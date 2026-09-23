import { z } from "zod";
import { extendZodWithOpenApi } from "@asteasolutions/zod-to-openapi";
import { registry } from "../../lib/openapi.js";
import {
  createApiResponseSchema,
  ApiErrorResponseSchema,
} from "../../lib/openapi-schemas.js";

extendZodWithOpenApi(z);

// =============================================================
// PARAMS & QUERY SCHEMAS
// =============================================================

export const AssessmentSummaryParamsSchema = z.object({
  id: z
    .string()
    .uuid("Invalid assessment UUID")
    .openapi({ example: "3fa85f64-5717-4562-b3fc-2c963f66afa6" }),
});
export type AssessmentSummaryParams = z.infer<typeof AssessmentSummaryParamsSchema>;

export const AttemptReportParamsSchema = z.object({
  attemptId: z
    .string()
    .uuid("Invalid attempt UUID")
    .openapi({ example: "550e8400-e29b-41d4-a716-446655440000" }),
});
export type AttemptReportParams = z.infer<typeof AttemptReportParamsSchema>;

// =============================================================
// DATA TRANSFER OBJECTS: ASSESSMENT SUMMARY
// =============================================================

export const ScoreDistributionBucketSchema = z.object({
  bucket: z.string().openapi({ example: "81-100%" }),
  count: z.number().int().nonnegative().openapi({ example: 4 }),
  percentage: z.number().openapi({ example: 40.0 }),
});

export const ProblemPerformanceSummarySchema = z.object({
  problemId: z.string().uuid().openapi({ example: "a1b2c3d4-e5f6-7890-abcd-ef1234567890" }),
  orderIndex: z.number().int().openapi({ example: 1 }),
  title: z.string().openapi({ example: "Implement LRU Cache" }),
  type: z.enum(["MCQ_SINGLE", "MCQ_MULTIPLE", "WRITTEN", "CODING"]).openapi({ example: "CODING" }),
  difficulty: z.enum(["EASY", "MEDIUM", "HARD"]).openapi({ example: "MEDIUM" }),
  allocatedPoints: z.number().openapi({ example: 30.0 }),
  averageAwardedPoints: z.number().openapi({ example: 25.5 }),
  accuracyRate: z.number().nullable().optional().openapi({ example: 85.0 }), // For MCQs
});

export const AssessmentSummaryResponseSchema = z.object({
  assessment: z.object({
    id: z.string().uuid().openapi({ example: "3fa85f64-5717-4562-b3fc-2c963f66afa6" }),
    title: z.string().openapi({ example: "Senior Backend Developer Assessment" }),
    status: z.enum(["DRAFT", "PUBLISHED", "ACTIVE", "CLOSED", "ARCHIVED"]).openapi({ example: "ACTIVE" }),
    durationMinutes: z.number().int().openapi({ example: 60 }),
    passingScore: z.number().nullable().openapi({ example: 70.0 }),
    totalScore: z.number().openapi({ example: 100.0 }),
  }),
  cohortMetrics: z.object({
    totalInvitations: z.number().int().nonnegative().openapi({ example: 15 }),
    totalAttempts: z.number().int().nonnegative().openapi({ example: 12 }),
    attemptsByStatus: z.object({
      IN_PROGRESS: z.number().int().nonnegative().openapi({ example: 2 }),
      SUBMITTED: z.number().int().nonnegative().openapi({ example: 1 }),
      AUTO_SUBMITTED: z.number().int().nonnegative().openapi({ example: 0 }),
      UNDER_REVIEW: z.number().int().nonnegative().openapi({ example: 1 }),
      COMPLETED: z.number().int().nonnegative().openapi({ example: 8 }),
    }),
  }),
  performanceStats: z.object({
    completedCandidates: z.number().int().nonnegative().openapi({ example: 8 }),
    passedCount: z.number().int().nonnegative().openapi({ example: 6 }),
    failedCount: z.number().int().nonnegative().openapi({ example: 2 }),
    passRate: z.number().openapi({ example: 75.0 }),
    averageScore: z.number().openapi({ example: 78.5 }),
    medianScore: z.number().openapi({ example: 80.0 }),
    highestScore: z.number().openapi({ example: 95.0 }),
    lowestScore: z.number().openapi({ example: 45.0 }),
    averagePercentage: z.number().openapi({ example: 78.5 }),
  }),
  scoreDistribution: z.array(ScoreDistributionBucketSchema),
  questionsPerformance: z.array(ProblemPerformanceSummarySchema),
});
export type AssessmentSummaryResponse = z.infer<typeof AssessmentSummaryResponseSchema>;

