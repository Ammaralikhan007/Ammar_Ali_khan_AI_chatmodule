# Architecture & Codebase Guide — GGI Backend

A secure AI-chat + subscriptions backend built with **Express 5 + TypeScript +
TypeORM (PostgreSQL)** following **Clean Architecture / DDD**. This document is
the map: what each module does, where each feature lives, and how a request
flows through the system.

> See [`SYSTEM_DESIGN.md`](./SYSTEM_DESIGN.md) for the original design blueprint
> and [`TESTING.md`](./TESTING.md) for how to run things manually.

---

## 1. Layered architecture (the dependency rule)

Dependencies always point **inward**. Inner layers never import from outer ones.

```
interface  (HTTP routes in main.ts, Zod schemas)   ← framework-aware
   │ calls
application (use-cases, services — orchestration + transactions)
   │ depends on
domain     (entities, policies, repository INTERFACES/ports) ← pure, no framework
   ▲ implemented by
infrastructure (TypeORM repos, mock AI, mock payment gateway)
```

- **domain** — business types and rules. Pure TypeScript, no Express/TypeORM.
  Defines repository **ports** (interfaces) the outer layers implement.
- **application** — use-cases that orchestrate domain + ports, own DB
  transactions. Depend only on interfaces, never on concrete infrastructure.
- **infrastructure** — concrete adapters: TypeORM repositories, the mock AI
  provider, the mock payment gateway. The only place that knows about the DB.
- **interface** — the transport edge: route handlers in `main.ts` and the Zod
  request schemas. Wires HTTP → use-cases.

---

## 2. Directory map

```
src/
├── main.ts                     Composition root: middleware pipeline + all routes + bootstrap.
│
├── modules/                    Feature modules (one folder per bounded context)
│   ├── users/
│   │   ├── domain/             User entity, UserRepository port
│   │   └── infrastructure/     TypeORM user entity, mapper, repository
│   │
│   ├── chat/                   MODULE 1 — AI chat + quota
│   │   ├── domain/             ChatMessage entity, ChatMessageRepository port
│   │   ├── application/        AskQuestionUseCase, QuotaService (atomic deduction)
│   │   ├── infrastructure/     TypeORM repos, MockAiProvider, free-usage + ledger
│   │   └── interface/          ask-question Zod schema (+ sanitization)
│   │
│   └── subscriptions/          MODULE 2 — subscriptions + billing
│       ├── domain/             Subscription entity, tier config, billing policy,
│       │                       PaymentGateway port, SubscriptionRepository port
│       ├── application/        Create / Cancel / Renew use-cases
│       ├── infrastructure/     TypeORM repos, MockPaymentGateway, usage-ledger
│       └── interface/          create-subscription Zod schema
│
├── shared/                     Cross-cutting concerns
│   ├── auth/                   protectedRoute chain, JWT auth, ensure-user, RBAC
│   │   └── oidc/               Mock OIDC provider + JWT sign/verify
│   ├── security/               content-type, request signature, sanitize, timeout
│   │   └── rate-limit/         Rate limiter factory + per-bucket config + limiters
│   ├── errors/                 AppError type + global error handler
│   ├── observability/          request-id + request logger middleware
│   ├── validation/             validateBody (Zod) middleware
│   ├── date/                   usage-month helper
│   └── persistence/            DataSource, migrations, migration runner
│
├── jobs/                       Background jobs: renewal job, scheduler, CLI runner
└── types/                      Express Request type augmentation
```

---

## 3. The two feature modules

### Module 1 — AI Chat + Quota (`modules/chat`)

A user asks a question; we deduct one unit of quota, call the (mock) AI, store
the message, and append an audit row — **all in one DB transaction** so quota
can never be double-spent or leaked.

- **`AskQuestionUseCase`** (application) — runs the whole thing inside
  `AppDataSource.transaction(...)`.
- **`QuotaService`** (application) — the quota brain. `deductQuota` tries:
  1. **free** monthly quota (3/month), then
  2. **subscription** quota (highest remaining first),
  3. else throws a typed `QUOTA_EXCEEDED` (402).
     Deductions use **`pessimistic_write` row locks** for concurrency safety.
- **`MockAiProvider`** (infrastructure) — simulates latency + token usage.
- **`MonthlyFreeUsage`** / **`UsageLedger`** — the free-quota counter and the
  append-only audit of every deduction.

### Module 2 — Subscriptions + Billing (`modules/subscriptions`)

