# Pre-production checklist

Reviewed: 2026-09-05. Baseline: commit `f2aedf0` **plus the current uncommitted working tree**.

This checklist covers publishing the Scheduler application and preparing its repository for release. It records work to do; unchecked items are not claims that every listed problem exists. **Confirmed** means supported by source inspection. **Verify** means a release check still needs evidence. **Decision** means resolve the policy or scope before implementing it.

Priorities: **P0** = release blocker; **P1** = complete before general availability; **P2** = optional polish or follow-up. Mark an item complete only with evidence, or record an explicit scope decision and owner for deferrals. The September 5 update in `PRODUCT.md` takes precedence over older navigation requirements: Home, Callback history, and modal Settings.

## 1. Verification baseline

- [x] Existing automated tests pass: 11 test files, 65 tests (`pnpm run test`).
- [x] Type checking passes (`pnpm.cmd run typecheck`).
- [x] ESLint passes (`pnpm.cmd run lint`).
- [ ] **P0 · Verify:** Repeat all three checks against the final release commit in CI; today's passing checks do not certify subsequent changes.
- [ ] **P0 · Verify:** Perform a clean, frozen-lockfile install and production build in the intended deployment environment, then smoke-test the production server. A production build was not run during this review.
- [ ] **P0 · Verify:** Run deployed database authorization tests and real browser workflows. Mocked unit tests alone cannot certify RLS, session behavior, native notifications, or recovery.

Review limits: no live database changes, production deployment, dependency advisory scan, git-history secret scan, full dead-code analyzer, browser acceptance run, load test, or backup restore was performed. Source code was not changed. A test run emitted a Node localStorage experimental warning; investigate compatibility when pinning the supported runtime.

## 2. Product completeness and confirmed correctness gaps

- [ ] **P0 · Confirmed:** Implement the required notification workflow. No Notification API implementation was found in `app/`, `components/`, or `lib/`. Cover permission/status UI, exact-time and window-start triggers, authenticated in-app fallback, cancellation after closure/deletion, replacement after rescheduling, and one notification per schedule occurrence across tabs. Verify generic content contains no customer PII. Do not promise delivery with a closed/sleeping browser or replay missed notifications (`PRODUCT.md` §12, §24.6).
- [ ] **P0 · Confirmed:** Implement attempt history and the close-or-reschedule outcome workflow. The migrations and database types contain callbacks but no `callback_attempts`; `lib/callbacks/update-status.ts` only overwrites current resolution fields. Preserve attempts on the same callback, offer the required choices after voicemail/no answer, and save the attempt plus schedule/lifecycle change atomically. Add ownership policies and cascade deletion for attempts (`PRODUCT.md` §13–15).
- [ ] **P0 · Confirmed:** Recalculate temporal state as time passes. `get-calendar-callbacks.ts` derives state once at load; `getDisplayState()` in `lib/calendar/date-utils.ts` trusts `marker.temporalState`. The timer in `up-next.tsx` updates `now` without updating that state. Test due, grace, and overdue transitions without navigating or reloading, including tab suspension/resume.
- [ ] **P0 · Confirmed:** Prevent short account numbers from being fully exposed outside details. Both `get-calendar-callbacks.ts` and `get-history.ts` append the last four characters, while validation accepts shorter values. Choose a masking rule that never exposes the entire value, share it, and test 1–4 characters, whitespace, and longer identifiers.
- [ ] **P1 · Confirmed:** Reconcile the action-needed list with required overdue discovery. `scheduling-calendar.tsx` passes only `visibleMarkers` to Up next, so older overdue items disappear outside the selected week/month. Provide an owner-scoped workload query independent of calendar navigation, or explicitly revise the requirement and UI claims.
- [ ] **P1 · Confirmed:** Add the required callback search and domain filters, or document an approved scope reduction. Current history supports outcome filtering; no customer-field search implementation was found. Search must remain owner-scoped, mask results, and not create a customer directory (`PRODUCT.md` §16).
- [ ] **P1 · Decision:** Reconcile required workload summaries with the new navigation. Factual history totals are present, but they do not replace scheduled-today, due/grace, overdue, upcoming, and completed-today summaries automatically. Confirm what belongs on Home (`PRODUCT.md` §17 and September 5 update).
- [ ] **P1 · Confirmed:** Add the required unsupported-phone experience if it remains in scope; no device gate was found. Retain usable narrow desktop layouts and describe the gate as a support boundary, not security (`PRODUCT.md` §21).
- [ ] **P1 · Verify:** Test editing an overdue callback's non-schedule fields. `parseCallbackInput()` requires a future start for every save, including updates; ensure ordinary detail edits do not unintentionally require rescheduling.
- [ ] **P1 · Verify:** Test windows spanning midnight and visible-range boundaries. Calendar retrieval and grouping use the window start; ensure a still-active window beginning before the visible range is represented according to the agreed calendar behavior.
- [ ] **P1 · Verify:** Test concurrent edits, repeated submissions, and uncertain network results. Define how to avoid duplicate creates/attempts and prevent stale tabs from silently overwriting a newer outcome. Keep overlap detection warning-only; conflicts are allowed by design.
- [ ] **P1 · Verify:** Test all September 5 flows: history pagination/filter/counts, changing PIN, logout, current-PIN confirmation, and permanent account deletion. Counts must describe surviving records, not audited performance.