// =============================================================
// DATA TRANSFER OBJECTS: RECRUITER CANDIDATE SCORECARD
// =============================================================

export const RecruiterQuestionScorecardSchema = z.object({
  problemId: z.string().uuid().openapi({ example: "a1b2c3d4-e5f6-7890-abcd-ef1234567890" }),
  orderIndex: z.number().int().openapi({ example: 1 }),
  title: z.string().openapi({ example: "SQL Database Indexing Strategy" }),
  type: z.enum(["MCQ_SINGLE", "MCQ_MULTIPLE", "WRITTEN", "CODING"]).openapi({ example: "WRITTEN" }),
  difficulty: z.enum(["EASY", "MEDIUM", "HARD"]).openapi({ example: "MEDIUM" }),
  description: z.string().openapi({ example: "Explain B-Tree indexing..." }),
  allocatedPoints: z.number().openapi({ example: 20.0 }),
  awardedPoints: z.number().openapi({ example: 18.0 }),
  // Response details
  candidateAnswer: z.object({
    selectedOptions: z.array(z.string()).openapi({ example: [] }),
    writtenAnswer: z.string().nullable().openapi({ example: "B-Tree indexes improve..." }),
    submittedCode: z.string().nullable().openapi({ example: null }),
    selectedLanguage: z.string().nullable().openapi({ example: null }),
  }),
  // For MCQs
  mcqOptions: z
    .array(
      z.object({
        id: z.string().openapi({ example: "opt-1" }),
        text: z.string().openapi({ example: "Option A" }),
        isCorrect: z.boolean().openapi({ example: true }),
      })
    )
    .optional(),
  isCorrect: z.boolean().nullable().optional().openapi({ example: true }),
  // Rubrics & Feedback (Recruiter / Admin view)
  evaluationRubric: z.any().optional(),
  reviewerFeedback: z.string().nullable().optional().openapi({ example: "Well structured explanation." }),
});

