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

export const AssessmentStatusEnum = z.enum([
  "DRAFT",
  "PUBLISHED",
  "ACTIVE",
  "CLOSED",
  "ARCHIVED",
]);
export type AssessmentStatus = z.infer<typeof AssessmentStatusEnum>;

// =============================================================
// REQUEST DTOs
// =============================================================

export const CreateAssessmentBodySchema = z
  .object({
    title: z
      .string()
      .min(3, "Title must be at least 3 characters")
      .max(200, "Title must be at most 200 characters")
      .openapi({ example: "Full Stack Engineering Assessment" }),
    description: z
      .string()
      .max(2000, "Description must be at most 2000 characters")
      .optional()
      .openapi({ example: "Comprehensive assessment evaluating full stack TypeScript, Node, and problem solving." }),
    instructions: z
      .string()
      .optional()
      .openapi({
        example:
          "Read each challenge carefully. Submit solutions before the timer expires. Once submitted, answers cannot be edited.",
      }),
    durationMinutes: z
      .number()
      .int("Duration must be a whole number of minutes")
      .min(5, "Duration must be at least 5 minutes")
      .max(1440, "Duration must not exceed 24 hours (1440 minutes)")
      .openapi({ example: 60, description: "Total allowed test time in minutes" }),
    passingScore: z
      .number()
      .positive("Passing score must be greater than 0")
      .optional()
      .openapi({ example: 70.0, description: "Minimum score required to qualify as passed" }),
    validFrom: z
      .string()
      .datetime({ message: "validFrom must be an ISO 8601 datetime string" })
      .optional()
      .openapi({ example: "2026-10-01T00:00:00Z" }),
    validUntil: z
      .string()
      .datetime({ message: "validUntil must be an ISO 8601 datetime string" })
      .optional()
      .openapi({ example: "2026-10-31T23:59:59Z" }),
  })
  .superRefine((data, ctx) => {
    if (data.validFrom && data.validUntil) {
      const from = new Date(data.validFrom).getTime();
      const until = new Date(data.validUntil).getTime();
      if (until <= from) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "validUntil must be chronologically after validFrom",
          path: ["validUntil"],
        });
      }
    }
  });

export type CreateAssessmentInput = z.infer<typeof CreateAssessmentBodySchema>;

export const UpdateAssessmentBodySchema = z
  .object({
    title: z
      .string()
      .min(3, "Title must be at least 3 characters")
      .max(200, "Title must be at most 200 characters")
      .optional()
      .openapi({ example: "Updated Full Stack Assessment" }),
    description: z
      .string()
      .max(2000, "Description must be at most 2000 characters")
      .optional()
      .openapi({ example: "Updated description text" }),
    instructions: z
      .string()
      .optional()
      .openapi({ example: "Updated instructions text" }),
    durationMinutes: z
      .number()
      .int()
      .min(5)
      .max(1440)
      .optional()
      .openapi({ example: 90 }),
    passingScore: z
      .number()
      .positive()
      .optional()
      .openapi({ example: 75.0 }),
    validFrom: z
      .string()
      .datetime()
      .optional()
      .openapi({ example: "2026-10-05T00:00:00Z" }),
    validUntil: z
      .string()
      .datetime()
      .optional()
      .openapi({ example: "2026-11-15T23:59:59Z" }),
  })
  .superRefine((data, ctx) => {
    if (data.validFrom && data.validUntil) {
      const from = new Date(data.validFrom).getTime();
      const until = new Date(data.validUntil).getTime();
      if (until <= from) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "validUntil must be chronologically after validFrom",
          path: ["validUntil"],
        });
      }
    }
  });

export type UpdateAssessmentInput = z.infer<typeof UpdateAssessmentBodySchema>;

export const AddAssessmentProblemBodySchema = z.object({
  problemId: z
    .string()
    .uuid("problemId must be a valid UUID")
    .openapi({ example: "a4e69b50-3bf2-4d43-a61f-132d7ec8b041" }),
  points: z
    .number()
    .positive("Points must be greater than 0")
    .optional()
    .openapi({ example: 25.0, description: "Points allocated for this problem in this assessment. Defaults to problem defaultPoints." }),
  orderIndex: z
    .number()
    .int("orderIndex must be an integer")
    .min(1, "orderIndex must be at least 1")
    .optional()
    .openapi({ example: 1, description: "Display order index in assessment. Defaults to next sequence index if omitted." }),
});

export type AddAssessmentProblemInput = z.infer<typeof AddAssessmentProblemBodySchema>;

export const UpdateAssessmentStatusBodySchema = z.object({
  status: AssessmentStatusEnum.openapi({
    example: "PUBLISHED",
    description: "New target status: PUBLISHED, ACTIVE, CLOSED, or ARCHIVED",
  }),
});

