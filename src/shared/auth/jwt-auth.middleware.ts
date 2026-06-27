import { NextFunction, Request, Response } from "express";
import { AppError } from "../errors/app-error";
import { JwtVerificationError } from "./oidc/jwt.service";
import { mockOidcProvider } from "./oidc/mock-oidc.provider";

/**
 * Authentication middleware — the OIDC/JWT verification gate.
 *
 * Replaces the old "trust the x-mock-* headers" approach. The client must now
 * present a bearer token in the standard `Authorization` header:
 *
 *     Authorization: Bearer <jwt>
 *
 * The token is cryptographically verified (signature + iss/aud/exp claims) by
 * the mock OIDC provider before we trust any identity. Possession of a token
 * alone is not enough — it must be authentic and currently valid.
 *
 * On success it populates `req.authUser` with the verified identity. The
 * downstream `ensureUserMiddleware` then maps that to a persisted DB user.
 */
export function jwtAuthMiddleware(
  req: Request,
  res: Response,
  next: NextFunction
) {
  const authorizationHeader = req.header("authorization");

  if (!authorizationHeader) {
    throw new AppError({
      code: "UNAUTHORIZED",
      message: "Missing Authorization header",
      statusCode: 401,
      details: {
        expectedFormat: "Authorization: Bearer <token>",
      },
    });
  }

  const [scheme, token] = authorizationHeader.split(" ");

  if (scheme?.toLowerCase() !== "bearer" || !token) {
    throw new AppError({
      code: "UNAUTHORIZED",
      message: "Authorization header must use the Bearer scheme",
      statusCode: 401,
      details: {
        expectedFormat: "Authorization: Bearer <token>",
      },
    });
  }

  try {
    const identity = mockOidcProvider.verifyToken(token);

    req.authUser = {
      externalAuthId: identity.externalAuthId,
      email: identity.email,
      role: identity.role,
    };

    return next();
  } catch (error) {
    // Any verification failure collapses to a single opaque 401 — we never
    // leak *why* a token failed (forged vs expired) to the client.
    if (error instanceof JwtVerificationError) {
      throw new AppError({
        code: "UNAUTHORIZED",
        message: "Invalid or expired authentication token",
        statusCode: 401,
      });
    }

    throw error;
  }
}
