import crypto from "crypto";
import { NextFunction, Request, Response } from "express";
import { AppError } from "../errors/app-error";

/**
 * Proof-of-possession guard. Each request must carry an HMAC-SHA256 signature
 * over `method:url:timestamp` (header `x-request-signature`) plus a fresh
 * timestamp (`x-request-timestamp`). The server recomputes the signature with
 * the shared secret and rejects mismatches; the ±5-minute timestamp window
 * blocks replay. This means a stolen JWT alone is not enough to call the API.
 */
export function requestSignatureMiddleware(
  req: Request,
  res: Response,
  next: NextFunction
) {
  const timestamp = req.header("x-request-timestamp");
  const signature = req.header("x-request-signature");

  if (!timestamp || !signature) {
    throw new AppError({
      code: "UNAUTHORIZED",
      message: "Missing request signature headers",
      statusCode: 401,
      details: {
        requiredHeaders: ["x-request-timestamp", "x-request-signature"],
      },
    });
  }

  const requestTime = new Date(timestamp).getTime();

  if (Number.isNaN(requestTime)) {
    throw new AppError({
      code: "UNAUTHORIZED",
      message: "Invalid request timestamp",
      statusCode: 401,
    });
  }

  const now = Date.now();
  const fiveMinutesMs = 5 * 60 * 1000;

  if (Math.abs(now - requestTime) > fiveMinutesMs) {
    throw new AppError({
      code: "UNAUTHORIZED",
      message: "Request timestamp expired",
      statusCode: 401,
    });
  }

  const secret = process.env.REQUEST_SIGNATURE_SECRET;

  if (!secret) {
    throw new AppError({
      code: "INTERNAL_SERVER_ERROR",
      message: "Request signature secret is not configured",
      statusCode: 500,
    });
  }

  // For this assignment prototype, i sign method + URL + timestamp.
  // In production, the raw request body should also be included in the signature.
  // To do that safely in Express, capture the raw body before JSON parsing.
  const payload = `${req.method}:${req.originalUrl}:${timestamp}`;

  const expectedSignature = crypto
    .createHmac("sha256", secret)
    .update(payload)
    .digest("hex");

  if (signature !== expectedSignature) {
    throw new AppError({
      code: "UNAUTHORIZED",
      message: "Invalid request signature",
      statusCode: 401,
    });
  }

  return next();
}
