import { Request, Response, NextFunction } from "express";
import { ReportService, reportService } from "./report.service.js";

export class ReportController {
  constructor(private readonly service: ReportService = reportService) {}

  getAssessmentSummary = async (
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const summary = await this.service.getAssessmentSummary(
        req.params.id as string,
        req.organizationId!
      );

      res.status(200).json({
        success: true,
        message: "Assessment performance summary retrieved successfully",
        data: summary,
      });
    } catch (error) {
      next(error);
    }
  };

  getAttemptReport = async (
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const report = await this.service.getAttemptReport(
        req.params.attemptId as string,
        req.organizationId!
      );

      res.status(200).json({
        success: true,
        message: "Candidate attempt scorecard retrieved successfully",
        data: report,
      });
    } catch (error) {
      next(error);
    }
  };

  getCandidateResults = async (
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const results = await this.service.getCandidateResults(
        req.user!.id,
        req.user!.email
      );

      res.status(200).json({
        success: true,
        message: "Candidate results retrieved successfully",
        data: results,
      });
    } catch (error) {
      next(error);
    }
  };
}

export const reportController = new ReportController();
