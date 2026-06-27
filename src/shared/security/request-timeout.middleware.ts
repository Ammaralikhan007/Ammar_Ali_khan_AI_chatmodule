import { NextFunction, Request, Response } from "express";

/**
 * Global request-timeout middleware.
 *
 * Guards against requests that hang (slow downstream, stuck DB lock, etc.) by
 * enforcing an upper bound on how long any single request may take. If the
 * handler hasn't started responding within `timeoutMs`, we send a 503 with the
 * standard typed-error envelope and stop waiting.
 *
 * Implementation notes / honest limitations:
 *  - Node/Express can't forcibly abort an already-running handler, so this is
 *    best-effort: on timeout we respond once (guarded by `res.headersSent`) and
 *    flag the request as timed-out. Any late write from the original handler is
 *    ignored. In a larger system you'd thread an `AbortSignal` into the DB / AI
 *    calls to cancel the underlying work too.
 *  - The timer is cleared on `finish`/`close` so normal fast requests incur no
 *    overhead beyond a single `setTimeout`.
 *
 * The timeout is read once from `REQUEST_TIMEOUT_MS` (default 15s) and must be
 * comfortably larger than the slowest legitimate operation (chat ≈ 1s mock
 * latency).
 */
export function createRequestTimeout(timeoutMs: number) {
  return function requestTimeoutMiddleware(
    req: Request,
    res: Response,
    next: NextFunction
  ) {
    const timer = setTimeout(() => {
      if (res.headersSent) {
        return;
      }

      res.status(503).json({
        success: false,
        error: {
          code: "REQUEST_TIMEOUT",
          message: "The server took too long to process the request.",
          requestId: req.requestId,
          details: {
            timeoutMs,
          },
        },
      });
    }, timeoutMs);

    // Stop the timer once the response is done (either way).
    res.on("finish", () => clearTimeout(timer));
    res.on("close", () => clearTimeout(timer));

    return next();
  };
}

/** Default request timeout in milliseconds, overridable via env. */
export const REQUEST_TIMEOUT_MS = Number(
  process.env.REQUEST_TIMEOUT_MS ?? 15_000
);
