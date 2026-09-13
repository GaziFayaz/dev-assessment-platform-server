import crypto from "node:crypto";
import { ProblemRepository, problemRepository } from "./problem.repository.js";
import {
  CreateProblemInput,
  UpdateProblemInput,
  ProblemQuery,
} from "./problem.schema.js";
import { AppError } from "../../errors/app-error.js";
import { Problem } from "../../generated/client/client.js";

export class ProblemService {
  constructor(private readonly repository: ProblemRepository = problemRepository) {}

  /**
   * Create a new problem with normalized option identifiers
   */
  async createProblem(
    input: CreateProblemInput,
    userId: string,
    organizationId: string
  ): Promise<Problem> {
    // Normalize MCQ options with unique IDs if not provided
    const mcqOptions = input.mcqOptions?.map((opt) => ({
      id: opt.id || crypto.randomUUID(),
      text: opt.text,
      isCorrect: opt.isCorrect,
    }));

    return this.repository.create({
      title: input.title,
      description: input.description,
      type: input.type,
      difficulty: input.difficulty,
      defaultPoints: input.defaultPoints,
      tags: input.tags,
      mcqOptions: mcqOptions ? (mcqOptions as any) : undefined,
      codingDetails: input.codingDetails ? (input.codingDetails as any) : undefined,
      evaluationRubric: input.evaluationRubric,
      creatorId: userId,
      organizationId,
    });
  }

  /**
   * List paginated problems with filters for active organization
   */
  async getProblems(query: ProblemQuery, organizationId: string) {
    const { page, limit, type, difficulty, tag, search } = query;
    const skip = (page - 1) * limit;

    const { items, total } = await this.repository.findMany({
      organizationId,
      type,
      difficulty,
      tag,
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
   * Get single problem by ID within organization
   */
  async getProblemById(id: string, organizationId: string): Promise<Problem> {
    const problem = await this.repository.findById(id, organizationId);
    if (!problem) {
      throw AppError.notFound(`Problem with ID ${id} not found in this organization`);
    }
    return problem;
  }

  /**
   * Update problem details, checking active assessment locks
   */
  async updateProblem(
    id: string,
    input: UpdateProblemInput,
    organizationId: string
  ): Promise<Problem> {
    // Ensure problem exists in this organization
    await this.getProblemById(id, organizationId);

    // Check if problem is used in any ACTIVE or PUBLISHED assessment
    const activeUsageCount = await this.repository.findActiveAssessmentsUsingProblem(id);
    if (activeUsageCount > 0) {
      throw AppError.conflict(
        "Cannot modify problem because it is currently part of an active or published assessment",
        "PROBLEM_LOCKED_IN_ASSESSMENT"
      );
    }

    // Normalize MCQ options with unique IDs if updated
    const mcqOptions = input.mcqOptions?.map((opt) => ({
      id: opt.id || crypto.randomUUID(),
      text: opt.text,
      isCorrect: opt.isCorrect,
    }));

    const updateData: Record<string, any> = {};
    if (input.title !== undefined) updateData.title = input.title;
    if (input.description !== undefined) updateData.description = input.description;
    if (input.type !== undefined) updateData.type = input.type;
    if (input.difficulty !== undefined) updateData.difficulty = input.difficulty;
    if (input.defaultPoints !== undefined) updateData.defaultPoints = input.defaultPoints;
    if (input.tags !== undefined) updateData.tags = input.tags;
    if (mcqOptions !== undefined) updateData.mcqOptions = mcqOptions;
    if (input.codingDetails !== undefined) updateData.codingDetails = input.codingDetails;
    if (input.evaluationRubric !== undefined) updateData.evaluationRubric = input.evaluationRubric;

    return this.repository.update(id, organizationId, updateData);
  }

  /**
   * Delete problem, checking assessment references
   */
  async deleteProblem(id: string, organizationId: string): Promise<{ deleted: true; id: string }> {
    // Ensure problem exists in this organization
    await this.getProblemById(id, organizationId);

    // Guard against deleting problems associated with any assessment
    const usageCount = await this.repository.countAssessmentUsage(id);
    if (usageCount > 0) {
      throw AppError.conflict(
        `Cannot delete problem because it is referenced by ${usageCount} assessment(s)`,
        "PROBLEM_REFERENCED_IN_ASSESSMENT"
      );
    }

    await this.repository.delete(id, organizationId);
    return { deleted: true, id };
  }
}

export const problemService = new ProblemService();
