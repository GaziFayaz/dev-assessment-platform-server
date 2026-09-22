import {
  AssessmentRepository,
  assessmentRepository,
  AssessmentWithDetails,
} from "./assessment.repository.js";
import {
  CreateAssessmentInput,
  UpdateAssessmentInput,
  AddAssessmentProblemInput,
  UpdateAssessmentStatusInput,
  AssessmentQuery,
  AssessmentStatus,
} from "./assessment.schema.js";
import { AppError } from "../../errors/app-error.js";
import { prisma } from "../../lib/prisma.js";
import { Assessment } from "../../generated/client/client.js";

const VALID_TRANSITIONS: Record<AssessmentStatus, AssessmentStatus[]> = {
  DRAFT: ["PUBLISHED", "ARCHIVED"],
  PUBLISHED: ["ACTIVE", "ARCHIVED"],
  ACTIVE: ["CLOSED", "ARCHIVED"],
  CLOSED: ["ARCHIVED"],
  ARCHIVED: [],
};

export class AssessmentService {
  constructor(private readonly repository: AssessmentRepository = assessmentRepository) {}

  /**
   * Create a new draft assessment
   */
  async createAssessment(
    input: CreateAssessmentInput,
    userId: string,
    organizationId: string
  ): Promise<Assessment> {
    return this.repository.create({
      title: input.title,
      description: input.description,
      instructions: input.instructions,
      durationMinutes: input.durationMinutes,
      passingScore: input.passingScore,
      totalScore: 0.0,
      status: "DRAFT",
      validFrom: input.validFrom ? new Date(input.validFrom) : null,
      validUntil: input.validUntil ? new Date(input.validUntil) : null,
      creatorId: userId,
      organizationId,
    });
  }

  /**
   * List paginated assessments with filters
   */
  async getAssessments(query: AssessmentQuery, organizationId: string) {
    const { page, limit, status, search } = query;
    const skip = (page - 1) * limit;

    const { items, total } = await this.repository.findMany({
      organizationId,
      status: status as any,
      search,
      skip,
      take: limit,
    });

    return {
      items,
      meta: {
        page,
        limit,
        totalItems: total,
        totalPages: Math.ceil(total / limit) || 0,
      },
    };
  }

  /**
   * Get single assessment by ID with ordered problems and rubrics
   */
  async getAssessmentById(id: string, organizationId: string): Promise<AssessmentWithDetails> {
    const assessment = await this.repository.findById(id, organizationId);
    if (!assessment) {
      throw AppError.notFound(`Assessment with ID ${id} not found in this organization`);
    }
    return assessment;
  }

  /**
   * Update assessment metadata
   */
  async updateAssessment(
    id: string,
    input: UpdateAssessmentInput,
    organizationId: string
  ): Promise<Assessment> {
    const assessment = await this.repository.findBasicById(id, organizationId);
    if (!assessment) {
      throw AppError.notFound(`Assessment with ID ${id} not found in this organization`);
    }

    if (assessment.status === "CLOSED" || assessment.status === "ARCHIVED") {
      throw AppError.conflict(
        `Cannot update assessment in ${assessment.status} status`,
        "ASSESSMENT_LOCKED"
      );
    }

    if (input.passingScore !== undefined && assessment.totalScore > 0) {
      if (input.passingScore > assessment.totalScore) {
        throw AppError.badRequest(
          `Passing score (${input.passingScore}) cannot exceed the assessment total score (${assessment.totalScore})`
        );
      }
    }

    const updateData: Record<string, any> = {};
    if (input.title !== undefined) updateData.title = input.title;
    if (input.description !== undefined) updateData.description = input.description;
    if (input.instructions !== undefined) updateData.instructions = input.instructions;
    if (input.durationMinutes !== undefined) updateData.durationMinutes = input.durationMinutes;
    if (input.passingScore !== undefined) updateData.passingScore = input.passingScore;
    if (input.validFrom !== undefined) updateData.validFrom = input.validFrom ? new Date(input.validFrom) : null;
    if (input.validUntil !== undefined) updateData.validUntil = input.validUntil ? new Date(input.validUntil) : null;

    return this.repository.update(id, organizationId, updateData);
  }

