import { User } from "../modules/users/domain/user.entity";

/**
 * Ambient augmentation of Express's `Request` type with the per-request fields
 * our middleware attaches:
 *   - `requestId`   — set by requestIdMiddleware (log/error correlation).
 *   - `authUser`    — set by jwtAuthMiddleware after verifying the OIDC JWT.
 *   - `currentUser` — set by ensureUserMiddleware (the persisted DB user).
 *
 * Because this file has a top-level `import`, it is a module — so the
 * augmentation MUST live inside `declare global` to reach the global Express
 * namespace. (`export {}` keeps it a module.)
 */
declare global {
  namespace Express {
    interface Request {
      requestId?: string;

      authUser?: {
        externalAuthId: string;
        email: string;
        role: "user" | "admin";
      };

      currentUser?: User;
    }
  }
}

export {};