export type UpdateAssessmentStatusInput = z.infer<typeof UpdateAssessmentStatusBodySchema>;

export const AssessmentParamsSchema = z.object({
  id: z.string().uuid("Assessment ID must be a valid UUID").openapi({ example: "3fa85f64-5717-4562-b3fc-2c963f66afa6" }),
});

export const AssessmentProblemParamsSchema = z.object({
  id: z.string().uuid("Assessment ID must be a valid UUID").openapi({ example: "3fa85f64-5717-4562-b3fc-2c963f66afa6" }),
  problemId: z.string().uuid("Problem ID must be a valid UUID").openapi({ example: "a4e69b50-3bf2-4d43-a61f-132d7ec8b041" }),
});

export const AssessmentQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1).openapi({ example: 1 }),
  limit: z.coerce.number().int().min(1).max(100).default(20).openapi({ example: 20 }),
  status: AssessmentStatusEnum.optional().openapi({ example: "DRAFT" }),
  search: z.string().optional().openapi({ example: "Engineering" }),
});

export type AssessmentQuery = z.infer<typeof AssessmentQuerySchema>;

// =============================================================
// RESPONSE DTOs
// =============================================================

export const AssessmentSummaryResponseSchema = z.object({
  id: z.string().uuid().openapi({ example: "3fa85f64-5717-4562-b3fc-2c963f66afa6" }),
  organizationId: z.string().openapi({ example: "techcorp-org-id" }),
  creatorId: z.string().openapi({ example: "user-creator-id" }),
  title: z.string().openapi({ example: "Full Stack Engineering Assessment" }),
  description: z.string().nullable().openapi({ example: "Assessment description" }),
  instructions: z.string().nullable().openapi({ example: "Assessment instructions" }),
  durationMinutes: z.number().int().openapi({ example: 60 }),
  passingScore: z.number().nullable().openapi({ example: 70.0 }),
  totalScore: z.number().openapi({ example: 100.0 }),
  status: AssessmentStatusEnum.openapi({ example: "DRAFT" }),
  validFrom: z.string().datetime().nullable().openapi({ example: "2026-10-01T00:00:00.000Z" }),
  validUntil: z.string().datetime().nullable().openapi({ example: "2026-10-31T23:59:59.000Z" }),
  createdAt: z.string().datetime().openapi({ example: "2026-09-22T20:00:00.000Z" }),
  updatedAt: z.string().datetime().openapi({ example: "2026-09-22T20:00:00.000Z" }),
  _count: z
    .object({
      problems: z.number().int().openapi({ example: 4 }),
      invitations: z.number().int().openapi({ example: 10 }),
      attempts: z.number().int().openapi({ example: 8 }),
    })
    .optional(),
});

export const AssessmentProblemItemResponseSchema = z.object({
  id: z.string().uuid().openapi({ example: "b2c1d3e4-f5a6-7890-bcde-f123456789ab" }),
  assessmentId: z.string().uuid().openapi({ example: "3fa85f64-5717-4562-b3fc-2c963f66afa6" }),
  problemId: z.string().uuid().openapi({ example: "a4e69b50-3bf2-4d43-a61f-132d7ec8b041" }),
  orderIndex: z.number().int().openapi({ example: 1 }),
  points: z.number().openapi({ example: 25.0 }),
  problem: z
    .object({
      id: z.string().uuid(),
      title: z.string(),
      description: z.string(),
      type: z.enum(["MCQ_SINGLE", "MCQ_MULTIPLE", "WRITTEN", "CODING"]),
      difficulty: z.enum(["EASY", "MEDIUM", "HARD"]),
      defaultPoints: z.number(),
      tags: z.array(z.string()),
      mcqOptions: z.any().optional(),
      codingDetails: z.any().optional(),
      evaluationRubric: z.string().nullable().optional(),
    })
    .optional(),
});

export const AssessmentDetailResponseSchema = AssessmentSummaryResponseSchema.extend({
  problems: z.array(AssessmentProblemItemResponseSchema).openapi({ description: "Ordered problem set in this assessment" }),
});

export const RemoveProblemResponseSchema = z.object({
  removed: z.literal(true).openapi({ example: true }),
  assessmentId: z.string().uuid().openapi({ example: "3fa85f64-5717-4562-b3fc-2c963f66afa6" }),
  problemId: z.string().uuid().openapi({ example: "a4e69b50-3bf2-4d43-a61f-132d7ec8b041" }),
  totalScore: z.number().openapi({ example: 75.0, description: "Recalculated totalScore after problem removal" }),
});

export const DeleteAssessmentResponseSchema = z.object({
  deleted: z.literal(true).openapi({ example: true }),
  id: z.string().uuid().openapi({ example: "3fa85f64-5717-4562-b3fc-2c963f66afa6" }),
});

