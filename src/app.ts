import express, { Express, Request, Response, NextFunction } from "express";
import cors from "cors";
import { toNodeHandler } from "better-auth/node";
import swaggerUi from "swagger-ui-express";
import { auth } from "./lib/auth.js";
import { buildOpenAPISpec } from "./lib/openapi.js";
import { apiV1Router } from "./routes/index.js";
import { errorHandler } from "./errors/error-handler.js";
import { AppError } from "./errors/app-error.js";
import { env } from "./config/env.js";

export const createApp = async (): Promise<Express> => {
  const app = express();

  // Middlewares
  app.use(
    cors({
      origin: env.CORS_ORIGIN,
      credentials: true,
      methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
      allowedHeaders: ["Content-Type", "Authorization", "x-organization-id"],
    })
  );
  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));

  // Mount Better Auth handler (Express 5 compatible wildcard)
  app.all("/api/auth", toNodeHandler(auth));
  app.all("/api/auth/*any", toNodeHandler(auth));

  // Build and mount OpenAPI / Swagger UI documentation
  const openapiSpec = await buildOpenAPISpec();

  // Raw OpenAPI 3.1 JSON endpoint for client SDKs & Postman import
  app.get("/api/docs/openapi.json", (_req: Request, res: Response) => {
    res.setHeader("Content-Type", "application/json");
    res.json(openapiSpec);
  });

  // Interactive Swagger UI documentation
  app.use(
    "/api/docs",
    swaggerUi.serve,
    swaggerUi.setup(openapiSpec, {
      swaggerOptions: {
        persistAuthorization: true,
        displayRequestDuration: true,
      },
      customSiteTitle: "Dev Assessment Platform API Docs",
    })
  );

  // Mount Domain API Router
  app.use("/api/v1", apiV1Router);

  // 404 Handler
  app.use((req: Request, _res: Response, next: NextFunction) => {
    next(AppError.notFound(`Route not found: ${req.method} ${req.originalUrl}`));
  });

  // Global Error Handler
  app.use(errorHandler);

  return app;
};
