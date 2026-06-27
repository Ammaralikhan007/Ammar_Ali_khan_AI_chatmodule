import { NextFunction, Request, Response } from "express";
import { AppError } from "../errors/app-error";

type Role = "user" | "admin";

/**
 * Role-based access control (RBAC). Returns a middleware that allows the
 * request only if `req.currentUser.role` is in `allowedRoles`, else throws
 * 403. Used to gate admin routes: `requireRole(["admin"])`.
 */
export function requireRole(allowedRoles: Role[]) {
  return function roleMiddleware(
    req: Request,
    res: Response,
    next: NextFunction
  ) {
    if (!req.currentUser) {
      throw new AppError({
        code: "UNAUTHORIZED",
        message: "Current user is missing",
        statusCode: 401,
      });
    }

    if (!allowedRoles.includes(req.currentUser.role)) {
      throw new AppError({
        code: "FORBIDDEN",
        message: "You do not have permission to access this resource",
        statusCode: 403,
      });
    }

    return next();
  };
}
