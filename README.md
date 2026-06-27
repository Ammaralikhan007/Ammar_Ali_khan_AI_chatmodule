# GGI Backend — AI Chat + Subscriptions

A secure, production-style backend for an AI chat module with usage quotas and
paid subscriptions. Built with **Express 5 + TypeScript (strict) + TypeORM
(PostgreSQL)** following **Clean Architecture / Domain-Driven Design**.

> **New here?** Read [`ARCHITECTURE.md`](./ARCHITECTURE.md) for the full
> module/layer map, and [`TESTING.md`](./TESTING.md) to run everything by hand.

---

## Features

- **AI Chat + Quota** — ask a question → (mock) AI answer, with atomic quota
  deduction. Free tier is 3 messages/month, then subscription quota. Quota is
  deducted inside a DB transaction with row locks, so it can never be
  double-spent under concurrency. Every deduction is recorded in an append-only
  **usage ledger**.
- **Subscriptions + Billing** — create/list/cancel subscriptions across
  `basic` / `pro` / `enterprise` tiers (monthly or yearly), with simulated
  auto-renewal and payment processing (random declines exercise the failure
  path).

---

## Tech stack

| Concern          | Choice                                         |
| ---------------- | ---------------------------------------------- |
| Language         | TypeScript (strict)                            |
| HTTP             | Express 5                                      |
| Database         | PostgreSQL 16 (via Docker)                     |
| ORM / migrations | TypeORM                                        |
| Validation       | Zod                                            |
| Auth             | Mock OIDC JWT (HS256) + HMAC request signing   |
| Tooling          | ESLint 9 (flat config) + Prettier, ts-node-dev |

---

## Architecture Decisions

- **Clean Architecture / DDD layering.** Code is split into `domain` (pure
  business types + repository _ports_), `application` (use-cases that orchestrate
  and own transactions), `infrastructure` (TypeORM/mock adapters), and
  `interface` (HTTP). Dependencies point inward, so business logic never depends
  on Express or TypeORM and is easy to test and swap.
- **Express over a heavier framework.** The design blueprint considered NestJS;
  the implementation uses Express 5 and wires the layers manually to keep the
  project small and explicit while preserving the same boundaries.
- **PostgreSQL + TypeORM with atomic quota deduction.** Quota is deducted inside
  a single DB transaction using `SELECT … FOR UPDATE` (`pessimistic_write`) row
  locks, so two concurrent requests can never double-spend the last credit.
- **Free-then-subscription quota with an append-only usage ledger.** Each
  message tries free monthly quota (3/mo) then subscription quota; every
  deduction is recorded in `usage_ledger` for auditing — cancelling a
  subscription preserves history.
- **Mock OIDC + mock providers behind ports.** Identity (OIDC/JWT), the AI
  client, and the payment gateway are mocked locally but sit behind interfaces,
  so they can be replaced with Keycloak / a real AI API / a real PSP without
  touching domain or application code. JWT verification uses HS256 here; the
  flow (verify signature → `iss`/`aud`/`exp`) mirrors a production RS256 + JWKS
  setup.
- **Migrations over `synchronize`.** The schema is owned by explicit, reviewable
  TypeORM migrations. `synchronize` is available only as an opt-in dev shortcut
  (`DB_SYNCHRONIZE=true`), never the default.
- **In-memory rate limiting.** Counters are in-process for simplicity; the
  limiter is isolated behind a factory so it can be swapped for a shared store
  (Redis) when scaling horizontally.
- **Validation at the edge with Zod `.strict()`.** Request bodies are validated
  and unknown fields are rejected, preventing mass-assignment; prices/allotments
  are always derived server-side, never trusted from the client.

---

## Security Model

Defense in depth — every authenticated request passes through multiple
independent layers:

