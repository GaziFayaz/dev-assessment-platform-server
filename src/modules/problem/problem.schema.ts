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

export const QuestionTypeEnum = z.enum(["MCQ_SINGLE", "MCQ_MULTIPLE", "WRITTEN", "CODING"]);
export type QuestionType = z.infer<typeof QuestionTypeEnum>;

export const DifficultyEnum = z.enum(["EASY", "MEDIUM", "HARD"]);
export type Difficulty = z.infer<typeof DifficultyEnum>;

// =============================================================
// SUB-SCHEMAS
// =============================================================

export const McqOptionSchema = z.object({
  id: z
    .string()
    .optional()
    .openapi({
      example: "a8098c1a-f86e-11da-bd1a-00112444be1e",
      description: "Option identifier (auto-assigned UUID if omitted)",
    }),
  text: z.string().min(1, "Option text cannot be empty").openapi({ example: "O(1) average time complexity" }),
  isCorrect: z.boolean().openapi({ example: true, description: "Whether this option is the correct answer" }),
});
export type McqOption = z.infer<typeof McqOptionSchema>;

export const SampleIoSchema = z.object({
  input: z.string().openapi({ example: "put(1, 1), get(1)" }),
  output: z.string().openapi({ example: "1" }),
  explanation: z.string().optional().openapi({ example: "Key 1 exists with value 1" }),
});
export type SampleIo = z.infer<typeof SampleIoSchema>;

export const CodingDetailsSchema = z.object({
  starterCode: z
    .union([z.record(z.string(), z.string()), z.string()])
    .optional()
    .openapi({
      example: {
        typescript: "function lruCache() {\n  // your implementation\n}",
        python: "def lru_cache():\n    pass",
      },
      description: "Language-specific starter code templates or boilerplate",
    }),
  allowedLanguages: z
    .array(z.string())
    .min(1, "At least one allowed language is required")
    .openapi({
      example: ["typescript", "javascript", "python"],
      description: "Array of language identifiers permitted for submission",
    }),
  sampleIo: z.array(SampleIoSchema).min(1, "At least one sample I/O pair is required"),
  constraints: z.array(z.string()).optional().openapi({
    example: ["1 <= capacity <= 3000", "0 <= key <= 10^4"],
  }),
});
export type CodingDetails = z.infer<typeof CodingDetailsSchema>;

// =============================================================
// REQUEST DTOs
// =============================================================

export const CreateProblemBodySchema = z
  .object({
    title: z
      .string()
      .min(3, "Title must be at least 3 characters")
      .max(200, "Title must be at most 200 characters")
      .openapi({ example: "Implement LRU Cache" }),
    description: z
      .string()
      .min(10, "Description must be at least 10 characters")
      .openapi({ example: "Design a data structure that follows the constraints of a Least Recently Used (LRU) cache." }),
    type: QuestionTypeEnum.openapi({ example: "CODING" }),
    difficulty: DifficultyEnum.default("MEDIUM").openapi({ example: "MEDIUM" }),
    defaultPoints: z.number().positive("Points must be greater than 0").default(10.0).openapi({ example: 10.0 }),
    tags: z.array(z.string()).default([]).openapi({ example: ["data-structures", "cache"] }),
    mcqOptions: z.array(McqOptionSchema).optional(),
    codingDetails: CodingDetailsSchema.optional(),
    evaluationRubric: z
      .string()
      .optional()
      .openapi({ example: "Award 5 points for O(1) operations, 3 points for clean doubly linked list, 2 points for edge cases." }),
  })
  .superRefine((data, ctx) => {
    if (data.type === "MCQ_SINGLE") {
      if (!data.mcqOptions || data.mcqOptions.length < 2) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "MCQ_SINGLE requires at least 2 options",
          path: ["mcqOptions"],
        });
      } else {
        const correctCount = data.mcqOptions.filter((opt) => opt.isCorrect).length;
        if (correctCount !== 1) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: "MCQ_SINGLE requires exactly 1 correct option",
            path: ["mcqOptions"],
          });
        }
      }
    } else if (data.type === "MCQ_MULTIPLE") {
      if (!data.mcqOptions || data.mcqOptions.length < 2) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "MCQ_MULTIPLE requires at least 2 options",
          path: ["mcqOptions"],
        });
      } else {
        const correctCount = data.mcqOptions.filter((opt) => opt.isCorrect).length;
        if (correctCount < 1) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: "MCQ_MULTIPLE requires at least 1 correct option",
            path: ["mcqOptions"],
          });
        }
      }
    } else if (data.type === "CODING") {
      if (!data.codingDetails) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "CODING questions require codingDetails (allowedLanguages, sampleIo)",
          path: ["codingDetails"],
        });
      }
    }
  });
