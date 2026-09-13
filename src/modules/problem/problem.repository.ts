import { prisma } from "../../lib/prisma.js";
import { Prisma, Problem, QuestionType, Difficulty } from "../../generated/client/client.js";

export interface FindProblemsParams {
  organizationId: string;
  type?: QuestionType;
  difficulty?: Difficulty;
  tag?: string;
  search?: string;
  skip?: number;
  take?: number;
}

export class ProblemRepository {
  /**
   * Create a new problem record
   */
  async create(data: Prisma.ProblemUncheckedCreateInput): Promise<Problem> {
    return prisma.problem.create({
      data,
    });
  }

  /**
   * Find paginated problems for an organization with optional filters
   */
  async findMany(
    params: FindProblemsParams
  ): Promise<{ items: Problem[]; total: number }> {
    const { organizationId, type, difficulty, tag, search, skip = 0, take = 20 } = params;

    const where: Prisma.ProblemWhereInput = {
      organizationId,
      ...(type ? { type } : {}),
      ...(difficulty ? { difficulty } : {}),
      ...(tag ? { tags: { has: tag } } : {}),
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
      prisma.problem.findMany({
        where,
        skip,
        take,
        orderBy: { createdAt: "desc" },
      }),
      prisma.problem.count({ where }),
    ]);

    return { items, total };
  }

  /**
   * Find a single problem by ID within an organization
   */
  async findById(id: string, organizationId: string): Promise<Problem | null> {
    return prisma.problem.findFirst({
      where: {
        id,
        organizationId,
      },
    });
  }

  /**
   * Update problem details
   */
  async update(
    id: string,
    organizationId: string,
    data: Prisma.ProblemUpdateInput
  ): Promise<Problem> {
    return prisma.problem.update({
      where: {
        id,
        organizationId,
      },
      data,
    });
  }

  /**
   * Delete a problem record
   */
  async delete(id: string, organizationId: string): Promise<Problem> {
    return prisma.problem.delete({
      where: {
        id,
        organizationId,
      },
    });
  }

  /**
   * Check if problem is part of any ACTIVE or PUBLISHED assessment
   */
  async findActiveAssessmentsUsingProblem(problemId: string): Promise<number> {
    return prisma.assessmentProblem.count({
      where: {
        problemId,
        assessment: {
          status: {
            in: ["ACTIVE", "PUBLISHED"],
          },
        },
      },
    });
  }

  /**
   * Count total assessment associations for referential integrity guards
   */
  async countAssessmentUsage(problemId: string): Promise<number> {
    return prisma.assessmentProblem.count({
      where: {
        problemId,
      },
    });
  }
}

export const problemRepository = new ProblemRepository();
