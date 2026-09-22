import {
  attemptRepository,
  AttemptWithAssessmentAndAnswers,
} from "./attempt.repository.js";
import {
  SaveAnswerInput,
  CandidateAttemptResponse,
  CandidateProblem,
  SubmitAttemptResponse,
} from "./attempt.schema.js";
import {
  AttemptStatus,
  EvaluationStatus,
} from "../../generated/client/client.js";
import { AppError } from "../../errors/app-error.js";

export class AttemptService {
  /**
   * Project a database problem into a sanitized candidate-safe DTO.
   * Strictly strips correct answer indicators, rubrics, and hidden test cases.
   */
  sanitizeProblemForCandidate(
    problem: AttemptWithAssessmentAndAnswers["assessment"]["problems"][0]["problem"],
    orderIndex: number,
    points: number
  ): CandidateProblem {
    // 1. Scrub MCQ options (NEVER leak isCorrect)
    let mcqOptions: CandidateProblem["mcqOptions"] = undefined;
    if (problem.mcqOptions && Array.isArray(problem.mcqOptions)) {
      mcqOptions = problem.mcqOptions.map((opt: any) => ({
        id: String(opt.id),
        text: String(opt.text || ""),
      }));
    }

    // 2. Scrub Coding details (only public starterCode, sampleIo, allowedLanguages)
    let codingDetails: CandidateProblem["codingDetails"] = undefined;
    if (problem.codingDetails && typeof problem.codingDetails === "object") {
      const details = problem.codingDetails as any;
      codingDetails = {
        allowedLanguages: Array.isArray(details.allowedLanguages)
          ? details.allowedLanguages
          : undefined,
        starterCode:
          details.starterCode && typeof details.starterCode === "object"
            ? details.starterCode
            : undefined,
        sampleIo: Array.isArray(details.sampleIo)
          ? details.sampleIo.map((io: any) => ({
              input: String(io.input || ""),
              output: String(io.output || ""),
              explanation: io.explanation ? String(io.explanation) : undefined,
            }))
          : undefined,
      };
    }

    return {
      problemId: problem.id,
      orderIndex,
      points,
      title: problem.title,
      description: problem.description,
      type: problem.type,
      difficulty: problem.difficulty,
      mcqOptions,
      codingDetails,
    };
  }

  /**
   * Deterministic MCQ answer grading helper.
   * Compares candidate's selected option IDs to the correct option IDs.
   */
  gradeMcqAnswer(
    selectedOptions: string[] | undefined,
    mcqOptions: any,
    points: number
  ): { autoScore: number; isCorrect: boolean } {
    if (!Array.isArray(mcqOptions) || mcqOptions.length === 0) {
      return { autoScore: 0.0, isCorrect: false };
    }

    // Extract exact correct option IDs
    const correctOptionIds = mcqOptions
      .filter((opt: any) => opt.isCorrect === true)
      .map((opt: any) => String(opt.id).trim())
      .sort();

    // Normalize candidate selected options
    const candidateOptionIds = (selectedOptions || [])
      .map((id) => String(id).trim())
      .filter(Boolean)
      .sort();

    // Check exact set equality
    const isExactMatch =
      correctOptionIds.length > 0 &&
      correctOptionIds.length === candidateOptionIds.length &&
      correctOptionIds.every((id, idx) => id === candidateOptionIds[idx]);

    return {
      autoScore: isExactMatch ? points : 0.0,
      isCorrect: isExactMatch,
    };
  }

  /**
   * Calculate remaining seconds until hard deadline
   */
  calculateRemainingSeconds(expiresAt: Date | null): number {
    if (!expiresAt) return 0;
    return Math.max(0, Math.floor((expiresAt.getTime() - Date.now()) / 1000));
  }

