import crypto from "crypto";
import { oidcConfig } from "./oidc.config";
import {
  JwtClaims,
  JwtVerificationError,
  signJwt,
  verifyJwtSignature,
} from "./jwt.service";

/**
 * Simulates an external OIDC identity provider (e.g. Keycloak).
 *
 * Responsibilities:
 *  - `issueToken(...)` — mint a signed JWT for a user (used by the dev token
 *    endpoint / test scripts; in production the real IdP does this).
 *  - `verifyToken(...)` — the part that actually matters for security: validate
 *    a presented token's signature AND its standard claims before we trust it.
 *
 * The verification order mirrors a real resource server:
 *   1. signature (is the token authentic / untampered?)
 *   2. issuer    (did *our* IdP mint it?)
 *   3. audience  (was it meant for *this* API?)
 *   4. time      (is it currently valid — not expired, not used too early?)
 */

export type AuthenticatedRole = "user" | "admin";

/** The trusted identity we extract from a verified token. */
export interface VerifiedIdentity {
  externalAuthId: string;
  email: string;
  role: AuthenticatedRole;
}

export class MockOidcProvider {
  /**
   * Mint a signed JWT for the given user. Mirrors what Keycloak would return
   * after a successful login. Intended for local/dev use only.
   */
  issueToken(params: {
    sub: string;
    email: string;
    role: AuthenticatedRole;
    /** Optional override for token lifetime (seconds). */
    ttlSeconds?: number;
  }): string {
    const nowSeconds = Math.floor(Date.now() / 1000);
    const ttl = params.ttlSeconds ?? oidcConfig.tokenTtlSeconds;

    const claims: JwtClaims = {
      sub: params.sub,
      email: params.email,
      role: params.role,
      iss: oidcConfig.issuer,
      aud: oidcConfig.audience,
      iat: nowSeconds,
      nbf: nowSeconds,
      exp: nowSeconds + ttl,
      jti: crypto.randomUUID(),
    };

    return signJwt(claims, oidcConfig.signingSecret);
  }

  /**
   * Verify a presented bearer token and return the trusted identity.
   * Throws `JwtVerificationError` for any failure (caller maps it to 401).
   */
  verifyToken(token: string): VerifiedIdentity {
    // 1. Signature + structure.
    const claims = verifyJwtSignature(token, oidcConfig.signingSecret);

    // 2. Issuer must be our IdP.
    if (claims.iss !== oidcConfig.issuer) {
      throw new JwtVerificationError("Untrusted token issuer");
    }

    // 3. Audience must include this API. `aud` may be a string or array.
    const audiences = Array.isArray(claims.aud) ? claims.aud : [claims.aud];
    if (!audiences.includes(oidcConfig.audience)) {
      throw new JwtVerificationError("Token audience mismatch");
    }

    // 4. Time-based validity (with a little clock tolerance).
    const nowSeconds = Math.floor(Date.now() / 1000);
    const tolerance = oidcConfig.clockToleranceSeconds;

    if (typeof claims.exp !== "number" || claims.exp + tolerance < nowSeconds) {
      throw new JwtVerificationError("Token has expired");
    }

    if (typeof claims.nbf === "number" && claims.nbf - tolerance > nowSeconds) {
      throw new JwtVerificationError("Token is not yet valid");
    }

    // 5. Required custom claims for our domain.
    if (!claims.sub || typeof claims.sub !== "string") {
      throw new JwtVerificationError("Token missing subject (sub)");
    }

    if (!claims.email || typeof claims.email !== "string") {
      throw new JwtVerificationError("Token missing email claim");
    }

    const role = claims.role;
    if (role !== "user" && role !== "admin") {
      throw new JwtVerificationError("Token has an invalid role claim");
    }

    return {
      externalAuthId: claims.sub,
      email: claims.email,
      role,
    };
  }
}

/** Shared singleton — the provider is stateless so one instance is fine. */
export const mockOidcProvider = new MockOidcProvider();
