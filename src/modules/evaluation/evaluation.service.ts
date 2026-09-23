import { AppError } from "../../errors/app-error.js";
import { EvaluationStatus, AttemptStatus } from "../../generated/client/client.js";
import {
  EvaluationRepository,
  evaluationRepository,
  EvaluationReviewDetail,
} from "./evaluation.repository.js";
import {
  EvaluationQueueQuery,
  ClaimReviewInput,
  ScoreQuestionInput,
  FinalizeEvaluationInput,
} from "./evaluation.schema.js";

export class EvaluationService {
  constructor(private readonly repo: EvaluationRepository = evaluationRepository) {}

  /**
   * List paginated evaluation queue items for active tenant
   */
  async getQueue(
    orgId: string,
    userId: string,
    query: EvaluationQueueQuery
  ) {
    const resolvedEvaluatorId =
      query.evaluatorId === "me" ? userId : query.evaluatorId;

    return this.repo.findQueue(orgId, query, resolvedEvaluatorId);
  }

  /**
   * Retrieve complete submission context, rubrics, and existing scores
   */
  async getReviewDetail(orgId: string, reviewId: string) {
    const review = await this.repo.findById(reviewId);
    if (!review) {
      throw AppError.notFound("Evaluation review not found", "REVIEW_NOT_FOUND");
    }

    if (review.attempt.assessment.organizationId !== orgId) {
      throw AppError.notFound("Evaluation review not found", "REVIEW_NOT_FOUND");
    }

    // Format all questions with candidate answers & scores
    const questions = (review.attempt.assessment.problems || []).map((ap) => {
      const candidateAnswer = review.attempt.answers.find(
        (ans) => ans.problemId === ap.problem.id
      );

      const isMcq =
        ap.problem.type === "MCQ_SINGLE" || ap.problem.type === "MCQ_MULTIPLE";

      const existingScore = candidateAnswer?.evaluationScore || null;

      return {
        submissionAnswerId: candidateAnswer?.id || "",
        problemId: ap.problem.id,
        title: ap.problem.title,
        type: ap.problem.type,
        difficulty: ap.problem.difficulty,
        points: ap.points,
        orderIndex: ap.orderIndex,
        description: ap.problem.description,
        evaluationRubric: ap.problem.evaluationRubric,
        codingDetails: ap.problem.codingDetails,
        candidateAnswer: {
          selectedOptions: candidateAnswer?.selectedOptions || [],
          writtenAnswer: candidateAnswer?.writtenAnswer || null,
          submittedCode: candidateAnswer?.submittedCode || null,
          selectedLanguage: candidateAnswer?.selectedLanguage || null,
        },
        mcqGrading: isMcq
          ? {
              autoScore: candidateAnswer?.autoScore || 0.0,
              isCorrect: candidateAnswer?.isCorrect || null,
            }
          : null,
        score: existingScore
          ? {
              id: existingScore.id,
              awardedPoints: existingScore.awardedPoints,
              maxPoints: existingScore.maxPoints,
              feedback: existingScore.feedback,
              updatedAt: existingScore.updatedAt.toISOString(),
            }
          : null,
      };
    });

    return {
      reviewId: review.id,
      evaluationStatus: review.evaluationStatus,
      evaluator: review.evaluator,
      overallFeedback: review.overallFeedback,
      evaluatedAt: review.evaluatedAt?.toISOString() || null,
      candidate: review.attempt.candidate,
      assessment: {
        id: review.attempt.assessment.id,
        title: review.attempt.assessment.title,
        durationMinutes: review.attempt.assessment.durationMinutes,
        totalScore: review.attempt.assessment.totalScore,
        passingScore: review.attempt.assessment.passingScore,
      },
      attempt: {
        id: review.attempt.id,
        startedAt: review.attempt.startedAt?.toISOString() || null,
        submittedAt: review.attempt.submittedAt?.toISOString() || null,
        autoScore: review.attempt.autoScore,
        manualScore: review.attempt.manualScore,
        totalScore: review.attempt.totalScore,
        percentage: review.attempt.percentage,
        isPassed: review.attempt.isPassed,
        status: review.attempt.status,
      },
      questions,
    };
  }