  /**
   * Format full candidate-safe attempt session response
   */
  formatAttemptResponse(
    attempt: AttemptWithAssessmentAndAnswers
  ): CandidateAttemptResponse {
    const sanitizedProblems = (attempt.assessment.problems || []).map((ap) =>
      this.sanitizeProblemForCandidate(ap.problem, ap.orderIndex, ap.points)
    );

    const answers = (attempt.answers || []).map((ans) => ({
      problemId: ans.problemId,
      selectedOptions: ans.selectedOptions || [],
      writtenAnswer: ans.writtenAnswer,
      submittedCode: ans.submittedCode,
      selectedLanguage: ans.selectedLanguage,
      updatedAt: ans.updatedAt ? ans.updatedAt.toISOString() : undefined,
    }));

    return {
      id: attempt.id,
      assessmentId: attempt.assessmentId,
      title: attempt.assessment.title,
      description: attempt.assessment.description,
      instructions: attempt.assessment.instructions,
      durationMinutes: attempt.assessment.durationMinutes,
      status: attempt.status as any,
      startedAt: (attempt.startedAt || attempt.createdAt).toISOString(),
      expiresAt: attempt.expiresAt
        ? attempt.expiresAt.toISOString()
        : new Date().toISOString(),
      remainingSeconds: this.calculateRemainingSeconds(attempt.expiresAt),
      problems: sanitizedProblems,
      answers,
    };
  }

  /**
   * Start or resume an assessment attempt (Option B verification gate)
   */
  async startAttempt(
    userId: string,
    userEmail: string,
    inviteToken: string
  ): Promise<{ attempt: CandidateAttemptResponse; isResumed: boolean }> {
    // 1. Fetch invitation with parent assessment and problems
    const invitation = await attemptRepository.findInvitationByToken(inviteToken);
    if (!invitation) {
      throw AppError.notFound("Invitation token not found", "INVITATION_NOT_FOUND");
    }

    // 2. Strict Option B account email match check
    if (
      invitation.candidateEmail.toLowerCase().trim() !==
      userEmail.toLowerCase().trim()
    ) {
      throw AppError.forbidden(
        "Forbidden: Authenticated account email does not match invitation recipient",
        "EMAIL_MISMATCH"
      );
    }

    // 3. Expiration check
    if (new Date() > invitation.expiresAt) {
      throw AppError.gone(
        "Invitation token has expired",
        "INVITATION_EXPIRED"
      );
    }

    // 4. Assessment status and window checks
    const assessment = invitation.assessment;
    if (assessment.status !== "PUBLISHED" && assessment.status !== "ACTIVE") {
      throw AppError.conflict(
        `Assessment is not open for attempts (current status: ${assessment.status})`,
        "ASSESSMENT_NOT_OPEN"
      );
    }

    const now = new Date();
    if (assessment.validFrom && now < assessment.validFrom) {
      throw AppError.conflict(
        "Assessment is not open yet",
        "ASSESSMENT_NOT_STARTED"
      );
    }
    if (assessment.validUntil && now > assessment.validUntil) {
      throw AppError.conflict(
        "Assessment validity window has closed",
        "ASSESSMENT_WINDOW_CLOSED"
      );
    }

    // 5. Check if an attempt already exists
    const existingAttempt = await attemptRepository.findExistingAttempt(
      assessment.id,
      userId
    );

    if (existingAttempt) {
      // If already submitted/completed, reject re-entry
      if (
        existingAttempt.status === AttemptStatus.SUBMITTED ||
        existingAttempt.status === AttemptStatus.AUTO_SUBMITTED ||
        existingAttempt.status === AttemptStatus.UNDER_REVIEW ||
        existingAttempt.status === AttemptStatus.COMPLETED
      ) {
        throw AppError.conflict(
          "Assessment attempt has already been submitted",
          "ATTEMPT_ALREADY_SUBMITTED"
        );
      }

      // If IN_PROGRESS, check timer
      if (existingAttempt.status === AttemptStatus.IN_PROGRESS) {
        if (
          existingAttempt.expiresAt &&
          Date.now() > existingAttempt.expiresAt.getTime()
        ) {
          // Timer expired: trigger auto-submit
          await this.executeSubmission(existingAttempt, true);
          throw AppError.conflict(
            "Assessment attempt time has expired and the session was auto-submitted",
            "ATTEMPT_TIMER_EXPIRED"
          );
        }

        // Active session: safely resume
        return {
          attempt: this.formatAttemptResponse(existingAttempt),
          isResumed: true,
        };
      }
    }

    // 6. Create new attempt
    const durationMs = assessment.durationMinutes * 60 * 1000;
    const gracePeriodMs = 60 * 1000; // 60s network grace period
    const startedAt = new Date();
    const expiresAt = new Date(startedAt.getTime() + durationMs + gracePeriodMs);

    const hasSubjective = (assessment.problems || []).some(
      (ap) =>
        ap.problem.type === "WRITTEN" || ap.problem.type === "CODING"
    );
    const evaluationStatus = hasSubjective
      ? EvaluationStatus.PENDING
      : EvaluationStatus.NOT_REQUIRED;

    const newAttempt = await attemptRepository.createAttempt({
      assessmentId: assessment.id,
      invitationId: invitation.id,
      candidateId: userId,
      candidateEmail: userEmail,
      status: AttemptStatus.IN_PROGRESS,
      startedAt,
      expiresAt,
      evaluationStatus,
    });

    return {
      attempt: this.formatAttemptResponse(newAttempt),
      isResumed: false,
    };
  }

