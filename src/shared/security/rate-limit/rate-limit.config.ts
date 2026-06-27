/**
 * Rate-limit budgets for each bucket, all overridable via environment.
 *
 * Two dimensions of limiting are used together (defense in depth):
 *  - PER-IP (global): coarse protection against a single host flooding the API,
 *    applied before authentication so even anonymous traffic is bounded.
 *  - PER-USER (per route group): fairness between authenticated users, with a
 *    different budget for each group because the routes have different costs
 *    and sensitivities:
 *      • chat          — hits the (mock) AI + a DB transaction → tightest limit.
 *      • subscriptions — billing-related writes → moderate limit.
 *      • admin         — sensitive analytics → moderate, separate budget.
 *      • default       — everything else authenticated (e.g. /me).
 *
 * `windowMs` is the rolling window length; `max` is the number of requests
 * allowed per key within that window.
 */
function intFromEnv(name: string, fallback: number): number {
  const raw = process.env[name];
  const parsed = raw ? Number(raw) : NaN;
  return Number.isFinite(parsed) ? parsed : fallback;
}

export interface RateLimitBucket {
  windowMs: number;
  max: number;
}

export const rateLimitConfig: Record<
  "ip" | "default" | "chat" | "subscriptions" | "admin",
  RateLimitBucket
> = {
  // Global per-IP guard — generous, just stops outright flooding.
  ip: {
    windowMs: intFromEnv("RATE_LIMIT_IP_WINDOW_MS", 60_000),
    max: intFromEnv("RATE_LIMIT_IP_MAX", 100),
  },

  // Default per-user budget for authenticated routes without a specific group.
  default: {
    windowMs: intFromEnv("RATE_LIMIT_DEFAULT_WINDOW_MS", 60_000),
    max: intFromEnv("RATE_LIMIT_DEFAULT_MAX", 60),
  },

  // Chat is the most expensive operation → tightest budget.
  chat: {
    windowMs: intFromEnv("RATE_LIMIT_CHAT_WINDOW_MS", 60_000),
    max: intFromEnv("RATE_LIMIT_CHAT_MAX", 10),
  },

  // Subscription writes (create/cancel) → moderate budget.
  subscriptions: {
    windowMs: intFromEnv("RATE_LIMIT_SUBSCRIPTIONS_WINDOW_MS", 60_000),
    max: intFromEnv("RATE_LIMIT_SUBSCRIPTIONS_MAX", 20),
  },

  // Admin analytics → its own moderate budget.
  admin: {
    windowMs: intFromEnv("RATE_LIMIT_ADMIN_WINDOW_MS", 60_000),
    max: intFromEnv("RATE_LIMIT_ADMIN_MAX", 30),
  },
};