export type CreateProblemInput = z.infer<typeof CreateProblemBodySchema>;

export const UpdateProblemBodySchema = z
  .object({
    title: z.string().min(3).max(200).optional().openapi({ example: "Implement LRU Cache (Updated)" }),
    description: z.string().min(10).optional().openapi({ example: "Updated problem description with additional constraints." }),
    type: QuestionTypeEnum.optional().openapi({ example: "CODING" }),
    difficulty: DifficultyEnum.optional().openapi({ example: "HARD" }),
    defaultPoints: z.number().positive().optional().openapi({ example: 15.0 }),
    tags: z.array(z.string()).optional().openapi({ example: ["data-structures", "cache", "advanced"] }),
    mcqOptions: z.array(McqOptionSchema).optional(),
    codingDetails: CodingDetailsSchema.optional(),
    evaluationRubric: z.string().optional().openapi({ example: "Updated rubric guidance." }),
  })
  .superRefine((data, ctx) => {
    if (data.type === "MCQ_SINGLE" && data.mcqOptions) {
      if (data.mcqOptions.length < 2) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "MCQ_SINGLE requires at least 2 options",
          path: ["mcqOptions"],
        });
      }
      const correctCount = data.mcqOptions.filter((opt) => opt.isCorrect).length;
      if (correctCount !== 1) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "MCQ_SINGLE requires exactly 1 correct option",
          path: ["mcqOptions"],
        });
      }
    } else if (data.type === "MCQ_MULTIPLE" && data.mcqOptions) {
      if (data.mcqOptions.length < 2) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "MCQ_MULTIPLE requires at least 2 options",
          path: ["mcqOptions"],
        });
      }
      const correctCount = data.mcqOptions.filter((opt) => opt.isCorrect).length;
      if (correctCount < 1) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "MCQ_MULTIPLE requires at least 1 correct option",
          path: ["mcqOptions"],
        });
      }
    } else if (data.type === "CODING" && data.codingDetails === null) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "CODING questions require codingDetails",
        path: ["codingDetails"],
      });
    }
  });
export type UpdateProblemInput = z.infer<typeof UpdateProblemBodySchema>;

export const ProblemParamsSchema = z.object({
  id: z.string().uuid("Invalid problem UUID").openapi({
    example: "d3b07384-d113-4674-bfd7-58f7004f2f01",
    param: { name: "id", in: "path" },
  }),
});
export type ProblemParams = z.infer<typeof ProblemParamsSchema>;

export const ProblemQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1).openapi({ example: 1, param: { name: "page", in: "query" } }),
  limit: z.coerce.number().int().positive().max(100).default(20).openapi({ example: 20, param: { name: "limit", in: "query" } }),
  type: QuestionTypeEnum.optional().openapi({ param: { name: "type", in: "query" } }),
  difficulty: DifficultyEnum.optional().openapi({ param: { name: "difficulty", in: "query" } }),
  tag: z.string().optional().openapi({ param: { name: "tag", in: "query", description: "Filter by tag" } }),
  search: z.string().optional().openapi({ param: { name: "search", in: "query", description: "Search term in title or description" } }),
});
export type ProblemQuery = z.infer<typeof ProblemQuerySchema>;

