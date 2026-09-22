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

export const InvitationStatusEnum = z.enum([
  "INVITED",
  "STARTED",
  "COMPLETED",
  "EXPIRED",
]);
export type InvitationStatus = z.infer<typeof InvitationStatusEnum>;

// =============================================================
// REQUEST DTOs
// =============================================================

export const CandidateInviteItemSchema = z.object({
  candidateEmail: z
    .string()
    .email("Invalid candidate email address")
    .openapi({ example: "candidate@example.com" }),
  candidateName: z
    .string()
    .min(1, "Name must not be empty")
    .max(100, "Name must be at most 100 characters")
    .optional()
    .openapi({ example: "Alex Smith" }),
  expiresAt: z
    .string()
    .datetime({ message: "expiresAt must be an ISO 8601 datetime" })
    .optional()
    .openapi({ example: "2026-10-31T23:59:59Z" }),
});
export type CandidateInviteItem = z.infer<typeof CandidateInviteItemSchema>;

export const SendInvitationsBodySchema = z
  .preprocess((val: any) => {
    if (val && typeof val === "object") {
      // If client sent a single invitation directly: { candidateEmail: "...", ... }
      if (val.candidateEmail && !val.invitations) {
        return {
          invitations: [
            {
              candidateEmail: val.candidateEmail,
              candidateName: val.candidateName,
              expiresAt: val.expiresAt,
            },
          ],
          defaultExpiresInDays: val.defaultExpiresInDays,
        };
      }
    }
    return val;
  }, z.object({
    invitations: z
      .array(CandidateInviteItemSchema)
      .min(1, "At least one candidate invitation is required")
      .max(100, "Cannot send more than 100 invitations in a single request")
      .openapi({
        description: "List of candidate invitations to send",
      }),
    defaultExpiresInDays: z
      .number()
      .int()
      .positive("Expiry days must be a positive integer")
      .max(90, "Expiry cannot exceed 90 days")
      .default(7)
      .optional()
      .openapi({
        example: 7,
        description: "Default expiry in days for invitations without explicit expiresAt",
      }),
  }));

export type SendInvitationsInput = z.infer<typeof SendInvitationsBodySchema>;

export const AssessmentInvitationParamsSchema = z.object({
  id: z
    .string()
    .uuid("Invalid assessment UUID")
    .openapi({ example: "3fa85f64-5717-4562-b3fc-2c963f66afa6" }),
});

export const VerifyTokenParamsSchema = z.object({
  token: z
    .string()
    .min(1, "Invitation token is required")
    .openapi({ example: "c2e5b7fb-65b1-4c6e-826a-fa0ad84e031b" }),
});

export const InvitationQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1).openapi({ example: 1 }),
  limit: z.coerce.number().int().positive().max(100).default(20).openapi({ example: 20 }),
  status: InvitationStatusEnum.optional().openapi({ example: "INVITED" }),
  search: z.string().max(100).optional().openapi({ example: "alex" }),
});

export type InvitationQueryParams = z.infer<typeof InvitationQuerySchema>;

// =============================================================
// RESPONSE DTOs
// =============================================================

export const InvitationAttemptSummarySchema = z.object({
  id: z.string().uuid().openapi({ example: "9f0113f8-d4fa-4dc8-b391-7db1839502ab" }),
  status: z.string().openapi({ example: "IN_PROGRESS" }),
  startedAt: z.string().datetime().nullable().openapi({ example: "2026-10-05T14:30:00Z" }),
  submittedAt: z.string().datetime().nullable().openapi({ example: null }),
  totalScore: z.number().openapi({ example: 85.0 }),
  isPassed: z.boolean().nullable().openapi({ example: true }),
});

export const InvitationItemResponseSchema = z.object({
  id: z.string().uuid().openapi({ example: "45f745e6-bbad-4950-8b2b-4e680415391d" }),
  assessmentId: z.string().uuid().openapi({ example: "3fa85f64-5717-4562-b3fc-2c963f66afa6" }),
  candidateEmail: z.string().email().openapi({ example: "candidate@example.com" }),
  candidateName: z.string().nullable().openapi({ example: "Alex Smith" }),
  inviteToken: z.string().openapi({ example: "c2e5b7fb-65b1-4c6e-826a-fa0ad84e031b" }),
  expiresAt: z.string().datetime().openapi({ example: "2026-10-12T14:30:00Z" }),
  isAccepted: z.boolean().openapi({ example: false }),
  status: InvitationStatusEnum.openapi({ example: "INVITED" }),
  createdAt: z.string().datetime().openapi({ example: "2026-10-05T14:30:00Z" }),
  attempt: InvitationAttemptSummarySchema.nullable().optional(),
});

export type InvitationItemResponse = z.infer<typeof InvitationItemResponseSchema>;

export const SendInvitationsResponseSchema = z.object({
  sentCount: z.number().int().openapi({ example: 2 }),
  invitations: z.array(InvitationItemResponseSchema),
});

