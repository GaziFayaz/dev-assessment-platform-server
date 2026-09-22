import { z } from "zod";
import { extendZodWithOpenApi } from "@asteasolutions/zod-to-openapi";
import { registry } from "../../lib/openapi.js";
import {
  createApiResponseSchema,
  ApiErrorResponseSchema,
} from "../../lib/openapi-schemas.js";

extendZodWithOpenApi(z);

// =============================================================
// ENUMS & PRIMITIVES
// =============================================================

export const AttemptStatusEnum = z.enum([
  "INVITED",
  "IN_PROGRESS",
  "SUBMITTED",
  "AUTO_SUBMITTED",
  "UNDER_REVIEW",
  "COMPLETED",
  "EXPIRED",
]);
export type AttemptStatus = z.infer<typeof AttemptStatusEnum>;

export const EvaluationStatusEnum = z.enum([
  "NOT_REQUIRED",
  "PENDING",
  "IN_REVIEW",
  "EVALUATED",
]);
export type EvaluationStatus = z.infer<typeof EvaluationStatusEnum>;

// =============================================================
// REQUEST DTOs
// =============================================================

export const StartAttemptBodySchema = z.object({
  inviteToken: z
    .string()
    .min(1, "Invitation token is required")
    .openapi({ example: "c2e5b7fb-65b1-4c6e-826a-fa0ad84e031b" }),
});
export type StartAttemptInput = z.infer<typeof StartAttemptBodySchema>;

export const AttemptIdParamSchema = z.object({
  attemptId: z
    .string()
    .uuid("Invalid attempt UUID")
    .openapi({ example: "3fa85f64-5717-4562-b3fc-2c963f66afa6" }),
});
export type AttemptIdParam = z.infer<typeof AttemptIdParamSchema>;

export const SaveAnswerBodySchema = z.object({
  problemId: z
    .string()
    .uuid("Invalid problem UUID")
    .openapi({ example: "d3b07384-d113-4674-bfd7-58f7004f2f01" }),
  selectedOptions: z
    .array(z.string())
    .optional()
    .openapi({ example: ["opt-1", "opt-2"] }),
  writtenAnswer: z
    .string()
    .optional()
    .openapi({ example: "My detailed explanation of the concept..." }),
  submittedCode: z
    .string()
    .optional()
    .openapi({ example: "function solution() {\n  return true;\n}" }),
  selectedLanguage: z
    .string()
    .optional()
    .openapi({ example: "typescript" }),
});
export type SaveAnswerInput = z.infer<typeof SaveAnswerBodySchema>;

// =============================================================
// SANITIZED CANDIDATE RESPONSE DTOs (ZERO KEY LEAKAGE)
// =============================================================

export const CandidateMcqOptionSchema = z.object({
  id: z.string().openapi({ example: "opt-1" }),
  text: z.string().openapi({ example: "Encapsulation" }),
});
export type CandidateMcqOption = z.infer<typeof CandidateMcqOptionSchema>;

export const CandidateCodingDetailsSchema = z.object({
  allowedLanguages: z
    .array(z.string())
    .optional()
    .openapi({ example: ["javascript", "typescript", "python"] }),
  starterCode: z
    .record(z.string(), z.string())
    .optional()
    .openapi({ example: { typescript: "function solve() {}" } }),
  sampleIo: z
    .array(
      z.object({
        input: z.string().openapi({ example: "[2, 7, 11, 15], 9" }),
        output: z.string().openapi({ example: "[0, 1]" }),
        explanation: z.string().optional().openapi({ example: "nums[0] + nums[1] == 9" }),
      })
    )
    .optional(),
});
export type CandidateCodingDetails = z.infer<typeof CandidateCodingDetailsSchema>;

export const CandidateProblemSchema = z.object({
  problemId: z.string().uuid().openapi({ example: "d3b07384-d113-4674-bfd7-58f7004f2f01" }),
  orderIndex: z.number().int().openapi({ example: 1 }),
  points: z.number().openapi({ example: 10.0 }),
  title: z.string().openapi({ example: "Reverse String" }),
  description: z.string().openapi({ example: "Write a function that reverses a string..." }),
  type: z.enum(["MCQ_SINGLE", "MCQ_MULTIPLE", "WRITTEN", "CODING"]).openapi({ example: "CODING" }),
  difficulty: z.enum(["EASY", "MEDIUM", "HARD"]).openapi({ example: "EASY" }),
  mcqOptions: z.array(CandidateMcqOptionSchema).optional(),
  codingDetails: CandidateCodingDetailsSchema.optional(),
});
export type CandidateProblem = z.infer<typeof CandidateProblemSchema>;

