# System Design — GGI Backend (AI Chat + Subscriptions)

Architecture & design mapping for the secure, production-grade backend defined in
`GGI - BACKEND TEST POSTURE.pdf`. No implementation here — this is the blueprint.

---

## 1. Goals & Non-Negotiables

| Driver                        | Implication                                                                |
| ----------------------------- | -------------------------------------------------------------------------- |
| Security-first                | No open/bypassable endpoints; defense-in-depth; token possession ≠ access. |
| DDD / Clean Architecture      | Domain logic isolated from framework & transport.                          |
| Correctness under concurrency | Quota deduction is **atomic** via DB transactions + row locks.             |
| Externalized identity         | OAuth2 / OIDC provider; **no custom auth**.                                |
| Operability                   | Structured logs, health, metrics, typed errors.                            |

---

## 2. Technology Decisions

| Concern             | Choice                               | Why                                                                                                    |
| ------------------- | ------------------------------------ | ------------------------------------------------------------------------------------------------------ |
| Language            | TypeScript (strict)                  | Required.                                                                                              |
| Framework           | **NestJS** (Express adapter)         | DI keeps domain framework-free; guards = controller-level authz; interceptors = timeout/logging.       |
| DB                  | **PostgreSQL**                       | Relational + `SELECT … FOR UPDATE` for atomic quota.                                                   |
| ORM / Migrations    | **TypeORM**                          | First-class pessimistic locks & transactions; migration tooling.                                       |
| Identity Provider   | **Keycloak** (OIDC)                  | Self-hostable, email/password + Google OAuth, JWKS, mockable in tests.                                 |
| Validation          | **class-validator + ValidationPipe** | Schema validation, `whitelist + forbidNonWhitelisted` → rejects extra fields & blocks mass assignment. |
| Rate limiting       | **@nestjs/throttler** (Redis store)  | Per-IP & per-user buckets, per-route-group limits.                                                     |
| Scheduling          | **@nestjs/schedule**                 | Cron for renewals + monthly free-quota reset.                                                          |
| Logging             | **pino** (nestjs-pino)               | Structured JSON, request-id correlation.                                                               |
| Proof-of-possession | **DPoP-style signed header + nonce** | The "additional security mechanism" — binds token to request.                                          |

> Keycloak/TypeORM/NestJS are swappable; the layering below makes provider/ORM choices replaceable behind interfaces.

---

## 3. Layered Architecture (Clean / DDD)

```
            ┌─────────────────────────────────────────────────────────┐
 Transport  │  Controllers · DTOs · Guards · Interceptors · Filters    │  ← framework-aware
            └───────────────▲─────────────────────────┬───────────────┘
                            │ calls                    │ depends on
            ┌───────────────┴─────────────────────────▼───────────────┐
Application │  Use-cases / App Services (orchestration, transactions)  │
            └───────────────▲─────────────────────────┬───────────────┘
                            │                          │
            ┌───────────────┴─────────────────────────▼───────────────┐
   Domain   │  Entities · Value Objects · Domain Services · Policies   │  ← pure, no imports
            │  Repository INTERFACES (ports)                           │     from outer layers
            └───────────────▲─────────────────────────────────────────┘
                            │ implemented by
            ┌───────────────┴─────────────────────────────────────────┐
Infrastructure│ TypeORM repos · Keycloak client · Mock OpenAI · Redis  │
            └─────────────────────────────────────────────────────────┘
```

**Dependency rule:** arrows point inward. Domain imports nothing from outer layers; infrastructure implements domain-defined ports. Business logic never references Nest/Express/HTTP.

---

## 4. Module Map

```
src/
├── modules/
│   ├── chat/
│   │   ├── domain/         entities (ChatMessage), policies (QuotaPolicy), services (QuotaDeductionService)
│   │   ├── application/    AskQuestionUseCase
│   │   ├── infrastructure/ ChatRepository (TypeORM), MockOpenAiClient
│   │   └── interface/      ChatController, dtos
│   └── subscriptions/
│       ├── domain/         Subscription entity, BillingPolicy, SubscriptionLifecycleService
│       ├── application/    CreateSubscription / Cancel / RenewSubscription use-cases
│       ├── infrastructure/ SubscriptionRepository, MockPaymentGateway
│       └── interface/      SubscriptionController, dtos
├── shared/
│   ├── auth/               OIDC token verification, RBAC guard, DPoP/PoP guard
│   ├── security/           helmet, CORS, body-limits, content-type, timeout, rate-limit config
│   ├── errors/             typed error hierarchy + global exception filter
│   ├── observability/      logger, request-id middleware, health, metrics
│   └── persistence/        DataSource, UnitOfWork / transaction helper
├── jobs/                   renewal cron, monthly-reset cron
└── config/                 env schema + typed config service
```

