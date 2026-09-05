# Scheduling Calendar Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build reusable monthly and weekly callback calendars that load the authenticated agent's real Supabase callbacks and follow `PRODUCT.md` and `DESIGN.md`.

**Architecture:** `app/page.tsx` remains a Server Component and resolves the URL-controlled calendar range before querying Supabase. A narrow client boundary owns month/week controls and renders pure month/week views from a discriminated callback marker model. Calendar math and status derivation stay framework-independent in `lib/calendar`.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript, Tailwind CSS v4, Base UI/shadcn Button, Tabler Icons, Supabase SSR

---

## File map

- `lib/calendar/types.ts`: callback row, normalized marker, view, and load-result contracts.
- `lib/calendar/date-utils.ts`: local-time calendar math, labels, range calculations, marker normalization, urgency, and collision helpers.
- `lib/supabase/server.ts`: cookie-aware Supabase Server Component client.
- `lib/callbacks/get-calendar-callbacks.ts`: authenticated, RLS-backed range query and result normalization.
- `components/scheduling-calendar/calendar-toolbar.tsx`: date summary, navigation, view switcher, and accessible icon tooltips.
- `components/scheduling-calendar/month-view.tsx`: six-week monthly grid with urgent-state summaries and explicit overflow.
- `components/scheduling-calendar/week-view.tsx`: seven-day hourly grid with fixed-height point markers and deterministic collision disclosure.
- `components/scheduling-calendar/scheduling-calendar.tsx`: interactive client coordinator and public component API.
- `components/scheduling-calendar/calendar-skeleton.tsx`: structural loading state.
- `app/loading.tsx`: route loading boundary.
- `app/page.tsx`: Supabase-backed calendar page with populated, empty, unauthenticated/configuration, and query-error states.
- `.env.example`: required public Supabase environment variable names without secrets.

### Task 1: Install and document Supabase SSR

**Files:**
- Modify: `package.json`
- Modify: `pnpm-lock.yaml`
- Create: `.env.example`

- [ ] Install `@supabase/ssr` and `@supabase/supabase-js` with `pnpm add @supabase/ssr @supabase/supabase-js`.
- [ ] Add `NEXT_PUBLIC_SUPABASE_URL=` and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=` to `.env.example`.
- [ ] Run `pnpm typecheck`; expected result is exit code 0 before source changes.

### Task 2: Add typed calendar domain utilities

**Files:**
- Create: `lib/calendar/types.ts`
- Create: `lib/calendar/date-utils.ts`

- [ ] Define `CalendarCallbackRow` as the database projection and `CalendarMarker` as an `exact | window` discriminated union. Neither type exposes phone number, comments, or full account number to the calendar client.
- [ ] Implement local-time helpers for `YYYY-MM-DD` parsing/formatting, Monday week starts, six-week month ranges, week/month labels, URL date normalization, time formatting, and date arithmetic.
- [ ] Normalize rows into markers at `scheduled_at` or `window_start_at`, preserving `window_end_at` only for range labels and overdue derivation.
- [ ] Derive `upcoming | due | grace | overdue` from open callbacks and the current instant. Window callbacks use the window end for grace/overdue.
- [ ] Implement deterministic chronological sorting and grouping helpers. Monthly cells disclose at most three markers plus `+N more`; weekly same-time collisions disclose the first marker plus `+N at this time`.
- [ ] Run `pnpm typecheck`; expected result is exit code 0.

### Task 3: Add authenticated Supabase range loading

**Files:**
- Create: `lib/supabase/server.ts`
- Create: `lib/callbacks/get-calendar-callbacks.ts`

- [ ] Create the server client with `createServerClient`, `await cookies()`, `getAll`, and a guarded `setAll` because Server Components cannot always write cookies.
- [ ] Model missing environment configuration, unauthenticated access, and query failure as explicit return values rather than thrown expected errors.
- [ ] Verify the user with `supabase.auth.getUser()` before querying.
- [ ] Select only `id`, `account_holder_name`, `account_number`, `schedule_mode`, schedule timestamps, and `lifecycle_state` from `callbacks`.
- [ ] Filter to `lifecycle_state = open` and rows whose exact timestamp or window start falls inside the requested UTC range. RLS remains the ownership boundary; do not add a client-only ownership filter as a security substitute.
- [ ] Mask account numbers on the server to an optional `•••• 1234` suffix and do not serialize full account numbers into the client component.
- [ ] Run `pnpm typecheck`; expected result is exit code 0.

### Task 4: Build the reusable scheduling calendar

**Files:**
- Create: `components/scheduling-calendar/calendar-toolbar.tsx`
- Create: `components/scheduling-calendar/month-view.tsx`
- Create: `components/scheduling-calendar/week-view.tsx`
- Create: `components/scheduling-calendar/scheduling-calendar.tsx`

- [ ] Build the toolbar from the existing Base UI-backed `Button`, Tabler chevrons, and accessible tooltips. URL navigation preserves a canonical local date and switches `view=month|week`.
- [ ] Render the monthly Monday-first six-week grid with out-of-month de-emphasis, today treatment, callback count, most urgent status, chronological markers, and explicit overflow.
- [ ] Render the weekly grid with a consistent 56px-per-hour scale. Every callback is a compact point marker of fixed height; a time window displays its full range but never stretches to its duration.
- [ ] Make callback markers keyboard reachable in chronological DOM order and link them to the callback detail destination supplied by the component API.
- [ ] Do not add drag, resize, drag-to-create, or animated position changes.
- [ ] Keep weekly horizontal scrolling inside the calendar surface for narrow desktop windows.
- [ ] Run `pnpm typecheck` and `pnpm lint`; expected result is exit code 0 for both.

### Task 5: Add loading, empty, and error states to the page

**Files:**
- Create: `components/scheduling-calendar/calendar-skeleton.tsx`
- Create: `app/loading.tsx`
- Modify: `app/page.tsx`

- [ ] Parse promised Next.js 16 `searchParams`, defaulting invalid input to the current local date and monthly view.
- [ ] Fetch the exact visible range and render the reusable calendar with the normalized markers.
- [ ] Keep the calendar grid visible when there are zero callbacks and show a concise empty message with the existing global New Callback destination.
- [ ] Render actionable setup copy when Supabase variables are missing, sign-in copy when no authenticated user exists, and retry-safe copy for query failures. Never claim data loaded successfully on failure.
- [ ] Add a structure-matching calendar skeleton in `app/loading.tsx`.
- [ ] Replace the starter page without adding dummy callbacks.
- [ ] Run `pnpm typecheck`, `pnpm lint`, and `pnpm build`; expected result is exit code 0 for all commands.

### Task 6: Final compliance review

**Files:**
- Review all files above.

- [ ] Confirm no full account number, phone number, or comments cross the Server/Client boundary.
- [ ] Confirm exact callbacks and windows both render as fixed-size point markers.
- [ ] Confirm window labels include their full range and overdue is based on the end.
- [ ] Confirm all controls have accessible names, focus-visible treatment, at least 32px pointer targets, semantic token colors, and tabular dates/times.
- [ ] Confirm there are no placeholder events, `any`, `console.log`, gradients, glows, duration blocks, drag affordances, or dead controls.
- [ ] Run project diagnostics and report any unrelated pre-existing issue separately.