export const RecruiterAttemptReportResponseSchema = z.object({
  attemptId: z.string().uuid().openapi({ example: "550e8400-e29b-41d4-a716-446655440000" }),
  candidate: z.object({
    id: z.string().openapi({ example: "user-123" }),
    name: z.string().nullable().openapi({ example: "Alice Johnson" }),
    email: z.string().email().openapi({ example: "alice@candidate.dev" }),
  }),
  assessment: z.object({
    id: z.string().uuid().openapi({ example: "3fa85f64-5717-4562-b3fc-2c963f66afa6" }),
    title: z.string().openapi({ example: "Senior Backend Developer Assessment" }),
    durationMinutes: z.number().int().openapi({ example: 60 }),
    passingScore: z.number().nullable().openapi({ example: 70.0 }),
    totalScore: z.number().openapi({ example: 100.0 }),
  }),
  timing: z.object({
    startedAt: z.string().datetime().nullable().openapi({ example: "2026-09-23T10:00:00Z" }),
    submittedAt: z.string().datetime().nullable().openapi({ example: "2026-09-23T10:45:00Z" }),
    durationTakenMinutes: z.number().nullable().openapi({ example: 45 }),
  }),
  scores: z.object({
    autoScore: z.number().openapi({ example: 40.0 }),
    manualScore: z.number().openapi({ example: 50.0 }),
    totalScore: z.number().openapi({ example: 90.0 }),
    totalPossibleScore: z.number().openapi({ example: 100.0 }),
    percentage: z.number().openapi({ example: 90.0 }),
    passingScore: z.number().nullable().openapi({ example: 70.0 }),
    isPassed: z.boolean().nullable().openapi({ example: true }),
    status: z.enum(["INVITED", "IN_PROGRESS", "SUBMITTED", "AUTO_SUBMITTED", "UNDER_REVIEW", "COMPLETED", "EXPIRED"]).openapi({ example: "COMPLETED" }),
    evaluationStatus: z.enum(["NOT_REQUIRED", "PENDING", "IN_REVIEW", "EVALUATED"]).openapi({ example: "EVALUATED" }),
  }),
  evaluation: z
    .object({
      evaluatorId: z.string().nullable().openapi({ example: "recruiter-123" }),
      evaluatorName: z.string().nullable().openapi({ example: "Sarah Recruiter" }),
      evaluatorEmail: z.string().nullable().openapi({ example: "recruiter@techcorp.dev" }),
      overallFeedback: z.string().nullable().openapi({ example: "Excellent grasp of backend concurrency." }),
      evaluatedAt: z.string().datetime().nullable().openapi({ example: "2026-09-23T12:00:00Z" }),
    })
    .nullable(),
  questions: z.array(RecruiterQuestionScorecardSchema),
});
export type RecruiterAttemptReportResponse = z.infer<typeof RecruiterAttemptReportResponseSchema>;

// =============================================================
// DATA TRANSFER OBJECTS: CANDIDATE PERSONAL RESULTS
// =============================================================

export const CandidateQuestionResultSchema = z.object({
  problemId: z.string().uuid().openapi({ example: "a1b2c3d4-e5f6-7890-abcd-ef1234567890" }),
  orderIndex: z.number().int().openapi({ example: 1 }),
  title: z.string().openapi({ example: "Design and Implement an LRU Cache" }),
  type: z.enum(["MCQ_SINGLE", "MCQ_MULTIPLE", "WRITTEN", "CODING"]).openapi({ example: "CODING" }),
  allocatedPoints: z.number().openapi({ example: 40.0 }),
  awardedPoints: z.number().openapi({ example: 35.0 }),
  candidateAnswer: z.object({
    selectedOptions: z.array(z.string()).openapi({ example: [] }),
    writtenAnswer: z.string().nullable().openapi({ example: null }),
    submittedCode: z.string().nullable().openapi({ example: "class LRUCache { ... }" }),
    selectedLanguage: z.string().nullable().openapi({ example: "typescript" }),
  }),
  isCorrect: z.boolean().nullable().optional().openapi({ example: null }), // Only for MCQs
  reviewerFeedback: z.string().nullable().optional().openapi({ example: "Great use of doubly linked list." }),
});

export const CandidateAttemptCardSchema = z.object({
  attemptId: z.string().uuid().openapi({ example: "550e8400-e29b-41d4-a716-446655440000" }),
  assessmentTitle: z.string().openapi({ example: "Senior Backend Developer Assessment" }),
  organizationName: z.string().openapi({ example: "TechCorp Solutions" }),
  completedAt: z.string().datetime().nullable().openapi({ example: "2026-09-23T10:45:00Z" }),
  totalScore: z.number().openapi({ example: 90.0 }),
  totalPossibleScore: z.number().openapi({ example: 100.0 }),
  percentage: z.number().openapi({ example: 90.0 }),
  isPassed: z.boolean().nullable().openapi({ example: true }),
  overallFeedback: z.string().nullable().openapi({ example: "Strong performance overall." }),
  questions: z.array(CandidateQuestionResultSchema),
});