  /**
   * Get candidate attempt session and remaining countdown time.
   * Auto-finalizes attempt if timer expired.
   */
  async getAttempt(
    userId: string,
    attemptId: string
  ): Promise<CandidateAttemptResponse> {
    let attempt = await attemptRepository.findById(attemptId);
    if (!attempt) {
      throw AppError.notFound("Assessment attempt not found", "ATTEMPT_NOT_FOUND");
    }

    if (attempt.candidateId !== userId) {
      throw AppError.forbidden(
        "Forbidden: Insufficient permissions to view this attempt",
        "ACCESS_DENIED"
      );
    }

    // Server-authoritative timer check
    if (
      attempt.status === AttemptStatus.IN_PROGRESS &&
      attempt.expiresAt &&
      Date.now() > attempt.expiresAt.getTime()
    ) {
      await this.executeSubmission(attempt, true);
      // Reload updated attempt
      attempt = (await attemptRepository.findById(attemptId))!;
    }

    return this.formatAttemptResponse(attempt);
  }

  /**
   * Autosave answer draft for a specific problem.
   * Enforces server timer and submission immutability.
   */
  async saveAnswer(
    userId: string,
    attemptId: string,
    input: SaveAnswerInput
  ): Promise<{ problemId: string; savedAt: string }> {
    const attempt = await attemptRepository.findById(attemptId);
    if (!attempt) {
      throw AppError.notFound("Assessment attempt not found", "ATTEMPT_NOT_FOUND");
    }

    if (attempt.candidateId !== userId) {
      throw AppError.forbidden(
        "Forbidden: Not the owner of this attempt",
        "ACCESS_DENIED"
      );
    }

    // Submission immutability check
    if (attempt.status !== AttemptStatus.IN_PROGRESS) {
      throw AppError.conflict(
        `Cannot modify answers for an attempt with status: ${attempt.status}`,
        "SUBMISSION_IMMUTABLE"
      );
    }

    // Server timer check
    if (attempt.expiresAt && Date.now() > attempt.expiresAt.getTime()) {
      await this.executeSubmission(attempt, true);
      throw AppError.conflict(
        "Assessment timer has expired. Attempt has been auto-submitted.",
        "ATTEMPT_TIMER_EXPIRED"
      );
    }

    // Validate problem belongs to this assessment
    const isProblemInAssessment = (attempt.assessment.problems || []).some(
      (ap) => ap.problem.id === input.problemId
    );
    if (!isProblemInAssessment) {
      throw AppError.badRequest(
        "Specified problem is not part of this assessment",
        "PROBLEM_NOT_IN_ASSESSMENT"
      );
    }

    await attemptRepository.upsertAnswer(attemptId, input.problemId, {
      selectedOptions: input.selectedOptions,
      writtenAnswer: input.writtenAnswer,
      submittedCode: input.submittedCode,
      selectedLanguage: input.selectedLanguage,
    });

    return {
      problemId: input.problemId,
      savedAt: new Date().toISOString(),
    };
  }

  /**
   * Finalize and submit assessment attempt
   */
  async submitAttempt(
    userId: string,
    attemptId: string
  ): Promise<SubmitAttemptResponse> {
    const attempt = await attemptRepository.findById(attemptId);
    if (!attempt) {
      throw AppError.notFound("Assessment attempt not found", "ATTEMPT_NOT_FOUND");
    }

    if (attempt.candidateId !== userId) {
      throw AppError.forbidden(
        "Forbidden: Not the owner of this attempt",
        "ACCESS_DENIED"
      );
    }

    if (attempt.status !== AttemptStatus.IN_PROGRESS) {
      throw AppError.conflict(
        `Attempt has already been submitted (status: ${attempt.status})`,
        "ATTEMPT_ALREADY_SUBMITTED"
      );
    }

    const isExpired = attempt.expiresAt
      ? Date.now() > attempt.expiresAt.getTime()
      : false;

    return this.executeSubmission(attempt, isExpired);
  }

