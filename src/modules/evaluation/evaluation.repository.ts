import { prisma } from "../../lib/prisma.js";
import {
  Prisma,
  EvaluationReview,
  EvaluationScore,
  EvaluationStatus,
  AttemptStatus,
} from "../../generated/client/client.js";
import { EvaluationQueueQuery } from "./evaluation.schema.js";

export type EvaluationReviewDetail = EvaluationReview & {
  evaluator: {
    id: string;
    name: string;
    email: string;
  } | null;
  attempt: {
    id: string;
    startedAt: Date | null;
    submittedAt: Date | null;
    autoScore: number;
    manualScore: number;
    totalScore: number;
    percentage: number;
    isPassed: boolean | null;
    status: AttemptStatus;
    candidate: {
      id: string;
      name: string | null;
      email: string;
    };
    assessment: {
      id: string;
      organizationId: string;
      title: string;
      durationMinutes: number;
      passingScore: number | null;
      totalScore: number;
      problems: {
        id: string;
        orderIndex: number;
        points: number;
        problem: {
          id: string;
          title: string;
          description: string;
          type: "MCQ_SINGLE" | "MCQ_MULTIPLE" | "WRITTEN" | "CODING";
          difficulty: "EASY" | "MEDIUM" | "HARD";
          defaultPoints: number;
          evaluationRubric: string | null;
          codingDetails: any;
          mcqOptions: any;
        };
      }[];
    };
    answers: {
      id: string;
      problemId: string;
      selectedOptions: string[];
      writtenAnswer: string | null;
      submittedCode: string | null;
      selectedLanguage: string | null;
      autoScore: number;
      isCorrect: boolean | null;
      problem: {
        id: string;
        title: string;
        description: string;
        type: "MCQ_SINGLE" | "MCQ_MULTIPLE" | "WRITTEN" | "CODING";
        difficulty: "EASY" | "MEDIUM" | "HARD";
        defaultPoints: number;
        evaluationRubric: string | null;
        codingDetails: any;
        mcqOptions: any;
      };
      evaluationScore: EvaluationScore | null;
    }[];
  };
  scores: EvaluationScore[];
};

