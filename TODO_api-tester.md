# API Testing Plan — Scheduler Auth and Data API

## Context

- The acceptance target is the isolated local Supabase Auth/PostgREST stack.
- The harness uses synthetic accounts and an external env file; it never prints keys,
  passwords, PINs, access tokens, emails, or response bodies.
- Gateway CRUD/RLS/idempotency/admission checks run through the same `/auth/v1` and
  `/rest/v1` paths used by the application. Direct Auth wrong-PIN probes bypass that
  gateway so provider behavior is measured separately.

## Test Items

- [x] **APIT-ITEM-1.1 [JWT issuance]**
  - **Expected Output**: Both synthetic accounts receive HTTP 200 and JWTs.
- [x] **APIT-ITEM-1.2 [CRUD and owner RLS]**
  - **Expected Output**: Owner insert/read/update/delete succeeds; another owner cannot
    read, delete, or insert a row owned by the first user; anonymous reads are denied.
- [x] **APIT-ITEM-1.3 [Durable callback idempotency]**
  - **Expected Output**: Same request key returns the original row with `created=false`
    and `same_payload=true`; a changed payload reports `same_payload=false`.
- [x] **APIT-ITEM-1.4 [Admission RPC grants]**
  - **Expected Output**: Authenticated user access is denied; service-role access admits
    one request and releases its token.
- [ ] **APIT-ITEM-1.5 [Direct Auth wrong-PIN throttle]**
  - **Expected Output**: Emit status counts for 40 direct wrong-PIN requests. A local
    result without HTTP 429 is evidence of a provider-control gap, not proof about the
    hosted Supabase gateway.

## Latest Evidence

- The saved harness reported `functionalPassed=true` against the loopback gateway.
- Both synthetic users received HTTP 200 JWT sessions. Counted owner pagination returned
  HTTP 206 with `Content-Range: 0-4/1002`; owner CRUD returned 201/200/204; the other
  user saw zero rows and cross-owner insert returned 403; anonymous read returned 401.
- Idempotency returned created=true, then created=false/same_payload=true, and a changed
  payload returned same_payload=false. Authenticated admission was denied with 403;
  service-role admission returned 200/allowed=true and release returned 204.
- Direct Auth wrong-PIN probes produced `400: 40` and `429: 0` in about four seconds.
  `directWrongPinThrottleObserved=false`; this local result does not establish the
  hosted provider/WAF policy and keeps the overall `passed` result false.
- A direct signup using a non-six-digit password returned a session. This only shows
  that GoTrue itself accepts general passwords; it does not claim the application PIN
  policy or direct Auth brute-force boundary is safe.

## Commands

```powershell
node supabase/tests/auth-rest-acceptance.mjs `
  --env C:\Users\remedy\AppData\Local\Temp\schedulerv2-auth-acceptance-20260908\app.env `
  --accounts C:\Users\remedy\AppData\Local\Temp\schedulerv2-auth-acceptance-20260908\synthetic-accounts.json `
  --base http://127.0.0.1:56021 `
  --direct-auth http://127.0.0.1:56031 `
  --wrong-attempts 40
```

## Release Readiness Checklist

- [ ] Hosted provider or WAF direct Auth throttle is configured and tested on the
  public Auth path.
- [ ] Browser acceptance covers authenticated navigation and native notification delivery.
- [ ] Results are recorded against the exact release artifact and migration set.