// =============================================================
// OPENAPI ROUTE REGISTRATIONS
// =============================================================

const standardSecurity: Array<Record<string, string[]>> = [
  { BearerAuth: [], OrganizationContext: [] },
  { CookieAuth: [], OrganizationContext: [] },
];

// 1. POST /assessments
registry.registerPath({
  method: "post",
  path: "/assessments",
  tags: ["Assessments"],
  summary: "Create a draft assessment",
  description: "Creates an assessment in DRAFT status with duration, passing score, instructions, and optional scheduling. Requires recruiter or company admin role.",
  security: standardSecurity,
  request: {
    body: {
      content: {
        "application/json": { schema: CreateAssessmentBodySchema },
      },
    },
  },
  responses: {
    201: {
      description: "Assessment draft created successfully",
      content: { "application/json": { schema: createApiResponseSchema(AssessmentSummaryResponseSchema) } },
    },
    400: { description: "Bad Request", content: { "application/json": { schema: ApiErrorResponseSchema } } },
    401: { description: "Unauthorized", content: { "application/json": { schema: ApiErrorResponseSchema } } },
    403: { description: "Forbidden", content: { "application/json": { schema: ApiErrorResponseSchema } } },
    422: { description: "Validation Error", content: { "application/json": { schema: ApiErrorResponseSchema } } },
  },
});

// 2. GET /assessments
registry.registerPath({
  method: "get",
  path: "/assessments",
  tags: ["Assessments"],
  summary: "List company assessments",
  description: "Returns paginated list of assessments for the tenant with optional status filtering and search. Includes problem and attempt counts. Requires recruiter or company admin role.",
  security: standardSecurity,
  request: {
    query: AssessmentQuerySchema,
  },
  responses: {
    200: {
      description: "Assessments retrieved successfully",
      content: { "application/json": { schema: createPaginatedResponseSchema(AssessmentSummaryResponseSchema) } },
    },
    401: { description: "Unauthorized", content: { "application/json": { schema: ApiErrorResponseSchema } } },
    403: { description: "Forbidden", content: { "application/json": { schema: ApiErrorResponseSchema } } },
  },
});

// 3. GET /assessments/{id}
registry.registerPath({
  method: "get",
  path: "/assessments/{id}",
  tags: ["Assessments"],
  summary: "Get detailed assessment with problem set",
  description: "Fetches full assessment details including all attached problems ordered by orderIndex with point weights and rubrics. Requires recruiter or company admin role.",
  security: standardSecurity,
  request: {
    params: AssessmentParamsSchema,
  },
  responses: {
    200: {
      description: "Assessment details retrieved successfully",
      content: { "application/json": { schema: createApiResponseSchema(AssessmentDetailResponseSchema) } },
    },
    401: { description: "Unauthorized", content: { "application/json": { schema: ApiErrorResponseSchema } } },
    403: { description: "Forbidden", content: { "application/json": { schema: ApiErrorResponseSchema } } },
    404: { description: "Not Found", content: { "application/json": { schema: ApiErrorResponseSchema } } },
  },
});

// 4. PUT /assessments/{id}
registry.registerPath({
  method: "put",
  path: "/assessments/{id}",
  tags: ["Assessments"],
  summary: "Update assessment metadata",
  description: "Updates assessment title, description, instructions, duration, passing score, or dates. Cannot modify CLOSED or ARCHIVED assessments. Requires recruiter or company admin role.",
  security: standardSecurity,
  request: {
    params: AssessmentParamsSchema,
    body: {
      content: {
        "application/json": { schema: UpdateAssessmentBodySchema },
      },
    },
  },
  responses: {
    200: {
      description: "Assessment updated successfully",
      content: { "application/json": { schema: createApiResponseSchema(AssessmentSummaryResponseSchema) } },
    },
    400: { description: "Bad Request", content: { "application/json": { schema: ApiErrorResponseSchema } } },
    401: { description: "Unauthorized", content: { "application/json": { schema: ApiErrorResponseSchema } } },
    403: { description: "Forbidden", content: { "application/json": { schema: ApiErrorResponseSchema } } },
    404: { description: "Not Found", content: { "application/json": { schema: ApiErrorResponseSchema } } },
    409: { description: "Conflict - Assessment locked or invalid score parameters", content: { "application/json": { schema: ApiErrorResponseSchema } } },
    422: { description: "Validation Error", content: { "application/json": { schema: ApiErrorResponseSchema } } },
  },
});