export class EvaluationRepository {
  /**
   * Find paginated evaluation queue items for an organization
   */
  async findQueue(
    orgId: string,
    filters: EvaluationQueueQuery,
    resolvedEvaluatorId?: string
  ): Promise<{
    items: Array<any>;
    totalItems: number;
    page: number;
    limit: number;
    totalPages: number;
  }> {
    const page = filters.page || 1;
    const limit = filters.limit || 20;
    const skip = (page - 1) * limit;

    const where: Prisma.EvaluationReviewWhereInput = {
      attempt: {
        assessment: {
          organizationId: orgId,
          ...(filters.assessmentId ? { id: filters.assessmentId } : {}),
        },
      },
      ...(filters.status ? { evaluationStatus: filters.status } : {}),
      ...(resolvedEvaluatorId ? { evaluatorId: resolvedEvaluatorId } : {}),
    };

    const [reviews, totalItems] = await Promise.all([
      prisma.evaluationReview.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: "desc" },
        include: {
          evaluator: {
            select: { id: true, name: true, email: true },
          },
          scores: true,
          attempt: {
            include: {
              candidate: {
                select: { id: true, name: true, email: true },
              },
              assessment: {
                include: {
                  problems: {
                    include: { problem: true },
                  },
                },
              },
            },
          },
        },
      }),
      prisma.evaluationReview.count({ where }),
    ]);

    const items = reviews.map((review) => {
      const assessmentProblems = review.attempt.assessment.problems || [];
      const subjectiveProblems = assessmentProblems.filter(
        (ap) =>
          ap.problem.type === "WRITTEN" || ap.problem.type === "CODING"
      );

      return {
        reviewId: review.id,
        attemptId: review.attempt.id,
        candidateName: review.attempt.candidate.name,
        candidateEmail: review.attempt.candidate.email,
        assessmentId: review.attempt.assessment.id,
        assessmentTitle: review.attempt.assessment.title,
        submittedAt:
          review.attempt.submittedAt?.toISOString() ||
          review.createdAt.toISOString(),
        evaluationStatus: review.evaluationStatus,
        evaluator: review.evaluator,
        subjectiveQuestionsCount: subjectiveProblems.length,
        gradedQuestionsCount: review.scores.length,
        autoScore: review.attempt.autoScore,
        totalPossibleScore: review.attempt.assessment.totalScore,
      };
    });

    const totalPages = Math.ceil(totalItems / limit);

    return {
      items,
      totalItems,
      page,
      limit,
      totalPages,
    };
  }

  /**
   * Find evaluation review by ID with complete attempt questions, candidate answers, and rubrics
   */
  async findById(reviewId: string): Promise<EvaluationReviewDetail | null> {
    return prisma.evaluationReview.findUnique({
      where: { id: reviewId },
      include: {
        evaluator: {
          select: { id: true, name: true, email: true },
        },
        scores: true,
        attempt: {
          include: {
            candidate: {
              select: { id: true, name: true, email: true },
            },
            assessment: {
              include: {
                problems: {
                  include: { problem: true },
                  orderBy: { orderIndex: "asc" },
                },
              },
            },
            answers: {
              include: {
                problem: true,
                evaluationScore: true,
              },
            },
          },
        },
      },
    }) as any;
  }

  /**
   * Update claim status of an evaluation review
   */
  async updateClaim(
    reviewId: string,
    evaluatorId: string | null,
    evaluationStatus: EvaluationStatus
  ): Promise<EvaluationReview> {
    return prisma.evaluationReview.update({
      where: { id: reviewId },
      data: {
        evaluatorId,
        evaluationStatus,
      },
    });
  }

  /**
   * Upsert score for a submission answer within a review
   */
  async upsertScore(
    reviewId: string,
    submissionAnswerId: string,
    awardedPoints: number,
    maxPoints: number,
    feedback?: string | null
  ): Promise<EvaluationScore> {
    return prisma.evaluationScore.upsert({
      where: { submissionAnswerId },
      create: {
        reviewId,
        submissionAnswerId,
        awardedPoints,
        maxPoints,
        feedback: feedback || null,
      },
      update: {
        awardedPoints,
        maxPoints,
        feedback: feedback || null,
      },
    });
  }

  /**
   * Calculate total manual score awarded across all scored answers for a review
   */
  async getSumAwardedPoints(reviewId: string): Promise<number> {
    const aggregate = await prisma.evaluationScore.aggregate({
      where: { reviewId },
      _sum: { awardedPoints: true },
    });
    return aggregate._sum.awardedPoints || 0.0;
  }

  /**
   * Update intermediate manual score on an attempt
   */
  async updateAttemptManualScore(
    attemptId: string,
    manualScore: number
  ): Promise<void> {
    await prisma.assessmentAttempt.update({
      where: { id: attemptId },
      data: { manualScore },
    });
  }

  /**
   * Atomically finalize an evaluation review and complete the candidate's attempt
   */
  async finalizeReview(
    reviewId: string,
    attemptId: string,
    data: {
      status: AttemptStatus;
      evaluationStatus: EvaluationStatus;
      manualScore: number;
      totalScore: number;
      percentage: number;
      isPassed: boolean;
      overallFeedback?: string | null;
      evaluatedAt: Date;
    }
  ): Promise<{
    review: EvaluationReview;
    attempt: {
      id: string;
      status: AttemptStatus;
      autoScore: number;
      manualScore: number;
      totalScore: number;
      percentage: number;
      isPassed: boolean | null;
    };
  }> {
    return prisma.$transaction(async (tx) => {
      const updatedAttempt = await tx.assessmentAttempt.update({
        where: { id: attemptId },
        data: {
          status: data.status,
          evaluationStatus: data.evaluationStatus,
          manualScore: data.manualScore,
          totalScore: data.totalScore,
          percentage: data.percentage,
          isPassed: data.isPassed,
        },
        select: {
          id: true,
          status: true,
          autoScore: true,
          manualScore: true,
          totalScore: true,
          percentage: true,
          isPassed: true,
        },
      });

      const updatedReview = await tx.evaluationReview.update({
        where: { id: reviewId },
        data: {
          evaluationStatus: data.evaluationStatus,
          overallFeedback: data.overallFeedback || null,
          evaluatedAt: data.evaluatedAt,
        },
      });

      return {
        review: updatedReview,
        attempt: updatedAttempt,
      };
    });
  }
}

export const evaluationRepository = new EvaluationRepository();
