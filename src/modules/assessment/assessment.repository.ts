import { prisma } from "../../lib/prisma.js";
import {
  Prisma,
  Assessment,
  AssessmentProblem,
  AssessmentStatus,
} from "../../generated/client/client.js";

export interface FindAssessmentsParams {
  organizationId: string;
  status?: AssessmentStatus;
  search?: string;
  skip?: number;
  take?: number;
}

export type AssessmentWithDetails = Assessment & {
  problems: (AssessmentProblem & {
    problem: {
      id: string;
      title: string;
      description: string;
      type: "MCQ_SINGLE" | "MCQ_MULTIPLE" | "WRITTEN" | "CODING";
      difficulty: "EASY" | "MEDIUM" | "HARD";
      defaultPoints: number;
      tags: string[];
      mcqOptions: any;
      codingDetails: any;
      evaluationRubric: string | null;
    };
  })[];
  _count?: {
    problems: number;
    invitations: number;
    attempts: number;
  };
};

export class AssessmentRepository {
  /**
   * Create a new draft assessment
   */
  async create(data: Prisma.AssessmentUncheckedCreateInput): Promise<Assessment> {
    return prisma.assessment.create({
      data,
    });
  }

  /**
   * Find paginated assessments with filters and usage counts
   */
  async findMany(
    params: FindAssessmentsParams
  ): Promise<{ items: (Assessment & { _count: { problems: number; invitations: number; attempts: number } })[]; total: number }> {
    const { organizationId, status, search, skip = 0, take = 20 } = params;

    const where: Prisma.AssessmentWhereInput = {
      organizationId,
      ...(status ? { status } : {}),
      ...(search
        ? {
            OR: [
              { title: { contains: search, mode: "insensitive" } },
              { description: { contains: search, mode: "insensitive" } },
            ],
          }
        : {}),
    };

    const [items, total] = await Promise.all([
      prisma.assessment.findMany({
        where,
        skip,
        take,
        orderBy: { createdAt: "desc" },
        include: {
          _count: {
            select: {
              problems: true,
              invitations: true,
              attempts: true,
            },
          },
        },
      }),
      prisma.assessment.count({ where }),
    ]);

    return { items, total };
  }

  /**
   * Find a single assessment by ID with attached problems and counts
   */
  async findById(id: string, organizationId: string): Promise<AssessmentWithDetails | null> {
    return prisma.assessment.findFirst({
      where: {
        id,
        organizationId,
      },
      include: {
        problems: {
          orderBy: { orderIndex: "asc" },
          include: {
            problem: {
              select: {
                id: true,
                title: true,
                description: true,
                type: true,
                difficulty: true,
                defaultPoints: true,
                tags: true,
                mcqOptions: true,
                codingDetails: true,
                evaluationRubric: true,
              },
            },
          },
        },
        _count: {
          select: {
            problems: true,
            invitations: true,
            attempts: true,
          },
        },
      },
    }) as Promise<AssessmentWithDetails | null>;
  }

  /**
   * Find minimal assessment record by ID within organization
   */
  async findBasicById(id: string, organizationId: string): Promise<Assessment | null> {
    return prisma.assessment.findFirst({
      where: {
        id,
        organizationId,
      },
    });
  }

  /**
   * Update assessment fields
   */
  async update(
    id: string,
    organizationId: string,
    data: Prisma.AssessmentUpdateInput
  ): Promise<Assessment> {
    return prisma.assessment.update({
      where: {
        id,
        organizationId,
      },
      data,
    });
  }

  /**
   * Delete an assessment record
   */
  async delete(id: string, organizationId: string): Promise<Assessment> {
    return prisma.assessment.delete({
      where: {
        id,
        organizationId,
      },
    });
  }

  /**
   * Find specific problem link in assessment
   */
  async findAssessmentProblem(
    assessmentId: string,
    problemId: string
  ): Promise<AssessmentProblem | null> {
    return prisma.assessmentProblem.findUnique({
      where: {
        assessmentId_problemId: {
          assessmentId,
          problemId,
        },
      },
    });
  }

  /**
   * Get maximum orderIndex in assessment
   */
  async getMaxOrderIndex(assessmentId: string): Promise<number> {
    const aggregate = await prisma.assessmentProblem.aggregate({
      where: { assessmentId },
      _max: { orderIndex: true },
    });
    return aggregate._max.orderIndex ?? 0;
  }

  /**
   * Add problem to assessment
   */
  async addProblem(
    assessmentId: string,
    problemId: string,
    points: number,
    orderIndex: number
  ): Promise<AssessmentProblem & { problem: any }> {
    return prisma.assessmentProblem.create({
      data: {
        assessmentId,
        problemId,
        points,
        orderIndex,
      },
      include: {
        problem: {
          select: {
            id: true,
            title: true,
            description: true,
            type: true,
            difficulty: true,
            defaultPoints: true,
            tags: true,
            mcqOptions: true,
            codingDetails: true,
            evaluationRubric: true,
          },
        },
      },
    });
  }

  /**
   * Remove problem from assessment
   */
  async removeProblem(assessmentId: string, problemId: string): Promise<AssessmentProblem> {
    return prisma.assessmentProblem.delete({
      where: {
        assessmentId_problemId: {
          assessmentId,
          problemId,
        },
      },
    });
  }

  /**
   * Recalculate and persist totalScore for assessment
   */
  async recalculateTotalScore(assessmentId: string, organizationId: string): Promise<number> {
    const aggregate = await prisma.assessmentProblem.aggregate({
      where: { assessmentId },
      _sum: { points: true },
    });
    const totalScore = aggregate._sum.points ?? 0.0;

    await prisma.assessment.update({
      where: {
        id: assessmentId,
        organizationId,
      },
      data: {
        totalScore,
      },
    });

    return totalScore;
  }

  /**
   * Count attempts associated with assessment
   */
  async countAttempts(assessmentId: string): Promise<number> {
    return prisma.assessmentAttempt.count({
      where: { assessmentId },
    });
  }

  /**
   * Count problems associated with assessment
   */
  async countProblems(assessmentId: string): Promise<number> {
    return prisma.assessmentProblem.count({
      where: { assessmentId },
    });
  }
}

export const assessmentRepository = new AssessmentRepository();
