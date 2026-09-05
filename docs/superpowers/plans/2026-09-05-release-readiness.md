# Scheduler Release Readiness Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Bring the Scheduler application into alignment with `PRODUCT.md`, close the confirmed P0/P1 implementation gaps in `PRE-PROD.md`, and leave a reproducible release verification record.

**Architecture:** Keep Supabase Auth, RLS, and the callback tables as the protected source of truth. Add append-only attempt history and a transactional outcome RPC, derive temporal state from UTC schedules at render time, and keep notification coordination in the authenticated client with a per-occurrence cross-tab claim. Share only pure presentation and validation utilities between server and client code.

**Tech Stack:** Next.js 16.2 App Router, React 19, TypeScript, Supabase SSR/Postgres, Zod, Tailwind CSS, Vitest, Testing Library, pnpm.

---

### Task 1: Release foundations, validation, and shared presentation rules

**Files:**
- Create: `lib/callbacks/presentation.ts`
- Create: `lib/config/runtime.ts`
- Modify: `lib/callbacks/validation.ts`
- Modify: `lib/supabase/server.ts`
- Modify: `lib/auth/actions.ts`
- Modify: `app/layout.tsx`
- Modify: `.gitignore`, `package.json`, `pnpm-workspace.yaml`
- Test: `tests/callback-actions.test.ts`, `tests/auth-core.test.ts`, `tests/runtime-config.test.ts`

- [ ] Add shared account masking that removes whitespace and never returns the complete account identifier, including one-to-four-character values.
- [ ] Add shared history page size and outcome labels in a dependency-free module and update all consumers.
- [ ] Add explicit maximum lengths for account-holder name, phone/account identifiers, comments, and attempt notes. Preserve permissive phone/account content while rejecting oversized payloads in Zod and SQL.
- [ ] Add server-only runtime configuration validation for public Supabase URL/key, service-role key, and a 32-character rate-limit secret. Make missing production configuration visible to operators while preserving safe unauthenticated behavior in request guards.
- [ ] Set intentional pnpm build-script policy, pin `engines.node` and `packageManager`, and extend root ignore rules for generated local artifacts.
- [ ] Add focused regression tests for masking, limits, and configuration failures, then run `pnpm.cmd run test -- tests/callback-actions.test.ts tests/auth-core.test.ts tests/runtime-config.test.ts`.
- [ ] Commit as `chore: harden release foundations`.

### Task 2: Attempt history and atomic outcome/reschedule workflow

**Files:**
- Create: `supabase/migrations/20260905010000_callback_attempts.sql`
- Modify: `lib/supabase/database.types.ts`, `lib/callbacks/update-status.ts`, `lib/callbacks/get-callback.ts`, `components/callbacks/callback-details-dialog.tsx`, `components/callbacks/callback-history.tsx`
- Test: `tests/callback-actions.test.ts`, `tests/callback-details.test.tsx`

- [ ] Create `callback_attempts` with append-only application semantics, parent cascade deletion, schedule snapshot fields, length checks, indexes, enabled RLS, ownership policies through `callbacks`, and grants limited to authenticated users for reads and the transactional function path.
- [ ] Add a security-definer RPC that verifies the current owner, records an unsuccessful attempt with the prior schedule snapshot, and either closes the callback or updates its future schedule in one transaction. Keep successful completion as a direct owner-scoped close with outcome `reached`.
- [ ] Regenerate the handwritten database type surface to match the migration and RPC signature.
- [ ] Implement the dialog choices required for Voicemail and No answer: Close or Reschedule, optional attempt note, and structured future schedule entry. Keep the same callback id and retain previous attempts.
- [ ] Render compact attempt history in callback details without exposing it in calendar or notification surfaces.
- [ ] Add tests for close/reschedule, exact/window snapshots, ownership failures, cascade behavior at the SQL contract level, and retained input on failure.
- [ ] Commit as `feat: add transactional callback attempt history`.

### Task 3: Authoritative temporal state and owner-scoped workload data

