import { Router } from "express";
import { invitationController } from "./invitation.controller.js";
import { requireAuth, requireCompanyRole } from "../../middlewares/auth.middleware.js";
import { validateRequest } from "../../middlewares/validate.middleware.js";
import {
  SendInvitationsBodySchema,
  AssessmentInvitationParamsSchema,
  InvitationQuerySchema,
  VerifyTokenParamsSchema,
} from "./invitation.schema.js";

// =============================================================
// ASSESSMENT INVITATIONS ROUTER (Recruiter/Admin scoped)
// Mounted at: /api/v1/assessments/:id/invitations
// =============================================================
const assessmentInvitationRouter = Router({ mergeParams: true });

assessmentInvitationRouter.use(requireAuth);
assessmentInvitationRouter.use(requireCompanyRole(["admin", "recruiter"]));

// 1. Dispatch invitations (single or bulk)
assessmentInvitationRouter.post(
  "/",
  validateRequest({
    params: AssessmentInvitationParamsSchema,
    body: SendInvitationsBodySchema,
  }),
  invitationController.sendInvitations
);

// 2. List sent invitations for assessment
assessmentInvitationRouter.get(
  "/",
  validateRequest({
    params: AssessmentInvitationParamsSchema,
    query: InvitationQuerySchema,
  }),
  invitationController.getInvitations
);

// =============================================================
// CANDIDATE INVITATION VERIFICATION ROUTER
// Mounted at: /api/v1/invitations
// =============================================================
const invitationRouter = Router();

invitationRouter.use(requireAuth);

// 3. Verify invitation token against candidate user session
invitationRouter.get(
  "/verify/:token",
  validateRequest({
    params: VerifyTokenParamsSchema,
  }),
  invitationController.verifyToken
);

export { assessmentInvitationRouter, invitationRouter };
