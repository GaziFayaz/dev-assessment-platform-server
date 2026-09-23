import { Router } from "express";
import { reportController } from "./report.controller.js";
import {
  requireAuth,
  requireCompanyRole,
} from "../../middlewares/auth.middleware.js";
import { validateRequest } from "../../middlewares/validate.middleware.js";
import {
  AssessmentSummaryParamsSchema,
  AttemptReportParamsSchema,
} from "./report.schema.js";

const reportRouter = Router();

// All reporting endpoints require an authenticated user
reportRouter.use(requireAuth);

// 1. GET /api/v1/reports/candidate/my-results
// Candidate self-service: only requires candidate authentication (no organization header)
reportRouter.get(
  "/candidate/my-results",
  reportController.getCandidateResults
);

// 2. GET /api/v1/reports/assessments/:id/summary
// Recruiter / Admin: requires company membership in active organization
reportRouter.get(
  "/assessments/:id/summary",
  requireCompanyRole(["admin", "recruiter"]),
  validateRequest({ params: AssessmentSummaryParamsSchema }),
  reportController.getAssessmentSummary
);

// 3. GET /api/v1/reports/attempts/:attemptId
// Recruiter / Admin: requires company membership in active organization
reportRouter.get(
  "/attempts/:attemptId",
  requireCompanyRole(["admin", "recruiter"]),
  validateRequest({ params: AttemptReportParamsSchema }),
  reportController.getAttemptReport
);

export { reportRouter };
