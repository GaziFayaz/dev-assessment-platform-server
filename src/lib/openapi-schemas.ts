import { z } from "zod";
import { extendZodWithOpenApi } from "@asteasolutions/zod-to-openapi";

extendZodWithOpenApi(z);

export const createApiResponseSchema = <T extends z.ZodTypeAny>(dataSchema: T) =>
  z.object({
    success: z.literal(true).openapi({ example: true }),
    message: z.string().optional().openapi({ example: "Operation completed successfully" }),
    data: dataSchema,
  });

export const createPaginatedResponseSchema = <T extends z.ZodTypeAny>(itemSchema: T) =>
  z.object({
    success: z.literal(true).openapi({ example: true }),
    data: z.array(itemSchema),
    meta: z.object({
      page: z.number().int().positive().openapi({ example: 1 }),
      limit: z.number().int().positive().openapi({ example: 20 }),
      totalItems: z.number().int().nonnegative().openapi({ example: 45 }),
      totalPages: z.number().int().nonnegative().openapi({ example: 3 }),
    }),
  });

export const ApiErrorResponseSchema = z.object({
  success: z.literal(false).openapi({ example: false }),
  message: z.string().openapi({ example: "Validation failed" }),
  code: z.string().openapi({ example: "VALIDATION_ERROR" }),
  errors: z
    .array(
      z.object({
        field: z.string().optional().openapi({ example: "email" }),
        message: z.string().openapi({ example: "Invalid email format" }),
      })
    )
    .optional(),
});

export type ApiResponse<T> = {
  success: true;
  message?: string;
  data: T;
};

export type ApiPaginatedResponse<T> = {
  success: true;
  data: T[];
  meta: {
    page: number;
    limit: number;
    totalItems: number;
    totalPages: number;
  };
};

export type ApiErrorResponse = z.infer<typeof ApiErrorResponseSchema>;
