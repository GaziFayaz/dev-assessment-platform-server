import { z } from "zod";
import { extendZodWithOpenApi } from "@asteasolutions/zod-to-openapi";
import { registry } from "../../lib/openapi.js";
import {
  createApiResponseSchema,
  createPaginatedResponseSchema,
  ApiErrorResponseSchema,
} from "../../lib/openapi-schemas.js";

extendZodWithOpenApi(z);

// =============================================================
// ENUMS & PRIMITIVES
// =============================================================

export const EvaluationStatusEnum = z.enum([
  "NOT_REQUIRED",
  "PENDING",
  "IN_REVIEW",
  "EVALUATED",
]);
export type EvaluationStatus = z.infer<typeof EvaluationStatusEnum>;

export const QuestionTypeEnum = z.enum([
  "MCQ_SINGLE",
  "MCQ_MULTIPLE",
  "WRITTEN",
  "CODING",
]);
export type QuestionType = z.infer<typeof QuestionTypeEnum>;

// =============================================================
// PARAMS & QUERY SCHEMAS
// =============================================================

export const ReviewIdParamSchema = z.object({
  reviewId: z
    .string()
    .uuid("Invalid review UUID")
    .openapi({ example: "550e8400-e29b-41d4-a716-446655440000" }),
});
export type ReviewIdParam = z.infer<typeof ReviewIdParamSchema>;

export const EvaluationQueueQuerySchema = z.object({
  page: z.coerce
    .number()
    .int()
    .positive()
    .default(1)
    .openapi({ example: 1, param: { name: "page", in: "query" } }),
  limit: z.coerce
    .number()
    .int()
    .positive()
    .max(100)
    .default(20)
    .openapi({ example: 20, param: { name: "limit", in: "query" } }),
  status: EvaluationStatusEnum.optional().openapi({
    example: "PENDING",
    param: { name: "status", in: "query" },
  }),
  assessmentId: z
    .string()
    .uuid("Invalid assessment UUID")
    .optional()
    .openapi({
      example: "3fa85f64-5717-4562-b3fc-2c963f66afa6",
      param: { name: "assessmentId", in: "query" },
    }),
  evaluatorId: z
    .string()
    .optional()
    .openapi({
      example: "me",
      param: { name: "evaluatorId", in: "query" },
    }),
});
export type EvaluationQueueQuery = z.infer<typeof EvaluationQueueQuerySchema>;

// =============================================================
// REQUEST BODIES
// =============================================================

export const ClaimReviewBodySchema = z.object({
  unclaim: z
    .boolean()
    .optional()
    .default(false)
    .openapi({ example: false, description: "Set true to release claim back to queue" }),
});
export type ClaimReviewInput = z.infer<typeof ClaimReviewBodySchema>;

export const ScoreQuestionBodySchema = z.object({
  submissionAnswerId: z
    .string()
    .uuid("Invalid submission answer UUID")
    .openapi({ example: "a1b2c3d4-e5f6-7890-abcd-ef1234567890" }),
  awardedPoints: z
    .number()
    .min(0, "Awarded points cannot be negative")
    .openapi({ example: 18.5 }),
  feedback: z
    .string()
    .optional()
    .openapi({ example: "Good time complexity analysis, but missing null check edge case." }),
});
export type ScoreQuestionInput = z.infer<typeof ScoreQuestionBodySchema>;

export const FinalizeEvaluationBodySchema = z.object({
  overallFeedback: z
    .string()
    .optional()
    .openapi({ example: "Strong overall performance in coding and architectural questions." }),
});
export type FinalizeEvaluationInput = z.infer<typeof FinalizeEvaluationBodySchema>;

// =============================================================
// RESPONSE DTO SCHEMAS
// =============================================================

export const EvaluatorSummarySchema = z.object({
  id: z.string().openapi({ example: "user-123" }),
  name: z.string().openapi({ example: "Sarah Recruiter" }),
  email: z.string().email().openapi({ example: "recruiter@techcorp.dev" }),
});