**Files:**
- Create: `lib/callbacks/get-workload.ts`
- Modify: `lib/calendar/date-utils.ts`, `lib/calendar/types.ts`, `lib/callbacks/get-calendar-callbacks.ts`, `components/scheduling-calendar/scheduling-calendar.tsx`, `components/scheduling-calendar/up-next.tsx`, `components/callbacks/callback-workspace.tsx`, `app/page.tsx`
- Test: `tests/week-position.test.tsx`, `tests/week-columns.test.tsx`, `tests/workload.test.ts`, `tests/date-utils.test.ts`

- [ ] Make temporal state a pure calculation from lifecycle, exact/window schedule, and supplied `now`; do not trust a stale server-computed marker state.
- [ ] Recalculate visible markers and the Up next list whenever the clock crosses due, grace, or overdue boundaries, including after tab visibility resumes.
- [ ] Add an owner-scoped workload query independent of calendar visible range and expose scheduled today, due/grace, overdue, upcoming, and completed today counts/lists. Do not include closed callbacks in open workload groups.
- [ ] Keep window callbacks as a single start marker while deriving overdue from window end. Cover midnight, visible-range boundaries, device timezone grouping, and month/year/leap/DST-safe calculations.
- [ ] Allow overdue detail edits that do not change schedule without requiring a future schedule; require future schedule only when schedule fields are changed.
- [ ] Add deterministic unit/component tests for exact `T`, `T+5m`, window start/end/grace/overdue, timezone-day grouping, and boundary behavior.
- [ ] Commit as `feat: keep callback workload state current`.

### Task 4: Native notification and authenticated in-app fallback

**Files:**
- Create: `components/notifications/notification-provider.tsx`, `lib/notifications/notification-core.ts`
- Modify: `app/layout.tsx`, `components/app-shell.tsx`, `components/settings-dialog.tsx`, `components/scheduling-calendar/up-next.tsx`, `components/callbacks/callback-workspace.tsx`
- Test: `tests/notification-core.test.ts`, `tests/settings-dialog.test.tsx`

- [ ] Add an authenticated client notification coordinator that schedules one generic native notification per exact timestamp/window start, recalculates on visibility/resume, and never replays missed occurrences.
- [ ] Coordinate tabs with a short-lived per-occurrence claim using `BroadcastChannel` plus a local-storage fallback, with expiry and safe failure behavior. Use callback id, schedule fingerprint, and trigger timestamp as the occurrence key.
- [ ] Cancel old occurrence timers after close, deletion, or reschedule and schedule the replacement occurrence.
- [ ] Request permission from an explicit Settings control, show permission status, and provide an in-app due/grace/overdue alert when native notifications are unavailable. Do not include customer PII in native or telemetry text.
- [ ] Add fake-clock tests for exact/window triggers, no replay, replacement, cancellation, duplicate-tab claims, denied permission, and generic content.
- [ ] Commit as `feat: add coordinated callback notifications`.

### Task 5: Callback discovery, history, and home workload UX

**Files:**
- Create: `lib/callbacks/search-callbacks.ts`
- Modify: `lib/callbacks/get-history.ts`, `components/callbacks/callback-history.tsx`, `components/callbacks/callback-workspace.tsx`, `components/callbacks/callbacks-section.tsx`, `app/history/page.tsx`, `app/page.tsx`
- Test: `tests/history.test.ts`, `tests/callback-search.test.ts`, `tests/callback-details.test.tsx`

- [ ] Add owner-scoped search/filter inputs for account-holder name, phone, masked account result, lifecycle, schedule mode, temporal state, date range, and closed outcome. Keep full account number available only to authenticated detail loading.
- [ ] Preserve stable pagination and counts after filtering, and ensure counts describe surviving records only.
- [ ] Share outcome labels/page size with the server module without importing server-only code into client components.
- [ ] Present Home in the required priority order: overdue, due/grace, today, upcoming; include the five workload summaries and a clear agent-reported workload label.
- [ ] Cover empty, loading, error, pending, retry, and retained-input states. Keep global New Callback available from each authenticated primary page and do not add a fifth page.
- [ ] Commit as `feat: add private callback discovery and workload summaries`.