  /**
   * Claim or unclaim an evaluation review
   */
  async claimReview(
    orgId: string,
    userId: string,
    userRole: string,
    reviewId: string,
    input: ClaimReviewInput
  ) {
    const review = await this.repo.findById(reviewId);
    if (!review || review.attempt.assessment.organizationId !== orgId) {
      throw AppError.notFound("Evaluation review not found", "REVIEW_NOT_FOUND");
    }

    if (review.evaluationStatus === EvaluationStatus.EVALUATED) {
      throw AppError.conflict(
        "Evaluation review has already been finalized",
        "REVIEW_ALREADY_FINALIZED"
      );
    }

    // Handle Unclaim
    if (input.unclaim) {
      if (review.evaluationStatus === EvaluationStatus.PENDING) {
        return {
          reviewId: review.id,
          evaluationStatus: EvaluationStatus.PENDING,
          evaluatorId: null,
          claimed: false,
        };
      }

      if (review.evaluatorId !== userId && userRole !== "admin") {
        throw AppError.forbidden(
          "Forbidden: Only the assigned evaluator or a company admin can unclaim this review",
          "NOT_ASSIGNED_EVALUATOR"
        );
      }

      const updated = await this.repo.updateClaim(
        reviewId,
        null,
        EvaluationStatus.PENDING
      );

      return {
        reviewId: updated.id,
        evaluationStatus: updated.evaluationStatus,
        evaluatorId: null,
        claimed: false,
      };
    }

    // Handle Claim
    if (review.evaluationStatus === EvaluationStatus.IN_REVIEW) {
      if (review.evaluatorId === userId) {
        return {
          reviewId: review.id,
          evaluationStatus: EvaluationStatus.IN_REVIEW,
          evaluatorId: userId,
          claimed: true,
        };
      }

      // Claimed by another reviewer
      if (userRole !== "admin") {
        throw AppError.conflict(
          "Evaluation review is already claimed by another reviewer",
          "REVIEW_ALREADY_CLAIMED"
        );
      }
    }

    const updated = await this.repo.updateClaim(
      reviewId,
      userId,
      EvaluationStatus.IN_REVIEW
    );

    return {
      reviewId: updated.id,
      evaluationStatus: updated.evaluationStatus,
      evaluatorId: userId,
      claimed: true,
    };
  }

  /**
   * Score an individual written or coding question with rubric feedback
   */
  async scoreQuestion(
    orgId: string,
    userId: string,
    userRole: string,
    reviewId: string,
    input: ScoreQuestionInput
  ) {
    const review = await this.repo.findById(reviewId);
    if (!review || review.attempt.assessment.organizationId !== orgId) {
      throw AppError.notFound("Evaluation review not found", "REVIEW_NOT_FOUND");
    }

    if (review.evaluationStatus === EvaluationStatus.EVALUATED) {
      throw AppError.conflict(
        "Evaluation review has already been finalized",
        "REVIEW_ALREADY_FINALIZED"
      );
    }

    if (review.evaluationStatus !== EvaluationStatus.IN_REVIEW) {
      throw AppError.conflict(
        "Evaluation review must be claimed before scoring questions",
        "REVIEW_NOT_CLAIMED"
      );
    }

    if (review.evaluatorId !== userId && userRole !== "admin") {
      throw AppError.forbidden(
        "Forbidden: Only the assigned evaluator or a company admin can score questions",
        "NOT_ASSIGNED_EVALUATOR"
      );
    }

    // Find target submission answer
    const answer = review.attempt.answers.find(
      (a) => a.id === input.submissionAnswerId
    );
    if (!answer) {
      throw AppError.notFound(
        "Submission answer not found in this attempt",
        "ANSWER_NOT_FOUND"
      );
    }

    if (
      answer.problem.type !== "WRITTEN" &&
      answer.problem.type !== "CODING"
    ) {
      throw AppError.badRequest(
        "Only written and coding questions can be manually scored",
        "INVALID_QUESTION_TYPE"
      );
    }

    // Determine max points allocated for this problem in this assessment
    const assessmentProblem = review.attempt.assessment.problems.find(
      (ap) => ap.problem.id === answer.problemId
    );
    const maxPoints = assessmentProblem?.points || answer.problem.defaultPoints;

    if (input.awardedPoints < 0 || input.awardedPoints > maxPoints) {
      throw AppError.badRequest(
        `Awarded points must be between 0 and ${maxPoints}`,
        "INVALID_SCORE_RANGE"
      );
    }

    // Upsert score
    await this.repo.upsertScore(
      reviewId,
      input.submissionAnswerId,
      input.awardedPoints,
      maxPoints,
      input.feedback
    );

    // Calculate intermediate manual score on attempt
    const newManualScore = await this.repo.getSumAwardedPoints(reviewId);
    await this.repo.updateAttemptManualScore(review.attempt.id, newManualScore);

    return {
      reviewId,
      submissionAnswerId: input.submissionAnswerId,
      awardedPoints: input.awardedPoints,
      maxPoints,
      feedback: input.feedback || null,
      attemptManualScore: newManualScore,
    };
  }

