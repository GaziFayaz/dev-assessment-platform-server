import { Router } from "express";
import { assessmentController } from "./assessment.controller.js";
import { requireAuth, requireCompanyRole } from "../../middlewares/auth.middleware.js";
import { validateRequest } from "../../middlewares/validate.middleware.js";
import {
  CreateAssessmentBodySchema,
  UpdateAssessmentBodySchema,
  AddAssessmentProblemBodySchema,
  UpdateAssessmentStatusBodySchema,
  AssessmentParamsSchema,
  AssessmentProblemParamsSchema,
  AssessmentQuerySchema,
} from "./assessment.schema.js";

const assessmentRouter = Router();

// Enforce authentication and company role ("admin" or "recruiter") for all assessment builder endpoints
assessmentRouter.use(requireAuth);
assessmentRouter.use(requireCompanyRole(["admin", "recruiter"]));

// 1. Create draft assessment
assessmentRouter.post(
  "/",
  validateRequest({ body: CreateAssessmentBodySchema }),
  assessmentController.createAssessment
);

// 2. List company assessments with filters
assessmentRouter.get(
  "/",
  validateRequest({ query: AssessmentQuerySchema }),
  assessmentController.getAssessments
);

// 3. Get detailed assessment with problem set
assessmentRouter.get(
  "/:id",
  validateRequest({ params: AssessmentParamsSchema }),
  assessmentController.getAssessmentById
);

// 4. Update assessment metadata
assessmentRouter.put(
  "/:id",
  validateRequest({ params: AssessmentParamsSchema, body: UpdateAssessmentBodySchema }),
  assessmentController.updateAssessment
);

// 5. Add problem to assessment draft
assessmentRouter.post(
  "/:id/problems",
  validateRequest({ params: AssessmentParamsSchema, body: AddAssessmentProblemBodySchema }),
  assessmentController.addProblem
);

// 6. Remove problem from assessment draft
assessmentRouter.delete(
  "/:id/problems/:problemId",
  validateRequest({ params: AssessmentProblemParamsSchema }),
  assessmentController.removeProblem
);

// 7. Transition assessment status
assessmentRouter.patch(
  "/:id/status",
  validateRequest({ params: AssessmentParamsSchema, body: UpdateAssessmentStatusBodySchema }),
  assessmentController.updateStatus
);

// 8. Delete assessment
assessmentRouter.delete(
  "/:id",
  validateRequest({ params: AssessmentParamsSchema }),
  assessmentController.deleteAssessment
);

export { assessmentRouter };
