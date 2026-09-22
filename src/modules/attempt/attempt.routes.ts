import { Router } from "express";
import { attemptController } from "./attempt.controller.js";
import { requireAuth } from "../../middlewares/auth.middleware.js";
import { validateRequest } from "../../middlewares/validate.middleware.js";
import {
  StartAttemptBodySchema,
  AttemptIdParamSchema,
  SaveAnswerBodySchema,
} from "./attempt.schema.js";

const attemptRouter = Router();

// All candidate attempt endpoints require an authenticated user session
attemptRouter.use(requireAuth);

// 1. POST /api/v1/attempts/start - Start new attempt or resume active session
attemptRouter.post(
  "/start",
  validateRequest({
    body: StartAttemptBodySchema,
  }),
  attemptController.startAttempt
);

// 2. GET /api/v1/attempts/:attemptId - Get session details, timer, and drafts
attemptRouter.get(
  "/:attemptId",
  validateRequest({
    params: AttemptIdParamSchema,
  }),
  attemptController.getAttempt
);

// 3. PUT /api/v1/attempts/:attemptId/answers - Autosave answer draft
attemptRouter.put(
  "/:attemptId/answers",
  validateRequest({
    params: AttemptIdParamSchema,
    body: SaveAnswerBodySchema,
  }),
  attemptController.saveAnswer
);

// 4. POST /api/v1/attempts/:attemptId/submit - Finalize and submit assessment
attemptRouter.post(
  "/:attemptId/submit",
  validateRequest({
    params: AttemptIdParamSchema,
  }),
  attemptController.submitAttempt
);

export { attemptRouter };
