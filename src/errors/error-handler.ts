import { Request, Response, NextFunction, ErrorRequestHandler } from "express";
import { ZodError } from "zod";
import { AppError } from "./app-error.js";
import { env } from "../config/env.js";

export const errorHandler: ErrorRequestHandler = (
  err: Error | AppError | ZodError | any,
  req: Request,
  res: Response,
  _next: NextFunction
): void => {
  // Handle AppError
  if (err instanceof AppError) {
    res.status(err.statusCode).json({
      success: false,
      message: err.message,
      code: err.errorCode,
      ...(err.errors ? { errors: err.errors } : {}),
    });
    return;
  }

  // Handle Zod Validation Error
  if (err instanceof ZodError) {
    const formattedErrors = err.issues.map((issue) => ({
      field: issue.path.join("."),
      message: issue.message,
    }));

    res.status(422).json({
      success: false,
      message: "Validation failed",
      code: "VALIDATION_ERROR",
      errors: formattedErrors,
    });
    return;
  }

  // Handle Prisma Known Request Errors
  if (err?.code === "P2002") {
    const target = Array.isArray(err.meta?.target)
      ? err.meta.target.join(", ")
      : err.meta?.target || "field";
    res.status(409).json({
      success: false,
      message: `A resource with that ${target} already exists.`,
      code: "CONFLICT",
    });
    return;
  }

  if (err?.code === "P2025") {
    res.status(404).json({
      success: false,
      message: err.meta?.cause || "Record not found.",
      code: "NOT_FOUND",
    });
    return;
  }

  // Log unexpected errors
  console.error("Unhandled Error:", err);

  const isDev = env.NODE_ENV === "development";
  res.status(500).json({
    success: false,
    message: isDev ? err?.message || "Internal server error" : "Internal server error",
    code: "INTERNAL_SERVER_ERROR",
    ...(isDev && err?.stack ? { stack: err.stack } : {}),
  });
};
