# Login and Registration Design

**Date:** 2026-09-02  
**Status:** Approved for implementation planning

## 1. Scope

Build complete Login and Register experiences for Scheduler using Next.js App Router, Supabase Auth, Tailwind CSS v4, and the existing shadcn-based design system.

This scope includes:

- Canonical `/login` and `/register` routes.
- Redirects from `/sign-in` to `/login` and `/sign-up` to `/register`.
- Working registration and login with the approved Company ID and six-digit PIN experience.
- A safe internal adaptation to Supabase email/password authentication.
- Database-backed throttling and lockout.
- Required validation, loading, error, and authenticated redirect states.
- Focused automated tests and project validation.

This scope excludes:

- PIN recovery or reset.
- Email, SMS, invitation, supervisor, or administrator workflows.
- Employee identity verification.
- Changes to the authenticated application shell or callback workflows.
- A new Dashboard or Calendar route. Successful authentication redirects to the existing `/` page.

## 2. Approved Product Decisions

- Authentication is end-to-end, not UI-only.
- Supabase Auth uses a deterministic synthetic email derived from the normalized Company ID.
- The synthetic identity for `E12345` is `e12345@auth.scheduler.invalid`.
- `/login` and `/register` are canonical.
- `/sign-in` and `/sign-up` are compatibility redirects.
- Successful login and registration redirect to `/`.
- Registration requires PIN and Confirm PIN.
- Login requires one PIN field.
- The interface uses the approved quiet split-screen direction.
- Server Actions and a server-only auth adapter are used instead of public auth Route Handlers or direct client-side Supabase calls.
- Rate-limit state is stored in Supabase/Postgres.
- The application is deployed on Vercel.
- Vercel's platform-controlled `x-vercel-forwarded-for` header is the production client-source input. Vercel documents this value as identical to its overwritten `x-forwarded-for` value while remaining stable when an upstream proxy changes `x-forwarded-for`.

## 3. Product and Design Constraints

The implementation must preserve the requirements in `PRODUCT.md` and `DESIGN.md`:

- Company IDs match `^E\d{5}$` after normalization.
- PINs contain exactly six digits.
- Registration does not verify employee identity and must never claim that it does.
- The first successful registrant may claim an available Company ID.
- A claimed Company ID cannot be registered again.
- PIN verification is delegated to Supabase Auth; the PIN is never stored in an application table or written to logs.
- Login failures do not disclose whether a Company ID exists.
- PIN recovery is unavailable and no replacement workflow is invented.
- Strict throttling and lockout protect the six-digit credential.
- Light and dark themes retain the same structure and meaning.
- Semantic color tokens are used instead of raw color values.
- Teal is reserved for the primary action, focus, or selection.
- Resting surfaces are flat, bordered, and shadowless.
- There are no gradients, glows, glass effects, illustrations, fake customer records, or decorative calendar previews.
- Lora may be used for the sparse authentication headline only. Form labels, controls, errors, and body copy use Figtree.
- The experience remains usable in narrow desktop windows and at 200% zoom.
- All controls are keyboard operable and target WCAG 2.2 AA.

## 4. Routes and Session Behavior

### 4.1 Canonical routes

- `GET /login` renders Login for unauthenticated users.
- `GET /register` renders Register for unauthenticated users.
- `GET /sign-in` permanently redirects to `/login`.
- `GET /sign-up` permanently redirects to `/register`.

### 4.2 Authenticated route behavior

The Login and Register server pages check the current Supabase user before rendering. An authenticated user is redirected to `/` and does not see an auth form.

### 4.3 Successful submission

A successful login or registration:

1. Establishes the Supabase session through SSR cookies.
2. Clears relevant failed-attempt counters.
3. Redirects to `/` from the Server Action.

The existing `proxy.ts` remains responsible for session refresh.

## 5. Interface Design

### 5.1 Shared auth shell

Both pages use one shared, full-height auth shell:

- A centered outer container with deliberate empty space appropriate to authentication.
- A two-column composition at wide widths.
- A quiet orientation area on the left.
- One bordered form surface on the right, approximately `400–440px` wide.
- No nested card stack and no resting shadow.
- At narrow widths, the orientation block condenses above the form and the form remains full-width within safe page padding.

