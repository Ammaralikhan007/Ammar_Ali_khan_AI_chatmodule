import { NextFunction, Request, Response } from "express";
import { randomUUID } from "crypto";

/**
 * Assigns a correlation id to every request (reusing an inbound `X-Request-Id`
 * if present, else a fresh UUID) and echoes it in the response header.
 * Everything downstream — logs, errors, timeouts — references `req.requestId`
 * so a single request can be traced end to end.
 */
export function requestIdMiddleware(
  req: Request,
  res: Response,
  next: NextFunction
) {
  const incomingRequestId = req.headers["x-request-id"];

  const requestId =
    typeof incomingRequestId === "string" && incomingRequestId.trim().length > 0
      ? incomingRequestId
      : randomUUID();

  req.requestId = requestId;

  res.setHeader("X-Request-Id", requestId);

  return next();
}