| Layer                  | Mechanism                                                                                             |
| ---------------------- | ----------------------------------------------------------------------------------------------------- |
| **Authentication**     | OIDC bearer **JWT** verified server-side (signature + `iss` / `aud` / `exp`). Possession ≠ access.    |
| **Proof-of-possession**| **HMAC request signature** over `method:url:timestamp` + fresh timestamp → a stolen token can't be replayed. |
| **Authorization**      | **RBAC** (`user` / `admin`) at the route level, plus ownership checks in use-cases (e.g. only cancel your own subscription). |
| **Rate limiting**      | Global **per-IP** limit (pre-auth) + distinct **per-user** budgets for chat / subscriptions / admin.  |
| **Transport hardening**| `helmet` headers, allow-list **CORS** (no wildcard with credentials), strict **content-type**, **64 KB** body cap, global **request timeout**. |
| **Input handling**     | Zod schema validation with unknown-field rejection (anti mass-assignment), **input sanitization** (strips control chars + HTML → stored-XSS defense), ORM-parameterized queries (SQL-injection defense). |
| **Error handling**     | Typed JSON error envelope `{ code, message, requestId }`; stack traces / internals never leaked in production. |
| **Secrets**            | All secrets via environment (`.env` is git-ignored); only `.env.example` with dev placeholders is committed. |

---

## Setup Instructions

### Prerequisites

- Node.js 18+
- Docker (for PostgreSQL) — or your own Postgres on the configured port

### Steps

```bash
# 1. Install dependencies
npm install

# 2. Configure env (defaults are dev-ready)
cp .env.example .env

# 3. Start PostgreSQL
docker compose up -d

# 4. Create the schema (migrations own the schema)
npm run migration:run

# 5. Run the server (hot reload)
npm run dev
# → http://localhost:3000  (GET /health to verify)
```

See [`TESTING.md`](./TESTING.md) for authenticated request examples using
`scripts/signed-request.ps1`.

---

## NPM scripts

| Script                                       | Purpose                          |
| -------------------------------------------- | -------------------------------- |
| `npm run dev`                                | Start the server with hot reload |
| `npm run build`                              | Compile TypeScript to `dist/`    |
| `npm start`                                  | Run the compiled server          |
| `npm run typecheck`                          | Type-check without emitting      |
| `npm run lint` / `lint:fix`                  | ESLint report / autofix          |
| `npm run format` / `format:check`            | Prettier write / check           |
| `npm run migration:run` / `migration:revert` | Apply / roll back migrations     |
| `npm run billing:run-renewals`               | Run the billing renewal job once |

---

## Project structure

```
src/
├── main.ts            Composition root: middleware pipeline + routes + bootstrap
├── modules/           Feature modules (domain · application · infrastructure · interface)
│   ├── users/
│   ├── chat/          MODULE 1 — AI chat + quota
│   └── subscriptions/ MODULE 2 — subscriptions + billing
├── shared/            auth · security (+ rate-limit) · errors · observability ·
│                      validation · date · persistence (+ migrations)
├── jobs/              Billing renewal job, scheduler, CLI runner
└── types/             Express Request augmentation
```

Dependencies point inward: **domain** is pure (no framework), **application**
orchestrates use-cases + transactions, **infrastructure** implements the
domain's repository ports, **interface** is the HTTP edge. Full details in
[`ARCHITECTURE.md`](./ARCHITECTURE.md).

---

## API overview

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
| GET    | `/admin/usage-ledger`         | admin             | Recent deduction audit              |
| GET    | `/admin/usage-summary`        | admin             | Usage counts (free vs subscription) |
| POST   | `/admin/billing/run-renewals` | admin             | Trigger the renewal job             |

Every non-public route requires **both** a valid bearer JWT **and** a request
signature.

---

## Configuration

All configuration is via environment variables — see
[`.env.example`](./.env.example) for the full list with defaults (database,
OIDC issuer/audience/secret, rate-limit budgets, request timeout, and billing
simulation knobs).

---

## Further reading

- [`ARCHITECTURE.md`](./ARCHITECTURE.md) — codebase map, layers, request lifecycle
- [`TESTING.md`](./TESTING.md) — manual testing walkthrough
- [`SYSTEM_DESIGN.md`](./SYSTEM_DESIGN.md) — original design blueprint
