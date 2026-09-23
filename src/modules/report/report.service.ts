import { reportRepository } from "./report.repository.js";
import { AppError } from "../../errors/app-error.js";
import {
  AssessmentSummaryResponse,
  RecruiterAttemptReportResponse,
  CandidateResultsResponse,
} from "./report.schema.js";

export class ReportService {
  /**
   * Aggregate assessment performance metrics, pass rates, score distribution,
   * and question-level benchmarks for Recruiters and Company Admins.
   */
  async getAssessmentSummary(
    assessmentId: string,
    organizationId: string
  ): Promise<AssessmentSummaryResponse> {
    const assessment = await reportRepository.findAssessmentWithProblems(
      assessmentId,
      organizationId
    );

    if (!assessment) {
      throw AppError.notFound(
        "Assessment not found or does not belong to active organization"
      );
    }

    const attempts = await reportRepository.findAttemptsForAssessment(assessmentId);

    // 1. Participant metrics
    const attemptsByStatus = {
      IN_PROGRESS: 0,
      SUBMITTED: 0,
      AUTO_SUBMITTED: 0,
      UNDER_REVIEW: 0,
      COMPLETED: 0,
    };

    for (const attempt of attempts) {
      if (attempt.status in attemptsByStatus) {
        attemptsByStatus[attempt.status as keyof typeof attemptsByStatus]++;
      }
    }

    // 2. Performance stats across COMPLETED attempts
    const completedAttempts = attempts.filter((a) => a.status === "COMPLETED");
    const completedCandidates = completedAttempts.length;

    let passedCount = 0;
    let failedCount = 0;
    let averageScore = 0.0;
    let medianScore = 0.0;
    let highestScore = 0.0;
    let lowestScore = 0.0;
    let averagePercentage = 0.0;

    if (completedCandidates > 0) {
      passedCount = completedAttempts.filter((a) => a.isPassed === true).length;
      failedCount = completedAttempts.filter((a) => a.isPassed === false).length;

      const scores = completedAttempts
        .map((a) => a.totalScore)
        .sort((a, b) => a - b);

      const totalScoreSum = scores.reduce((sum, s) => sum + s, 0);
      averageScore = Number((totalScoreSum / completedCandidates).toFixed(2));

      // Calculate median
      if (completedCandidates % 2 === 1) {
        medianScore = scores[Math.floor(completedCandidates / 2)];
      } else {
        const mid1 = scores[completedCandidates / 2 - 1];
        const mid2 = scores[completedCandidates / 2];
        medianScore = Number(((mid1 + mid2) / 2).toFixed(2));
      }

      highestScore = scores[scores.length - 1];
      lowestScore = scores[0];

      const percentageSum = completedAttempts.reduce(
        (sum, a) => sum + a.percentage,
        0
      );
      averagePercentage = Number((percentageSum / completedCandidates).toFixed(2));
    }

    const passRate =
      completedCandidates > 0
        ? Number(((passedCount / completedCandidates) * 100).toFixed(1))
        : 0.0;

    // 3. Score distribution buckets
    const bucketDefinitions = [
      { key: "0-20%", min: 0, max: 20 },
      { key: "21-40%", min: 20.0001, max: 40 },
      { key: "41-60%", min: 40.0001, max: 60 },
      { key: "61-80%", min: 60.0001, max: 80 },
      { key: "81-100%", min: 80.0001, max: 100 },
    ];

    const scoreDistribution = bucketDefinitions.map((def) => {
      const count = completedAttempts.filter(
        (a) => a.percentage >= def.min && a.percentage <= def.max
      ).length;

      const pct =
        completedCandidates > 0
          ? Number(((count / completedCandidates) * 100).toFixed(1))
          : 0.0;

      return {
        bucket: def.key,
        count,
        percentage: pct,
      };
    });

    // 4. Question-level performance breakdown
    const questionsPerformance = assessment.problems.map((ap) => {
      // Find answers for this problem among all completed attempts
      const answersForProblem: Array<{
        autoScore: number;
        isCorrect: boolean | null;
        awardedPoints: number;
      }> = [];

      for (const attempt of completedAttempts) {
        const ans = attempt.answers.find((a) => a.problemId === ap.problemId);
        if (ans) {
          const awarded =
            ap.problem.type.startsWith("MCQ")
              ? ans.autoScore
              : ans.evaluationScore?.awardedPoints ?? 0.0;

          answersForProblem.push({
            autoScore: ans.autoScore,
            isCorrect: ans.isCorrect,
            awardedPoints: awarded,
          });
        }
      }

      let averageAwardedPoints = 0.0;
      let accuracyRate: number | null = null;

      if (answersForProblem.length > 0) {
        const totalPoints = answersForProblem.reduce(
          (sum, a) => sum + a.awardedPoints,
          0
        );
        averageAwardedPoints = Number(
          (totalPoints / answersForProblem.length).toFixed(2)
        );

        if (ap.problem.type.startsWith("MCQ")) {
          const correctCount = answersForProblem.filter(
            (a) => a.isCorrect === true
          ).length;
          accuracyRate = Number(
            ((correctCount / answersForProblem.length) * 100).toFixed(1)
          );
        }
      } else if (ap.problem.type.startsWith("MCQ")) {
        accuracyRate = 0.0;
      }

      return {
        problemId: ap.problemId,
        orderIndex: ap.orderIndex,
        title: ap.problem.title,
        type: ap.problem.type,
        difficulty: ap.problem.difficulty,
        allocatedPoints: ap.points,
        averageAwardedPoints,
        accuracyRate,
      };
    });

    return {
      assessment: {
        id: assessment.id,
        title: assessment.title,
        status: assessment.status,
        durationMinutes: assessment.durationMinutes,
        passingScore: assessment.passingScore,
        totalScore: assessment.totalScore,
      },
      cohortMetrics: {
        totalInvitations: assessment._count.invitations,
        totalAttempts: attempts.length,
        attemptsByStatus,
      },
      performanceStats: {
        completedCandidates,
        passedCount,
        failedCount,
        passRate,
        averageScore,
        medianScore,
        highestScore,
        lowestScore,
        averagePercentage,
      },
      scoreDistribution,
      questionsPerformance,
    };
  }