// =============================================================
// RESPONSE DTOs
// =============================================================

export const ProblemResponseSchema = z.object({
  id: z.string().uuid().openapi({ example: "d3b07384-d113-4674-bfd7-58f7004f2f01" }),
  organizationId: z.string().nullable().openapi({ example: "c56a4180-65aa-42ec-a945-5fd21dec0538" }),
  creatorId: z.string().openapi({ example: "usr-12345" }),
  title: z.string().openapi({ example: "Implement LRU Cache" }),
  description: z.string().openapi({ example: "Design a data structure that follows the constraints of a Least Recently Used (LRU) cache." }),
  type: QuestionTypeEnum.openapi({ example: "CODING" }),
  difficulty: DifficultyEnum.openapi({ example: "MEDIUM" }),
  defaultPoints: z.number().openapi({ example: 10.0 }),
  tags: z.array(z.string()).openapi({ example: ["data-structures", "cache"] }),
  mcqOptions: z.array(McqOptionSchema).nullable().optional(),
  codingDetails: CodingDetailsSchema.nullable().optional(),
  evaluationRubric: z.string().nullable().optional().openapi({ example: "Award 5 points for O(1) operations..." }),
  createdAt: z.string().datetime().openapi({ example: "2026-09-13T12:00:00.000Z" }),
  updatedAt: z.string().datetime().openapi({ example: "2026-09-13T12:00:00.000Z" }),
});
export type ProblemResponse = z.infer<typeof ProblemResponseSchema>;

export const DeleteProblemResponseSchema = z.object({
  deleted: z.literal(true).openapi({ example: true }),
  id: z.string().uuid().openapi({ example: "d3b07384-d113-4674-bfd7-58f7004f2f01" }),
});
export type DeleteProblemResponse = z.infer<typeof DeleteProblemResponseSchema>;

// =============================================================
// OPENAPI ROUTE REGISTRATIONS
// =============================================================

const problemSecurity: Array<Record<string, string[]>> = [
  { BearerAuth: [], OrganizationContext: [] },
  { CookieAuth: [], OrganizationContext: [] },
];

registry.registerPath({
  method: "post",
  path: "/problems",
  tags: ["Problems"],
  summary: "Create a problem in the organization bank",
  description:
    "Creates a new MCQ, written, or coding problem with rubric and options. Scoped to active organization tenant. Requires COMPANY_ADMIN or RECRUITER role.",
  security: problemSecurity,
  request: {
    body: {
      content: {
        "application/json": { schema: CreateProblemBodySchema },
      },
    },
  },
  responses: {
    201: {
      description: "Problem created successfully",
      content: { "application/json": { schema: createApiResponseSchema(ProblemResponseSchema) } },
    },
    400: { description: "Bad Request", content: { "application/json": { schema: ApiErrorResponseSchema } } },
    401: { description: "Unauthorized", content: { "application/json": { schema: ApiErrorResponseSchema } } },
    403: { description: "Forbidden", content: { "application/json": { schema: ApiErrorResponseSchema } } },
    422: { description: "Validation Error", content: { "application/json": { schema: ApiErrorResponseSchema } } },
    500: { description: "Internal Server Error", content: { "application/json": { schema: ApiErrorResponseSchema } } },
  },
});

registry.registerPath({
  method: "get",
  path: "/problems",
  tags: ["Problems"],
  summary: "List organization problems",
  description:
    "Returns a paginated list of problems belonging to the active organization. Supports filtering by type, difficulty, tags, and text search.",
  security: problemSecurity,
  request: {
    query: ProblemQuerySchema,
  },
  responses: {
    200: {
      description: "Paginated list of problems retrieved successfully",
      content: { "application/json": { schema: createPaginatedResponseSchema(ProblemResponseSchema) } },
    },
    400: { description: "Bad Request", content: { "application/json": { schema: ApiErrorResponseSchema } } },
    401: { description: "Unauthorized", content: { "application/json": { schema: ApiErrorResponseSchema } } },
    403: { description: "Forbidden", content: { "application/json": { schema: ApiErrorResponseSchema } } },
    500: { description: "Internal Server Error", content: { "application/json": { schema: ApiErrorResponseSchema } } },
  },
});

