import { Request, Response, NextFunction } from "express";
import { InvitationService, invitationService } from "./invitation.service.js";

export class InvitationController {
  constructor(
    private readonly service: InvitationService = invitationService
  ) {}

  /**
   * POST /api/v1/assessments/:id/invitations
   * Dispatches single or bulk candidate invitations
   */
  sendInvitations = async (
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const result = await this.service.sendInvitations(
        req.params.id as string,
        req.body,
        req.organizationId!
      );

      res.status(201).json({
        success: true,
        message: `Successfully dispatched ${result.sentCount} candidate invitation(s)`,
        data: result,
      });
    } catch (error) {
      next(error);
    }
  };

  /**
   * GET /api/v1/assessments/:id/invitations
   * Lists sent invitations for an assessment
   */
  getInvitations = async (
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const result = await this.service.getInvitations(
        req.params.id as string,
        req.query as any,
        req.organizationId!
      );

      res.status(200).json({
        success: true,
        data: result.items,
        meta: result.meta,
      });
    } catch (error) {
      next(error);
    }
  };

  /**
   * GET /api/v1/invitations/verify/:token
   * Validates invitation token against candidate user session
   */
  verifyToken = async (
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const result = await this.service.verifyInvitationToken(
        req.params.token as string,
        req.user!
      );

      res.status(200).json({
        success: true,
        message: "Invitation verified successfully",
        data: result,
      });
    } catch (error) {
      next(error);
    }
  };
}

export const invitationController = new InvitationController();