The shell respects the active theme rather than forcing dark mode. The dark theme remains the signature expression through the existing semantic tokens.

### 5.2 Orientation content

The orientation block contains:

- The Scheduler wordmark.
- One restrained Lora headline.
- One short factual sentence describing Scheduler as a private workspace for scheduling and rescheduling callbacks.

It does not contain marketing metrics, feature cards, customer examples, decorative data, or claims about employee verification.

### 5.3 Login content

- Heading: `Return to your callbacks`
- Company ID label and control.
- Helper text: `Use the format E12345.`
- One masked six-digit PIN control.
- Primary action: `Log in`
- Secondary link: `Need an account? Register`
- Quiet note: PIN recovery is not currently available.

### 5.4 Registration content

- Heading: `Create your callback workspace`
- Company ID label and control.
- Helper text: `Use the format E12345.`
- Masked six-digit PIN control.
- Masked six-digit Confirm PIN control.
- Factual disclosure that registration claims the Company ID but does not verify employee identity.
- Primary action: `Create account`
- Secondary link: `Already registered? Log in`

### 5.5 Form behavior

- Company ID input accepts ordinary text entry and paste, uses an uppercase visual value, and normalizes before validation.
- PIN controls accept numeric keyboard input and paste.
- The visually segmented PIN remains one understandable field to assistive technology.
- PIN values are masked and are not persisted in browser storage or general application state.
- Validation occurs on blur where useful and always on submit. It does not produce disruptive errors on every keystroke.
- Failed submission preserves Company ID and clears PIN fields.
- Submit buttons preserve their width while pending, expose an accessible loading name, and prevent repeat submission.
- Field errors are rendered directly below the source control.
- Form-level errors use an assertive live region without repeating the PIN or other sensitive values.
- Focus moves to the first invalid field after client validation and to the form-level error after a server failure when appropriate.

## 6. Component and Module Boundaries

### 6.1 App routes

- `app/(auth)/layout.tsx` provides auth-only layout structure where route-level composition is useful.
- `app/(auth)/login/page.tsx` performs the session guard and renders Login.
- `app/(auth)/register/page.tsx` performs the session guard and renders Register.

The route group does not affect public URLs.

### 6.2 Auth components

- `components/auth/auth-shell.tsx` owns the orientation block and responsive shell.
- `components/auth/login-form.tsx` owns Login fields and form-state rendering.
- `components/auth/register-form.tsx` owns Register fields and form-state rendering.
- Small shared auth field components may be extracted only when they remove real duplication without hiding labels, descriptions, or errors.

### 6.3 UI primitives

Reuse existing primitives and add missing shadcn-compatible primitives:

- `components/ui/input.tsx`
- `components/ui/label.tsx`
- `components/ui/input-otp.tsx`

The existing `Button` remains the canonical action component.

### 6.4 Auth domain modules

- `lib/auth/schema.ts` defines shared Zod schemas and public field-error types.
- `lib/auth/identity.ts` normalizes Company IDs and performs the deterministic synthetic-email mapping.
- `lib/auth/actions.ts` exposes Login and Register Server Actions.
- `lib/auth/errors.ts` translates internal and Supabase failures into the small public error vocabulary.
- `lib/auth/rate-limit.ts` creates HMAC keys, reads the Vercel client source, and calls restricted atomic database functions.
- `lib/supabase/admin.ts` creates the server-only service-role client.

Server-only modules use the framework's server-only guard and are never imported by Client Components.

## 7. Authentication Flow

### 7.1 Shared validation

The Server Action is authoritative. Client validation may improve immediacy but cannot replace server validation.

Company ID processing:

1. Trim surrounding whitespace.
2. Convert to uppercase.
3. Validate against `^E\d{5}$`.
4. Derive the lowercase synthetic email using the fixed `.invalid` domain.

PIN processing:

1. Read as a string so leading zeroes remain valid.
2. Validate against `^\d{6}$`.
3. On registration, compare PIN and Confirm PIN with a field-level mismatch error.

### 7.2 Login

