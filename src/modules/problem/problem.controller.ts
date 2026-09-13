import { Request, Response, NextFunction } from "express";
import { ProblemService, problemService } from "./problem.service.js";

export class ProblemController {
  constructor(private readonly service: ProblemService = problemService) {}

  createProblem = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const problem = await this.service.createProblem(
        req.body,
        req.user!.id,
        req.organizationId!
      );

      res.status(201).json({
        success: true,
        message: "Problem created successfully",
        data: problem,
      });
    } catch (error) {
      next(error);
    }
  };

  getProblems = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const result = await this.service.getProblems(
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

  getProblemById = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const problem = await this.service.getProblemById(
        req.params.id as string,
        req.organizationId!
      );

      res.status(200).json({
        success: true,
        message: "Problem retrieved successfully",
        data: problem,
      });
    } catch (error) {
      next(error);
    }
  };

  updateProblem = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const problem = await this.service.updateProblem(
        req.params.id as string,
        req.body,
        req.organizationId!
      );

      res.status(200).json({
        success: true,
        message: "Problem updated successfully",
        data: problem,
      });
    } catch (error) {
      next(error);
    }
  };

  deleteProblem = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const result = await this.service.deleteProblem(
        req.params.id as string,
        req.organizationId!
      );

      res.status(200).json({
        success: true,
        message: "Problem deleted successfully",
        data: result,
      });
    } catch (error) {
      next(error);
    }
  };
}

export const problemController = new ProblemController();
