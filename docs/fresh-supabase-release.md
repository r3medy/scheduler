# Fresh Supabase project release procedure

Use a new, isolated Supabase project. This procedure is an operator handoff;
it does not assert that a production project has been provisioned or deployed.
See [release-status.md](release-status.md) for verified evidence and open gates.

## Exact migration order

Apply the entire contents of these **nine** files, in this order, recording
each successful application in the project's migration history:

1. `supabase/migrations/20260902000000_auth_rate_limits.sql`
2. `supabase/migrations/20260905000000_callbacks.sql`
3. `supabase/migrations/20260905010000_callback_field_lengths.sql`
4. `supabase/migrations/20260906000000_feedback.sql`
5. `supabase/migrations/20260907000000_callbacks_future_schedule.sql`
6. `supabase/migrations/20260907100000_callbacks_future_schedule_fix.sql`
7. `supabase/migrations/20260907110000_callback_create_idempotency.sql`
8. `supabase/migrations/20260907120000_auth_rate_limit_admission.sql`
9. `supabase/migrations/20260908000000_auth_rate_limit_admission_tokens.sql`

The deleted `20260905015000_callback_attempts.sql` is intentionally absent from
a fresh installation. Existing deployments must preserve their applied
migration history; do not delete an already-applied migration or replay the
fresh-install procedure over an existing database.

Verify owner-only callback and feedback access, denied anonymous access,
service-role-only limiter grants, and authenticated owner-scoped callback
idempotency RPC access using the SQL/API acceptance
checks. A successful migration application alone does not prove Auth or RLS
works through the external Data API.

## Configuration and build

Configure email/password Auth with email confirmation disabled for the
application's synthetic Company-ID email mapping. Set the actual application
site/redirect URLs. Verify direct Auth password attempts are protected as
described in [auth-configuration.md](auth-configuration.md); the application's
Server Action limiter cannot protect a publicly accessible backing Auth API.

Provide these variables through the hosting provider's environment settings:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`
- `SUPABASE_SERVICE_ROLE_KEY` — server only
- `AUTH_RATE_LIMIT_SECRET` — persistent random server-only secret, at least 32 characters

Do not commit environment files. Configure `TRUSTED_CLIENT_IP_HEADER` only
when the hosting provider overwrites that header and prevents direct-origin
spoofing; see the auth configuration document for region constraints.

Using Node 26.2.0 and pnpm 11.5.2, perform a frozen-lockfile install, lint,
typecheck, tests, and a production build. Public Next.js variables must be set
**before building**. Build in an isolated checkout/artifact directory, not
over a running development server's `.next` directory. Missing runtime
configuration warnings fail the release gate even if compilation succeeds.

Review [dependency-advisories.md](dependency-advisories.md) against the final
lockfile. Record the release commit or source manifest hash, build output,
configured project, applied migrations, and acceptance result without secrets.

## Production verification and rollback

On the real HTTPS domain, use disposable accounts and synthetic records to
verify registration/login/logout, callback create/edit/reschedule/close/delete,
history, settings, owner isolation, assets, and security headers. Check startup
request counts with a clean browser profile; verify notifications and logout
across tabs, and no stale notification replay after suspension/reopening.

Record the hosting owner/target, monitoring and alert destination, database
backup/restore evidence, and previous deployable application artifact before
promoting traffic. For an application regression, restore the previous tested
artifact with its matching environment. Do not reverse database migrations
blindly: use a reviewed forward repair, or a tested backup restoration plan
with an explicit data-loss window. No production rollback target or restore
exercise has yet been recorded for this project.