## 3. Authentication, authorization, and privacy

- [ ] **P0 · Verify:** Prove owner isolation using two disposable accounts and an anonymous client against the deployed database: select, insert, update, delete, ownership changes, direct record IDs, and future attempt-history access. Check direct database API access as well as application actions.
- [ ] **P0 · Verify:** Review every exported server action as a remotely callable boundary. Validate inputs and obtain identity server-side; keep dependency-injected helpers such as `authenticateLogin`/`authenticateRegistration` in a server-only module if they are not intended action entry points (`lib/auth/actions.ts`). Never rely on unreferenced action exports being unreachable.
- [ ] **P0 · Verify:** Confirm strict PIN throttling covers all usable authentication paths, including direct calls to the backing auth service, PIN changes, and account deletion reauthentication. App-level action checks alone are not proof of end-to-end throttling.
- [ ] **P0 · Verify:** Test parallel failed logins and registration bursts. `actions.ts` checks limits before authentication and records failures afterward; measure concurrent behavior, successful-login resets, shared-source behavior, and database failure handling.
- [ ] **P0 · Decision:** Choose the hosting target and verify trusted client-address handling there. `getClientSource()` in `lib/auth/rate-limit.ts` uses Vercel-specific headers only when `VERCEL=1`; other hosts share `local-development`. Configure a trustworthy provider-specific source before deploying elsewhere, without trusting arbitrary forwarded headers.
- [ ] **P0 · Verify:** Configure production auth according to `docs/auth-configuration.md`: synthetic email mapping, email confirmation disabled, and password settings compatible with the approved six-digit PIN. Confirm login/register work without claiming employee identity verification.
- [ ] **P0 · Verify:** Keep the service-role key and rate-limit secret server-only. Inspect built client bundles and logs for accidental exposure; confirm privileged database functions are executable only by the intended role.
- [ ] **P0 · Verify:** Confirm session refresh, expiration, logout, deleted accounts, and direct private-route access behave safely. Test browser back navigation and multiple tabs after logout/account deletion. Verify private responses are not shared through CDN or application caching.
- [ ] **P1 · Verify:** Define PIN-change session behavior and explain it accurately. Confirm existing sessions behave as intended after a PIN change; do not imply global logout when only local logout is implemented.
- [ ] **P1 · Confirmed:** Add agreed maximum lengths for names, phone/account identifiers, and comments. `lib/callbacks/validation.ts` and callback SQL currently require nonempty text without upper bounds. Enforce compatible limits at server and database boundaries and test large payloads. Do not invent restrictive phone/account formats without resolving the deferred product decision.
- [ ] **P1 · Verify:** Audit rendered HTML, serialized props, URLs, logs, telemetry, notifications, and QA captures for customer data. Full account numbers belong only in permitted detail/edit workflows; PINs must never be logged or stored in application tables/browser persistence.
- [ ] **P1 · Decision:** Publish accurate support/privacy information and resolve retention/backup handling before real customer data is used. Identify a support owner and describe deletion accurately, including backup retention.
- [ ] **P1 · Decision:** Keep PIN recovery explicitly deferred unless approved. Do not add email, SMS, administrator, or employee-verification flows implicitly.