- **`CreateSubscriptionUseCase`** — derives period/price/allotment from the
  shared **`billing.policy`** and persists an active subscription.
- **`CancelSubscriptionUseCase`** — cancels (ownership-checked); history kept.
- **`RenewSubscriptionUseCase`** — charges via the **`PaymentGateway`** port;
  on success extends the period + tops up quota, on failure deactivates.
- **`MockPaymentGateway`** — simulates latency + a configurable random decline
  rate to exercise the failure path.
- **Billing job** (`jobs/`) — finds due subscriptions and renews each.

---

## 4. Request lifecycle (authenticated route)

```
Request
  └─ requestId            assign correlation id
  └─ requestLogger        structured access log on finish
  └─ ipRateLimiter        GLOBAL per-IP limit (before auth)
  └─ requestTimeout       upper bound on duration
  └─ cors / helmet        restricted origins + secure headers
  └─ content-type + json  reject non-JSON writes, 64KB body cap
  ── route: ...protectedRoute, <groupRateLimiter>, [validateBody], handler
       └─ requestSignature   HMAC signature + fresh timestamp (replay protection)
       └─ jwtAuth             verify OIDC JWT (signature + iss/aud/exp) → req.authUser
       └─ ensureUser          map identity to DB user → req.currentUser
       └─ groupRateLimiter    per-USER limit for this route group
       └─ validateBody        Zod schema (+ sanitization), rejects unknown fields
       └─ handler             builds use-case, returns typed JSON
  └─ errorHandler          any thrown AppError → typed JSON envelope
```

---

## 5. Where each security feature lives

| Requirement                                     | Implementation                                                                                   |
| ----------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| **OIDC/JWT verification**                       | `shared/auth/oidc/` (`mock-oidc.provider`, `jwt.service`) + `shared/auth/jwt-auth.middleware.ts` |
| **Proof-of-possession**                         | `shared/security/request-signature.middleware.ts` (HMAC + timestamp)                             |
| **RBAC (user/admin)**                           | `shared/auth/require-role.middleware.ts`                                                         |
| **Per-IP rate limiting**                        | `shared/security/rate-limit/` → `ipRateLimiter` (global)                                         |
| **Per-group rate limits**                       | same dir → `chat` / `subscriptions` / `admin` / `default` buckets                                |
| **Global request timeout**                      | `shared/security/request-timeout.middleware.ts`                                                  |
| **Input sanitization**                          | `shared/security/sanitize.ts` (applied in `ask-question.schema.ts`)                              |
| **Schema validation / no mass-assignment**      | `shared/validation/validate-body.middleware.ts` + Zod `.strict()`                                |
| **Secure headers / CORS / size / content-type** | `main.ts` (helmet, cors), `content-type.middleware.ts`, 64KB json cap                            |
| **Typed errors, no leaks**                      | `shared/errors/` (`AppError` + `errorHandlerMiddleware`)                                         |
| **Migrations (no `synchronize`)**               | `shared/persistence/migrations/` + `migrate.ts` runner                                           |
| **Billing auto-renew / payment sim**            | `modules/subscriptions` renew use-case + `jobs/`                                                 |
| **Lint/format**                                 | `eslint.config.mjs`, `.prettierrc.json`                                                          |

---

## 6. API surface

| Method | Route                         | Auth              | Purpose                             |
| ------ | ----------------------------- | ----------------- | ----------------------------------- |
| GET    | `/health`                     | public            | Liveness probe                      |
| GET    | `/dev/auth/token`             | public (dev only) | Mint a JWT for manual testing       |
| GET    | `/me`                         | user              | Verified identity + DB user         |
| POST   | `/chat`                       | user              | Ask a question (deducts quota)      |
| GET    | `/chat`                       | user              | List own chat history               |
| POST   | `/subscriptions`              | user              | Create a subscription               |
| GET    | `/subscriptions`              | user              | List own subscriptions              |
| POST   | `/subscriptions/:id/cancel`   | user              | Cancel a subscription               |
| GET    | `/admin/usage-ledger`         | admin             | Recent deduction audit rows         |
| GET    | `/admin/usage-summary`        | admin             | Usage counts (free vs subscription) |
| POST   | `/admin/billing/run-renewals` | admin             | Trigger the renewal job             |

All non-public routes require **both** a valid bearer JWT **and** a request
signature — see [`TESTING.md`](./TESTING.md).