export const CandidateResultsResponseSchema = z.object({
  results: z.array(CandidateAttemptCardSchema),
});
export type CandidateResultsResponse = z.infer<typeof CandidateResultsResponseSchema>;

// =============================================================
// OPENAPI ROUTE REGISTRATIONS
// =============================================================

// 1. GET /reports/assessments/{id}/summary
registry.registerPath({
  method: "get",
  path: "/reports/assessments/{id}/summary",
  tags: ["Reports"],
  summary: "Get assessment performance analytics, pass rates, and score distribution",
  description:
    "Returns aggregate assessment metrics including invitation statistics, completion and pass rates, score distribution histogram, and question-level difficulty benchmarks. Requires company admin or recruiter role.",
  security: [
    { BearerAuth: [], OrganizationContext: [] },
    { CookieAuth: [], OrganizationContext: [] },
  ],
  request: {
    params: AssessmentSummaryParamsSchema,
  },
  responses: {
    200: {
      description: "Assessment analytics summary retrieved successfully",
      content: {
        "application/json": {
          schema: createApiResponseSchema(AssessmentSummaryResponseSchema),
        },
      },
    },
    400: {
      description: "Bad Request: Invalid parameters",
      content: { "application/json": { schema: ApiErrorResponseSchema } },
    },
    401: {
      description: "Unauthorized: Active session required",
      content: { "application/json": { schema: ApiErrorResponseSchema } },
    },
    403: {
      description: "Forbidden: Insufficient company permissions",
      content: { "application/json": { schema: ApiErrorResponseSchema } },
    },
    404: {
      description: "Not Found: Assessment not found in active organization",
      content: { "application/json": { schema: ApiErrorResponseSchema } },
    },
  },
});

// 2. GET /reports/attempts/{attemptId}
registry.registerPath({
  method: "get",
  path: "/reports/attempts/{attemptId}",
  tags: ["Reports"],
  summary: "Get detailed recruiter candidate scorecard with rubrics and feedback",
  description:
    "Returns a comprehensive candidate scorecard including timing, auto-grading, rubric evaluations, itemized scoring, and candidate responses. Requires company admin or recruiter role.",
  security: [
    { BearerAuth: [], OrganizationContext: [] },
    { CookieAuth: [], OrganizationContext: [] },
  ],
  request: {
    params: AttemptReportParamsSchema,
  },
  responses: {
    200: {
      description: "Candidate scorecard retrieved successfully",
      content: {
        "application/json": {
          schema: createApiResponseSchema(RecruiterAttemptReportResponseSchema),
        },
      },
    },
    400: {
      description: "Bad Request: Attempt is still in progress",
      content: { "application/json": { schema: ApiErrorResponseSchema } },
    },
    401: {
      description: "Unauthorized: Active session required",
      content: { "application/json": { schema: ApiErrorResponseSchema } },
    },
    403: {
      description: "Forbidden: Insufficient company permissions",
      content: { "application/json": { schema: ApiErrorResponseSchema } },
    },
    404: {
      description: "Not Found: Attempt not found in active organization",
      content: { "application/json": { schema: ApiErrorResponseSchema } },
    },
  },
});

// 3. GET /reports/candidate/my-results
registry.registerPath({
  method: "get",
  path: "/reports/candidate/my-results",
  tags: ["Reports"],
  summary: "Get candidate's own completed assessment scorecards and feedback",
  description:
    "Allows authenticated candidates to view their verified assessment results, scores, and evaluator feedback. Internal rubrics and question answer keys are securely scrubbed. Requires candidate authentication.",
  security: [
    { BearerAuth: [] },
    { CookieAuth: [] },
  ],
  responses: {
    200: {
      description: "Candidate results retrieved successfully",
      content: {
        "application/json": {
          schema: createApiResponseSchema(CandidateResultsResponseSchema),
        },
      },
    },
    401: {
      description: "Unauthorized: Candidate authentication required",
      content: { "application/json": { schema: ApiErrorResponseSchema } },
    },
  },
});
