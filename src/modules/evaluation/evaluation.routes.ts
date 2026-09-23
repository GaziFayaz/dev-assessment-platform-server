import { Router } from "express";
import { evaluationController } from "./evaluation.controller.js";
import { requireAuth, requireCompanyRole } from "../../middlewares/auth.middleware.js";
import { validateRequest } from "../../middlewares/validate.middleware.js";
import {
  EvaluationQueueQuerySchema,
  ReviewIdParamSchema,
  ClaimReviewBodySchema,
  ScoreQuestionBodySchema,
  FinalizeEvaluationBodySchema,
} from "./evaluation.schema.js";

const evaluationRouter = Router();

// Enforce authentication and company role ("admin" or "recruiter") for all evaluation endpoints
evaluationRouter.use(requireAuth);
evaluationRouter.use(requireCompanyRole(["admin", "recruiter"]));

// 1. GET /api/v1/evaluations/queue
evaluationRouter.get(
  "/queue",
  validateRequest({ query: EvaluationQueueQuerySchema }),
  evaluationController.getQueue
);

// 2. GET /api/v1/evaluations/:reviewId
evaluationRouter.get(
  "/:reviewId",
  validateRequest({ params: ReviewIdParamSchema }),
  evaluationController.getReviewDetail
);

// 3. POST /api/v1/evaluations/:reviewId/claim
evaluationRouter.post(
  "/:reviewId/claim",
  validateRequest({ params: ReviewIdParamSchema, body: ClaimReviewBodySchema }),
  evaluationController.claimReview
);

// 4. POST /api/v1/evaluations/:reviewId/score
evaluationRouter.post(
  "/:reviewId/score",
  validateRequest({ params: ReviewIdParamSchema, body: ScoreQuestionBodySchema }),
  evaluationController.scoreQuestion
);

// 5. POST /api/v1/evaluations/:reviewId/finalize
evaluationRouter.post(
  "/:reviewId/finalize",
  validateRequest({ params: ReviewIdParamSchema, body: FinalizeEvaluationBodySchema }),
  evaluationController.finalizeEvaluation
);

export { evaluationRouter };