registry.registerPath({
  method: "get",
  path: "/problems/{id}",
  tags: ["Problems"],
  summary: "Get problem details by ID",
  description:
    "Fetches complete problem details including full rubric and options. Scoped strictly to the active organization.",
  security: problemSecurity,
  request: {
    params: ProblemParamsSchema,
  },
  responses: {
    200: {
      description: "Problem retrieved successfully",
      content: { "application/json": { schema: createApiResponseSchema(ProblemResponseSchema) } },
    },
    400: { description: "Bad Request", content: { "application/json": { schema: ApiErrorResponseSchema } } },
    401: { description: "Unauthorized", content: { "application/json": { schema: ApiErrorResponseSchema } } },
    403: { description: "Forbidden", content: { "application/json": { schema: ApiErrorResponseSchema } } },
    404: { description: "Problem Not Found", content: { "application/json": { schema: ApiErrorResponseSchema } } },
    500: { description: "Internal Server Error", content: { "application/json": { schema: ApiErrorResponseSchema } } },
  },
});

registry.registerPath({
  method: "put",
  path: "/problems/{id}",
  tags: ["Problems"],
  summary: "Update problem details",
  description:
    "Updates an existing problem. Rejected with 409 Conflict if the problem is currently attached to any active or published assessment.",
  security: problemSecurity,
  request: {
    params: ProblemParamsSchema,
    body: {
      content: {
        "application/json": { schema: UpdateProblemBodySchema },
      },
    },
  },
  responses: {
    200: {
      description: "Problem updated successfully",
      content: { "application/json": { schema: createApiResponseSchema(ProblemResponseSchema) } },
    },
    400: { description: "Bad Request", content: { "application/json": { schema: ApiErrorResponseSchema } } },
    401: { description: "Unauthorized", content: { "application/json": { schema: ApiErrorResponseSchema } } },
    403: { description: "Forbidden", content: { "application/json": { schema: ApiErrorResponseSchema } } },
    404: { description: "Problem Not Found", content: { "application/json": { schema: ApiErrorResponseSchema } } },
    409: { description: "Conflict: Problem locked in active assessment", content: { "application/json": { schema: ApiErrorResponseSchema } } },
    422: { description: "Validation Error", content: { "application/json": { schema: ApiErrorResponseSchema } } },
    500: { description: "Internal Server Error", content: { "application/json": { schema: ApiErrorResponseSchema } } },
  },
});

registry.registerPath({
  method: "delete",
  path: "/problems/{id}",
  tags: ["Problems"],
  summary: "Delete a problem",
  description:
    "Deletes a problem from the organization bank. Rejected with 409 Conflict if the problem is referenced in any assessment.",
  security: problemSecurity,
  request: {
    params: ProblemParamsSchema,
  },
  responses: {
    200: {
      description: "Problem deleted successfully",
      content: { "application/json": { schema: createApiResponseSchema(DeleteProblemResponseSchema) } },
    },
    400: { description: "Bad Request", content: { "application/json": { schema: ApiErrorResponseSchema } } },
    401: { description: "Unauthorized", content: { "application/json": { schema: ApiErrorResponseSchema } } },
    403: { description: "Forbidden", content: { "application/json": { schema: ApiErrorResponseSchema } } },
    404: { description: "Problem Not Found", content: { "application/json": { schema: ApiErrorResponseSchema } } },
    409: { description: "Conflict: Problem linked to assessments", content: { "application/json": { schema: ApiErrorResponseSchema } } },
    500: { description: "Internal Server Error", content: { "application/json": { schema: ApiErrorResponseSchema } } },
  },
});