export const VerifyInvitationResponseSchema = z.object({
  canStart: z.boolean().openapi({ example: true }),
  invitation: z.object({
    id: z.string().uuid(),
    candidateEmail: z.string().email(),
    candidateName: z.string().nullable(),
    expiresAt: z.string().datetime(),
    isAccepted: z.boolean(),
  }),
  assessment: z.object({
    id: z.string().uuid(),
    title: z.string(),
    description: z.string().nullable(),
    instructions: z.string().nullable(),
    durationMinutes: z.number().int(),
    totalScore: z.number(),
    passingScore: z.number().nullable(),
    status: z.string(),
    validFrom: z.string().datetime().nullable(),
    validUntil: z.string().datetime().nullable(),
  }),
  organization: z.object({
    id: z.string().uuid(),
    name: z.string(),
    slug: z.string(),
    logo: z.string().nullable(),
  }),
  existingAttempt: z
    .object({
      id: z.string().uuid(),
      status: z.string(),
      startedAt: z.string().datetime().nullable(),
      expiresAt: z.string().datetime().nullable(),
    })
    .nullable()
    .optional(),
});

// =============================================================
// OPENAPI ROUTE REGISTRATIONS
// =============================================================

const companySecurity: Array<Record<string, string[]>> = [
  { BearerAuth: [], OrganizationContext: [] },
  { CookieAuth: [], OrganizationContext: [] },
];

const candidateSecurity: Array<Record<string, string[]>> = [
  { BearerAuth: [] },
  { CookieAuth: [] },
];

// 1. POST /assessments/{id}/invitations
registry.registerPath({
  method: "post",
  path: "/assessments/{id}/invitations",
  tags: ["Invitations"],
  summary: "Send candidate invitations for an assessment",
  description:
    "Dispatches single or bulk candidate invitations for a PUBLISHED or ACTIVE assessment. Generates unique secure invite tokens. Requires recruiter or company admin role.",
  security: companySecurity,
  request: {
    params: AssessmentInvitationParamsSchema,
    body: {
      content: {
        "application/json": { schema: SendInvitationsBodySchema },
      },
    },
  },
  responses: {
    201: {
      description: "Invitations dispatched successfully",
      content: { "application/json": { schema: createApiResponseSchema(SendInvitationsResponseSchema) } },
    },
    400: { description: "Bad Request", content: { "application/json": { schema: ApiErrorResponseSchema } } },
    401: { description: "Unauthorized", content: { "application/json": { schema: ApiErrorResponseSchema } } },
    403: { description: "Forbidden", content: { "application/json": { schema: ApiErrorResponseSchema } } },
    404: { description: "Not Found", content: { "application/json": { schema: ApiErrorResponseSchema } } },
    409: { description: "Conflict - Assessment not published/active or duplicate active attempt", content: { "application/json": { schema: ApiErrorResponseSchema } } },
    422: { description: "Validation Error", content: { "application/json": { schema: ApiErrorResponseSchema } } },
  },
});

// 2. GET /assessments/{id}/invitations
registry.registerPath({
  method: "get",
  path: "/assessments/{id}/invitations",
  tags: ["Invitations"],
  summary: "List sent invitations for an assessment",
  description:
    "Returns a paginated list of invitations sent for the specified assessment with dynamic lifecycle statuses (INVITED, STARTED, COMPLETED, EXPIRED). Requires recruiter or company admin role.",
  security: companySecurity,
  request: {
    params: AssessmentInvitationParamsSchema,
    query: InvitationQuerySchema,
  },
  responses: {
    200: {
      description: "Invitations retrieved successfully",
      content: { "application/json": { schema: createPaginatedResponseSchema(InvitationItemResponseSchema) } },
    },
    401: { description: "Unauthorized", content: { "application/json": { schema: ApiErrorResponseSchema } } },
    403: { description: "Forbidden", content: { "application/json": { schema: ApiErrorResponseSchema } } },
    404: { description: "Not Found", content: { "application/json": { schema: ApiErrorResponseSchema } } },
  },
});

// 3. GET /invitations/verify/{token}
registry.registerPath({
  method: "get",
  path: "/invitations/verify/{token}",
  tags: ["Invitations"],
  summary: "Verify invitation token (Option B Security Gate)",
  description:
    "Validates candidate invitation token against authenticated Better Auth session. Strictly enforces req.user.email matches CandidateInvitation.candidateEmail (returns 403 on mismatch). Returns candidate-safe assessment metadata.",
  security: candidateSecurity,
  request: {
    params: VerifyTokenParamsSchema,
  },
  responses: {
    200: {
      description: "Invitation token valid and verified",
      content: { "application/json": { schema: createApiResponseSchema(VerifyInvitationResponseSchema) } },
    },
    400: { description: "Bad Request", content: { "application/json": { schema: ApiErrorResponseSchema } } },
    401: { description: "Unauthorized - Active candidate session required", content: { "application/json": { schema: ApiErrorResponseSchema } } },
    403: { description: "Forbidden - Authenticated email does not match invitation recipient", content: { "application/json": { schema: ApiErrorResponseSchema } } },
    404: { description: "Not Found - Invalid invitation token", content: { "application/json": { schema: ApiErrorResponseSchema } } },
    409: { description: "Conflict - Assessment is closed, archived, or already completed", content: { "application/json": { schema: ApiErrorResponseSchema } } },
    410: { description: "Gone - Invitation token has expired", content: { "application/json": { schema: ApiErrorResponseSchema } } },
  },
});
