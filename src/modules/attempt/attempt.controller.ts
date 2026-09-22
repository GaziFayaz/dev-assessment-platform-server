import { Request, Response, NextFunction } from "express";
import { AttemptService, attemptService } from "./attempt.service.js";

export class AttemptController {
  constructor(private readonly service: AttemptService = attemptService) {}

  /**
   * POST /api/v1/attempts/start
   * Start a new assessment attempt or resume an existing active attempt session
   */
  startAttempt = async (
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const result = await this.service.startAttempt(
        req.user!.id,
        req.user!.email,
        req.body.inviteToken
      );

      const statusCode = result.isResumed ? 200 : 201;
      const message = result.isResumed
        ? "Existing active assessment attempt resumed successfully"
        : "Assessment attempt started successfully";

      res.status(statusCode).json({
        success: true,
        message,
        data: result.attempt,
      });
    } catch (error) {
      next(error);
    }
  };

  /**
   * GET /api/v1/attempts/:attemptId
   * Retrieve attempt session details, server countdown timer, and draft answers
   */
  getAttempt = async (
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const attempt = await this.service.getAttempt(
        req.user!.id,
        req.params.attemptId as string
      );

      res.status(200).json({
        success: true,
        data: attempt,
      });
    } catch (error) {
      next(error);
    }
  };

  /**
   * PUT /api/v1/attempts/:attemptId/answers
   * Autosave candidate answer draft for a specific problem
   */
  saveAnswer = async (
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const result = await this.service.saveAnswer(
        req.user!.id,
        req.params.attemptId as string,
        req.body
      );

      res.status(200).json({
        success: true,
        message: "Answer draft saved successfully",
        data: result,
      });
    } catch (error) {
      next(error);
    }
  };

  /**
   * POST /api/v1/attempts/:attemptId/submit
   * Finalize and submit assessment attempt
   */
  submitAttempt = async (
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const result = await this.service.submitAttempt(
        req.user!.id,
        req.params.attemptId as string
      );

      res.status(200).json({
        success: true,
        message: result.message,
        data: result,
      });
    } catch (error) {
      next(error);
    }
  };
}

export const attemptController = new AttemptController();