// 5. POST /assessments/{id}/problems
registry.registerPath({
  method: "post",
  path: "/assessments/{id}/problems",
  tags: ["Assessments"],
  summary: "Add problem to assessment draft",
  description: "Attaches a question from the problem bank to an assessment in DRAFT status with allocated points and order index. Automatically updates assessment totalScore. Requires recruiter or company admin role.",
  security: standardSecurity,
  request: {
    params: AssessmentParamsSchema,
    body: {
      content: {
        "application/json": { schema: AddAssessmentProblemBodySchema },
      },
    },
  },
  responses: {
    201: {
      description: "Problem attached to assessment successfully",
      content: { "application/json": { schema: createApiResponseSchema(AssessmentProblemItemResponseSchema) } },
    },
    400: { description: "Bad Request", content: { "application/json": { schema: ApiErrorResponseSchema } } },
    401: { description: "Unauthorized", content: { "application/json": { schema: ApiErrorResponseSchema } } },
    403: { description: "Forbidden", content: { "application/json": { schema: ApiErrorResponseSchema } } },
    404: { description: "Not Found", content: { "application/json": { schema: ApiErrorResponseSchema } } },
    409: { description: "Conflict - Assessment not in DRAFT or problem already added", content: { "application/json": { schema: ApiErrorResponseSchema } } },
    422: { description: "Validation Error", content: { "application/json": { schema: ApiErrorResponseSchema } } },
  },
});

// 6. DELETE /assessments/{id}/problems/{problemId}
registry.registerPath({
  method: "delete",
  path: "/assessments/{id}/problems/{problemId}",
  tags: ["Assessments"],
  summary: "Remove problem from assessment draft",
  description: "Removes a problem from an assessment in DRAFT status and automatically recalculates totalScore. Requires recruiter or company admin role.",
  security: standardSecurity,
  request: {
    params: AssessmentProblemParamsSchema,
  },
  responses: {
    200: {
      description: "Problem removed from assessment successfully",
      content: { "application/json": { schema: createApiResponseSchema(RemoveProblemResponseSchema) } },
    },
    401: { description: "Unauthorized", content: { "application/json": { schema: ApiErrorResponseSchema } } },
    403: { description: "Forbidden", content: { "application/json": { schema: ApiErrorResponseSchema } } },
    404: { description: "Not Found", content: { "application/json": { schema: ApiErrorResponseSchema } } },
    409: { description: "Conflict - Assessment not in DRAFT", content: { "application/json": { schema: ApiErrorResponseSchema } } },
  },
});

// 7. PATCH /assessments/{id}/status
registry.registerPath({
  method: "patch",
  path: "/assessments/{id}/status",
  tags: ["Assessments"],
  summary: "Transition assessment status lifecycle",
  description: "Executes state machine transitions: DRAFT -> PUBLISHED (requires >= 1 problem & totalScore > 0), PUBLISHED -> ACTIVE, ACTIVE -> CLOSED, or any -> ARCHIVED. Requires recruiter or company admin role.",
  security: standardSecurity,
  request: {
    params: AssessmentParamsSchema,
    body: {
      content: {
        "application/json": { schema: UpdateAssessmentStatusBodySchema },
      },
    },
  },
  responses: {
    200: {
      description: "Assessment status updated successfully",
      content: { "application/json": { schema: createApiResponseSchema(AssessmentSummaryResponseSchema) } },
    },
    400: { description: "Bad Request - Invalid state transition", content: { "application/json": { schema: ApiErrorResponseSchema } } },
    401: { description: "Unauthorized", content: { "application/json": { schema: ApiErrorResponseSchema } } },
    403: { description: "Forbidden", content: { "application/json": { schema: ApiErrorResponseSchema } } },
    404: { description: "Not Found", content: { "application/json": { schema: ApiErrorResponseSchema } } },
    409: { description: "Conflict - State transition requirements not met", content: { "application/json": { schema: ApiErrorResponseSchema } } },
    422: { description: "Validation Error", content: { "application/json": { schema: ApiErrorResponseSchema } } },
  },
});

// 8. DELETE /assessments/{id}
registry.registerPath({
  method: "delete",
  path: "/assessments/{id}",
  tags: ["Assessments"],
  summary: "Delete an assessment",
  description: "Deletes an assessment. Blocked with 409 Conflict if candidate attempts exist (advising archiving instead). Requires recruiter or company admin role.",
  security: standardSecurity,
  request: {
    params: AssessmentParamsSchema,
  },
  responses: {
    200: {
      description: "Assessment deleted successfully",
      content: { "application/json": { schema: createApiResponseSchema(DeleteAssessmentResponseSchema) } },
    },
    401: { description: "Unauthorized", content: { "application/json": { schema: ApiErrorResponseSchema } } },
    403: { description: "Forbidden", content: { "application/json": { schema: ApiErrorResponseSchema } } },
    404: { description: "Not Found", content: { "application/json": { schema: ApiErrorResponseSchema } } },
    409: { description: "Conflict - Assessment has candidate attempts and cannot be deleted", content: { "application/json": { schema: ApiErrorResponseSchema } } },
  },
});
