import { prisma } from "../../lib/prisma.js";

export class ReportRepository {
  /**
   * Find an assessment by ID within an organization, including attached problems
   * ordered by orderIndex and counts for invitations and attempts.
   */
  async findAssessmentWithProblems(assessmentId: string, organizationId: string) {
    return prisma.assessment.findFirst({
      where: {
        id: assessmentId,
        organizationId,
      },
      include: {
        problems: {
          orderBy: { orderIndex: "asc" },
          include: {
            problem: true,
          },
        },
        _count: {
          select: {
            invitations: true,
            attempts: true,
          },
        },
      },
    });
  }

  /**
   * Find all attempts for an assessment, including candidate details and answers
   * for computing analytics.
   */
  async findAttemptsForAssessment(assessmentId: string) {
    return prisma.assessmentAttempt.findMany({
      where: {
        assessmentId,
      },
      include: {
        candidate: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
        answers: {
          select: {
            problemId: true,
            autoScore: true,
            isCorrect: true,
            evaluationScore: {
              select: {
                awardedPoints: true,
                maxPoints: true,
              },
            },
          },
        },
      },
    });
  }

  /**
   * Find a detailed attempt by ID within the organization, including candidate,
   * assessment, all answers with evaluation scores, and evaluation review.
   */
  async findAttemptDetailedById(attemptId: string, organizationId: string) {
    const attempt = await prisma.assessmentAttempt.findUnique({
      where: { id: attemptId },
      include: {
        candidate: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
        assessment: {
          include: {
            organization: {
              select: {
                id: true,
                name: true,
                slug: true,
              },
            },
            problems: {
              orderBy: { orderIndex: "asc" },
              include: {
                problem: true,
              },
            },
          },
        },
        answers: {
          include: {
            problem: true,
            evaluationScore: true,
          },
        },
        evaluation: {
          include: {
            evaluator: {
              select: {
                id: true,
                name: true,
                email: true,
              },
            },
          },
        },
      },
    });

    if (!attempt || attempt.assessment.organizationId !== organizationId) {
      return null;
    }

    return attempt;
  }

  /**
   * Find completed attempts for a candidate user, including assessment metadata,
   * organization branding, submission answers, and evaluation review.
   */
  async findCompletedAttemptsByCandidate(candidateId: string, candidateEmail: string) {
    return prisma.assessmentAttempt.findMany({
      where: {
        OR: [
          { candidateId },
          { candidateEmail: candidateEmail.toLowerCase().trim() },
        ],
        status: "COMPLETED",
      },
      include: {
        assessment: {
          include: {
            organization: {
              select: {
                id: true,
                name: true,
                slug: true,
              },
            },
            problems: {
              orderBy: { orderIndex: "asc" },
              include: {
                problem: true,
              },
            },
          },
        },
        answers: {
          include: {
            problem: true,
            evaluationScore: true,
          },
        },
        evaluation: {
          select: {
            overallFeedback: true,
            evaluatedAt: true,
          },
        },
      },
      orderBy: {
        submittedAt: "desc",
      },
    });
  }
}

export const reportRepository = new ReportRepository();
