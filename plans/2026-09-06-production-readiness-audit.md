# Production readiness audit — 2026-09-06

Status: **Do not ship this snapshot yet.** Confirmed security and correctness findings remain. Passing unit tests and a build do not establish deployed database or browser correctness.

## Scope and method

- Audited current working tree based on commit `3e6c420b87821fdf7fb4c88eb088f358a2fba8f6`, including its pre-existing modified/untracked files. This is not an immutable release commit.
- Used Graphify query/explain and graph relationships for navigation, with targeted source checks to verify findings. Existing graph: 956 nodes, 2,103 edges, 152 indexed files. Every manifest file matched its recorded modification time; all current app/components/hooks/lib/tests/supabase TS, TSX, and SQL files were indexed.
- Three parallel reviewers used **gpt-5.6-luna, xhigh**, covering authentication/database security, scheduling/data correctness, and client/notification behavior.
- Following the user's updated instruction, further file reading was delegated to **gpt-5.6-luna, medium**. That independent final verifier confirmed R2, R5, and R6 against Graphify and targeted source without corrections. An earlier extra xhigh verifier hit a usage limit and did not provide review evidence.
- Source code, dependencies, and database state were not modified. Build output was generated in the normal ignored build directory. This report is the audit deliverable.

## Verification evidence

| Check | Result |
| --- | --- |
| `pnpm.cmd run test` | Passed: 24 files, 180 tests |
| `pnpm.cmd run lint` | Passed |
| `pnpm.cmd run typecheck` | Passed |
| `pnpm.cmd run build` | Passed: Next.js 16.2.6 production build |
| Production startup | Passed using `pnpm.cmd run start --hostname 127.0.0.1 --port 3097` |
| Anonymous HTTP smoke | Home sign-in state; History streamed redirect to login; login/register and icons served; unknown route 404; private/no-store cache headers and framing protection observed |
| `pnpm.cmd audit --prod --json` | Failed: 7 high, 9 moderate, 1 low advisory entries; at least the Next.js Server Actions DoS applies to this app |
| `pnpm.cmd run format:check` | Failed: 30 files; formatting is absent from CI |
| `git diff --check` | Passed; Git emitted line-ending warnings |

The first dependency audit could not reach the registry from the sandbox; the approved network-enabled retry returned the advisory results. No exploit or destructive security test was run. Tests emitted a Node experimental localStorage warning but passed.

## Confirmed findings

Recommended remediation order: R1 (patched runtime) and R9 (atomic PIN throttling), R2 (database edit invariant), R7 (atomic creation), R5/R6 (notification integration and coordination), R3/R8 (complete and honest workload data), then R4 (release instructions). Verify the direct Auth boundary alongside R9. Database integration tests should land with R2/R7; notification integration tests should land with R5/R6. Repeat release checks against the final commit rather than relying on this snapshot's passing checks.

### R1 — High: update the vulnerable Next.js runtime before release

