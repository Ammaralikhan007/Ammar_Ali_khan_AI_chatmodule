import crypto from "crypto";

/**
 * Minimal, dependency-free JSON Web Token (JWT) implementation using Node's
 * built-in `crypto`. Supports the HS256 algorithm only — which is all the mock
 * OIDC provider needs.
 *
 * A JWT is three base64url segments joined by dots:
 *
 *     base64url(header) . base64url(payload) . base64url(signature)
 *
 * The signature is an HMAC-SHA256 over "header.payload" using the shared
 * secret. Verification recomputes that HMAC and compares it in constant time,
 * which is what proves the token wasn't tampered with or forged.
 *
 * This file deliberately knows nothing about *our* claims (iss/aud/role) — it
 * just signs and verifies generic payloads. The OIDC-specific rules live in
 * `mock-oidc.provider.ts`.
 */

/** Standard registered claims plus the custom claims our IdP issues. */
export interface JwtClaims {
  /** Subject — the stable external user id (Keycloak `sub` equivalent). */
  sub: string;
  /** Issuer — who minted the token. */
  iss: string;
  /** Audience — who the token is intended for. */
  aud: string;
  /** Issued-at (epoch seconds). */
  iat: number;
  /** Expiry (epoch seconds). */
  exp: number;
  /** Not-before (epoch seconds). */
  nbf?: number;
  /** Unique token id (helps with replay/audit). */
  jti?: string;
  /** Custom: user email. */
  email?: string;
  /** Custom: user role. */
  role?: string;
  [claim: string]: unknown;
}

/** Encode a Buffer/string as base64url (RFC 7515) — no padding, URL-safe. */
function base64UrlEncode(input: Buffer | string): string {
  return Buffer.from(input)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

/** Decode a base64url string back into a Buffer. */
function base64UrlDecode(input: string): Buffer {
  const padded = input.replace(/-/g, "+").replace(/_/g, "/");
  return Buffer.from(padded, "base64");
}

/** Compute the HS256 signature segment for a given signing input. */
function sign(signingInput: string, secret: string): string {
  const hmac = crypto
    .createHmac("sha256", secret)
    .update(signingInput)
    .digest();
  return base64UrlEncode(hmac);
}

/**
 * Encode and sign a JWT from the given claims.
 */
export function signJwt(claims: JwtClaims, secret: string): string {
  const header = { alg: "HS256", typ: "JWT" };

  const encodedHeader = base64UrlEncode(JSON.stringify(header));
  const encodedPayload = base64UrlEncode(JSON.stringify(claims));
  const signingInput = `${encodedHeader}.${encodedPayload}`;

  const signature = sign(signingInput, secret);

  return `${signingInput}.${signature}`;
}

/** Thrown when a token is structurally invalid, forged, or has a bad signature. */
export class JwtVerificationError extends Error {}

/**
 * Verify a token's structure and signature, returning the decoded claims.
 *
 * NOTE: this only validates the cryptographic signature and shape. Claim-level
 * checks (iss/aud/exp) are layered on top by the OIDC provider so this stays a
 * generic primitive.
 */
export function verifyJwtSignature(token: string, secret: string): JwtClaims {
  const segments = token.split(".");

  if (segments.length !== 3) {
    throw new JwtVerificationError("Malformed token: expected 3 segments");
  }

  const [encodedHeader, encodedPayload, providedSignature] = segments;

  // Reject anything that isn't the algorithm we support (prevents "alg=none"
  // and algorithm-confusion attacks).
  let header: { alg?: string; typ?: string };
  try {
    header = JSON.parse(base64UrlDecode(encodedHeader).toString("utf8"));
  } catch {
    throw new JwtVerificationError("Malformed token header");
  }

  if (header.alg !== "HS256") {
    throw new JwtVerificationError(`Unsupported algorithm: ${header.alg}`);
  }

  const expectedSignature = sign(`${encodedHeader}.${encodedPayload}`, secret);

  // Constant-time comparison to avoid leaking signature bytes via timing.
  const provided = Buffer.from(providedSignature);
  const expected = Buffer.from(expectedSignature);

  if (
    provided.length !== expected.length ||
    !crypto.timingSafeEqual(provided, expected)
  ) {
    throw new JwtVerificationError("Invalid token signature");
  }

  try {
    return JSON.parse(base64UrlDecode(encodedPayload).toString("utf8"));
  } catch {
    throw new JwtVerificationError("Malformed token payload");
  }
}