## 4. Database and production configuration

- [ ] **P0 · Verify:** Separate development/test and production database projects and credentials. Browser tests must use synthetic records and disposable accounts in an isolated environment.
- [ ] **P0 · Verify:** Apply both committed migrations in order, plus migrations for completed release features, through a recorded migration process. Verify tables, indexes, constraints, policies, triggers, function grants, and schema availability afterward.
- [ ] **P0 · Verify:** Test migration deployment from an empty database and upgrade from the current schema. Never rewrite an already-applied migration to represent a new change.
- [ ] **P0 · Verify:** Match `lib/supabase/database.types.ts` to the deployed schema after changes. Confirm nullability, status fields, and RPC signatures agree.
- [ ] **P0 · Verify:** Set and validate all required production environment variables from `.env.example` and `docs/auth-configuration.md`; use a distinct strong rate-limit secret. Keep values out of this checklist and repository.
- [ ] **P1 · Verify:** Add startup/deployment configuration validation so missing settings fail visibly for operators. Confirm the intentional pass-through in `proxy.ts` when configuration is missing does not hide a broken release.
- [ ] **P1 · Verify:** Establish rate-limit table cleanup. The migration removes expired rows when their keys are revisited; verify abandoned expired keys are purged on a controlled schedule without changing active lockouts.
- [ ] **P1 · Verify:** Test database/API outages, auth outages, timeouts, and missing schema. Show actionable safe UI messages while recording sanitized diagnostics for operators.
- [ ] **P0 · Verify:** Configure backups and complete a restore drill in isolation. Record recovery time/data-loss objectives, responsible owner, and how application/database rollback remain compatible.
- [ ] **P1 · Verify:** Confirm account deletion removes owned callbacks and, when added, attempts; callback deletion removes only that callback and its attempts. Test partial failures and expired sessions.

## 5. Repository hygiene and .gitignore

The root `.gitignore` already covers `.env*` (with `.env.example` retained), root `node_modules`, `.next`, `out`, `build`, coverage, TypeScript build info, generated `next-env.d.ts`, and common package-manager debug logs. `browserbase/.gitignore` already excludes its dependencies, artifacts, and local environment files. Preserve these rules.

- [ ] **P1 · Confirmed:** Add `/.pnpm-store/` to the root `.gitignore`; it currently appears as untracked local package storage.
- [ ] **P1 · Confirmed:** Add `/graphify-out/` for generated code-graph/cache output unless there is an explicit reason to version a curated report. It currently appears untracked and contains generated HTML, JSON, and caches.
- [ ] **P1 · Verify:** Preserve and commit `browserbase/.gitignore` if keeping the harness. Add `/artifacts/` at root if scripts may be launched there, because several harness outputs are relative to the current working directory.
- [ ] **P1 · Decision:** Prefer an unanchored `node_modules/` rule if more nested packages are expected. Root `/node_modules` does not itself cover nested packages; the existing Browserbase rule currently handles that package.
- [ ] **P1 · Verify:** Add generated paths only when used: `/.vercel/` for local hosting state, `/test-results/` and `/playwright-report/` for browser test output, `/dist/` for build output, and `Thumbs.db`/`Desktop.ini` for local Windows metadata. Ignore additional logs, profiler output, and crash dumps at their actual output locations.
- [ ] **P1 · Decision:** Review `.agents/`, `skills-lock.json`, `.graphifyignore`, and internal planning/design documents before publishing the repository. Keep shared project instructions and useful docs intentionally; exclude machine-specific state and sensitive notes. Do not blanket-ignore all dotfiles or Markdown.
- [ ] **P0 · Verify:** Scan both the staged release diff and git history for credentials/customer data, including old screenshots and reports. If a secret was ever committed, rotate it and follow a deliberate history-remediation process; `.gitignore` does not remove tracked files or history.
- [ ] **P1 · Verify:** Inspect `git status --short`, `git ls-files`, and `git check-ignore` before committing. The current tree has many untracked source files and a deleted `app/favicon.ico`; make sure all intended application code, migrations, assets, tests, and nested ignore rules reach the release commit.
- [ ] **P1 · Verify:** Keep `pnpm-lock.yaml`, `.env.example`, migrations, required assets, configs, and tests versioned. If retaining Browserbase as a separate package, verify its lockfile/install process is reproducible too.