1. Validate input.
2. Read the Vercel client source from `x-vercel-forwarded-for` in production. In local development, use a fixed `local-development` source bucket; do not trust arbitrary forwarded headers as production identity outside Vercel.
3. Create separate HMAC keys for the normalized Company ID and Vercel client source using `AUTH_RATE_LIMIT_SECRET`.
4. Check the Company ID account-lockout bucket and the source-wide abuse bucket.
5. Call `supabase.auth.signInWithPassword` using the synthetic email and PIN.
6. On failure, atomically record failures and return `The company ID or PIN is incorrect.` unless a lockout threshold has now been reached.
7. On success, reset relevant counters and redirect to `/`.

### 7.3 Registration

1. Validate Company ID, PIN, and Confirm PIN.
2. Resolve and HMAC the Vercel client source.
3. Check the registration source bucket.
4. Call `supabase.auth.signUp` using the synthetic email and PIN.
5. Include the normalized Company ID in user metadata for display/reference only. Authorization continues to use `auth.uid()` and never trusts this metadata.
6. If Supabase reports an existing synthetic email, return the claimed-ID error.
7. If Supabase returns a user but no session, return a configuration error explaining that account creation could not be completed. Do not report success. This protects against accidentally enabled email confirmation for an unreachable synthetic address.
8. On success, clear relevant counters and redirect to `/`.

### 7.4 Public error vocabulary

Login may return:

- Invalid Company ID format.
- Invalid PIN format.
- Generic invalid credentials.
- Temporary lockout with a retry time.
- Service unavailable/configuration failure with a retry instruction.

Registration may return:

- Invalid Company ID format.
- Invalid PIN format.
- PIN mismatch.
- Company ID already claimed.
- Temporary registration throttle with a retry time.
- Service unavailable/configuration failure with a retry instruction.

Raw Supabase messages, internal synthetic emails, stack traces, HMAC keys, IP values, and database details never reach the browser.

## 8. Rate Limiting and Lockout

### 8.1 Approved defaults

Defaults are configurable through server-only environment variables but ship as:

- Login account failures: 5 attempts in 15 minutes.
- Account lockout: 15 minutes after the fifth failed attempt.
- Login source-wide failures: 20 failed attempts per client source across all Company IDs in 15 minutes.
- Source-wide login lockout: 15 minutes after the twentieth failed attempt.
- Registration attempts: 5 attempts per client source in 15 minutes.

Configuration must reject non-positive or nonsensical values at startup/use rather than silently disabling protection.

### 8.2 Stored data

Add an RLS-enabled `public.auth_rate_limits` table containing only:

- A scope enum or constrained text value.
- An HMAC-derived key.
- Window start and expiry timestamps.
- Failure/attempt count.
- Lockout-until timestamp where applicable.
- Maintenance timestamps.

The table stores no raw Company ID, synthetic email, IP address, or PIN.

### 8.3 Access control and atomicity

- Enable RLS.
- Define no `anon` or `authenticated` policies.
- Revoke direct table access from `anon` and `authenticated`.
- Add SQL functions that atomically inspect/consume and reset buckets.
- Revoke function execution from `public`, `anon`, and `authenticated`.
- Grant function execution only to `service_role`.
- Invoke the functions only through `lib/supabase/admin.ts`.
- Expired rows may be deleted opportunistically by the restricted functions; no new scheduler service is required for this scope.

### 8.4 Client-source handling

Production runs on Vercel. Use `x-vercel-forwarded-for`, which Vercel documents as equivalent to its client IP value and resilient when an upstream proxy rewrites `x-forwarded-for`.

- Parse and validate a single IP value before hashing.
- If the header is unexpectedly absent or invalid in production, use a shared `unknown-production-source` bucket. Do not skip source throttling.
- Local development uses `local-development`.
- Company ID and client-source values use separate scope-prefixed HMAC-SHA-256 keys with `AUTH_RATE_LIMIT_SECRET`.
- The source-wide key is reused across attempted Company IDs so one source cannot evade throttling by rotating IDs.
- HMAC storage prevents values from being reversed through a raw hash lookup.