Modules are independent; cross-module access goes through application services, not direct entity reach-in.

---

## 5. Domain Model

```mermaid
erDiagram
    USER ||--o{ CHAT_MESSAGE : asks
    USER ||--o{ SUBSCRIPTION : owns
    USER ||--|| FREE_QUOTA : has
    SUBSCRIPTION ||--o{ USAGE_LEDGER : records
    CHAT_MESSAGE ||--o| USAGE_LEDGER : "deducts via"

    USER {
        uuid id PK
        string externalSubjectId "Keycloak sub"
        string email
        enum role "user | admin"
    }
    CHAT_MESSAGE {
        uuid id PK
        uuid userId FK
        text question
        text answer
        int tokenUsage
        timestamptz createdAt
    }
    FREE_QUOTA {
        uuid userId PK_FK
        int usedThisMonth
        date periodMonth "YYYY-MM-01"
    }
    SUBSCRIPTION {
        uuid id PK
        uuid userId FK
        enum tier "BASIC | PRO | ENTERPRISE"
        enum cycle "MONTHLY | YEARLY"
        int maxMessages "10 | 100 | -1=unlimited"
        int remaining
        numeric price
        bool autoRenew
        bool active
        timestamptz startDate
        timestamptz endDate
        timestamptz renewalDate
    }
    USAGE_LEDGER {
        uuid id PK
        uuid subscriptionId FK
        uuid chatMessageId FK
        int amount
        timestamptz createdAt
    }
```

- **Identity is external.** `USER.externalSubjectId` maps the Keycloak `sub`; we never store passwords.
- **`USAGE_LEDGER`** is an append-only audit of deductions → cancellation "preserves all historical usage."
- **`remaining`** on a subscription is the authoritative counter for atomic deduction; ledger explains it.

---

## 6. Key Flows

### 6.1 Chat request + atomic quota deduction

```
Client ──(Bearer JWT + DPoP proof)──▶ Security middleware (helmet/cors/size/content-type/timeout)
   ▶ RateLimit guard (per-IP + per-user, chat bucket)
   ▶ AuthGuard: verify JWT via JWKS (iss, aud, exp) + DPoP/nonce check
   ▶ RBAC guard: role = user/admin
   ▶ ChatController → AskQuestionUseCase
        BEGIN TX
          1. resolveQuotaSource(userId)   ← QuotaPolicy (see §7) with row locks
          2. deduct 1 (FREE_QUOTA.used++ OR SUBSCRIPTION.remaining-- via SELECT…FOR UPDATE)
          3. call MockOpenAiClient (simulated latency)
          4. persist ChatMessage (q, a, tokens, meta) + USAGE_LEDGER row
        COMMIT  (any failure → ROLLBACK, no deduction leak)
   ▶ 200 { answer, tokenUsage, quotaRemaining }   |   402 typed error if no quota
```

Concurrency safety = single transaction + `FOR UPDATE` lock on the chosen quota row, so two parallel requests can't double-spend the last credit.

### 6.2 Quota selection (QuotaPolicy)

```
if FREE_QUOTA.period == currentMonth and used < 3   → deduct FREE
else
  pick active subscriptions where remaining > 0 (or unlimited)
  → deduct from the bundle with the LATEST remaining quota   (spec: "latest remaining quota")
  → none available → throw NoQuotaError (typed, 402)
```

> "Latest remaining quota" is read as _the active bundle with the greatest remaining count_ (Enterprise/unlimited preferred when present). This tie-break rule is documented in the README as an explicit interpretation.

### 6.3 Monthly free-quota reset

Cron `0 0 1 * *` (UTC) resets `FREE_QUOTA` lazily: each deduction also self-heals if `periodMonth` is stale (so correctness never depends on the cron firing).

### 6.4 Subscription billing & lifecycle

```
RenewalCron (daily): subscriptions where autoRenew && renewalDate <= now
   → MockPaymentGateway.charge()  (random failure)
        success → extend endDate/renewalDate, top up remaining, active=true
        failure → active=false   (kept in DB, historical usage preserved)
Cancel: active=false, autoRenew=false, endDate=end of current cycle, ledger untouched.
```

---

## 7. Security Model → Requirement Mapping