Suggested immediate root additions (not applied by this review):

```gitignore
# local package cache
/.pnpm-store/

# generated code analysis
/graphify-out/

# QA output when scripts run from the repository root
/artifacts/
```

## 6. Dead code, duplication, and maintainability

- [ ] **P1 · Verify:** Run a repository-aware unused-code/dependency audit covering app routes, server actions, test entry points, and the separate Browserbase package. Review each result before deletion; dynamic imports, framework-discovered files, CSS imports, and generated UI exports can be false positives.
- [ ] **P1 · Verify:** Remove confirmed unused imports, exports, hooks, components, utility functions, styles, and packages. Search all consumers first; a clean lint run is not a complete dead-code audit. No files were certified dead during this review.
- [ ] **P1 · Confirmed:** Consolidate the duplicated account-number masking in `get-calendar-callbacks.ts` and `get-history.ts`, fixing the short-number issue with shared regression tests.
- [ ] **P1 · Confirmed:** Share history page size and outcome labels between `components/callbacks/callback-history.tsx` and `lib/callbacks/get-history.ts`. Both currently define them independently. Put shared constants in a safe common module rather than importing server-only runtime code into the client.
- [ ] **P1 · Verify:** Review repeated Supabase configuration/session acquisition and mutation result handling across `lib/callbacks/*` and `lib/auth/*`. Extract only stable shared behavior while preserving per-action authorization and useful error messages.
- [ ] **P1 · Verify:** Review repeated schedule/date rendering, status labels, styles, and hydration gating in calendar/workspace components. Keep one authoritative temporal-state calculation and avoid unnecessary abstraction for simple markup.
- [ ] **P1 · Verify:** Review duplicated field constraints and status unions across UI, server validation, and SQL for drift. Keep database invariants even when validation is shared in application code.
- [ ] **P1 · Verify:** Audit `any`, non-null assertions, broad casts, lint suppressions, swallowed errors, stale comments, TODOs, debug logging, mock data, abandoned routes, and misleading copy. For example, detail deletion currently mentions attempt history that has no storage yet.
- [ ] **P1 · Verify:** Keep `/sign-in` and `/sign-up` aliases only intentionally; verify redirects to the canonical routes and retain them if existing links need compatibility.
- [ ] **P1 · Decision:** Review runtime versus tooling dependencies, including `shadcn` in root dependencies and the standalone Browserbase dependencies. Move tooling only after confirming production imports/build needs; do not remove dependencies based on package names alone.
- [ ] **P1 · Verify:** Keep generated graphs, QA captures, and caches out of lint/format/source analysis inputs where appropriate. Ensure browser test source still receives its own lint/type checks.
- [ ] **P2 · Decision:** Reconcile `PRODUCT.md`'s Zustand requirement with the current implementation. Update an obsolete stack mandate or justify a store for a real need; do not add it solely to satisfy stale wording.

## 7. Favicon, branding, metadata, and error pages