export const EvaluationQueueItemSchema = z.object({
  reviewId: z.string().uuid().openapi({ example: "550e8400-e29b-41d4-a716-446655440000" }),
  attemptId: z.string().uuid().openapi({ example: "660e8400-e29b-41d4-a716-446655440001" }),
  candidateName: z.string().nullable().openapi({ example: "Bob Candidate" }),
  candidateEmail: z.string().email().openapi({ example: "bob@candidate.dev" }),
  assessmentId: z.string().uuid().openapi({ example: "770e8400-e29b-41d4-a716-446655440002" }),
  assessmentTitle: z.string().openapi({ example: "Full Stack Engineering Assessment" }),
  submittedAt: z.string().datetime().openapi({ example: "2026-09-23T10:30:00.000Z" }),
  evaluationStatus: EvaluationStatusEnum.openapi({ example: "PENDING" }),
  evaluator: EvaluatorSummarySchema.nullable(),
  subjectiveQuestionsCount: z.number().int().openapi({ example: 2 }),
  gradedQuestionsCount: z.number().int().openapi({ example: 0 }),
  autoScore: z.number().openapi({ example: 15.0 }),
  totalPossibleScore: z.number().openapi({ example: 65.0 }),
});
export type EvaluationQueueItem = z.infer<typeof EvaluationQueueItemSchema>;

export const EvaluationQuestionDetailSchema = z.object({
  submissionAnswerId: z.string().uuid().openapi({ example: "a1b2c3d4-e5f6-7890-abcd-ef1234567890" }),
  problemId: z.string().uuid().openapi({ example: "b2c3d4e5-f6a7-8901-bcde-f12345678901" }),
  title: z.string().openapi({ example: "Implement LRU Cache" }),
  type: QuestionTypeEnum.openapi({ example: "CODING" }),
  difficulty: z.string().openapi({ example: "MEDIUM" }),
  points: z.number().openapi({ example: 25.0, description: "Maximum points allocated in assessment" }),
  orderIndex: z.number().int().openapi({ example: 1 }),
  description: z.string().openapi({ example: "Design and implement a data structure..." }),
  evaluationRubric: z.string().nullable().openapi({ example: "Full points for O(1) get/put..." }),
  codingDetails: z.any().nullable().openapi({
    example: {
      allowedLanguages: ["typescript", "javascript", "python"],
      sampleIo: [{ input: "[1, 2]", output: "3" }],
    },
  }),
  candidateAnswer: z.object({
    selectedOptions: z.array(z.string()).default([]),
    writtenAnswer: z.string().nullable(),
    submittedCode: z.string().nullable(),
    selectedLanguage: z.string().nullable(),
  }),
  mcqGrading: z
    .object({
      autoScore: z.number(),
      isCorrect: z.boolean().nullable(),
    })
    .nullable(),
  score: z
    .object({
      id: z.string().uuid(),
      awardedPoints: z.number(),
      maxPoints: z.number(),
      feedback: z.string().nullable(),
      updatedAt: z.string().datetime(),
    })
    .nullable(),
});

export const EvaluationDetailResponseSchema = z.object({
  reviewId: z.string().uuid().openapi({ example: "550e8400-e29b-41d4-a716-446655440000" }),
  evaluationStatus: EvaluationStatusEnum.openapi({ example: "IN_REVIEW" }),
  evaluator: EvaluatorSummarySchema.nullable(),
  overallFeedback: z.string().nullable().openapi({ example: "Great submission overall." }),
  evaluatedAt: z.string().datetime().nullable(),
  candidate: z.object({
    id: z.string(),
    name: z.string().nullable(),
    email: z.string().email(),
  }),
  assessment: z.object({
    id: z.string().uuid(),
    title: z.string(),
    durationMinutes: z.number().int(),
    totalScore: z.number(),
    passingScore: z.number().nullable(),
  }),
  attempt: z.object({
    id: z.string().uuid(),
    startedAt: z.string().datetime().nullable(),
    submittedAt: z.string().datetime().nullable(),
    autoScore: z.number(),
    manualScore: z.number(),
    totalScore: z.number(),
    percentage: z.number(),
    isPassed: z.boolean().nullable(),
    status: z.string(),
  }),
  questions: z.array(EvaluationQuestionDetailSchema),
});