## 9. Supabase and Environment Requirements

Required existing public variables:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`

Required new server-only variables:

- `SUPABASE_SERVICE_ROLE_KEY`
- `AUTH_RATE_LIMIT_SECRET`

Optional server-only override variables may configure the approved rate-limit numbers. Defaults remain active when overrides are absent.

Supabase configuration requirements:

- Email/password authentication enabled.
- Email confirmation disabled for this project because synthetic `.invalid` addresses cannot receive confirmation mail.
- The migration applied before production auth traffic is enabled.
- The service-role key configured only in Vercel server environment variables and never prefixed with `NEXT_PUBLIC_`.

Documentation must describe these requirements without printing secret values.

## 10. Dependencies and Form State

Add:

- `zod` for authoritative validation and typed public action state.
- The shadcn Input OTP primitive and its required `input-otp` package.
- Vitest and Testing Library dependencies for unit and component coverage.

Do not add React Hook Form. These forms are fixed, small, and submit-oriented; React 19 native forms with `useActionState` and Server Actions provide the required pending and error flow with less indirection.

Before implementation, read the installed Next.js 16.2.6 documentation under `node_modules/next/dist/docs/` for Server Actions/forms, redirects, `headers()`, cookies, and auth/session patterns, as required by `AGENTS.md`.

## 11. Accessibility

- Every field has a persistent visible label.
- Helper and error text are connected with `aria-describedby`.
- Invalid controls set `aria-invalid`.
- The segmented PIN input exposes one understandable accessible field.
- Paste is allowed for Company ID and PIN.
- Focus-visible styling uses the semantic ring token.
- Primary actions are at least 36px high; all pointer targets are at least 32px.
- Form-level errors use a live region.
- Pending state is communicated textually and does not rely on animation.
- Reduced-motion preferences are respected.
- Heading order remains logical in both wide and stacked layouts.
- The page remains operable by keyboard and at 200% zoom.

## 12. Testing and Validation

### 12.1 Unit tests

Cover:

- Company ID trimming, uppercase normalization, and validation.
- Leading-zero PIN handling and exact six-digit validation.
- Registration PIN mismatch.
- Deterministic synthetic-email generation.
- HMAC key determinism and separation between scopes.
- Rate-limit environment parsing.
- Public error translation without sensitive leakage.

### 12.2 Server Action tests

Use injected or mocked auth and rate-limit adapters to cover:

- Successful login and redirect.
- Successful registration and redirect.
- Invalid credentials remain generic.
- Company ID already claimed.
- Account lockout before Supabase password verification.
- Failure that reaches the threshold returns lockout state.
- Registration source throttling.
- Missing configuration.
- Registration returning no session because email confirmation is enabled.
- PIN fields are not included in logs or public action state.

### 12.3 Component tests

Cover:

- Correct labels and descriptions.
- Numeric PIN entry and paste.
- PIN and Confirm PIN mismatch display.
- Pending button state and repeat-submit prevention.
- Accessible field and form-level errors.
- Links between Login and Register.

### 12.4 Project validation

Run:

- `pnpm test`
- `pnpm typecheck`
- `pnpm lint`
- `pnpm build`

A real Supabase smoke test is required after the migration and Vercel environment variables are configured. Automated local tests do not claim that production Supabase configuration has been verified.

## 13. Acceptance Criteria

Implementation is complete when:

- `/login` and `/register` render the approved responsive auth design.
- `/sign-in` and `/sign-up` redirect to canonical routes.
- An authenticated user visiting an auth page is redirected to `/`.
- Valid registration creates a Supabase Auth account and session using the synthetic mapping.
- A duplicate Company ID cannot be registered.
- Valid credentials establish a session and redirect to `/`.
- Invalid login credentials do not reveal whether the Company ID exists.
- PIN and Confirm PIN are required only on registration.
- PINs are never stored or logged by application code.
- The approved database-backed limits and lockout are enforced atomically.
- No raw client IP is stored.
- Missing or unsafe configuration fails visibly rather than bypassing protection.
- PIN recovery, employee verification, and unapproved administrative flows are absent.
- Required automated checks pass without new warnings.