- [ ] **P1 · Confirmed:** Finish and verify the favicon set. `app/layout.tsx` already uses `/logo.png` for icon and Apple icon, and `public/logo.png` exists; `app/favicon.ico` is deleted in the working tree. Confirm this is intentional and test tiny-size legibility, transparency, dimensions, browser caching, and light/dark tab backgrounds. Add a dedicated `.ico`/icon and Apple-sized asset if needed.
- [ ] **P1 · Verify:** Check every brand reference and image for final naming, correct aspect ratio, sharp rendering, accessible text alternatives, and usage rights.
- [ ] **P1 · Verify:** Add meaningful route titles/descriptions for login, registration, Home, and history. Verify metadata never contains customer information.
- [ ] **P1 · Decision:** Choose indexing policy for this private workspace. Configure appropriate robots metadata and crawler rules; robots directives are not access control. Keep private records out of sitemaps.
- [ ] **P2 · Decision:** Add canonical site URL and branded social preview metadata only for intentionally shareable public pages. A sitemap or web-app manifest is not automatically required for a private application.
- [ ] **P1 · Confirmed:** Add deliberate not-found and unexpected-error experiences; no `app/not-found.tsx`, `app/error.tsx`, or `app/global-error.tsx` was found. Test recovery and safe error text alongside the existing loading/query-error states.
- [ ] **P1 · Verify:** Review fallback fonts and production font loading. The root layout uses three Google font families; validate clean builds can obtain required assets and assess whether all families are needed.

## 8. Browser, accessibility, and functional acceptance

- [ ] **P1 · Verify:** Run real end-to-end registration, login, callback creation/edit/deletion, warning-only conflicts, outcomes/rescheduling, history, settings, PIN change, logout, and account deletion. Reload after mutations to prove persistence.
- [ ] **P1 · Verify:** Cover invalid inputs, long content, empty states, pending/double-submit states, save failure with retained input, expired sessions, deleted records, and retry after an uncertain response.
- [ ] **P1 · Verify:** Test keyboard-only navigation, visible focus, dialog focus return/trapping, destructive confirmation defaulting to Cancel, labels, screen-reader feedback, and accessible names for calendar markers and icon buttons.
- [ ] **P1 · Verify:** Test text/status contrast and non-color cues in both themes, reduced motion, zoom, clipped labels, scrolling dialogs, and resized desktop windows.
- [ ] **P1 · Verify:** Test supported Chromium, Firefox, and Safari environments as applicable; specifically validate date inputs, notification permission, timezone formatting, hydration, and session cookies. Document the supported browser/OS baseline.
- [ ] **P1 · Verify:** Use deterministic time tests for exact `T`, `T+5m`, window start/end/`end+5m`, midnight, month/year rollover, leap days, DST transitions, and device timezone changes. Verify both pure calculations and rendered updates.
- [ ] **P1 · Verify:** Verify no hydration warnings, unhandled exceptions, failed assets, or unexpected requests occur during the production smoke run.
- [ ] **P1 · Verify:** Review `browserbase/PLAN.md` against actual evidence. Use synthetic test data; secure reports/session links and clean up only test-owned resources. Do not treat an unchecked plan or a screenshot as proof of database security/native notification delivery.

## 9. Performance, dependencies, and build reliability