  /**
   * Finalize evaluation review, calculate final total scores, and complete attempt
   */
  async finalizeEvaluation(
    orgId: string,
    userId: string,
    userRole: string,
    reviewId: string,
    input: FinalizeEvaluationInput
  ) {
    const review = await this.repo.findById(reviewId);
    if (!review || review.attempt.assessment.organizationId !== orgId) {
      throw AppError.notFound("Evaluation review not found", "REVIEW_NOT_FOUND");
    }

    if (review.evaluationStatus === EvaluationStatus.EVALUATED) {
      throw AppError.conflict(
        "Evaluation review has already been finalized",
        "REVIEW_ALREADY_FINALIZED"
      );
    }

    if (review.evaluationStatus !== EvaluationStatus.IN_REVIEW) {
      throw AppError.conflict(
        "Evaluation review must be claimed and in review before finalizing",
        "REVIEW_NOT_IN_REVIEW"
      );
    }

    if (review.evaluatorId !== userId && userRole !== "admin") {
      throw AppError.forbidden(
        "Forbidden: Only the assigned evaluator or a company admin can finalize this review",
        "NOT_ASSIGNED_EVALUATOR"
      );
    }

    // Completeness verification: all subjective questions must have recorded EvaluationScore
    const assessmentProblems = review.attempt.assessment.problems || [];
    const subjectiveProblems = assessmentProblems.filter(
      (ap) =>
        ap.problem.type === "WRITTEN" || ap.problem.type === "CODING"
    );

    const unscoredProblems: string[] = [];
    for (const sp of subjectiveProblems) {
      const candidateAnswer = review.attempt.answers.find(
        (a) => a.problemId === sp.problem.id
      );

      if (!candidateAnswer) {
        unscoredProblems.push(sp.problem.title);
        continue;
      }

      const scoreExists = review.scores.some(
        (s) => s.submissionAnswerId === candidateAnswer.id
      );

      if (!scoreExists) {
        unscoredProblems.push(sp.problem.title);
      }
    }

    if (unscoredProblems.length > 0) {
      throw AppError.badRequest(
        `Cannot finalize evaluation: ${unscoredProblems.length} subjective question(s) remain unscored: [${unscoredProblems.join(", ")}]`,
        "UNSCORED_QUESTIONS_REMAIN"
      );
    }

    // Calculate final scores
    const manualScore = await this.repo.getSumAwardedPoints(reviewId);
    const autoScore = review.attempt.autoScore;
    const totalScore = Number((autoScore + manualScore).toFixed(2));
    const assessmentTotal = review.attempt.assessment.totalScore;
    const percentage =
      assessmentTotal > 0
        ? Number(((totalScore / assessmentTotal) * 100).toFixed(2))
        : 0.0;
    const isPassed =
      review.attempt.assessment.passingScore !== null
        ? totalScore >= review.attempt.assessment.passingScore
        : true;

    const evaluatedAt = new Date();

    const finalized = await this.repo.finalizeReview(
      reviewId,
      review.attempt.id,
      {
        status: AttemptStatus.COMPLETED,
        evaluationStatus: EvaluationStatus.EVALUATED,
        manualScore,
        totalScore,
        percentage,
        isPassed,
        overallFeedback: input.overallFeedback,
        evaluatedAt,
      }
    );

    return {
      reviewId: finalized.review.id,
      attemptId: finalized.attempt.id,
      evaluationStatus: finalized.review.evaluationStatus,
      attemptStatus: finalized.attempt.status,
      autoScore: finalized.attempt.autoScore,
      manualScore: finalized.attempt.manualScore,
      totalScore: finalized.attempt.totalScore,
      percentage: finalized.attempt.percentage,
      isPassed: finalized.attempt.isPassed ?? false,
      overallFeedback: finalized.review.overallFeedback,
      evaluatedAt: evaluatedAt.toISOString(),
    };
  }
}

export const evaluationService = new EvaluationService();