  /**
   * Retrieve a detailed recruiter candidate scorecard including question rubrics,
   * candidate submitted code/essays, and evaluator feedback.
   */
  async getAttemptReport(
    attemptId: string,
    organizationId: string
  ): Promise<RecruiterAttemptReportResponse> {
    const attempt = await reportRepository.findAttemptDetailedById(
      attemptId,
      organizationId
    );

    if (!attempt) {
      throw AppError.notFound(
        "Assessment attempt not found or does not belong to active organization"
      );
    }

    if (attempt.status === "IN_PROGRESS") {
      throw AppError.badRequest(
        "Attempt is still in progress; scorecard is available only for submitted or completed attempts"
      );
    }

    const durationTakenMinutes =
      attempt.startedAt && attempt.submittedAt
        ? Math.round(
            (attempt.submittedAt.getTime() - attempt.startedAt.getTime()) / 60000
          )
        : null;

    // Map question scorecards ordered by orderIndex
    const questions = attempt.assessment.problems.map((ap) => {
      const answer = attempt.answers.find((a) => a.problemId === ap.problemId);

      const awardedPoints = ap.problem.type.startsWith("MCQ")
        ? answer?.autoScore ?? 0.0
        : answer?.evaluationScore?.awardedPoints ?? 0.0;

      // Extract MCQ options if applicable
      const mcqOptions = ap.problem.type.startsWith("MCQ")
        ? (ap.problem.mcqOptions as any) ?? []
        : undefined;

      return {
        problemId: ap.problemId,
        orderIndex: ap.orderIndex,
        title: ap.problem.title,
        type: ap.problem.type,
        difficulty: ap.problem.difficulty,
        description: ap.problem.description,
        allocatedPoints: ap.points,
        awardedPoints,
        candidateAnswer: {
          selectedOptions: answer?.selectedOptions ?? [],
          writtenAnswer: answer?.writtenAnswer ?? null,
          submittedCode: answer?.submittedCode ?? null,
          selectedLanguage: answer?.selectedLanguage ?? null,
        },
        mcqOptions,
        isCorrect: answer?.isCorrect ?? (ap.problem.type.startsWith("MCQ") ? false : null),
        evaluationRubric: ap.problem.evaluationRubric ?? undefined,
        reviewerFeedback: answer?.evaluationScore?.feedback ?? null,
      };
    });

    const evaluation = attempt.evaluation
      ? {
          evaluatorId: attempt.evaluation.evaluatorId,
          evaluatorName: attempt.evaluation.evaluator?.name ?? null,
          evaluatorEmail: attempt.evaluation.evaluator?.email ?? null,
          overallFeedback: attempt.evaluation.overallFeedback,
          evaluatedAt: attempt.evaluation.evaluatedAt
            ? attempt.evaluation.evaluatedAt.toISOString()
            : null,
        }
      : null;

    return {
      attemptId: attempt.id,
      candidate: {
        id: attempt.candidate.id,
        name: attempt.candidate.name,
        email: attempt.candidate.email,
      },
      assessment: {
        id: attempt.assessment.id,
        title: attempt.assessment.title,
        durationMinutes: attempt.assessment.durationMinutes,
        passingScore: attempt.assessment.passingScore,
        totalScore: attempt.assessment.totalScore,
      },
      timing: {
        startedAt: attempt.startedAt ? attempt.startedAt.toISOString() : null,
        submittedAt: attempt.submittedAt ? attempt.submittedAt.toISOString() : null,
        durationTakenMinutes,
      },
      scores: {
        autoScore: attempt.autoScore,
        manualScore: attempt.manualScore,
        totalScore: attempt.totalScore,
        totalPossibleScore: attempt.assessment.totalScore,
        percentage: attempt.percentage,
        passingScore: attempt.assessment.passingScore,
        isPassed: attempt.isPassed,
        status: attempt.status,
        evaluationStatus: attempt.evaluationStatus,
      },
      evaluation,
      questions,
    };
  }

