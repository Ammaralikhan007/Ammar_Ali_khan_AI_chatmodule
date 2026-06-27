import { NextFunction, Request, Response } from "express";
import { AppError } from "../../errors/app-error";
import { RateLimitBucket } from "./rate-limit.config";

/**
 * A small, dependency-free fixed-window rate limiter factory.
 *
 * Each call to `createRateLimiter` returns an Express middleware backed by its
 * OWN in-memory bucket store (a `Map`), so different limiters never share or
 * pollute each other's counts. Within a limiter, requests are grouped by a
 * caller-supplied key (an IP address, a user id, ...).
 *
 * NOTE: state is in-process only. In a horizontally-scaled deployment this
 * would be swapped for a shared store (e.g. Redis) — the middleware contract
 * stays identical, which is exactly why the strategy is isolated here.
 */

interface RateLimitRecord {
  count: number;
  windowStart: number;
}

export interface RateLimiterOptions extends RateLimitBucket {
  /** Human-readable name (used in error details / debugging). */
  name: string;
  /**
   * Derives the bucket key for a request. Return `null` to skip limiting for
   * this request (e.g. identity not resolved yet).
   */
  keyResolver: (req: Request) => string | null;
}

export function createRateLimiter(options: RateLimiterOptions) {
  const { name, windowMs, max, keyResolver } = options;

  // Private store for THIS limiter only.
  const store = new Map<string, RateLimitRecord>();

  return function rateLimitMiddleware(
    req: Request,
    res: Response,
    next: NextFunction
  ) {
    const key = keyResolver(req);

    // No key → nothing to limit against; let the request through.
    if (!key) {
      return next();
    }

    const now = Date.now();
    const existing = store.get(key);

    // Fresh window: first request in this window for this key.
    if (!existing || now - existing.windowStart > windowMs) {
      store.set(key, { count: 1, windowStart: now });

      res.setHeader("X-RateLimit-Limit", max);
      res.setHeader("X-RateLimit-Remaining", max - 1);

      return next();
    }

    // Window active and budget exhausted → reject with 429 + Retry-After.
    if (existing.count >= max) {
      const retryAfterSeconds = Math.ceil(
        (windowMs - (now - existing.windowStart)) / 1000
      );

      res.setHeader("Retry-After", retryAfterSeconds);
      res.setHeader("X-RateLimit-Limit", max);
      res.setHeader("X-RateLimit-Remaining", 0);

      throw new AppError({
        code: "RATE_LIMITED",
        message: "Too many requests. Please try again later.",
        statusCode: 429,
        details: {
          bucket: name,
          limit: max,
          windowSeconds: windowMs / 1000,
          retryAfterSeconds,
        },
      });
    }

    // Window active and budget remaining → count it and continue.
    existing.count += 1;

    res.setHeader("X-RateLimit-Limit", max);
    res.setHeader("X-RateLimit-Remaining", max - existing.count);

    return next();
  };
}