export const ClaimReviewResponseSchema = z.object({
  reviewId: z.string().uuid().openapi({ example: "550e8400-e29b-41d4-a716-446655440000" }),
  evaluationStatus: EvaluationStatusEnum.openapi({ example: "IN_REVIEW" }),
  evaluatorId: z.string().nullable().openapi({ example: "user-123" }),
  claimed: z.boolean().openapi({ example: true }),
});

export const ScoreQuestionResponseSchema = z.object({
  reviewId: z.string().uuid().openapi({ example: "550e8400-e29b-41d4-a716-446655440000" }),
  submissionAnswerId: z.string().uuid().openapi({ example: "a1b2c3d4-e5f6-7890-abcd-ef1234567890" }),
  awardedPoints: z.number().openapi({ example: 20.0 }),
  maxPoints: z.number().openapi({ example: 25.0 }),
  feedback: z.string().nullable().openapi({ example: "Clean code and optimal structure." }),
  attemptManualScore: z.number().openapi({ example: 20.0, description: "Updated intermediate manual score" }),
});

export const FinalizeEvaluationResponseSchema = z.object({
  reviewId: z.string().uuid().openapi({ example: "550e8400-e29b-41d4-a716-446655440000" }),
  attemptId: z.string().uuid().openapi({ example: "660e8400-e29b-41d4-a716-446655440001" }),
  evaluationStatus: EvaluationStatusEnum.openapi({ example: "EVALUATED" }),
  attemptStatus: z.string().openapi({ example: "COMPLETED" }),
  autoScore: z.number().openapi({ example: 15.0 }),
  manualScore: z.number().openapi({ example: 35.0 }),
  totalScore: z.number().openapi({ example: 50.0 }),
  percentage: z.number().openapi({ example: 76.92 }),
  isPassed: z.boolean().openapi({ example: true }),
  overallFeedback: z.string().nullable().openapi({ example: "Well done!" }),
  evaluatedAt: z.string().datetime(),
});

// =============================================================
// OPENAPI ROUTE REGISTRATIONS
// =============================================================

