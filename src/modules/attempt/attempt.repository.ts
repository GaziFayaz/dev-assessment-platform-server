import { prisma } from "../../lib/prisma.js";
import {
  Prisma,
  AssessmentAttempt,
  SubmissionAnswer,
  CandidateInvitation,
  AttemptStatus,
  EvaluationStatus,
} from "../../generated/client/client.js";

export type AttemptWithAssessmentAndAnswers = AssessmentAttempt & {
  assessment: {
    id: string;
    organizationId: string;
    title: string;
    description: string | null;
    instructions: string | null;
    durationMinutes: number;
    passingScore: number | null;
    totalScore: number;
    status: string;
    validFrom: Date | null;
    validUntil: Date | null;
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
        tags: string[];
        mcqOptions: any;
        codingDetails: any;
        evaluationRubric: string | null;
      };
    }[];
  };
  answers: SubmissionAnswer[];
};

export class AttemptRepository {
  /**
   * Find candidate invitation by its unique invite token including assessment details & problems
   */
  async findInvitationByToken(token: string): Promise<
    | (CandidateInvitation & {
        assessment: AttemptWithAssessmentAndAnswers["assessment"];
      })
    | null
  > {
    return prisma.candidateInvitation.findUnique({
      where: { inviteToken: token },
      include: {
        assessment: {
          include: {
            problems: {
              include: { problem: true },
              orderBy: { orderIndex: "asc" },
            },
          },
        },
      },
    }) as any;
  }

  /**
   * Find an existing attempt by invitation ID or by (assessmentId, candidateId)
   */
  async findExistingAttempt(
    assessmentId: string,
    candidateId: string
  ): Promise<AttemptWithAssessmentAndAnswers | null> {
    return prisma.assessmentAttempt.findFirst({
      where: {
        assessmentId,
        candidateId,
      },
      include: {
        assessment: {
          include: {
            problems: {
              include: { problem: true },
              orderBy: { orderIndex: "asc" },
            },
          },
        },
        answers: true,
      },
    }) as any;
  }

  /**
   * Find attempt by ID with full assessment questions and existing answer drafts
   */
  async findById(attemptId: string): Promise<AttemptWithAssessmentAndAnswers | null> {
    return prisma.assessmentAttempt.findUnique({
      where: { id: attemptId },
      include: {
        assessment: {
          include: {
            problems: {
              include: { problem: true },
              orderBy: { orderIndex: "asc" },
            },
          },
        },
        answers: true,
      },
    }) as any;
  }

  /**
   * Create a new attempt record and mark invitation accepted within an atomic transaction
   */
  async createAttempt(
    data: Prisma.AssessmentAttemptUncheckedCreateInput
  ): Promise<AttemptWithAssessmentAndAnswers> {
    return prisma.$transaction(async (tx) => {
      if (data.invitationId) {
        await tx.candidateInvitation.update({
          where: { id: data.invitationId },
          data: { isAccepted: true },
        });
      }

      const attempt = await tx.assessmentAttempt.create({
        data,
        include: {
          assessment: {
            include: {
              problems: {
                include: { problem: true },
                orderBy: { orderIndex: "asc" },
              },
            },
          },
          answers: true,
        },
      });

      return attempt as any;
    });
  }

  /**
   * Upsert a candidate's answer draft for a specific problem
   */
  async upsertAnswer(
    attemptId: string,
    problemId: string,
    data: {
      selectedOptions?: string[];
      writtenAnswer?: string;
      submittedCode?: string;
      selectedLanguage?: string;
    }
  ): Promise<SubmissionAnswer> {
    return prisma.submissionAnswer.upsert({
      where: {
        attemptId_problemId: {
          attemptId,
          problemId,
        },
      },
      create: {
        attemptId,
        problemId,
        selectedOptions: data.selectedOptions || [],
        writtenAnswer: data.writtenAnswer,
        submittedCode: data.submittedCode,
        selectedLanguage: data.selectedLanguage,
      },
      update: {
        ...(data.selectedOptions !== undefined && {
          selectedOptions: data.selectedOptions,
        }),
        ...(data.writtenAnswer !== undefined && {
          writtenAnswer: data.writtenAnswer,
        }),
        ...(data.submittedCode !== undefined && {
          submittedCode: data.submittedCode,
        }),
        ...(data.selectedLanguage !== undefined && {
          selectedLanguage: data.selectedLanguage,
        }),
        updatedAt: new Date(),
      },
    });
  }

  /**
   * Batch update MCQ scores for submission answers
   */
  async updateMcqScores(
    scoredAnswers: Array<{
      attemptId: string;
      problemId: string;
      autoScore: number;
      isCorrect: boolean;
      selectedOptions: string[];
    }>
  ): Promise<void> {
    if (scoredAnswers.length === 0) return;

    await prisma.$transaction(
      scoredAnswers.map((item) =>
        prisma.submissionAnswer.upsert({
          where: {
            attemptId_problemId: {
              attemptId: item.attemptId,
              problemId: item.problemId,
            },
          },
          create: {
            attemptId: item.attemptId,
            problemId: item.problemId,
            selectedOptions: item.selectedOptions,
            autoScore: item.autoScore,
            isCorrect: item.isCorrect,
          },
          update: {
            autoScore: item.autoScore,
            isCorrect: item.isCorrect,
          },
        })
      )
    );
  }

  /**
   * Finalize an attempt, update scores and status, and optionally create an EvaluationReview record
   */
  async finalizeAttempt(
    attemptId: string,
    data: {
      status: AttemptStatus;
      submittedAt: Date;
      autoScore: number;
      manualScore: number;
      totalScore: number;
      percentage: number;
      isPassed: boolean | null;
      evaluationStatus: EvaluationStatus;
      createEvaluationReview?: boolean;
    }
  ): Promise<AssessmentAttempt> {
    return prisma.$transaction(async (tx) => {
      const updatedAttempt = await tx.assessmentAttempt.update({
        where: { id: attemptId },
        data: {
          status: data.status,
          submittedAt: data.submittedAt,
          autoScore: data.autoScore,
          manualScore: data.manualScore,
          totalScore: data.totalScore,
          percentage: data.percentage,
          isPassed: data.isPassed,
          evaluationStatus: data.evaluationStatus,
        },
      });

      if (data.createEvaluationReview) {
        await tx.evaluationReview.upsert({
          where: { attemptId },
          create: {
            attemptId,
            evaluationStatus: EvaluationStatus.PENDING,
          },
          update: {
            evaluationStatus: EvaluationStatus.PENDING,
          },
        });
      }

      return updatedAttempt;
    });
  }
}

export const attemptRepository = new AttemptRepository();
