import { NextFunction, Request, Response } from "express";

/**
 * Structured access logger. Times each request and, on response `finish`,
 * emits a single JSON line (method, path, status, duration, requestId) so logs
 * are machine-parseable and correlated to a request.
 */
export function requestLoggerMiddleware(
  req: Request,
  res: Response,
  next: NextFunction
) {
  const startTime = process.hrtime.bigint();

  res.on("finish", () => {
    const durationMs = Number(process.hrtime.bigint() - startTime) / 1_000_000;

    console.log(
      JSON.stringify({
        level: "info",
        type: "request",
        requestId: req.requestId,
        method: req.method,
        path: req.originalUrl,
        statusCode: res.statusCode,
        durationMs: Number(durationMs.toFixed(2)),
        timestamp: new Date().toISOString(),
      })
    );
  });

  return next();
}