// 1. GET /evaluations/queue
registry.registerPath({
  method: "get",
  path: "/evaluations/queue",
  tags: ["Evaluations"],
  summary: "List attempts pending or undergoing human evaluation",
  description:
    "Returns paginated queue of assessment attempts requiring evaluation. Scoped strictly to the active tenant. Requires recruiter or company admin role.",
  security: [
    { BearerAuth: [], OrganizationContext: [] },
    { CookieAuth: [], OrganizationContext: [] },
  ],
  request: {
    query: EvaluationQueueQuerySchema,
  },
  responses: {
    200: {
      description: "Evaluation queue retrieved successfully",
      content: {
        "application/json": {
          schema: createPaginatedResponseSchema(EvaluationQueueItemSchema),
        },
      },
    },
    400: {
      description: "Bad Request: Missing organization context or invalid filter",
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
  },
});

// 2. GET /evaluations/{reviewId}
registry.registerPath({
  method: "get",
  path: "/evaluations/{reviewId}",
  tags: ["Evaluations"],
  summary: "Get comprehensive evaluation review details, rubrics, and candidate answers",
  description:
    "Returns complete assessment submission including candidate code, written answers, rubrics, and existing scorecards. Requires recruiter or company admin role.",
  security: [
    { BearerAuth: [], OrganizationContext: [] },
    { CookieAuth: [], OrganizationContext: [] },
  ],
  request: {
    params: ReviewIdParamSchema,
  },
  responses: {
    200: {
      description: "Evaluation review details retrieved successfully",
      content: {
        "application/json": {
          schema: createApiResponseSchema(EvaluationDetailResponseSchema),
        },
      },
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
      description: "Not Found: Evaluation review not found",
      content: { "application/json": { schema: ApiErrorResponseSchema } },
    },
  },
});

// 3. POST /evaluations/{reviewId}/claim
registry.registerPath({
  method: "post",
  path: "/evaluations/{reviewId}/claim",
  tags: ["Evaluations"],
  summary: "Claim or unclaim an evaluation review item",
  description:
    "Assigns the evaluation review to the calling recruiter or admin to prevent concurrent grading conflicts. Allows unclaiming back to the queue.",
  security: [
    { BearerAuth: [], OrganizationContext: [] },
    { CookieAuth: [], OrganizationContext: [] },
  ],
  request: {
    params: ReviewIdParamSchema,
    body: {
      content: {
        "application/json": {
          schema: ClaimReviewBodySchema,
        },
      },
    },
  },
  responses: {
    200: {
      description: "Claim state updated successfully",
      content: {
        "application/json": {
          schema: createApiResponseSchema(ClaimReviewResponseSchema),
        },
      },
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
      description: "Not Found: Evaluation review not found",
      content: { "application/json": { schema: ApiErrorResponseSchema } },
    },
    409: {
      description: "Conflict: Review is already claimed by another reviewer or finalized",
      content: { "application/json": { schema: ApiErrorResponseSchema } },
    },
  },
});

// 4. POST /evaluations/{reviewId}/score
registry.registerPath({
  method: "post",
  path: "/evaluations/{reviewId}/score",
  tags: ["Evaluations"],
  summary: "Score an individual question with marks and feedback against its rubric",
  description:
    "Records or updates awarded points and feedback for a written or coding challenge. Points must not exceed maximum question points.",
  security: [
    { BearerAuth: [], OrganizationContext: [] },
    { CookieAuth: [], OrganizationContext: [] },
  ],
  request: {
    params: ReviewIdParamSchema,
    body: {
      content: {
        "application/json": {
          schema: ScoreQuestionBodySchema,
        },
      },
    },
  },
  responses: {
    200: {
      description: "Question scored successfully",
      content: {
        "application/json": {
          schema: createApiResponseSchema(ScoreQuestionResponseSchema),
        },
      },
    },
    400: {
      description: "Bad Request: Awarded points exceed max points or question is not subjective",
      content: { "application/json": { schema: ApiErrorResponseSchema } },
    },
    401: {
      description: "Unauthorized: Active session required",
      content: { "application/json": { schema: ApiErrorResponseSchema } },
    },
    403: {
      description: "Forbidden: Not the assigned evaluator",
      content: { "application/json": { schema: ApiErrorResponseSchema } },
    },
    404: {
      description: "Not Found: Review or submission answer not found",
      content: { "application/json": { schema: ApiErrorResponseSchema } },
    },
    409: {
      description: "Conflict: Review is not in reviewable state",
      content: { "application/json": { schema: ApiErrorResponseSchema } },
    },
  },
});

// 5. POST /evaluations/{reviewId}/finalize
registry.registerPath({
  method: "post",
  path: "/evaluations/{reviewId}/finalize",
  tags: ["Evaluations"],
  summary: "Finalize evaluation review, calculate final total scores, and complete attempt",
  description:
    "Finalizes scoring once all subjective questions are graded. Aggregates autoScore and manualScore, calculates percentage, determines pass/fail status, and marks attempt as COMPLETED.",
  security: [
    { BearerAuth: [], OrganizationContext: [] },
    { CookieAuth: [], OrganizationContext: [] },
  ],
  request: {
    params: ReviewIdParamSchema,
    body: {
      content: {
        "application/json": {
          schema: FinalizeEvaluationBodySchema,
        },
      },
    },
  },
  responses: {
    200: {
      description: "Evaluation finalized successfully",
      content: {
        "application/json": {
          schema: createApiResponseSchema(FinalizeEvaluationResponseSchema),
        },
      },
    },
    400: {
      description: "Bad Request: Unscored subjective questions remain",
      content: { "application/json": { schema: ApiErrorResponseSchema } },
    },
    401: {
      description: "Unauthorized: Active session required",
      content: { "application/json": { schema: ApiErrorResponseSchema } },
    },
    403: {
      description: "Forbidden: Not the assigned evaluator",
      content: { "application/json": { schema: ApiErrorResponseSchema } },
    },
    404: {
      description: "Not Found: Evaluation review not found",
      content: { "application/json": { schema: ApiErrorResponseSchema } },
    },
    409: {
      description: "Conflict: Review is already finalized",
      content: { "application/json": { schema: ApiErrorResponseSchema } },
    },
  },
});
