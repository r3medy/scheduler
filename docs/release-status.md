# MVP release verification

Status: **In progress; production readiness is not yet proven.**

This record tracks the September 8–9, 2026 verification of the current working
tree. It does not certify an immutable release commit or a deployed service.
The older `PRE-PROD.md` and September 6 audit contain historical findings;
their unchecked items must be reconciled with current code and evidence.

## Current evidence

| Gate | Evidence and scope |
| --- | --- |
| Unit/component tests | September 8, 13:19 local: `pnpm.cmd run test` passed, 30 files / 222 tests, including two new lower-provider-cap pagination regressions. |
| Lint and types | September 8 continuation: `pnpm.cmd run lint` and `pnpm.cmd run typecheck` passed. |
| Production build | September 8 continuation: frozen-lockfile install and configured Next.js 16.2.12 production build passed in an isolated OS-temp snapshot. The actual `assertRuntimeConfiguration` passed with disposable loopback Supabase settings before building; no runtime-configuration warning was emitted. |
| Dependency security | September 8 audit: 3 high, 4 moderate, 1 low; no Next.js package advisories. Reachability and deferred-upgrade decisions recorded in [dependency-advisories.md](dependency-advisories.md). |
| SQL migrations and authorization | Prior September 8 parent verification: all 9 migrations and callback integrity, callback RLS, and auth-admission SQL checks passed on real PostgreSQL 17.11. Independent sessions proved one creator for two idempotent calls and two admitted/two blocked for a four-request admission race. The uniquely named test container was removed. Actual Supabase Auth/JWT/Data API evidence remains pending. |
| Secret scanning | September 8: checksum-verified Gitleaks 8.30.1 reported no leaks across all 7 Git commits. September 9: a fresh redacted scan of 185 tracked/untracked non-ignored release files found no leaks. Ignored local credentials/dependency directories were excluded. This is scanner evidence, not a guarantee that no secret exists. |
| Browser acceptance | Authenticated workflows, native notifications, concurrent tabs, and suspension/resume require real-browser evidence. |
| Production operations | Hosting target, domain, isolated staging project, backup/restore, monitoring, and rollback evidence remain outstanding. |

## In-flight verification

- Capture actual browser startup traffic in an isolated profile. The reported
  10–15 `GET /` burst is **unconfirmed and not marked fixed**; reduced backend
  auth reads and component tests are not a browser reproduction.
- Complete real Auth/Data API acceptance and direct backing-Auth PIN checks
  with synthetic accounts and explicit loopback-only infrastructure.
- Verify notification lifecycle, cross-tab cleanup, and no-replay behavior in
  the browser; mocked notification tests do not certify native OS delivery.
- Workload retrieval now uses deterministic pages through an empty response
  and advances by actual returned length, covering lower provider caps.
  Tests cover 2,001 rows and a 250-row provider cap; real API boundary behavior
  is being checked. Concurrent writes can still change data between requests;
  this is not a database snapshot transaction.
- This continuation reproduced and fixed the same short-page truncation in
  calendar/overdue and notification retrieval. Both had stopped at 250 rows
  when a 1,000-row request met a 250-row provider cap. Their tests now prove
  all 1,001 rows are returned; the notification and calendar projections remain
  owner-scoped. Full tests, lint, and types passed after these changes.
- Finish authenticated browser acceptance against the configured production
  candidate at `http://127.0.0.1:55430`.

## Configured production smoke evidence

The isolated snapshot is
`C:/Users/remedy/AppData/Local/Temp/scheduler-release-29f826d602bd4ae79c608693548cd161`.
It uses Node 26.2.0, pnpm 11.5.2, and Next.js 16.2.12. Source was copied using
Git's tracked/untracked non-ignored inventory, excluding deleted files and local
environment files; no browser profile was packaged. Build configuration points
only to the disposable loopback backend, not a production Supabase project.

Parent HTTP checks: `/` and `/login` returned 200 without a configuration
banner; `/history` returned a streamed redirect instruction to `/login` (HTTP
200 during streaming, so browser navigation still needs verification). The
fixed `/logo.png` and its 32px optimized image returned image responses with
200; an external optimizer URL returned 400. `X-Frame-Options: DENY` and
`frame-ancestors 'none'` were present on normal pages. The production server
error log was empty after these checks. These HTTP checks do not replace
authenticated browser acceptance.

## Recovered browser evidence

On September 9 the saved September 8 CDP captures were inspected. Four
unauthenticated development runs each recorded one `GET /` document load.
`schedulerv2-browser-auth-dev-2.json` recorded one root document request after
login and an authenticated page containing "Today's workload" and "New
Callback". The earlier auth capture did not leave `/login`, so it is not a
successful authenticated test. The unauthenticated production capture recorded
two root GETs (one document, one RSC fetch) and eight total RSC prefetches,
including repeated `/sign-in` requests. These limited captures do not reproduce
or resolve the reported 10–15 root requests. New authenticated production and
navigation checks are pending. Browser-side counts do not include the server's
outbound Supabase requests.

## Release boundary

Never infer deployed RLS, provider Auth throttling, backup restoration, or
browser notification delivery from mocked tests or a successful build.
The six-digit PIN design also requires verification of direct Supabase Auth
protections; application throttling alone cannot establish that boundary.

Before release, record the tested commit/artifact, applied migration versions,
production owner and target, smoke-test results, and rollback instructions.
Use synthetic records and disposable accounts for acceptance checks.

The exact fresh-project migration order and configuration/rollback handoff are
in [fresh-supabase-release.md](fresh-supabase-release.md). No deployment or commit
has been performed. The working tree contains pre-existing user changes.
