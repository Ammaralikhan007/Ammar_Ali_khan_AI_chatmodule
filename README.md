# GGI Backend — AI Chat + Subscriptions

A secure, production-style backend for an AI chat module with usage quotas and
paid subscriptions. Built with **Express 5 + TypeScript (strict) + TypeORM
(PostgreSQL)** following **Clean Architecture / Domain-Driven Design**.
---

## Features

**Two domain modules**

- **AI Chat + Quota** — ask a question → (mock) AI answer, with atomic quota
  deduction. Free tier is 3 messages/month, then subscription quota. Quota is
  deducted inside a DB transaction with row locks, so it can never be
  double-spent under concurrency. Every deduction is recorded in an append-only
  **usage ledger**.
- **Subscriptions + Billing** — create/list/cancel subscriptions across
  `basic` / `pro` / `enterprise` tiers (monthly or yearly), with simulated
  auto-renewal and payment processing (random declines exercise the failure
  path).

**Security & operability**

- OIDC-style **JWT verification** (signature + `iss`/`aud`/`exp`) — possession
  of a token isn't enough.
- **Proof-of-possession** request signing (HMAC + timestamp, replay-protected).
- **RBAC** (`user` / `admin`), restricted **CORS**, **helmet** headers, strict
  **content-type**, 64 KB **body limit**.
- **Rate limiting** — global per-IP plus distinct per-user budgets for chat /
  subscriptions / admin.
- **Global request timeout**, **input sanitization**, schema validation with
  unknown-field rejection (anti mass-assignment).
- Typed error envelope, request-id correlation, structured access logs.
- **TypeORM migrations** (no `synchronize` in normal operation).

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

## Prerequisites

- Node.js 18+
- Docker (for PostgreSQL) — or your own Postgres on the configured port

---

## Quick start

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
