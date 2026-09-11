import { Router, Request, Response } from "express";
import { z } from "zod";
import { registry } from "../lib/openapi.js";
import { createApiResponseSchema } from "../lib/openapi-schemas.js";
import { env } from "../config/env.js";

const healthRouter = Router();

const HealthDataSchema = z.object({
  status: z.literal("UP").openapi({ example: "UP" }),
  uptime: z.number().openapi({ example: 12.34 }),
  timestamp: z.string().datetime().openapi({ example: "2026-09-11T16:00:00.000Z" }),
  environment: z.string().openapi({ example: "development" }),
});

registry.registerPath({
  method: "get",
  path: "/health",
  tags: ["System"],
  summary: "Server healthcheck endpoint",
  description: "Returns the operational status, uptime, and environment of the API service.",
  responses: {
    200: {
      description: "Service is healthy and responding",
      content: {
        "application/json": {
          schema: createApiResponseSchema(HealthDataSchema),
        },
      },
    },
  },
});

healthRouter.get("/", (_req: Request, res: Response) => {
  res.status(200).json({
    success: true,
    message: "Developer Assessment & Coding Platform Server is healthy",
    data: {
      status: "UP",
      uptime: process.uptime(),
      timestamp: new Date().toISOString(),
      environment: env.NODE_ENV,
    },
  });
});

export { healthRouter };
