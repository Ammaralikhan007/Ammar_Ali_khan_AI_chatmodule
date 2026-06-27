import { NextFunction, Request, Response } from "express";

/**
 * Strict content-type guard: rejects write requests (POST/PUT/PATCH) that
 * aren't `application/json` with 415. Stops clients from sending unexpected
 * payload formats and narrows the parser's attack surface.
 */
export function requireJsonContentType(
  req: Request,
  res: Response,
  next: NextFunction
) {
  const methodsThatNeedJson = ["POST", "PUT", "PATCH"];

  if (!methodsThatNeedJson.includes(req.method)) {
    return next();
  }

  // A bodyless write (e.g. POST /subscriptions/:id/cancel) has nothing to
  // parse, so the content-type is irrelevant — don't demand JSON for it.
  const contentLength = Number(req.headers["content-length"] ?? 0);
  const hasBody =
    contentLength > 0 || req.headers["transfer-encoding"] !== undefined;

  if (!hasBody) {
    return next();
  }

  const contentType = req.headers["content-type"];

  if (!contentType || !contentType.includes("application/json")) {
    return res.status(415).json({
      success: false,
      error: {
        code: "UNSUPPORTED_MEDIA_TYPE",
        message: "Content-Type must be application/json",
      },
    });
  }

  return next();
}
