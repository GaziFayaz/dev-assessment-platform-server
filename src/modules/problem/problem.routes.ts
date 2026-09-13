import { Router } from "express";
import { problemController } from "./problem.controller.js";
import { requireAuth, requireCompanyRole } from "../../middlewares/auth.middleware.js";
import { validateRequest } from "../../middlewares/validate.middleware.js";
import {
  CreateProblemBodySchema,
  UpdateProblemBodySchema,
  ProblemParamsSchema,
  ProblemQuerySchema,
} from "./problem.schema.js";

const problemRouter = Router();

// Enforce authentication and company role ("admin" or "recruiter") for all problem bank endpoints
problemRouter.use(requireAuth);
problemRouter.use(requireCompanyRole(["admin", "recruiter"]));

problemRouter.post(
  "/",
  validateRequest({ body: CreateProblemBodySchema }),
  problemController.createProblem
);

problemRouter.get(
  "/",
  validateRequest({ query: ProblemQuerySchema }),
  problemController.getProblems
);

problemRouter.get(
  "/:id",
  validateRequest({ params: ProblemParamsSchema }),
  problemController.getProblemById
);

problemRouter.put(
  "/:id",
  validateRequest({ params: ProblemParamsSchema, body: UpdateProblemBodySchema }),
  problemController.updateProblem
);

problemRouter.delete(
  "/:id",
  validateRequest({ params: ProblemParamsSchema }),
  problemController.deleteProblem
);

export { problemRouter };