  /**
   * Add problem to assessment draft with points and ordering
   */
  async addProblem(
    assessmentId: string,
    input: AddAssessmentProblemInput,
    organizationId: string
  ) {
    const assessment = await this.repository.findBasicById(assessmentId, organizationId);
    if (!assessment) {
      throw AppError.notFound(`Assessment with ID ${assessmentId} not found in this organization`);
    }

    if (assessment.status !== "DRAFT") {
      throw AppError.conflict(
        `Problems can only be added to an assessment in DRAFT status. Current status is ${assessment.status}.`,
        "ASSESSMENT_NOT_IN_DRAFT"
      );
    }

    // Verify problem exists and belongs to this organization (or global platform problem)
    const problem = await prisma.problem.findFirst({
      where: {
        id: input.problemId,
        OR: [{ organizationId }, { organizationId: null }],
      },
    });

    if (!problem) {
      throw AppError.notFound(
        `Problem with ID ${input.problemId} not found in this organization`
      );
    }

    // Check if problem already attached
    const existing = await this.repository.findAssessmentProblem(assessmentId, input.problemId);
    if (existing) {
      throw AppError.conflict(
        "Problem is already attached to this assessment",
        "DUPLICATE_ASSESSMENT_PROBLEM"
      );
    }

    const points = input.points ?? problem.defaultPoints;
    const orderIndex =
      input.orderIndex ?? (await this.repository.getMaxOrderIndex(assessmentId)) + 1;

    const assessmentProblem = await this.repository.addProblem(
      assessmentId,
      input.problemId,
      points,
      orderIndex
    );

    // Synchronize totalScore
    await this.repository.recalculateTotalScore(assessmentId, organizationId);

    return assessmentProblem;
  }

  /**
   * Remove problem from assessment draft and recompute totalScore
   */
  async removeProblem(
    assessmentId: string,
    problemId: string,
    organizationId: string
  ) {
    const assessment = await this.repository.findBasicById(assessmentId, organizationId);
    if (!assessment) {
      throw AppError.notFound(`Assessment with ID ${assessmentId} not found in this organization`);
    }

    if (assessment.status !== "DRAFT") {
      throw AppError.conflict(
        `Problems can only be removed from an assessment in DRAFT status. Current status is ${assessment.status}.`,
        "ASSESSMENT_NOT_IN_DRAFT"
      );
    }

    const existing = await this.repository.findAssessmentProblem(assessmentId, problemId);
    if (!existing) {
      throw AppError.notFound("Problem is not part of this assessment");
    }

    await this.repository.removeProblem(assessmentId, problemId);

    const totalScore = await this.repository.recalculateTotalScore(
      assessmentId,
      organizationId
    );

    return {
      removed: true as const,
      assessmentId,
      problemId,
      totalScore,
    };
  }

  /**
   * Transition assessment lifecycle status
   */
  async updateStatus(
    id: string,
    input: UpdateAssessmentStatusInput,
    organizationId: string
  ): Promise<Assessment> {
    const assessment = await this.repository.findBasicById(id, organizationId);
    if (!assessment) {
      throw AppError.notFound(`Assessment with ID ${id} not found in this organization`);
    }

    const currentStatus = assessment.status as AssessmentStatus;
    const targetStatus = input.status;

    if (currentStatus === targetStatus) {
      return assessment;
    }

    const allowed = VALID_TRANSITIONS[currentStatus] || [];
    if (!allowed.includes(targetStatus)) {
      throw AppError.badRequest(
        `Invalid status transition from ${currentStatus} to ${targetStatus}. Allowed transitions: ${allowed.join(", ") || "none"}`,
        "INVALID_STATUS_TRANSITION"
      );
    }

    // Invariant checks when publishing
    if (targetStatus === "PUBLISHED") {
      const problemCount = await this.repository.countProblems(id);
      if (problemCount === 0) {
        throw AppError.conflict(
          "Cannot publish assessment without any problems attached. Add at least one problem first.",
          "NO_PROBLEMS_ATTACHED"
        );
      }

      if (assessment.totalScore <= 0) {
        throw AppError.conflict(
          "Cannot publish assessment with a total score of 0.",
          "ZERO_TOTAL_SCORE"
        );
      }

      if (assessment.passingScore !== null && assessment.passingScore > assessment.totalScore) {
        throw AppError.conflict(
          `Passing score (${assessment.passingScore}) cannot exceed total score (${assessment.totalScore})`,
          "INVALID_PASSING_SCORE"
        );
      }
    }

    return this.repository.update(id, organizationId, {
      status: targetStatus as any,
    });
  }

  /**
   * Delete assessment if zero attempts exist
   */
  async deleteAssessment(
    id: string,
    organizationId: string
  ): Promise<{ deleted: true; id: string }> {
    const assessment = await this.repository.findBasicById(id, organizationId);
    if (!assessment) {
      throw AppError.notFound(`Assessment with ID ${id} not found in this organization`);
    }

    const attemptCount = await this.repository.countAttempts(id);
    if (attemptCount > 0) {
      throw AppError.conflict(
        `Cannot delete assessment because it has ${attemptCount} candidate attempt(s). Please archive it instead.`,
        "ASSESSMENT_HAS_ATTEMPTS"
      );
    }

    await this.repository.delete(id, organizationId);
    return { deleted: true, id };
  }
}

export const assessmentService = new AssessmentService();
