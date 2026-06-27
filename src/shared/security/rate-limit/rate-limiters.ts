import { Request } from "express";
import { createRateLimiter } from "./rate-limiter";
import { rateLimitConfig } from "./rate-limit.config";

/**
 * Concrete, ready-to-use rate limiters for the application.
 *
 * Two key strategies:
 *  - `byIp`   — groups by client IP. Used by the global limiter so unauthenticated
 *               traffic is bounded.
 *  - `byUser` — groups by the verified external auth id. Used by the per-route
 *               limiters; returns null pre-auth so it simply no-ops if somehow
 *               attached before authentication.
 */
const byIp = (req: Request): string =>
  req.ip ?? req.socket.remoteAddress ?? "unknown-ip";

const byUser = (req: Request): string | null =>
  req.authUser?.externalAuthId ?? null;

/** Global, per-IP guard. Mount with `app.use(...)` before the routes. */
export const ipRateLimiter = createRateLimiter({
  name: "ip",
  keyResolver: byIp,
  ...rateLimitConfig.ip,
});

/** Default per-user limiter for authenticated routes without a specific group. */
export const defaultUserRateLimiter = createRateLimiter({
  name: "default-user",
  keyResolver: byUser,
  ...rateLimitConfig.default,
});

/** Per-user limiter for the chat group (tightest budget). */
export const chatRateLimiter = createRateLimiter({
  name: "chat",
  keyResolver: byUser,
  ...rateLimitConfig.chat,
});

/** Per-user limiter for the subscriptions group. */
export const subscriptionRateLimiter = createRateLimiter({
  name: "subscriptions",
  keyResolver: byUser,
  ...rateLimitConfig.subscriptions,
});

/** Per-user limiter for the admin group. */
export const adminRateLimiter = createRateLimiter({
  name: "admin",
  keyResolver: byUser,
  ...rateLimitConfig.admin,
});
