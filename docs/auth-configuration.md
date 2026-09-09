# Authentication Configuration

Scheduler's authentication UI accepts a Company ID and six-digit PIN, then maps
that input to a synthetic Supabase email. For example, `E12345` maps to
`e12345@auth.scheduler.invalid`. The mapping is internal; it is not employee
identity verification.

## Required environment variables

Set these in the server environment only where noted:

- `NEXT_PUBLIC_SUPABASE_URL` — Supabase project URL.
- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` — Supabase publishable key.
- `SUPABASE_SERVICE_ROLE_KEY` — server-only service-role key. Never prefix it
  with `NEXT_PUBLIC_`.
- `AUTH_RATE_LIMIT_SECRET` — server-only random secret of at least 32
  characters. It is used to HMAC rate-limit scopes and is never sent to the
  browser.

Supabase Auth must have email/password sign-up enabled and email confirmation
disabled. The synthetic `.invalid` addresses cannot receive confirmation mail;
registration returns a configuration error rather than claiming success when a
session is not created.

## Trusted client source (hosting decision)

Per-source rate limiting is only as trustworthy as the client address behind
it. `resolveClientSource()` in `lib/auth/rate-limit.ts` never trusts arbitrary
forwarded headers:

- Set `TRUSTED_CLIENT_IP_HEADER` (server-only) to the single
  provider-controlled header your host guarantees, e.g.
  `x-vercel-forwarded-for` on Vercel or `cf-connecting-ip` behind Cloudflare.
  The value must be one valid IPv4/IPv6 address; missing, multi-valued, or
  non-IP values fall back to the shared `unknown-source` bucket.
- Optionally set `TRUSTED_DEPLOY_REGIONS` (server-only, comma-separated) to
  restrict the trusted header to known regions. The current region is read
  from `DEPLOY_REGION`, `VERCEL_REGION`, or `FLY_REGION`; when the allowlist
  is set and the current region is unknown or unlisted, the source falls back
  to `unknown-source`.
- When `TRUSTED_CLIENT_IP_HEADER` is unset, the legacy Vercel path still
  applies: with the platform-set `VERCEL=1` flag, `x-vercel-forwarded-for` is
  trusted and invalid values map to `unknown-production-source`. Everywhere
  else the source is `unknown-source`. Prefer the explicit variable on new
  deployments; do not set it to `x-forwarded-for` unless your provider
  overwrites that header itself.
- `unknown-source` callers share one HMAC-hashed throttling bucket. That is
  fail-closed (no bypass) but couples availability across unattributed
  sources, so configure a trusted header before production traffic.

Before deploying to a new host, verify which header the provider controls and
record the chosen values in the release notes (PRE-PROD.md §3, §10).

## Session semantics

- PIN change keeps the current session and leaves other signed-in devices
  alone. A password update does not revoke existing sessions, so the settings
  UI must not promise a global logout.
- Sign-out (`signOutAccount`) uses `scope: "local"` and clears only the
  current device's session cookies.
- Account deletion removes the auth user — owned callbacks cascade at the
  database layer — and then clears the local session cookie. Other devices
  lose access because the user no longer exists.
- After sign-out or deletion, browser back navigation or another open tab may
  still show cached UI, but every private data load re-verifies the session
  server-side (`getUser()`) and denies anonymous access.

## Private-route gating

Every private data load verifies the session server-side before querying
owner-scoped data: callback mutations via `requireAuth()` in
`lib/callbacks/require-auth.ts`, and page-level checks via
`getSessionStatus()` in `lib/auth/session.ts`. Presentation differs by route
by design:

- Home (`app/page.tsx`) is a public shell over private data and renders an
  inline sign-in prompt for unauthenticated visitors.
- History (`app/history/page.tsx`) is a private route and redirects
  unauthenticated visitors to the canonical `/login` (`/sign-in` is a
  compatibility alias that permanent-redirects there).

Both deny anonymous data access server-side; the difference is UI only.

## Missing-configuration behavior

When Supabase settings are absent, `proxy.ts` intentionally passes the request
through so public routes and the configuration-error UI still render — but it
also calls `reportRuntimeConfiguration()` and emits a one-time operator
warning (`[proxy] Supabase configuration missing`) instead of failing
silently. Home renders the "Connect Supabase" operator banner; treat any
missing-configuration warning as a broken release, not a normal state.

## Secret hygiene

`SUPABASE_SERVICE_ROLE_KEY` and `AUTH_RATE_LIMIT_SECRET` are server-only and
must never carry a `NEXT_PUBLIC_` prefix. Only `NEXT_PUBLIC_SUPABASE_URL` and
`NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` reach the browser. PINs are used as
in-memory passwords only: they are never logged, never stored in application
tables, and never written to browser persistence.

## Rate-limit defaults

The database-backed defaults are:

- Login per Company ID: 5 failed attempts in 15 minutes, then a 15-minute
  lockout.
- Login per client source: 20 failed attempts in 15 minutes, then a 15-minute
  lockout.
- Registration per client source: 5 failed attempts in 15 minutes.

Optional server-only overrides are available through:

- `AUTH_LOGIN_ACCOUNT_WINDOW_SECONDS`
- `AUTH_LOGIN_ACCOUNT_MAX_ATTEMPTS`
- `AUTH_LOGIN_ACCOUNT_LOCKOUT_SECONDS`
- `AUTH_LOGIN_SOURCE_WINDOW_SECONDS`
- `AUTH_LOGIN_SOURCE_MAX_ATTEMPTS`
- `AUTH_LOGIN_SOURCE_LOCKOUT_SECONDS`
- `AUTH_REGISTRATION_SOURCE_WINDOW_SECONDS`
- `AUTH_REGISTRATION_SOURCE_MAX_ATTEMPTS`
- `AUTH_REGISTRATION_SOURCE_LOCKOUT_SECONDS`

Values must be positive integers, except the registration lockout override,
which may be zero. Values above 24 hours are rejected.

## Database setup

Apply `supabase/migrations/20260902000000_auth_rate_limits.sql` before enabling
authentication traffic, followed by
`supabase/migrations/20260907120000_auth_rate_limit_admission.sql` and
`supabase/migrations/20260908000000_auth_rate_limit_admission_tokens.sql`.
The migrations:

- Creates the RLS-enabled `public.auth_rate_limits` table.
- Stores only scope, HMAC-derived key, window/expiry timestamps, counters,
  maintenance timestamps, and one opaque row per in-flight admission token.
- Revokes direct table access from `anon` and `authenticated`.
- Expose status plus atomic admission, failure, success-release, and outage-
  release functions only to `service_role`.

Every login and registration reserves capacity in each applicable bucket
before contacting Supabase Auth. The database lock makes concurrent requests
consume distinct admission slots, so a burst cannot all pass a read-only
check. A bad credential or already-claimed registration records a failure and
releases its in-flight slot. Auth service errors, missing sessions, and the
10-second verification timeout release the slot without counting a failure.
Limiter/admission errors fail closed and do not send credentials to Auth.

Successful verification releases its own one-shot admission token. A success,
failure, or timeout/outage completion may arrive out of order, and duplicate
completion callbacks are harmless: each token can consume at most one active
slot. Token generations remain monotonic when an empty bucket is reused or a
window rolls over, so a late completion from an older window cannot consume a
new request's slot. A successful verification clears its own in-flight slot
while preserving failures from other in-flight attempts. The registration
source bucket follows the same policy, with no lockout interval beyond its
configured window.

This application limiter covers the server action path only. Direct requests
to Supabase Auth still require provider-level throttling or gateway controls;
the application does not claim to protect those paths.

The `proxy.ts` session refresh remains part of the request path. Auth pages also
verify the current user server-side and redirect authenticated users to `/`.

## Direct Auth boundary acceptance

The six-digit PIN rule is enforced by the application's login and registration
actions. Supabase Auth accepts general password strings and does not know the
Company ID to synthetic-email mapping, so a caller that reaches `/auth/v1`
directly can bypass the application's PIN shape check. Keep the Auth API behind
the provider gateway or WAF used by the deployment and verify its throttling
policy independently; do not expose a direct Auth origin as an alternate path.

The isolated local acceptance stack (GoTrue v2.196.0, PostgreSQL 17.6, and
PostgREST 14.12) demonstrated this boundary: a direct signup with a non-six-
digit password returned a session, and forty rapid wrong-password requests to
`/auth/v1/token` returned authentication failures without a 429 response. This
is an acceptance limitation to carry into the provider configuration review,
not evidence that a hosted Supabase gateway has no rate limit. The deployment
must include a provider-level test that reaches the public Auth path and proves
the intended per-source burst control and response status.
