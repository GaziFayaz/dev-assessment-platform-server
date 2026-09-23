import { Request, Response, NextFunction } from "express";
import { EvaluationService, evaluationService } from "./evaluation.service.js";

export class EvaluationController {
  constructor(private readonly service: EvaluationService = evaluationService) {}

  getQueue = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const result = await this.service.getQueue(
        req.organizationId!,
        req.user!.id,
        req.query as any
      );

      res.status(200).json({
        success: true,
        data: result.items,
        meta: {
          page: result.page,
          limit: result.limit,
          totalItems: result.totalItems,
          totalPages: result.totalPages,
        },
      });
    } catch (error) {
      next(error);
    }
  };

  getReviewDetail = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const review = await this.service.getReviewDetail(
        req.organizationId!,
        req.params.reviewId as string
      );

      res.status(200).json({
        success: true,
        message: "Evaluation review details retrieved successfully",
        data: review,
      });
    } catch (error) {
      next(error);
    }
  };

  claimReview = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const result = await this.service.claimReview(
        req.organizationId!,
        req.user!.id,
        req.companyMember!.role,
        req.params.reviewId as string,
        req.body
      );

      res.status(200).json({
        success: true,
        message: result.claimed
          ? "Evaluation review claimed successfully"
          : "Evaluation review unclaimed successfully",
        data: result,
      });
    } catch (error) {
      next(error);
    }
  };

  scoreQuestion = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const result = await this.service.scoreQuestion(
        req.organizationId!,
        req.user!.id,
        req.companyMember!.role,
        req.params.reviewId as string,
        req.body
      );

      res.status(200).json({
        success: true,
        message: "Question scored successfully",
        data: result,
      });
    } catch (error) {
      next(error);
    }
  };

  finalizeEvaluation = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const result = await this.service.finalizeEvaluation(
        req.organizationId!,
        req.user!.id,
        req.companyMember!.role,
        req.params.reviewId as string,
        req.body
      );

      res.status(200).json({
        success: true,
        message: "Evaluation finalized successfully",
        data: result,
      });
    } catch (error) {
      next(error);
    }
  };
}

export const evaluationController = new EvaluationController();