export const CandidateAnswerDraftSchema = z.object({
  problemId: z.string().uuid().openapi({ example: "d3b07384-d113-4674-bfd7-58f7004f2f01" }),
  selectedOptions: z.array(z.string()).default([]).openapi({ example: ["opt-1"] }),
  writtenAnswer: z.string().nullable().optional().openapi({ example: "Candidate written response" }),
  submittedCode: z.string().nullable().optional().openapi({ example: "console.log('test')" }),
  selectedLanguage: z.string().nullable().optional().openapi({ example: "typescript" }),
  updatedAt: z.string().datetime().optional().openapi({ example: "2026-09-23T10:15:00Z" }),
});
export type CandidateAnswerDraft = z.infer<typeof CandidateAnswerDraftSchema>;

export const CandidateAttemptResponseSchema = z.object({
  id: z.string().uuid().openapi({ example: "3fa85f64-5717-4562-b3fc-2c963f66afa6" }),
  assessmentId: z.string().uuid().openapi({ example: "e1a90c58-2972-4a7b-a25e-e09062eb1855" }),
  title: z.string().openapi({ example: "Frontend Core Fundamentals" }),
  description: z.string().nullable().optional().openapi({ example: "Comprehensive test of React and JS" }),
  instructions: z.string().nullable().optional().openapi({ example: "Read each question carefully..." }),
  durationMinutes: z.number().int().openapi({ example: 60 }),
  status: AttemptStatusEnum.openapi({ example: "IN_PROGRESS" }),
  startedAt: z.string().datetime().openapi({ example: "2026-09-23T10:00:00Z" }),
  expiresAt: z.string().datetime().openapi({ example: "2026-09-23T11:01:00Z" }),
  remainingSeconds: z.number().int().openapi({ example: 3540 }),
  problems: z.array(CandidateProblemSchema),
  answers: z.array(CandidateAnswerDraftSchema).default([]),
});
export type CandidateAttemptResponse = z.infer<typeof CandidateAttemptResponseSchema>;

export const SaveAnswerResponseSchema = z.object({
  problemId: z.string().uuid().openapi({ example: "d3b07384-d113-4674-bfd7-58f7004f2f01" }),
  savedAt: z.string().datetime().openapi({ example: "2026-09-23T10:20:00Z" }),
});
export type SaveAnswerResponse = z.infer<typeof SaveAnswerResponseSchema>;

export const SubmitAttemptResponseSchema = z.object({
  attemptId: z.string().uuid().openapi({ example: "3fa85f64-5717-4562-b3fc-2c963f66afa6" }),
  assessmentId: z.string().uuid().openapi({ example: "e1a90c58-2972-4a7b-a25e-e09062eb1855" }),
  status: AttemptStatusEnum.openapi({ example: "UNDER_REVIEW" }),
  submittedAt: z.string().datetime().openapi({ example: "2026-09-23T10:45:00Z" }),
  evaluationStatus: EvaluationStatusEnum.openapi({ example: "PENDING" }),
  autoScore: z.number().openapi({ example: 20.0 }),
  manualScore: z.number().openapi({ example: 0.0 }),
  totalScore: z.number().openapi({ example: 20.0 }),
  percentage: z.number().nullable().optional().openapi({ example: 80.0 }),
  isPassed: z.boolean().nullable().optional().openapi({ example: true }),
  message: z.string().openapi({ example: "Assessment submitted successfully" }),
});
export type SubmitAttemptResponse = z.infer<typeof SubmitAttemptResponseSchema>;

// =============================================================
// OPENAPI ROUTE REGISTRATIONS (Tag: "Attempts")
// =============================================================

// 1. POST /attempts/start
registry.registerPath({
  method: "post",
  path: "/attempts/start",
  tags: ["Attempts"],
  summary: "Start or resume a timed assessment attempt",
  description:
    "Verifies invitation token and authenticated candidate email (Option B). Initializes attempt timer and returns sanitized problem set. Re-entry with active attempt safely resumes session.",
  security: [
    { BearerAuth: [] },
    { CookieAuth: [] },
  ],
  request: {
    body: {
      content: {
        "application/json": {
          schema: StartAttemptBodySchema,
        },
      },
    },
  },
  responses: {
    200: {
      description: "Existing active assessment attempt resumed successfully",
      content: {
        "application/json": {
          schema: createApiResponseSchema(CandidateAttemptResponseSchema),
        },
      },
    },
    201: {
      description: "Assessment attempt started successfully",
      content: {
        "application/json": {
          schema: createApiResponseSchema(CandidateAttemptResponseSchema),
        },
      },
    },
    400: {
      description: "Bad Request: Missing token or validation failure",
      content: { "application/json": { schema: ApiErrorResponseSchema } },
    },
    401: {
      description: "Unauthorized: Active candidate session required",
      content: { "application/json": { schema: ApiErrorResponseSchema } },
    },
    403: {
      description: "Forbidden: Authenticated account email does not match invitation recipient",
      content: { "application/json": { schema: ApiErrorResponseSchema } },
    },
    404: {
      description: "Not Found: Invitation token not found",
      content: { "application/json": { schema: ApiErrorResponseSchema } },
    },
    409: {
      description: "Conflict: Attempt already submitted or assessment not open",
      content: { "application/json": { schema: ApiErrorResponseSchema } },
    },
    410: {
      description: "Gone: Invitation token has expired",
      content: { "application/json": { schema: ApiErrorResponseSchema } },
    },
  },
});

