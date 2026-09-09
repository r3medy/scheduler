# Scheduler

Scheduler is a private, single-agent callback scheduling workspace (Next.js + TypeScript + Supabase + Tailwind CSS v4 + shadcn/ui). Each agent manages only their own callbacks: capture, schedule (exact time or window), track due/grace/overdue, and record outcomes or reschedule work.

## Prerequisites

- Node.js `26.2.0` and pnpm `11.5.2` (see `engines` / `packageManager` in `package.json`).
- A Supabase project for auth + data. On Windows use `pnpm.cmd` to avoid PowerShell execution-policy issues.

## Setup

```bash
pnpm install --frozen-lockfile
cp .env.example .env.local  # then fill in values, never commit secrets
pnpm run dev
```

## Environment variables

See `.env.example` and [`docs/auth-configuration.md`](docs/auth-configuration.md):

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`
- `SUPABASE_SERVICE_ROLE_KEY` (server-only, never `NEXT_PUBLIC_`)
- `AUTH_RATE_LIMIT_SECRET` (server-only, persistent random value, min 32 chars)

Supabase Auth needs email/password sign-up enabled with email confirmation disabled (synthetic `.invalid` addresses cannot receive mail).

## Migrations

Apply in order through the Supabase SQL Editor (or recorded migration process):

- `supabase/migrations/20260902000000_auth_rate_limits.sql`
- `supabase/migrations/20260905000000_callbacks.sql`
- `supabase/migrations/20260905010000_callback_field_lengths.sql`
- `supabase/migrations/20260906000000_feedback.sql`
- `supabase/migrations/20260907000000_callbacks_future_schedule.sql`
- `supabase/migrations/20260907100000_callbacks_future_schedule_fix.sql`
- `supabase/migrations/20260907110000_callback_create_idempotency.sql`
- `supabase/migrations/20260907120000_auth_rate_limit_admission.sql`
- `supabase/migrations/20260908000000_auth_rate_limit_admission_tokens.sql`

Verify tables, indexes, constraints, policies, and function grants afterward. Never rewrite an applied migration; add a new one.

## Scripts

- `pnpm run dev` — local dev server
- `pnpm run build` / `pnpm run start` — production build / serve
- `pnpm run lint` — ESLint
- `pnpm run typecheck` — `tsc --noEmit`
- `pnpm run test` — `vitest run`
- `pnpm run format` — write formatting (do not use as CI check)
- `pnpm run format:check` — non-mutating Prettier check (not gated in CI yet: it currently flags 15 pre-existing unformatted files outside this change's scope, most under paths frozen by the branding/metadata task)

Release gate: `install --frozen-lockfile`, `lint`, `typecheck`, `test`, `build` (see `.github/workflows/ci.yml`).

## Tests

```bash
pnpm run test
pnpm run lint
pnpm run typecheck
```

Browser/acceptance checks run against disposable accounts in an isolated environment with synthetic records only.

For a disposable Supabase/Postgres database with at least two test auth users,
run the callback trigger/idempotency, owner-isolation, and auth-admission
checks (each script rolls back all rows):

```bash
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/callback_integrity.sql
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/callback_rls_integrity.sql
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/auth_rate_limit_integrity.sql
```

The repository environment does not include `psql`, and its Docker daemon is
not always running, so these SQL harnesses must be run in CI or a local
disposable Supabase/Postgres environment before deployment. When Docker is
available, the portable runner also applies every migration and exercises
independent-session concurrency without publishing a port or mounting a
project directory:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File supabase/tests/run-disposable-postgres.ps1
```

The runner creates a uniquely named, labeled `postgres:17-alpine` container and
removes only that container when it exits.

## Deployment

No production provider/region/domain is recorded yet (PRE-PROD.md §10 open decision). Before release: set production env vars, apply all migrations to the production project, run a frozen-lockfile install + production build, and smoke-test through the real domain (register/login, create/read/update/delete, history, settings, asset loading). Keep preview environments isolated from production data.

## Troubleshooting

- `Calendar unavailable` + Supabase `PGRST205` on `public.callbacks`: callbacks migration not applied — apply it and reload.
- `Connect Supabase` empty state: `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` missing.
- Registration reports a configuration error without a session: Auth email confirmation is likely enabled — disable it per `docs/auth-configuration.md`.
- Node localStorage experimental warning in tests: investigate when pinning the supported runtime.

## Repository hygiene notes

- Root `.gitignore` intentionally ignores `/.agents/` (machine-specific state); shared project instructions live in `AGENTS.md`, `PRODUCT.md`, and `DESIGN.md`, which stay versioned.
- `/browserbase/` and its nested ignore rules are preserved untouched.
- `proxy.ts` remains focused on Supabase session refresh. Application security
  headers are configured in `next.config.ts`; verify the hosting provider does
  not override them before release (see PRE-PROD.md §10).

## Authentication setup

The `/login` and `/register` routes use Supabase Auth with a synthetic email
mapping for the approved Company ID and six-digit PIN experience. Configure the
required server variables and apply the rate-limit migration before testing
authentication. See [`docs/auth-configuration.md`](docs/auth-configuration.md)
for the complete setup and safety requirements.

## Calendar database setup

Apply [`supabase/migrations/20260905000000_callbacks.sql`](supabase/migrations/20260905000000_callbacks.sql)
in the configured Supabase project's SQL Editor before loading the calendar.
It creates the callback table, schedule constraints, indexes, and owner-only
row-level security policies. It does not insert sample data.

If the main page shows `Calendar unavailable` and Supabase returns `PGRST205`
for `public.callbacks`, this migration has not been applied. Run the migration
and reload the page; a new account should see an empty calendar. The public
API key and service-role key cannot apply SQL migrations through the Data API.