  /**
   * Retrieve completed assessment results for an authenticated candidate.
   * Strips internal rubrics and MCQ answer keys to protect test integrity.
   */
  async getCandidateResults(
    candidateId: string,
    candidateEmail: string
  ): Promise<CandidateResultsResponse> {
    const attempts = await reportRepository.findCompletedAttemptsByCandidate(
      candidateId,
      candidateEmail
    );

    const results = attempts.map((attempt) => {
      const questions = attempt.assessment.problems.map((ap) => {
        const answer = attempt.answers.find((a) => a.problemId === ap.problemId);

        const awardedPoints = ap.problem.type.startsWith("MCQ")
          ? answer?.autoScore ?? 0.0
          : answer?.evaluationScore?.awardedPoints ?? 0.0;

        return {
          problemId: ap.problemId,
          orderIndex: ap.orderIndex,
          title: ap.problem.title,
          type: ap.problem.type,
          allocatedPoints: ap.points,
          awardedPoints,
          candidateAnswer: {
            selectedOptions: answer?.selectedOptions ?? [],
            writtenAnswer: answer?.writtenAnswer ?? null,
            submittedCode: answer?.submittedCode ?? null,
            selectedLanguage: answer?.selectedLanguage ?? null,
          },
          isCorrect: ap.problem.type.startsWith("MCQ") ? answer?.isCorrect ?? false : null,
          reviewerFeedback: answer?.evaluationScore?.feedback ?? null,
        };
      });

      return {
        attemptId: attempt.id,
        assessmentTitle: attempt.assessment.title,
        organizationName: attempt.assessment.organization.name,
        completedAt: attempt.submittedAt
          ? attempt.submittedAt.toISOString()
          : attempt.createdAt.toISOString(),
        totalScore: attempt.totalScore,
        totalPossibleScore: attempt.assessment.totalScore,
        percentage: attempt.percentage,
        isPassed: attempt.isPassed,
        overallFeedback: attempt.evaluation?.overallFeedback ?? null,
        questions,
      };
    });

    return { results };
  }
}

export const reportService = new ReportService();