// 2. GET /attempts/{attemptId}
registry.registerPath({
  method: "get",
  path: "/attempts/{attemptId}",
  tags: ["Attempts"],
  summary: "Get candidate attempt session and remaining countdown time",
  description:
    "Retrieves current attempt session, server-authoritative countdown timer, sanitized question set, and existing answer drafts. Automatically finalizes if timer expired.",
  security: [
    { BearerAuth: [] },
    { CookieAuth: [] },
  ],
  request: {
    params: AttemptIdParamSchema,
  },
  responses: {
    200: {
      description: "Attempt session details retrieved successfully",
      content: {
        "application/json": {
          schema: createApiResponseSchema(CandidateAttemptResponseSchema),
        },
      },
    },
    401: {
      description: "Unauthorized: Active session required",
      content: { "application/json": { schema: ApiErrorResponseSchema } },
    },
    403: {
      description: "Forbidden: Insufficient permissions to view attempt",
      content: { "application/json": { schema: ApiErrorResponseSchema } },
    },
    404: {
      description: "Not Found: Assessment attempt not found",
      content: { "application/json": { schema: ApiErrorResponseSchema } },
    },
  },
});

// 3. PUT /attempts/{attemptId}/answers
registry.registerPath({
  method: "put",
  path: "/attempts/{attemptId}/answers",
  tags: ["Attempts"],
  summary: "Autosave answer draft for a problem in an active attempt",
  description:
    "Persists candidate response for a problem (MCQ choices, written essay, or code). Enforces server-authoritative timer and submission immutability.",
  security: [
    { BearerAuth: [] },
    { CookieAuth: [] },
  ],
  request: {
    params: AttemptIdParamSchema,
    body: {
      content: {
        "application/json": {
          schema: SaveAnswerBodySchema,
        },
      },
    },
  },
  responses: {
    200: {
      description: "Answer draft saved successfully",
      content: {
        "application/json": {
          schema: createApiResponseSchema(SaveAnswerResponseSchema),
        },
      },
    },
    400: {
      description: "Bad Request: Problem not found in this assessment",
      content: { "application/json": { schema: ApiErrorResponseSchema } },
    },
    401: {
      description: "Unauthorized: Active session required",
      content: { "application/json": { schema: ApiErrorResponseSchema } },
    },
    403: {
      description: "Forbidden: Not the owner of this attempt",
      content: { "application/json": { schema: ApiErrorResponseSchema } },
    },
    404: {
      description: "Not Found: Attempt not found",
      content: { "application/json": { schema: ApiErrorResponseSchema } },
    },
    409: {
      description: "Conflict: Attempt is already submitted or timer expired",
      content: { "application/json": { schema: ApiErrorResponseSchema } },
    },
  },
});

// 4. POST /attempts/{attemptId}/submit
registry.registerPath({
  method: "post",
  path: "/attempts/{attemptId}/submit",
  tags: ["Attempts"],
  summary: "Finalize and submit assessment attempt",
  description:
    "Locks attempt, auto-scores MCQ questions against correct answer keys, routes subjective questions to the evaluation review queue, or completes 100% MCQ assessments immediately.",
  security: [
    { BearerAuth: [] },
    { CookieAuth: [] },
  ],
  request: {
    params: AttemptIdParamSchema,
  },
  responses: {
    200: {
      description: "Assessment attempt finalized and submitted successfully",
      content: {
        "application/json": {
          schema: createApiResponseSchema(SubmitAttemptResponseSchema),
        },
      },
    },
    401: {
      description: "Unauthorized: Active session required",
      content: { "application/json": { schema: ApiErrorResponseSchema } },
    },
    403: {
      description: "Forbidden: Not the owner of this attempt",
      content: { "application/json": { schema: ApiErrorResponseSchema } },
    },
    404: {
      description: "Not Found: Attempt not found",
      content: { "application/json": { schema: ApiErrorResponseSchema } },
    },
    409: {
      description: "Conflict: Attempt has already been submitted",
      content: { "application/json": { schema: ApiErrorResponseSchema } },
    },
  },
});
