import { NextFunction, Request, Response } from "express";
import { TypeOrmUserRepository } from "../../modules/users/infrastructure/typeorm-user.repository";
import { AppError } from "../errors/app-error";

/**
 * Bridges the external identity (from the verified JWT) to a local DB user.
 * Looks the user up by external auth id and lazily provisions one on first
 * sight (just-in-time user creation), then sets `req.currentUser`. Runs after
 * `jwtAuthMiddleware`, which populates `req.authUser`.
 */
export async function ensureUserMiddleware(
  req: Request,
  res: Response,
  next: NextFunction
) {
  if (!req.authUser) {
    throw new AppError({
      code: "UNAUTHORIZED",
      message: "Authenticated user is missing",
      statusCode: 401,
    });
  }

  const userRepository = new TypeOrmUserRepository();

  let user = await userRepository.findByExternalAuthId(
    req.authUser.externalAuthId
  );

  if (!user) {
    user = await userRepository.create({
      externalAuthId: req.authUser.externalAuthId,
      email: req.authUser.email,
      role: req.authUser.role,
    });
  }

  req.currentUser = user;

  return next();
}