- Evidence: `package.json:31` pins Next.js `16.2.6`; `lib/auth/actions.ts:1` is a Server Actions module used by the App Router authentication forms.
- Impact: this application matches the affected App Router + Server Actions configuration for a remotely triggerable CPU-exhaustion denial of service.
- Primary advisory: [GHSA-m99w-x7hq-7vfj](https://github.com/vercel/next.js/security/advisories/GHSA-m99w-x7hq-7vfj), published July 21, 2026. The affected Next.js 16 range is below `16.2.11`; that advisory identifies `16.2.11` as patched and gives no workaround besides upgrading.
- Remediation: update to a supported patched Next.js version, align `eslint-config-next`, regenerate the lockfile, and repeat clean installation, tests, lint, typecheck, production build, smoke tests, and advisory triage. Other audit entries require reachability assessment; seven high entries do not mean seven independently demonstrated app vulnerabilities.
- Confidence: high. Effort: S. Change risk: medium, because framework updates require regression validation.

### R2 — High: the future-schedule trigger rejects ordinary edits to due/overdue callbacks

- Evidence: `supabase/migrations/20260907000000_callbacks_future_schedule.sql:13` checks every open callback's start against `now()`; line 27 attaches it to every insert or update.
- Impact: once an open exact callback is due, or a window has started, an update retaining that schedule fails even if it changes only comments or customer fields. Closing remains exempt; rescheduling to the future remains allowed. This becomes a runtime defect wherever the migration is applied.
- Remediation: enforce future times on creation, reopening, and actual schedule changes while permitting unchanged schedules on ordinary edits to already-open callbacks. Use a forward migration if the current one has been applied. Verify exact and window schedules against a real disposable PostgreSQL database.
- Confidence: high from source; migration application state was not inspected. Effort: S. Change risk: medium, because the invariant must remain enforced for new schedules.

### R3 — Medium: bounded data retrieval silently produces incomplete lists and totals

- Evidence: `lib/callbacks/get-calendar-callbacks.ts:103` and `:154` retrieve calendar and overdue rows without pagination or a completeness check. `lib/callbacks/get-workload-summary.ts:25` caps open rows at 2,000 and closed rows at 500, then returns success without indicating truncation.
- Impact: workloads exceeding the API cap can omit callbacks; displayed totals can undercount. Supabase's documented default API maximum is 1,000 rows, so a client limit of 2,000 does not establish complete retrieval. Production API configuration was not inspected.
- Documentation: [Supabase default API configuration](https://github.com/supabase/supabase/blob/master/supabase/config.toml), confirmed through Context7.
- Remediation: use deterministic pagination or server-side aggregation for totals; if deliberately bounding lists, expose their incomplete status. Test beyond the configured API cap and the closed-row cap.
- Confidence: high for the conditional failure. Effort: M. Change risk: medium, because ordering, concurrency, and local-time grouping need preservation.

### R4 — Medium: release instructions omit a migration and the release checklist is stale

- Evidence: `README.md:31` lists migrations only through the feedback migration, omitting `20260907000000_callbacks_future_schedule.sql`. `PRE-PROD.md:22` still says notifications are absent, and `:23` requires attempt-history implementation despite the explicit owner cut at `PRODUCT.md:1652`.
- Impact: operators cannot use the current checklist as reliable release evidence; following the explicit migration list yields a different schema from applying all migration files.
- Remediation: reconcile the migration list only after correcting R2, reconcile old findings against current behavior and owner decisions, and record each production gate with evidence or a disposition.
- Confidence: high. Effort: S. Change risk: low.

### R5 — High: connect the notification system to authenticated pages

- Evidence: `components/notifications/notification-host.tsx:26` is the only production caller of `useNotificationsScheduler`, but has no production importer or rendered instance. Graphify reverse traversal also reports no affected nodes. `components/callbacks/new-callback-dialog.tsx:177` schedules only when editing an existing callback; newly created callbacks do not take that path.
- Impact: loading/reloading a page does not reconcile saved callbacks into the scheduler, new creates do not arm notifications, and the in-app fallback never renders. Edit/reschedule mutation helpers can still arm individual native timers; this is not a claim that all notification code is unreachable. Occurrences deferred beyond six hours also lack the hook's periodic sweep.
- Remediation: mount the host once within an authenticated lifecycle and supply complete owner-scoped schedule data independently of the visible calendar range. `lib/notifications/scheduler.ts:317` cancels IDs absent from reconciliation input, so feeding only the current month/week would introduce lost timers on navigation. Cover creation, reload, navigation, permission denial, deferred timers, and logout in integration tests.
- Confidence: high. Effort: M. Change risk: medium, because notification ownership, lifetime, and schedule completeness must be handled together.

### R6 — Medium: notification claims are not atomic across tabs

- Evidence: `lib/notifications/dedupe.ts:53` reads localStorage and `:54` writes it separately; `lib/notifications/scheduler.ts:177` trusts the resulting winner flag before native delivery. Broadcast is a later notification, not an acquisition lock.
- Impact: concurrent tabs can both win the same occurrence claim. The code therefore does not guarantee one delivery attempt; the native notification tag may replace a displayed notification, but does not establish exclusive acquisition. Current missing host integration limits normal paths to this race; fix coordination before enabling complete multi-tab scheduling.
- Remediation: serialize cross-tab claim acquisition using an appropriate atomic coordination mechanism and define behavior when that mechanism is unavailable. Test genuinely concurrent claims rather than two sequential calls using a shared Map.
- Confidence: high for the race in code. A local deterministic interleaving of the actual `tryClaimDelivery` helper returned true for both claimants; this modeled the race without exercising real browser tabs. Effort: M. Change risk: medium.

### R7 — High: callback creation idempotency is neither atomic nor durable

- Evidence: `lib/callbacks/callback-idempotency.ts:14` stores completed results in a process-local Map. `lib/callbacks/create-callback.ts:123` checks the cache before asynchronous work; `:180` inserts a callback and only then stores success at `:190`. The request key is not part of an atomic database insert/uniqueness claim.
- Impact: concurrent same-key requests can both pass the check and insert, especially when overlap has already been acknowledged. A retry after an uncertain response can also duplicate a callback when handled by another instance or after process restart. Client double-submit prevention does not make server retries safe.
- Remediation: persist an owner/operation-scoped idempotency key with an atomic database uniqueness rule or durable claim/result transaction. Test simultaneous requests, post-commit response loss, and retries across independent workers. Keep update optimistic-concurrency checks; the create duplicate-insert finding should not be generalized into a claim that every update ignores concurrency protection.
- Confidence: high from source; no concurrent database writes were executed. Effort: M. Change risk: medium.

### R8 — Medium: partial Home query failures silently hide overdue callbacks

- Evidence: `app/page.tsx:166` converts a failed overdue query into undefined markers. `lib/calendar/date-utils.ts:332` interprets absent overdue markers as simply the visible calendar markers. `app/page.tsx:156` also omits workload summaries on failure without explaining why.
- Impact: when the calendar query succeeds but the independent overdue query fails, Up Next loses overdue callbacks outside the selected period without warning. Users cannot distinguish a complete action list from a degraded one.
- Remediation: carry explicit completeness/error state to the page and show a focused retry or degraded-state indicator. Cover mixed success/failure loader results in page integration tests.
- Confidence: high. Effort: S/M. Change risk: low/medium.

### R9 — High: PIN throttling admits concurrent attempts before counting them

- Evidence: `lib/auth/credentials.ts:184` checks limits, then `:194` calls password authentication, and `:206` records failure afterward. `lib/auth/rate-limit.ts:127` maps that check to `auth_rate_limit_status`, whose SQL at `supabase/migrations/20260902000000_auth_rate_limits.sql:55` takes only a transaction-scoped lock and returns current status without reserving an attempt.
- Impact: overlapping login attempts can all be admitted before any failures are recorded. Atomic failure increments do not make admission atomic, so the configured per-account threshold does not bound concurrent guesses against the six-digit PIN. Current-PIN reauthentication also uses the same helper. Registration has a similar check-before-request pattern.
- Remediation: make admission/attempt consumption atomic before calling Auth, with defined success, timeout, outage, and retry behavior. Test concurrency by counting admitted Auth calls, not just the final stored failure count. Preserve user/source scoping and restricted RPC grants.
- Confidence: high from application and SQL source; no live password-guess burst was executed. Effort: M. Change risk: medium.

## Authentication deployment boundary — unresolved release gate

The custom Company-ID throttle is enforced in the app's Server Action path (`lib/auth/actions.ts:41`, `lib/auth/credentials.ts:179`). It does not itself wrap direct requests to Supabase Auth. Public Supabase client configuration is intentional, not a leaked credential. The repo therefore cannot prove that every password-verification path enforces the same per-account lockout. Inspect the production Auth/gateway controls and test direct endpoint throttling in a disposable environment before approving the six-digit PIN design for release. Do not assume unspecified WAF or provider settings either exist or are absent. This is a medium-confidence deployment exposure, distinct from R9's confirmed application race; changing authentication architecture requires a concrete design rather than simply hiding the public key.

## Additional bounded follow-ups

- **Schedule error focus (medium):** `components/callbacks/new-callback-dialog.tsx:181` focuses a named form element on server field errors, but `components/callbacks/schedule-date-time.tsx:39` puts that name on a hidden input. Focus the visible date/time control instead. Confidence high; S effort, low risk.
- **Window order feedback (low):** `components/callbacks/new-callback-dialog.tsx:140` validates endpoints individually without checking end-after-start before submitting. The server rejects reversed windows at `lib/callbacks/validation.ts:132`, so data integrity is protected; improve immediate field feedback. Confidence high; S effort, low risk.
- **Home request waterfall (low until measured):** `app/page.tsx:142` awaits three independent loaders sequentially. Parallelizing them can reduce additive network waiting; measure before claiming a specific latency improvement. Confidence high for serialization; S effort, low/medium risk.
- **Latent notification reconciliation (medium after R5):** `lib/notifications/scheduler.ts:250` puts initially missed occurrences into the notice store without retaining an entry; `:329` only reports cancelled IDs from retained entries. Fresh marker reconciliation therefore cannot clear those notices after remote close/delete. Include this scenario in R5's integration work. Confidence high from source; S/M effort, low/medium risk.
- **Notification timing contract:** `lib/notifications/occurrence.ts:58` treats exact trigger + five minutes as still deliverable. More broadly, the implementation permits delivery during five minutes after a missed trigger, while `PRODUCT.md:1454` says not to replay after sleep. Define and test wake-up behavior against the strict no-replay requirement; do not merely change one comparator and claim the whole requirement is satisfied.
- **Feedback resource bounds (operational):** `lib/feedback/submit-feedback.ts:38` and the authenticated insert policy at `supabase/migrations/20260906000000_feedback.sql:21` allow repeated append-only submissions without an application/database quota. Authentication, ownership, rating, and text-length checks exist. Evaluate a per-user/time quota against expected usage and abuse controls; an unverified storage-exhaustion scenario is not presented as a demonstrated outage. Confidence high for absence of a local quota, medium for operational impact; M effort, low risk.

## Release evidence still required

These are unverified gates, not claims that the deployed system has failed them:

- Clean frozen-lockfile installation and checks on the immutable release commit in the intended deployment environment. The successful local build used existing dependencies and local environment configuration.
- Applied migration versions and live RLS/function-grant tests with two disposable users and an anonymous client, including direct Data API ownership-change attempts.
- Direct backing-auth PIN protections, provider-specific trusted client-address behavior, production region configuration, and session behavior through the real host.
- Authenticated browser acceptance: registration/login, callback mutations and persistence, history, PIN change, logout/deletion, notifications, multiple tabs, browser suspension, keyboard accessibility, and supported browsers.
- Production provider/domain/region, monitoring and alert delivery, rollback, backup restoration, and retention. `README.md:64` says the production target is not yet recorded.
- Full git-history secret scan, dependency-license review, measured load/performance tests, and production client-bundle secret inspection were not performed.

## Lower-priority hygiene

Formatting fails in 30 files, whereas `README.md:48` says 15. The CI workflow at `.github/workflows/ci.yml:19` runs install/lint/typecheck/unit tests/build but neither formatting nor database/browser integration tests. Add reliable verification gates after addressing their failures; do not treat formatting as equivalent in severity to R1 or R2.

## Considered and excluded

- Missing attempt-history storage: explicitly cut by the owner at `PRODUCT.md:1652`; not a defect to restore automatically.
- Completed-today counting voicemail/no-answer closures: expressly required at `PRODUCT.md:895`; not a metric bug.
- Notification singleton surviving current-tab logout: the shipped settings UI uses `window.location.replace` after logout/deletion, discarding that document's singleton. Cross-tab session behavior still requires browser validation.
- Phone blocking, unverified company-ID enrollment, six-digit PIN UX, and no closed-browser notification delivery: documented product constraints, not missing features by themselves.
- Anonymous Home returning HTTP 200: it renders the sign-in state without callback data. History uses a streamed redirect. Status code alone was not treated as an authorization failure.
- A full browser enforcement CSP, extensive UI refactoring, new recovery channels, and new product features were not recommended merely to expand scope.