- [ ] **P0 · Confirmed:** Resolve the placeholder `esbuild: set this to true or false` in `pnpm-workspace.yaml` to an intentional build-script policy, then prove clean installation. Do not enable all dependency scripts indiscriminately.
- [ ] **P1 · Confirmed:** Pin/document the root Node and package-manager versions; root `package.json` has no `engines` or `packageManager`. Account for the Browserbase package's separate Node requirement and compiler versions.
- [ ] **P1 · Verify:** Scan root and Browserbase lockfiles for current advisories; triage reachable runtime and build-chain risk and record fixes or justified exceptions. This review makes no assertion that dependency versions are vulnerability-free.
- [ ] **P1 · Verify:** Check dependency and bundled-asset licenses before repository/application publication. Add a project license if public redistribution is intended; otherwise state the proprietary/internal-use policy.
- [ ] **P1 · Verify:** Measure production route payloads and client bundle size, especially auth shaders, icon imports, calendar components, and shared shell dependencies. Lazy-load substantial optional UI only where measurements justify it.
- [ ] **P1 · Verify:** Test dense calendars and large histories. `getCalendarCallbacks()` has no explicit pagination; confirm database/API row limits cannot silently truncate a busy period. Define complete retrieval or clearly communicate bounded results.
- [ ] **P1 · Verify:** Profile history's multiple exact-count queries and page retrieval (`get-history.ts`) with realistic per-user data. Add indexes or query consolidation based on query plans, not guesswork.
- [ ] **P1 · Verify:** Measure first load, navigation, dialog opening, and mutation latency on the target network/device. Record acceptable budgets and test database connection/concurrency behavior under expected usage.
- [ ] **P1 · Verify:** Add CI for lint, typecheck, unit tests, production build, migration/authorization checks, and critical browser smoke tests. No repository `.github` workflow was found; use the chosen CI provider rather than assuming one already exists.
- [ ] **P1 · Verify:** Add a non-mutating formatting check and resolve formatting consistently. The existing `format` script writes files and should not be used as the CI check.

## 10. Hosting, operations, documentation, and release

- [ ] **P0 · Decision:** Record the production provider, region, database project, domain, deployment owner, and exact deployment/rollback procedure.
- [ ] **P0 · Verify:** Configure DNS, HTTPS, production environment variables, auth site/redirect settings, and preview environment isolation. Smoke-test through the real domain and reverse proxy.
- [ ] **P1 · Verify:** Review response headers and CSP against actual fonts, shaders, scripts, and backend connections. Test framing restrictions, content-type protection, referrer behavior, and permissions policy without breaking the application. `next.config.ts` is currently empty; provider-level settings were not inspected.
- [ ] **P1 · Verify:** Add sanitized error reporting, uptime monitoring, and alerts for authentication failures, database outages, rate-limit store errors, and failed deployments. Many server functions return generic errors; operators still need actionable diagnostics without PIN/customer data.
- [ ] **P1 · Verify:** Define ownership and runbooks for incidents, exposed-secret rotation, schema mismatch, restore, rollback, and failed account deletion. Validate alert delivery.
- [ ] **P1 · Confirmed:** Replace the template introduction and generic component instructions in `README.md` with project purpose, prerequisites, setup, environment-variable names, migrations, scripts, tests, deployment, and troubleshooting. Preserve the useful auth and calendar setup sections.
- [ ] **P1 · Verify:** Update `PRODUCT.md`, `DESIGN.md`, auth configuration, and Browserbase documentation to match shipped behavior and recorded deferrals. State the accepted PIN/enrollment, notification, shared-timezone, and non-audit deletion limitations accurately.
- [ ] **P0 · Verify:** Review the final staged diff, tag or otherwise record the immutable release commit, and deploy the tested artifact. Confirm no local-only source files or migrations are omitted.
- [ ] **P0 · Verify:** Run a post-deployment smoke test with a disposable account: login/register, create/read/update/delete, history, settings, asset loading, and notification behavior if shipped. Check logs and remove test-owned data.
- [ ] **P0 · Verify:** Confirm monitoring is healthy, rollback is ready, and every P0/P1 item has evidence or an explicit approved scope disposition. Record release owner, date, artifact/commit, migration versions, and remaining follow-ups.

## Release verification commands

Run from the repository root using the pinned package-manager version. On Windows, `pnpm.cmd` avoids PowerShell script execution-policy issues. Run installs/builds in CI or an isolated checkout; do not overwrite an active development build just to inspect readiness.

```text
pnpm.cmd install --frozen-lockfile
pnpm.cmd run lint
pnpm.cmd run typecheck
pnpm.cmd run test
pnpm.cmd run build
pnpm.cmd run start
```

The production server stays running for smoke testing. Separately install/check the standalone Browserbase package if retained (`pnpm-workspace.yaml` currently has `packages: []`); run its browser tests only against the designated disposable environment. Add newly implemented migration, authorization, temporal-state, and notification checks to the release gate.