  /**
   * Internal submission execution engine:
   * Auto-scores MCQs, routes subjective questions to evaluation queue, or completes 100% MCQ attempts.
   */
  async executeSubmission(
    attempt: AttemptWithAssessmentAndAnswers,
    isExpired: boolean
  ): Promise<SubmitAttemptResponse> {
    const now = new Date();

    // 1. Grade all MCQ problems in the assessment
    const scoredMcqs: Array<{
      attemptId: string;
      problemId: string;
      autoScore: number;
      isCorrect: boolean;
      selectedOptions: string[];
    }> = [];

    let totalAutoScore = 0.0;

    for (const ap of attempt.assessment.problems || []) {
      if (
        ap.problem.type === "MCQ_SINGLE" ||
        ap.problem.type === "MCQ_MULTIPLE"
      ) {
        const candidateAnswer = (attempt.answers || []).find(
          (ans) => ans.problemId === ap.problem.id
        );
        const selectedOptions = candidateAnswer?.selectedOptions || [];
        const grading = this.gradeMcqAnswer(
          selectedOptions,
          ap.problem.mcqOptions,
          ap.points
        );

        scoredMcqs.push({
          attemptId: attempt.id,
          problemId: ap.problem.id,
          autoScore: grading.autoScore,
          isCorrect: grading.isCorrect,
          selectedOptions,
        });

        totalAutoScore += grading.autoScore;
      }
    }

    // Persist MCQ scores to submission answers
    if (scoredMcqs.length > 0) {
      await attemptRepository.updateMcqScores(scoredMcqs);
    }

    // 2. Evaluation routing logic
    const hasSubjective = (attempt.assessment.problems || []).some(
      (ap) =>
        ap.problem.type === "WRITTEN" || ap.problem.type === "CODING"
    );

    let finalStatus: AttemptStatus;
    let evaluationStatus: EvaluationStatus;
    let manualScore = 0.0;
    let totalScore = totalAutoScore;
    let percentage: number | null = null;
    let isPassed: boolean | null = null;
    let createEvaluationReview = false;
    let responseMessage: string;

    if (hasSubjective) {
      // Contains written/coding questions -> Routed to Evaluation Queue
      finalStatus = AttemptStatus.UNDER_REVIEW;
      evaluationStatus = EvaluationStatus.PENDING;
      createEvaluationReview = true;
      responseMessage = isExpired
        ? "Time expired: Assessment auto-submitted and routed to evaluation queue for manual review."
        : "Assessment submitted successfully and routed to evaluation queue for manual review.";
    } else {
      // 100% MCQ Assessment -> Completed immediately
      finalStatus = AttemptStatus.COMPLETED;
      evaluationStatus = EvaluationStatus.NOT_REQUIRED;
      percentage =
        attempt.assessment.totalScore > 0
          ? Number(
              ((totalScore / attempt.assessment.totalScore) * 100).toFixed(2)
            )
          : 0.0;
      isPassed =
        attempt.assessment.passingScore !== null
          ? totalScore >= attempt.assessment.passingScore
          : true;
      responseMessage = isExpired
        ? "Time expired: Assessment auto-submitted and automatically graded."
        : "Assessment submitted and automatically graded successfully.";
    }

    await attemptRepository.finalizeAttempt(attempt.id, {
      status: finalStatus,
      submittedAt: now,
      autoScore: totalAutoScore,
      manualScore,
      totalScore,
      percentage: percentage ?? 0.0,
      isPassed,
      evaluationStatus,
      createEvaluationReview,
    });

    return {
      attemptId: attempt.id,
      assessmentId: attempt.assessmentId,
      status: finalStatus as any,
      submittedAt: now.toISOString(),
      evaluationStatus: evaluationStatus as any,
      autoScore: totalAutoScore,
      manualScore,
      totalScore,
      percentage,
      isPassed,
      message: responseMessage,
    };
  }
}

export const attemptService = new AttemptService();
