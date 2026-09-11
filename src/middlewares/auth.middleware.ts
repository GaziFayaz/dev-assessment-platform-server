import { Request, Response, NextFunction } from "express";
import { fromNodeHeaders } from "better-auth/node";
import { auth } from "../lib/auth.js";
import { prisma } from "../lib/prisma.js";
import { AppError } from "../errors/app-error.js";

export const requireAuth = async (req: Request, _res: Response, next: NextFunction) => {
  try {
    const session = await auth.api.getSession({
      headers: fromNodeHeaders(req.headers),
    });

    if (!session) {
      return next(AppError.unauthorized("Unauthorized: Active session required"));
    }

    req.user = session.user as any;
    req.session = session.session as any;
    next();
  } catch (error) {
    next(error);
  }
};

export const requirePlatformAdmin = (req: Request, _res: Response, next: NextFunction) => {
  if (req.user?.role !== "admin") {
    return next(AppError.forbidden("Forbidden: Platform admin privileges required"));
  }
  next();
};

export const requireCompanyRole = (allowedRoles: ("admin" | "recruiter")[]) => {
  return async (req: Request, _res: Response, next: NextFunction) => {
    try {
      const orgId = (req.headers["x-organization-id"] as string) || req.session?.activeOrganizationId;

      if (!orgId) {
        return next(
          AppError.badRequest(
            "Active organization context required (missing x-organization-id header)",
            "ORGANIZATION_CONTEXT_REQUIRED"
          )
        );
      }

      if (!req.user?.id) {
        return next(AppError.unauthorized());
      }

      const member = await prisma.member.findFirst({
        where: {
          organizationId: orgId,
          userId: req.user.id,
        },
      });

      if (!member || !allowedRoles.includes(member.role as any)) {
        return next(AppError.forbidden("Forbidden: Insufficient company permissions"));
      }

      req.organizationId = orgId;
      req.companyMember = member;
      next();
    } catch (error) {
      next(error);
    }
  };
};