### Task 6: Auth/session boundaries, metadata, accessibility, and error recovery

**Files:**
- Create: `app/not-found.tsx`, `app/error.tsx`, `app/global-error.tsx`, `app/robots.ts`
- Modify: `lib/auth/actions.ts`, `lib/auth/account-actions.ts`, `lib/auth/session.ts`, `proxy.ts`, `app/layout.tsx`, `app/(auth)/login/page.tsx`, `app/(auth)/register/page.tsx`, `app/history/page.tsx`, `components/app-shell.tsx`, `components/auth/*`, `components/settings-dialog.tsx`
- Create or modify: `public/favicon.ico`, `public/apple-touch-icon.png`
- Test: `tests/auth-actions.test.ts`, `tests/account-actions.test.ts`, `tests/auth-components.test.tsx`

- [ ] Keep only intended server-action entry points exported; validate every remotely callable boundary and resolve identity server-side. Keep injectable auth helpers in a server-only module.
- [ ] Verify logout, session refresh, direct private-route access, deleted-account behavior, cache-control, and safe back-navigation behavior. Add `no-store`/private response behavior where the route uses protected data.
- [ ] Add meaningful route metadata, private indexing controls, safe error recovery, and accessible error semantics with retry.
- [ ] Finish an ICO and Apple icon set from the existing logo, verify dimensions/transparency/tiny-size legibility, and retain accessible labels for icon-only controls.
- [ ] Add unsupported-phone deterrence that does not block narrow desktop windows, and document it as a support boundary.
- [ ] Commit as `feat: harden authenticated app boundaries`.

### Task 7: Documentation, CI, and release evidence

**Files:**
- Create: `.github/workflows/ci.yml`, `docs/release-readiness.md`
- Modify: `README.md`, `PRODUCT.md`, `DESIGN.md`, `docs/auth-configuration.md`, `browserbase/PLAN.md`
- Test: CI workflow syntax and all root/browserbase checks

- [ ] Replace template README text with project purpose, supported runtime/package manager, environment variable names, migrations, local setup, scripts, tests, build/start, deployment, rollback, troubleshooting, and known product limitations.
- [ ] Add CI for frozen install, format check, lint, typecheck, unit tests, production build, migration contract checks, and Browserbase package typecheck when its inputs are present.
- [ ] Record the chosen local verification matrix, synthetic-data rule, unsupported external checks, and release artifact evidence in `docs/release-readiness.md` without storing secrets or customer data.
- [ ] Update product/design/auth/browserbase docs to match shipped behavior, notification limitations, same-callback rescheduling, deletion semantics, and explicit deferrals. Reconcile the stale Zustand mandate with the actual implementation.
- [ ] Run secret and customer-data scans against the staged release diff and history, inspect tracked/ignored files, and record any required rotation or external verification as a blocker.
- [ ] Commit as `docs: document release readiness and CI`.

### Task 8: Final verification and release assessment

**Files:**
- Modify: `PRE-PROD.md`, `docs/release-readiness.md`

- [ ] Run `pnpm.cmd install --frozen-lockfile` in a clean isolated checkout, then `pnpm.cmd run format:check`, `pnpm.cmd run lint`, `pnpm.cmd run typecheck`, `pnpm.cmd run test`, and `pnpm.cmd run build`.
- [ ] Start the production server and smoke-test every local route, assets, auth redirect behavior, private-route caching headers, loading/error states, and callback mutation flows with synthetic data.
- [ ] Run Browserbase checks only with disposable accounts and record unverified RLS, native Windows delivery, abuse, backup/restore, and production-provider checks separately.
- [ ] Inspect the final staged diff and repository status, verify all intended source/migrations/tests/docs are included, and keep `.env*`, `.pnpm-store`, graph output, artifacts, reports, and build output ignored.
- [ ] Mark checklist items complete only when evidence exists; retain explicit P0/P1 external blockers with an owner and exact command or dashboard action required.
- [ ] Commit the final evidence update as `chore: record release verification`.

