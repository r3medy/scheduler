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
authentication traffic. The migration:

- Creates the RLS-enabled `public.auth_rate_limits` table.
- Stores only scope, HMAC-derived key, window/expiry timestamps, counters, and
  maintenance timestamps.
- Revokes direct table access from `anon` and `authenticated`.
- Exposes atomic status, failure, and reset functions only to `service_role`.

The `proxy.ts` session refresh remains part of the request path. Auth pages also
verify the current user server-side and redirect authenticated users to `/`.
