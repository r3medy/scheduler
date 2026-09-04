# Server-Side Authentication Registration Design

## Goal

Make Company ID and six-digit PIN registration work reliably with the existing
Supabase project configuration while preserving Supabase Auth as the credential
authority and the existing database-backed rate limits.

## Context

The application maps a Company ID such as `E12345` to a private synthetic Auth
identifier such as `e12345@auth.scheduler.invalid`. Public Supabase `signUp()`
enters the email-delivery and confirmation flow, which is inappropriate for
these intentionally non-deliverable identifiers and currently returns a generic
registration failure.

A live project check proved that the server-only Supabase Admin API can create
and confirm this synthetic user, and that the ordinary password grant can then
sign the same user in and issue access and refresh tokens.

## Architecture

Registration remains a Next.js Server Action. After validation and the existing
registration-source rate-limit check, it uses the server-only service-role
client to create the Supabase Auth user with `email_confirm: true`. It then uses
the request-scoped SSR client to call `signInWithPassword`, allowing Supabase SSR
to write the normal authentication cookies.

Login continues to use `signInWithPassword` directly. No public application
table stores the PIN, and no new SQL objects are required for authentication.

## Components

### Authentication adapters

The dependency-injected authentication service will distinguish between:

- A session adapter that signs users in with a synthetic email and PIN.
- An admin adapter that creates a confirmed user through
  `auth.admin.createUser`.

The admin adapter is instantiated only from the server-only Supabase client.
The service-role key must never enter client components or public environment
variables.

### Registration flow

1. Validate Company ID, PIN, and PIN confirmation.
2. Check the existing registration-source rate-limit bucket.
3. Derive the deterministic synthetic email from the normalized Company ID.
4. Create a Supabase Auth user with the PIN as the Auth password,
   `email_confirm: true`, and normalized `company_id` user metadata.
5. If the synthetic email already exists, return the approved claimed-ID error.
6. Sign the newly created user in with the ordinary SSR client so session cookies
   are written.
7. Reset the registration rate-limit bucket and redirect to the authenticated
   application.

The unique synthetic Auth email remains the atomic Company ID claim, including
when concurrent registration requests race.

### Partial failure behavior

If user creation succeeds but immediate sign-in fails, the account remains
valid instead of being deleted. The registration response tells the user that
the account was created and asks them to sign in with the same credentials.
This avoids turning a transient session failure into an inconsistent or lost
Company ID claim.

Failures before user creation continue to count against the registration-source
bucket. A successful account creation is not represented as a failed signup.

## Public errors

- Duplicate Auth identity: `That company ID has already been claimed.`
- Successful creation followed by failed automatic sign-in:
  `Your account was created. Sign in with your Company ID and PIN.`
- Other unavailable Admin/Auth operations:
  `Authentication is temporarily unavailable. Try again shortly.`

Internal Supabase errors, credentials, synthetic emails, and service details are
not exposed in form state.

## Testing

Unit tests will prove that registration:

- Calls Admin user creation with the normalized synthetic email, PIN,
  `email_confirm: true`, and Company ID metadata.
- Signs in after successful creation and resets the rate-limit bucket.
- Returns the claimed-ID message for duplicate users.
- Returns the account-created message when immediate sign-in fails.
- Does not call sign-in when Admin user creation fails.

Existing login, validation, and rate-limit tests remain green. Verification will
also include type-checking/build checks and one live end-to-end registration and
login using the reserved `E00000` test identity, followed by deletion of only
that test user.

## Product and security invariants

- Supabase Auth remains the credential authority.
- PINs are never stored in application tables or logs.
- Authentication traffic remains protected by the existing database-backed
  throttling.
- The service-role key remains server-only.
- The flow does not claim to verify employee identity.
- Callback ownership continues to use the resulting Supabase Auth user ID.
- Authentication requires no additional public SQL table.
