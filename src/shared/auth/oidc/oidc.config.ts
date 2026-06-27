/**
 * Configuration for the MOCK OpenID Connect (OIDC) identity provider.
 *
 * In a real deployment this layer would be backed by an external IdP such as
 * Keycloak/Auth0: tokens would be signed with the IdP's *private* key (RS256)
 * and verified here against its *public* JWKS endpoint.
 *
 * For this assignment we simulate that provider in-process using a symmetric
 * HS256 secret. The verification *flow* is identical to production (parse the
 * JWT, check the signature, then validate the `iss` / `aud` / `exp` claims) —
 * only the key material is simplified so the project stays self-contained and
 * easy to test manually.
 *
 * All values are read from the environment with safe development defaults so
 * the app boots without extra setup. Override them in `.env` for real use.
 */
export const oidcConfig = {
  /** Expected `iss` (issuer) claim — identifies which IdP minted the token. */
  issuer: process.env.OIDC_ISSUER ?? "https://mock-idp.ggi.local/",

  /** Expected `aud` (audience) claim — this API's identifier. */
  audience: process.env.OIDC_AUDIENCE ?? "ggi-backend",

  /**
   * Shared secret used to sign/verify HS256 tokens.
   * Stands in for the IdP's asymmetric signing key in this mock.
   */
  signingSecret:
    process.env.OIDC_JWT_SECRET ?? "dev-oidc-mock-signing-secret-change-me",

  /** Lifetime of a freshly minted token, in seconds (default 1 hour). */
  tokenTtlSeconds: Number(process.env.OIDC_TOKEN_TTL_SECONDS ?? 3600),

  /**
   * Allowed clock skew (seconds) when validating `exp`/`nbf`, so tiny clock
   * differences between client and server don't spuriously reject tokens.
   */
  clockToleranceSeconds: Number(process.env.OIDC_CLOCK_TOLERANCE_SECONDS ?? 30),
} as const;
