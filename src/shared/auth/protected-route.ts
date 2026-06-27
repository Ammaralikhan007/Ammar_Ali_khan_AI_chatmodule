import { ensureUserMiddleware } from "./ensure-user.middleware";
import { jwtAuthMiddleware } from "./jwt-auth.middleware";
import { requestSignatureMiddleware } from "../security/request-signature.middleware";

/**
 * The standard middleware chain applied to every authenticated route.
 *
 * Order matters — each step builds on the previous one:
 *   1. requestSignatureMiddleware — proof-of-possession: the request carries a
 *      valid HMAC signature + fresh timestamp (replay protection). Token theft
 *      alone is not enough to call the API.
 *   2. jwtAuthMiddleware — verifies the OIDC bearer JWT (signature + claims)
 *      and populates `req.authUser` with the trusted identity.
 *   3. ensureUserMiddleware — maps that external identity to a persisted DB
 *      user (creating one on first sight) and sets `req.currentUser`.
 *
 * Rate limiting is intentionally NOT part of this chain: a global per-IP limit
 * runs earlier (app-wide), and per-route-group per-user limits are attached
 * explicitly on each route so each group can have its own budget.
 *
 * Spread it into a route definition: `app.get("/me", ...protectedRoute, handler)`.
 */
export const protectedRoute = [
  requestSignatureMiddleware,
  jwtAuthMiddleware,
  ensureUserMiddleware,
];
