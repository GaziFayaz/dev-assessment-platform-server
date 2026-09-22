import { Request, Response, NextFunction } from "express";
import { AssessmentService, assessmentService } from "./assessment.service.js";

export class AssessmentController {
  constructor(private readonly service: AssessmentService = assessmentService) {}

  createAssessment = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const assessment = await this.service.createAssessment(
        req.body,
        req.user!.id,
        req.organizationId!
      );

      res.status(201).json({
        success: true,
        message: "Assessment created successfully",
        data: assessment,
      });
    } catch (error) {
      next(error);
    }
  };

  getAssessments = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const result = await this.service.getAssessments(
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

  getAssessmentById = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const assessment = await this.service.getAssessmentById(
        req.params.id as string,
        req.organizationId!
      );

      res.status(200).json({
        success: true,
        message: "Assessment retrieved successfully",
        data: assessment,
      });
    } catch (error) {
      next(error);
    }
  };

  updateAssessment = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const assessment = await this.service.updateAssessment(
        req.params.id as string,
        req.body,
        req.organizationId!
      );

      res.status(200).json({
        success: true,
        message: "Assessment updated successfully",
        data: assessment,
      });
    } catch (error) {
      next(error);
    }
  };

  addProblem = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const result = await this.service.addProblem(
        req.params.id as string,
        req.body,
        req.organizationId!
      );

      res.status(201).json({
        success: true,
        message: "Problem added to assessment successfully",
        data: result,
      });
    } catch (error) {
      next(error);
    }
  };

  removeProblem = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const result = await this.service.removeProblem(
        req.params.id as string,
        req.params.problemId as string,
        req.organizationId!
      );

      res.status(200).json({
        success: true,
        message: "Problem removed from assessment successfully",
        data: result,
      });
    } catch (error) {
      next(error);
    }
  };

  updateStatus = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const assessment = await this.service.updateStatus(
        req.params.id as string,
        req.body,
        req.organizationId!
      );

      res.status(200).json({
        success: true,
        message: "Assessment status updated successfully",
        data: assessment,
      });
    } catch (error) {
      next(error);
    }
  };

  deleteAssessment = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const result = await this.service.deleteAssessment(
        req.params.id as string,
        req.organizationId!
      );

      res.status(200).json({
        success: true,
        message: "Assessment deleted successfully",
        data: result,
      });
    } catch (error) {
      next(error);
    }
  };
}

export const assessmentController = new AssessmentController();