| Requirement                             | Mechanism                                                                                                                                               |
| --------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| External OIDC auth, no custom auth      | Keycloak; email/password + Google OAuth.                                                                                                                |
| Verify tokens server-side (iss/aud/exp) | JWKS verification in `AuthGuard`; no shared secret trust.                                                                                               |
| Token possession ≠ access               | **DPoP proof-of-possession**: client signs each request; guard validates signature + **nonce/timestamp** (replay protection) + binds to JWT thumbprint. |
| RBAC (user/admin)                       | Guard at **controller level** + `Policy` checks at **domain level** (e.g. `canAccessChat(user, chat)`). Both enforced.                                  |
| Secure headers                          | `helmet`.                                                                                                                                               |
| Restricted CORS                         | Allow-list origins from env, no wildcard with credentials.                                                                                              |
| Request size limits                     | Body parser limit (e.g. 64KB JSON).                                                                                                                     |
| Strict content-type                     | Reject non-`application/json` on write routes.                                                                                                          |
| Global timeout                          | `TimeoutInterceptor`.                                                                                                                                   |
| Rate limiting                           | `@nestjs/throttler` (Redis): per-IP + per-user, distinct limits for auth / chat / subscription groups.                                                  |
| Schema validation + reject extra fields | `ValidationPipe({ whitelist, forbidNonWhitelisted, transform })`.                                                                                       |
| Prevent mass assignment                 | DTO whitelist + never bind request body straight to entities.                                                                                           |
| XSS / injection                         | Output is JSON (no HTML render); sanitize stored strings; ORM parameterized queries.                                                                    |

---

## 8. API Surface (all authenticated)

| Method | Route                          | Role   | Purpose                                     |
| ------ | ------------------------------ | ------ | ------------------------------------------- |
| POST   | `/v1/chat/messages`            | user   | Ask question → mocked answer + deduct quota |
| GET    | `/v1/chat/messages`            | user   | List own chat history                       |
| POST   | `/v1/subscriptions`            | user   | Create bundle (tier, cycle, autoRenew)      |
| GET    | `/v1/subscriptions`            | user   | List own subscriptions                      |
| POST   | `/v1/subscriptions/:id/cancel` | user   | Cancel at cycle end                         |
| GET    | `/v1/admin/metrics`            | admin  | Usage & subscription analytics              |
| GET    | `/health`                      | public | Liveness/readiness                          |
| GET    | `/metrics`                     | admin  | Basic metrics (usage, subscriptions)        |

---

## 9. Cross-Cutting Concerns

- **Errors:** typed domain error hierarchy (`NoQuotaError`, `PaymentFailedError`, `ForbiddenError`…) → global exception filter → structured JSON `{ code, message, requestId }`. No stack traces leak.
- **Logging:** pino, every log carries `requestId`, `userId`, `responseTimeMs`.
- **Config:** all secrets/URLs via env, validated at boot by a typed config schema; app fails fast if missing.
- **Observability:** `/health` (DB + IdP reachability), `/metrics` (counts).

---

## 10. Testing Strategy

| Type          | Targets                                                                                                                                                      |
| ------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Unit          | QuotaPolicy selection, atomic deduction logic, subscription lifecycle (renew/cancel/payment-fail), DPoP/nonce validation.                                    |
| Integration   | Authenticated access (valid/invalid/expired token, missing DPoP), rate-limit enforcement, security middleware, concurrent quota deduction (no double-spend). |
| Auth in tests | Keycloak **mocked** (issue test JWTs against a test JWKS) — never bypassed.                                                                                  |

---

## 11. Requirements Traceability (quick check)

| Spec area                          | Covered in       |
| ---------------------------------- | ---------------- |
| Module 1 — AI Chat + quota         | §5, §6.1–6.3, §7 |
| Module 2 — Subscriptions + billing | §5, §6.4         |
| Auth & access control              | §6.1, §7         |
| Security requirements              | §7               |
| Clean Architecture / layering      | §3, §4           |
| Observability & errors             | §9               |
| Testing                            | §10              |

---

## 12. Open Decisions (to confirm before coding)

1. **"Latest remaining quota"** — interpreted as _greatest remaining count_ among active bundles (§6.2). Alternative: most-recently-created bundle. → confirm.
2. **PoP mechanism** — DPoP vs simpler HMAC request signing. DPoP chosen for standards alignment.
3. **Unlimited (Enterprise)** modeled as `maxMessages = -1` / `remaining = NULL`; deduction logged but not decremented.
