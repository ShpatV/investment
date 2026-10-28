# Investment Management Platform — Backend API

Production-oriented REST API for managing client investments across three roles:
**USER** (client), **ADMIN** (advisor), and **SUPER_ADMIN**.

Built with **Fastify 5 + TypeScript + Prisma 6 + PostgreSQL 16**, with exact decimal
financial calculations, scoped authorization, audit logging, document storage, market
price ingestion, and dashboard aggregations.

> This repository contains the backend only. Interactive API documentation is served at
> [`/docs`](http://localhost:4000/docs) in non-production environments.

---

## 1. Quick start

### Prerequisites

- Node.js **20.12+** (uses native `process.loadEnvFile`)
- Docker Desktop (for PostgreSQL)

### Setup

```powershell
# 1. Install dependencies
npm install

# 2. Create your environment file
Copy-Item .env.example .env
#    Then set a strong JWT_SECRET:
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"

# 3. Start PostgreSQL (host port 5433 -> container 5432)
docker compose up -d db

# 4. Apply migrations and seed demo data
npx prisma migrate deploy
npx prisma generate
npm run db:seed

# 5. Run the API
npm run dev
```

- API: <http://localhost:4000>
- Health: <http://localhost:4000/health>
- Readiness (checks DB): <http://localhost:4000/ready>
- Swagger UI: <http://localhost:4000/docs>

### Scripts

| Script | Purpose |
| --- | --- |
| `npm run dev` | Watch-mode server via `tsx` |
| `npm run build` | Type-check and emit to `dist/` |
| `npm start` | Run the compiled server |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run db:migrate` | Create/apply a dev migration |
| `npm run db:deploy` | Apply existing migrations (deployments) |
| `npm run db:seed` | Seed demo accounts and data |
| `npm run db:reset` | Drop, re-migrate, and re-seed |
| `npm test` | Run the Vitest suite |

---

## 2. Seed accounts

After `npm run db:seed` (development only, values from `.env`):

| Role | Email | Password |
| --- | --- | --- |
| SUPER_ADMIN | `superadmin@example.com` | `SuperAdmin123!` |
| ADMIN (assigned) | `admin@example.com` | `Admin1234!` |
| ADMIN (second advisor) | `advisor2@example.com` | `Admin1234!` |
| USER (assigned client) | `client@example.com` | `Client123!` |
| USER (unassigned client) | `jordan.lee@example.com` | `Client123!` |

Passwords are read from `SEED_*_PASSWORD`. The seed is idempotent (upserts by email) and
creates institutions, investments, transactions, and assignments. Market prices are
intentionally left empty until a provider refresh runs; the seed never fabricates prices.

---

## 3. Environment configuration

See [`.env.example`](./.env.example) for the full annotated list. Key settings:

| Variable | Default | Notes |
| --- | --- | --- |
| `DATABASE_URL` | `postgresql://investment:investment@localhost:5433/investment?schema=public` | Host port is 5433 to avoid clashing with a local PostgreSQL |
| `JWT_SECRET` | — | **Required**, minimum 32 characters |
| `JWT_ACCESS_TTL` | `15m` | Access token lifetime |
| `REFRESH_TOKEN_DAYS` | `30` | Opaque rotating refresh token lifetime |
| `EXPOSE_DEV_TOKENS` | `true` in dev | Exposes invite/reset tokens in API responses for local testing |
| `STORAGE_DIR` | `./storage/documents` | Private document storage (not web-served) |
| `MAX_UPLOAD_MB` | `10` | Per-file upload limit |
| `SIGNED_URL_TTL_SECONDS` | `120` | Lifetime of signed document download links |
| `PRICE_PROVIDER` | `stooq` | `stooq` or `none` (manual overrides only) |
| `PRICE_REFRESH_CRON` | `*/15 * * * *` | Price refresh schedule |
| `PRICE_STALE_MINUTES` | `60` | Price is marked `STALE` after this age |
| `ALLOW_ADMIN_PRICE_OVERRIDE` | `false` | Super admins can always override |
| `NEWS_PROVIDER` | `newsapi` | Use `none` to disable |
| `NEWS_API_KEY` | — | Without a key, `/api/news` returns `status: "unconfigured"` |
| `SEED_*` | demo values | Seed account emails/passwords |

`NODE_ENV=production` disables Swagger and redacts internal error messages.

---

## 4. Roles and authorization

Authorization is enforced **server-side on every request**, including list filters.
Changing an ID in a query or URL never widens scope.

| Capability | USER | ADMIN | SUPER_ADMIN |
| --- | --- | --- | --- |
| Read/update own profile | ✅ | ✅ | ✅ |
| Read own portfolio, transactions, documents, notifications | ✅ | ✅ | ✅ |
| List/read assigned clients | ❌ | ✅ (assigned only) | ✅ (all) |
| Create/update/disable clients | ❌ | ✅ (assigned only) | ✅ |
| Create/update investments and transactions | ❌ | ✅ (assigned clients) | ✅ |
| View admin dashboard / audit logs | ❌ | ✅ (scoped) | ✅ |
| Manage administrator accounts | ❌ | ❌ | ✅ |
| Price overrides | ❌ | Only if `ALLOW_ADMIN_PRICE_OVERRIDE=true` | ✅ |
| System settings | ❌ | ❌ | ✅ |

Additional rules:

- Access to a client that is not assigned returns **404** (not 403) so record existence is
  not leaked. Administrative-only endpoints return **403**.
- Ordinary admins may only assign new clients to themselves; only super admins can assign
  to other administrators or reassign existing clients.
- Disabling a user revokes all their active sessions immediately.
- The **last active super admin** cannot be disabled, demoted, or removed.
- Disabled/deleted clients cannot be accessed even by former advisors (scoping uses
  `status: ACTIVE` assignments).
- Clients may upload only `IDENTIFICATION`, `TAX_DOCUMENT`, and `OTHER` documents.
- Completed transactions are immutable except for `description`. Withdrawals are rejected
  if they exceed the investment's current principal.

---

## 5. API overview

All routes are under `/api`. Authentication uses `Authorization: Bearer <accessToken>`.
JSON responses use `{ "data": ... }`; list endpoints add
`{ "pagination": { page, pageSize, total, totalPages } }`.
Errors use `{ "error": { "code", "message", "details?" }, "requestId" }`.

| Area | Endpoints |
| --- | --- |
| Auth | `POST /auth/login`, `POST /auth/refresh`, `POST /auth/logout`, `GET /auth/me`, `POST /auth/change-password`, `POST /auth/forgot-password`, `POST /auth/reset-password`, `GET/PATCH /auth/security-question` |
| Profile | `GET /profile`, `PATCH /profile` |
| Clients | `GET/POST /clients`, `GET/PATCH /clients/:id`, `POST /clients/:id/disable`, `POST /clients/:id/reactivate`, `POST /clients/:id/invite` |
| Admins | `GET/POST /admins`, `GET/PATCH /admins/:id`, `POST /admins/:id/disable`, `POST /admins/:id/reactivate`, `GET /admins/:id/clients` |
| Assignments | `GET/POST /assignments`, `GET /assignments/unassigned`, `GET/PATCH /assignments/:id`, `DELETE /assignments/:id` |
| Institutions | `GET/POST /institutions`, `GET/PATCH /institutions/:id`, `DELETE /institutions/:id` |
| Investments | `GET/POST /investments`, `GET/PATCH /investments/:id` |
| Transactions | `GET/POST /transactions`, `GET/PATCH /transactions/:id` |
| Documents | `GET/POST /documents`, `POST /documents/:id/archive`, `DELETE /documents/:id`, `GET /documents/:id/download`, `POST /documents/:id/signed-url`, `GET /documents/download/:id` |
| Prices | `GET /prices`, `POST /prices/refresh`, `POST/DELETE /prices/:commodity/override`, `GET /prices/:commodity`, `GET /prices/:commodity/history` |
| Dashboard | `GET /dashboard/client`, `GET /dashboard/admin` |
| Audit | `GET /audit-logs`, `GET /audit-logs/:id` |
| Notifications | `GET /notifications`, `PATCH /notifications/:id/read`, `POST /notifications/read-all` |
| Settings | `GET /settings`, `GET /settings/effective`, `PATCH /settings` |
| News | `GET /news` |

Common list query parameters: `page` (default 1), `pageSize` (default 20, max 100), plus
resource-specific filters such as `search`, `status`, `clientId`, `institutionId`,
`type`, `from`, `to`, `sortBy`, and `sortDir`.

---

## 6. Financial calculation methodology

All monetary values are stored as PostgreSQL `DECIMAL(20,2)` and rates as
`DECIMAL(9,4)`. Arithmetic uses **Decimal.js** with 28-digit precision and
**ROUND_HALF_UP**; API money values are rounded to 2 decimal places and rates to 4.
Rates are stored as percentages (`5.2500` means 5.25% per annum).

### Day count

**Actual/365 Fixed**: elapsed years = milliseconds between dates / 86,400,000 / 365.
No leap-year adjustment.

### Interest models

- `SIMPLE`: growth factor = `1 + (rate / 100) × years`
- `MONTHLY` / `QUARTERLY` / `SEMIANNUALLY` / `ANNUALLY`:
  growth factor = `(1 + (rate / 100) / n)^(n × years)`, where `n` is 12/4/2/1 and
  fractional periods are allowed.

### Projection model (cash-flow based)

For each investment:

1. The base principal accrues from `startDate` to `maturityDate`.
2. Every **COMPLETED** transaction with `affectsPrincipal = true` and type
   `DEPOSIT`/`WITHDRAWAL` is applied to maturity balance, accruing from its
   `transactionDate` (or `startDate` if earlier) to maturity.
3. Interest transactions, pending/failed transactions, and non-principal transactions are
   excluded.
4. `currentPrincipal` = base principal ± completed principal-affecting flows dated on or
   before "as of" (floored at zero).
5. `projectedReturn` = projected maturity balance − current principal.
6. `isMatured` is true when maturity has passed or status is `MATURED`.
7. The methodology string is returned with every projection so clients can disclose the
   assumptions.

### Portfolio and AUM

- **Portfolio summary** uses **ACTIVE** investments only. Total invested is the sum of
  current principal; projected return is the sum of projected returns; the average rate is
  weighted by current principal; allocation is grouped by institution.
- **AUM** (admin dashboard) = current principal of ACTIVE investments adjusted by
  completed principal-affecting deposits/withdrawals. Pending/failed transactions and
  projected interest are excluded.
- No market-price appreciation is assumed for investment principal.

---

## 7. Market prices and news

- **Prices** are fetched server-side from a keyless provider chain for gold (USD/troy
  ounce) and WTI oil (USD/barrel):
  1. **Stooq** primary (`xauusd`, `cl.f`).
  2. **Yahoo Finance** fallback (`GC=F`, `CL=F`) when Stooq fails.

  Each request uses an 8-second timeout and up to 3 attempts; failures leave the last
  valid price in place. The provider that actually produced each price is stored per row
  (`provider`) and shown by `GET /api/prices` under `activeProviders`.
- Each refresh writes a `PublishedPrice` row and a bounded `PriceSnapshot` history.
- A price is `LIVE` until `PRICE_STALE_MINUTES` elapse, then `STALE`. If no provider price
  exists it is `UNAVAILABLE`.
- Manual overrides can have a reason, effective window, and expiry; they are recorded in
  `PriceOverride` and in the audit log. Only one active override applies at a time.
- **The API never invents prices.** Disable the provider with `PRICE_PROVIDER=none`.
- **News** uses NewsAPI only when `NEWS_API_KEY` is configured; otherwise it reports
  `status: "unconfigured"`. No articles are fabricated.

---

## 8. Documents and security

- Files are stored **outside the web root** under `STORAGE_DIR` with generated storage
  keys; the original filename is retained only as metadata.
- Downloads require authentication and scope checks. Time-limited HMAC-signed URLs are
  available via `POST /documents/:id/signed-url` and validated by
  `GET /documents/download/:id?expires=…&signature=…`.
- Uploads enforce MIME/extension allow-lists, size limits, and role-based categories.
- Passwords and security answers use **Argon2id** hashing (`@node-rs/argon2`); the
  passwords are never returned by any endpoint.
- JWTs are short-lived access tokens; refresh tokens are opaque, rotating, hashed at rest,
  and revocable per session. Login errors do not reveal whether an email exists.
- Security middleware: Helmet, CORS allow-list, global and per-route rate limits,
  request-ID correlation, and redacted logs for secrets/authorization headers.
- **Audit logging** covers authentication events, client/admin lifecycle, assignments,
  investments, transactions, documents, price overrides, and settings changes, storing
  actor, role, entity, before/after state, outcome, IP, and timestamp.
- **Idempotency**: transaction creation accepts an `Idempotency-Key` header; repeated
  requests with the same key return the original transaction instead of double-posting.

---

## 9. Database

The schema lives in [`prisma/schema.prisma`](./prisma/schema.prisma). Core models:
`User`, `Session`, `AuthToken`, `Institution`, `Investment`, `Transaction`, `Document`,
`AdminAssignment`, `PublishedPrice`, `PriceSnapshot`, `PriceOverride`, `AuditLog`,
`Notification`, `SystemSetting`.

```powershell
docker compose up -d db          # PostgreSQL 16 on localhost:5433
npx prisma migrate deploy        # apply migrations
npx prisma studio                # optional DB browser
```

To reset local data: `npm run db:reset` (drops, re-migrates, re-seeds).

---

## 10. Testing

```powershell
npm test
```

- `tests/finance.test.ts` — simple/compound interest, cash-flow projections, portfolio
  summaries.
- `tests/security.test.ts` — signed URL integrity/expiry, password and security-answer
  hashing.
- `tests/api-permissions.test.ts` — end-to-end Fastify injection tests against a real
  database: client isolation, administrator scoping, privilege escalation, withdrawal
  limits, interest/principal rules, last-super-admin protection, and self-disable guards.

The API tests create uniquely named fixture data and clean up after themselves. They need
the database from `docker compose up -d db` and a valid `.env`.

---

## 11. Docker deployment

```powershell
docker compose --profile full up -d --build
```

The `api` service waits for a healthy database, runs `prisma migrate deploy`, then starts
`node dist/server.js`. Document storage is persisted in the `investment_storage` volume.
For production, also:

- Set `NODE_ENV=production`, a strong `JWT_SECRET`, and `EXPOSE_DEV_TOKENS=false`.
- Terminate TLS at a reverse proxy and restrict `CORS_ORIGIN`.
- Replace local document storage with S3-compatible object storage (the storage layer is
  isolated in `src/lib/storage.ts`).
- Set `NEWS_API_KEY` if news is required; otherwise set `NEWS_PROVIDER=none`.
- Back up PostgreSQL and the document volume together.

---

## 12. Project structure

```
prisma/            schema, migrations, seed script
src/
  config.ts        validated environment configuration
  app.ts           Fastify composition (plugins, routes, error handling)
  server.ts        process bootstrap, graceful shutdown, cron jobs
  modules/         feature routes (auth, clients, admins, investments, …)
  services/        financial engine, investment loaders, notifications, settings
  lib/             scoping/RBAC, schemas, serializers, audit, storage, signed URLs
  plugins/         auth, Swagger, error handler
  jobs/            price refresh and maturity/reminder jobs
tests/             unit, security, and API permission tests
```

---

## 13. Troubleshooting

| Symptom | Cause / fix |
| --- | --- |
| `ECONNREFUSED ::1:5433` | Start the DB: `docker compose up -d db` |
| Port 5432 already in use | Use the compose default 5433 or change `POSTGRES_PORT` |
| `Invalid environment configuration` | Copy `.env.example` to `.env` and set `JWT_SECRET` (≥32 chars) |
| `P1000` auth failure | Ensure `DATABASE_URL` credentials match `POSTGRES_*` |
| Prices show `UNAVAILABLE` | Run `POST /api/prices/refresh` as an admin, or the provider is unreachable |
| News is `unconfigured` | Set `NEWS_API_KEY` or use `NEWS_PROVIDER=none` |
| Uploads fail | Check `MAX_UPLOAD_MB`, MIME/extension allow-list, and `STORAGE_DIR` permissions |
| Seed login fails | Re-check the current `SEED_*_PASSWORD` values in `.env` |
