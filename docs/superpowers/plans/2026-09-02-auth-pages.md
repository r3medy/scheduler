# Login and Registration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build polished `/login` and `/register` pages backed by Supabase Auth, deterministic Company ID mapping, and database-backed Vercel-aware throttling and lockout.

**Architecture:** Next.js Server Components guard auth routes, small Client Components use React 19 `useActionState`, and Server Actions validate all input before calling a narrow auth service. Supabase SSR owns user sessions while a server-only service-role client invokes restricted Postgres functions for atomic rate-limit buckets.

**Tech Stack:** Next.js 16.2.6 App Router, React 19.2, TypeScript, Tailwind CSS v4, shadcn/Base UI, Input OTP, Zod, Supabase SSR/JS, Postgres, Vitest, Testing Library

---

## Constraints for every task

- Read and follow `AGENTS.md`, `PRODUCT.md`, `DESIGN.md`, and `docs/superpowers/specs/2026-09-02-auth-pages-design.md`.
- Preserve the user-facing Company ID + PIN experience; never expose the synthetic email.
- Never store, log, serialize, or return a PIN.
- Never claim that registration verifies employee identity.
- Do not invent PIN recovery.
- Use semantic design tokens and the existing Base Maia component preset.
- Use `FieldGroup` + `Field`; apply `data-invalid` to `Field` and `aria-invalid` to controls.
- Keep `redirect()` outside caught error paths because Next.js implements it by throwing.
- Await Next.js 16 `headers()` and `cookies()`.
- Do not commit unless the user explicitly requests it. Commit steps are intentionally omitted from this plan.

## File map

### Create

- `vitest.config.ts`: Vitest alias, jsdom, and test setup.
- `vitest.setup.ts`: Testing Library DOM matchers.
- `lib/auth/schema.ts`: Zod schemas, normalized inputs, and serializable action-state types.
- `lib/auth/schema.test.ts`: credential validation tests.
- `lib/auth/identity.ts`: deterministic synthetic-email mapping.
- `lib/auth/identity.test.ts`: mapping tests.
- `lib/auth/rate-limit-config.ts`: validated limit defaults and HMAC key helpers.
- `lib/auth/rate-limit-config.test.ts`: config, HMAC, and Vercel-source tests.
- `lib/auth/rate-limit.ts`: server-only restricted RPC adapter.
- `lib/auth/errors.ts`: safe Supabase-to-public error translation.
- `lib/auth/service.ts`: dependency-injected login/register orchestration.
- `lib/auth/service.test.ts`: auth, lockout, duplicate, and confirmation tests.
- `lib/auth/actions.ts`: public Server Actions and success redirects.
- `lib/auth/actions.test.ts`: validation, sensitive-state, and redirect tests.
- `lib/auth/session.ts`: auth-page session guard.
- `lib/supabase/admin.ts`: server-only privileged Supabase client.
- `components/auth/auth-shell.tsx`: shared quiet split-screen composition.
- `components/auth/pin-field.tsx`: masked accessible six-digit PIN field.
- `components/auth/login-form.tsx`: Login form and action-state rendering.
- `components/auth/register-form.tsx`: Register form and disclosure.
- `components/auth/auth-forms.test.tsx`: form labels, masking, paste, pending, and errors.
- `components/auth/auth-skeleton.tsx`: structure-matching loading state.
- `app/(auth)/layout.tsx`: auth route-group layout.
- `app/(auth)/loading.tsx`: auth loading boundary.
- `app/(auth)/login/page.tsx`: guarded Login page.
- `app/(auth)/register/page.tsx`: guarded Register page.
- `supabase/migrations/20260902000000_auth_rate_limits.sql`: private rate-limit state and restricted atomic functions.

### Modify

- `package.json`: test script and dependencies.
- `pnpm-lock.yaml`: resolved dependencies.
- `next.config.ts`: permanent legacy auth redirects.
- `app/page.tsx`: canonical `/login` link.
- `lib/supabase/database.types.ts`: rate-limit table and RPC types.
- `components/ui/input-otp.tsx`: mask-capable slot rendering after generation.
- `.env.example`: names and comments for required server-only variables.
- `README.md`: Supabase auth configuration and migration instructions.

### Generate with shadcn CLI

- `components/ui/card.tsx`
- `components/ui/field.tsx`
- `components/ui/input.tsx`
- `components/ui/input-otp.tsx`
- `components/ui/label.tsx`
- `components/ui/spinner.tsx`

## Task 1: Install primitives and establish the test harness

**Files:**
- Modify: `package.json`
- Modify: `pnpm-lock.yaml`
- Create: `vitest.config.ts`
- Create: `vitest.setup.ts`
- Generate: `components/ui/card.tsx`
- Generate: `components/ui/field.tsx`
- Generate: `components/ui/input.tsx`
- Generate: `components/ui/input-otp.tsx`
- Generate: `components/ui/label.tsx`
- Generate: `components/ui/spinner.tsx`

- [ ] **Step 1: Confirm the current baseline**

Run:

```bash
pnpm typecheck
pnpm lint
```

Expected: both commands exit with code 0. Record unrelated pre-existing failures before changing source.

- [ ] **Step 2: Install runtime and test dependencies**

Run:

```bash
pnpm add zod input-otp
pnpm add -D vitest jsdom @testing-library/react @testing-library/user-event @testing-library/jest-dom
```

Expected: `package.json` and `pnpm-lock.yaml` contain the new dependencies.

- [ ] **Step 3: Add the current Base UI shadcn primitives**

Run:

```bash
pnpm dlx shadcn@latest add card field input input-otp label spinner
```

Expected: the six generated files use the existing `base-maia` preset, `@/` aliases, Base UI where applicable, and Tabler icons.

- [ ] **Step 4: Add the test script**

Make the `scripts` section in `package.json` contain:

```json
{
  "dev": "next dev",
  "build": "next build",
  "start": "next start",
  "lint": "eslint",
  "format": "prettier --write \"**/*.{ts,tsx}\"",
  "typecheck": "tsc --noEmit",
  "test": "vitest run"
}
```

- [ ] **Step 5: Configure Vitest**

Create `vitest.config.ts`:

```ts
import { fileURLToPath } from "node:url"
import { defineConfig } from "vitest/config"

export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL(".", import.meta.url)),
    },
  },
  test: {
    environment: "jsdom",
    setupFiles: ["./vitest.setup.ts"],
    include: ["**/*.{test,spec}.{ts,tsx}"],
    exclude: ["node_modules/**", ".next/**"],
    clearMocks: true,
  },
})
```

Create `vitest.setup.ts`:

```ts
import "@testing-library/jest-dom/vitest"
```

- [ ] **Step 6: Verify generated primitives and harness**

Run:

```bash
pnpm typecheck
pnpm lint
pnpm exec vitest run --passWithNoTests
```

Expected: all commands exit with code 0.

## Task 2: Define credential validation and identity mapping with tests

**Files:**
- Create: `lib/auth/schema.test.ts`
- Create: `lib/auth/identity.test.ts`
- Create: `lib/auth/schema.ts`
- Create: `lib/auth/identity.ts`

- [ ] **Step 1: Write failing schema tests**

Create `lib/auth/schema.test.ts`:

```ts
import { describe, expect, it } from "vitest"

import {
  loginSchema,
  registerSchema,
  toFieldErrors,
} from "@/lib/auth/schema"

describe("loginSchema", () => {
  it("normalizes a valid company ID and preserves a leading-zero PIN", () => {
    expect(loginSchema.parse({ companyId: " e12345 ", pin: "012345" })).toEqual({
      companyId: "E12345",
      pin: "012345",
    })
  })

  it.each(["12345", "E1234", "E123456", "A12345"])(
    "rejects company ID %s",
    (companyId) => {
      expect(loginSchema.safeParse({ companyId, pin: "123456" }).success).toBe(
        false
      )
    }
  )

  it.each(["12345", "1234567", "12A456"])("rejects PIN %s", (pin) => {
    expect(loginSchema.safeParse({ companyId: "E12345", pin }).success).toBe(
      false
    )
  })
})

describe("registerSchema", () => {
  it("places a mismatch error on confirmPin", () => {
    const result = registerSchema.safeParse({
      companyId: "E12345",
      pin: "123456",
      confirmPin: "654321",
    })

    expect(result.success).toBe(false)
    if (!result.success) {
      expect(toFieldErrors(result.error).confirmPin).toContain(
        "Enter the same PIN again."
      )
    }
  })
})
```

Create `lib/auth/identity.test.ts`:

```ts
import { describe, expect, it } from "vitest"

import { toSyntheticEmail } from "@/lib/auth/identity"

describe("toSyntheticEmail", () => {
  it("maps a normalized Company ID deterministically", () => {
    expect(toSyntheticEmail("E12345")).toBe("e12345@auth.scheduler.invalid")
  })
})
```

- [ ] **Step 2: Run tests and verify they fail**

Run:

```bash
pnpm test -- lib/auth/schema.test.ts lib/auth/identity.test.ts
```

Expected: FAIL because `schema.ts` and `identity.ts` do not exist.

- [ ] **Step 3: Implement schemas and serializable action state**

Create `lib/auth/schema.ts`:

```ts
import { z } from "zod"

const COMPANY_ID_MESSAGE = "Use a company ID in the format E12345."
const PIN_MESSAGE = "Enter a six-digit PIN."

export const companyIdSchema = z
  .string()
  .trim()
  .transform((value) => value.toUpperCase())
  .pipe(z.string().regex(/^E\d{5}$/, COMPANY_ID_MESSAGE))

export const pinSchema = z.string().regex(/^\d{6}$/, PIN_MESSAGE)

export const loginSchema = z.object({
  companyId: companyIdSchema,
  pin: pinSchema,
})

export const registerSchema = loginSchema
  .extend({
    confirmPin: pinSchema,
  })
  .superRefine((value, context) => {
    if (value.pin !== value.confirmPin) {
      context.addIssue({
        code: "custom",
        path: ["confirmPin"],
        message: "Enter the same PIN again.",
      })
    }
  })

export type CompanyId = z.infer<typeof companyIdSchema>
export type LoginInput = z.infer<typeof loginSchema>
export type RegisterInput = z.infer<typeof registerSchema>
export type AuthField = "companyId" | "pin" | "confirmPin"
export type AuthFieldErrors = Partial<Record<AuthField, string[]>>

export interface AuthActionState {
  status: "idle" | "error"
  submissionId: number
  companyId: string
  fieldErrors?: AuthFieldErrors
  message?: string
}

export const initialAuthActionState: AuthActionState = {
  status: "idle",
  submissionId: 0,
  companyId: "",
}

export function toFieldErrors(error: z.ZodError): AuthFieldErrors {
  const flattened = z.flattenError(error).fieldErrors

  return {
    companyId: flattened.companyId,
    pin: flattened.pin,
    confirmPin: flattened.confirmPin,
  }
}
```

- [ ] **Step 4: Implement the deterministic identity adapter**

Create `lib/auth/identity.ts`:

```ts
import type { CompanyId } from "@/lib/auth/schema"

const AUTH_DOMAIN = "auth.scheduler.invalid"

export function toSyntheticEmail(companyId: CompanyId): string {
  return `${companyId.toLowerCase()}@${AUTH_DOMAIN}`
}
```

- [ ] **Step 5: Run focused tests**

Run:

```bash
pnpm test -- lib/auth/schema.test.ts lib/auth/identity.test.ts
```

Expected: PASS.

## Task 3: Add the restricted Postgres rate-limit store

**Files:**
- Create: `supabase/migrations/20260902000000_auth_rate_limits.sql`
- Modify: `lib/supabase/database.types.ts`
- Create: `lib/supabase/admin.ts`

- [ ] **Step 1: Create the migration**

Create `supabase/migrations/20260902000000_auth_rate_limits.sql` with an RLS-protected table and restricted functions. Use this shape and behavior:

```sql
create table public.auth_rate_limits (
  scope text not null check (
    scope in ('login_account', 'login_source', 'register_source')
  ),
  bucket_key text not null check (bucket_key ~ '^[a-f0-9]{64}$'),
  attempt_count integer not null default 0 check (attempt_count >= 0),
  window_started_at timestamptz not null default now(),
  window_expires_at timestamptz not null,
  locked_until timestamptz,
  updated_at timestamptz not null default now(),
  primary key (scope, bucket_key)
);

alter table public.auth_rate_limits enable row level security;
revoke all on table public.auth_rate_limits from public, anon, authenticated;
grant all on table public.auth_rate_limits to service_role;

create or replace function public.apply_auth_rate_limit(
  p_scope text,
  p_bucket_key text,
  p_limit integer,
  p_window_seconds integer,
  p_lock_seconds integer,
  p_mode text
)
returns table (allowed boolean, retry_after_seconds integer)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_now timestamptz := clock_timestamp();
  v_row public.auth_rate_limits%rowtype;
  v_next_count integer;
begin
  if p_scope not in ('login_account', 'login_source', 'register_source')
    or p_bucket_key !~ '^[a-f0-9]{64}$'
    or p_limit <= 0
    or p_window_seconds <= 0
    or p_lock_seconds <= 0
    or p_mode not in ('check', 'failure', 'consume') then
    raise exception 'Invalid auth rate-limit arguments';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(p_scope || ':' || p_bucket_key, 0)
  );

  select *
  into v_row
  from public.auth_rate_limits
  where scope = p_scope and bucket_key = p_bucket_key
  for update;

  if found and v_row.window_expires_at <= v_now
    and coalesce(v_row.locked_until, v_now) <= v_now then
    delete from public.auth_rate_limits
    where scope = p_scope and bucket_key = p_bucket_key;
    v_row := null;
  end if;

  if v_row.locked_until is not null and v_row.locked_until > v_now then
    return query select false,
      greatest(1, ceil(extract(epoch from (v_row.locked_until - v_now)))::integer);
    return;
  end if;

  if p_mode = 'check' then
    return query select true, 0;
    return;
  end if;

  if p_mode = 'consume' and v_row.scope is not null
    and v_row.attempt_count >= p_limit then
    return query select false,
      greatest(1, ceil(extract(epoch from (v_row.window_expires_at - v_now)))::integer);
    return;
  end if;

  v_next_count := coalesce(v_row.attempt_count, 0) + 1;

  insert into public.auth_rate_limits (
    scope,
    bucket_key,
    attempt_count,
    window_started_at,
    window_expires_at,
    locked_until,
    updated_at
  ) values (
    p_scope,
    p_bucket_key,
    v_next_count,
    coalesce(v_row.window_started_at, v_now),
    coalesce(v_row.window_expires_at, v_now + make_interval(secs => p_window_seconds)),
    case
      when p_mode = 'failure' and v_next_count >= p_limit
        then v_now + make_interval(secs => p_lock_seconds)
      else null
    end,
    v_now
  )
  on conflict (scope, bucket_key) do update set
    attempt_count = excluded.attempt_count,
    locked_until = excluded.locked_until,
    updated_at = excluded.updated_at;

  if p_mode = 'failure' and v_next_count >= p_limit then
    return query select false, p_lock_seconds;
  else
    return query select true, 0;
  end if;
end;
$$;

create or replace function public.reset_auth_rate_limit(
  p_scope text,
  p_bucket_key text
)
returns void
language sql
security definer
set search_path = ''
as $$
  delete from public.auth_rate_limits
  where scope = p_scope and bucket_key = p_bucket_key;
$$;

revoke execute on function public.apply_auth_rate_limit(text, text, integer, integer, integer, text)
  from public, anon, authenticated;
revoke execute on function public.reset_auth_rate_limit(text, text)
  from public, anon, authenticated;

grant execute on function public.apply_auth_rate_limit(text, text, integer, integer, integer, text)
  to service_role;
grant execute on function public.reset_auth_rate_limit(text, text)
  to service_role;
```

- [ ] **Step 2: Extend generated database types**

Add `auth_rate_limits` beside `callbacks` in `Database["public"]["Tables"]`, and replace the empty Functions type with:

```ts
Functions: {
  apply_auth_rate_limit: {
    Args: {
      p_scope: "login_account" | "login_source" | "register_source"
      p_bucket_key: string
      p_limit: number
      p_window_seconds: number
      p_lock_seconds: number
      p_mode: "check" | "failure" | "consume"
    }
    Returns: Array<{
      allowed: boolean
      retry_after_seconds: number
    }>
  }
  reset_auth_rate_limit: {
    Args: {
      p_scope: "login_account" | "login_source" | "register_source"
      p_bucket_key: string
    }
    Returns: undefined
  }
}
```

Use the exact table row fields from the migration for `Row`, optional defaults for `Insert`, `Partial<Insert>` for `Update`, and `Relationships: []`.

- [ ] **Step 3: Add the server-only privileged client**

Create `lib/supabase/admin.ts`:

```ts
import "server-only"

import { createClient } from "@supabase/supabase-js"

import type { Database } from "@/lib/supabase/database.types"

export function createSupabaseAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!url || !serviceRoleKey) {
    throw new Error("Supabase admin configuration is missing")
  }

  return createClient<Database>(url, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      detectSessionInUrl: false,
      persistSession: false,
    },
  })
}
```

- [ ] **Step 4: Validate types**

Run:

```bash
pnpm typecheck
pnpm lint
```

Expected: both commands exit with code 0.

## Task 4: Implement Vercel-aware rate-limit keys and RPC orchestration

**Files:**
- Create: `lib/auth/rate-limit-config.test.ts`
- Create: `lib/auth/rate-limit-config.ts`
- Create: `lib/auth/rate-limit.ts`

- [ ] **Step 1: Write failing pure helper tests**

Create `lib/auth/rate-limit-config.test.ts`:

```ts
import { describe, expect, it } from "vitest"

import {
  createBucketKey,
  getRateLimitConfig,
  resolveClientSource,
} from "@/lib/auth/rate-limit-config"

describe("resolveClientSource", () => {
  it("uses Vercel's protected forwarded IP in production", () => {
    const headers = new Headers({ "x-vercel-forwarded-for": "203.0.113.8" })
    expect(resolveClientSource(headers, true)).toBe("203.0.113.8")
  })

  it("uses a shared safe bucket for an invalid production header", () => {
    const headers = new Headers({ "x-vercel-forwarded-for": "not-an-ip" })
    expect(resolveClientSource(headers, true)).toBe("unknown-production-source")
  })

  it("uses one local development bucket outside Vercel", () => {
    expect(resolveClientSource(new Headers(), false)).toBe("local-development")
  })
})

describe("createBucketKey", () => {
  it("is deterministic and scope-separated", () => {
    const secret = "a".repeat(32)
    const first = createBucketKey("login_account", "E12345", secret)
    expect(first).toHaveLength(64)
    expect(first).toBe(createBucketKey("login_account", "E12345", secret))
    expect(first).not.toBe(createBucketKey("login_source", "E12345", secret))
  })
})

describe("getRateLimitConfig", () => {
  it("returns approved defaults", () => {
    expect(getRateLimitConfig({ AUTH_RATE_LIMIT_SECRET: "a".repeat(32) })).toMatchObject({
      loginAccountLimit: 5,
      loginSourceLimit: 20,
      registrationSourceLimit: 5,
      windowSeconds: 900,
      lockSeconds: 900,
    })
  })
})
```

- [ ] **Step 2: Run the test and verify failure**

Run:

```bash
pnpm test -- lib/auth/rate-limit-config.test.ts
```

Expected: FAIL because `rate-limit-config.ts` does not exist.

- [ ] **Step 3: Implement validated config, source parsing, and HMAC keys**

Create `lib/auth/rate-limit-config.ts` using `node:crypto`, `node:net`, and Zod. Export these exact contracts:

```ts
export type AuthRateLimitScope =
  | "login_account"
  | "login_source"
  | "register_source"

export interface RateLimitConfig {
  secret: string
  loginAccountLimit: number
  loginSourceLimit: number
  registrationSourceLimit: number
  windowSeconds: number
  lockSeconds: number
}

export function getRateLimitConfig(
  environment: Record<string, string | undefined> = process.env
): RateLimitConfig

export function resolveClientSource(
  requestHeaders: Headers,
  isVercel = process.env.VERCEL === "1"
): string

export function createBucketKey(
  scope: AuthRateLimitScope,
  value: string,
  secret: string
): string
```

Implementation requirements:

```ts
const environmentSchema = z.object({
  AUTH_RATE_LIMIT_SECRET: z.string().min(32),
  AUTH_LOGIN_ACCOUNT_LIMIT: z.coerce.number().int().positive().default(5),
  AUTH_LOGIN_SOURCE_LIMIT: z.coerce.number().int().positive().default(20),
  AUTH_REGISTRATION_SOURCE_LIMIT: z.coerce.number().int().positive().default(5),
  AUTH_RATE_LIMIT_WINDOW_SECONDS: z.coerce.number().int().positive().default(900),
  AUTH_RATE_LIMIT_LOCK_SECONDS: z.coerce.number().int().positive().default(900),
})
```

`resolveClientSource` must accept one valid IPv4/IPv6 value from `x-vercel-forwarded-for`, return `unknown-production-source` when missing/invalid on Vercel, and return `local-development` outside Vercel. `createBucketKey` must return `createHmac("sha256", secret).update(`${scope}:${value}`).digest("hex")`.

- [ ] **Step 4: Implement the server-only RPC adapter**

Create `lib/auth/rate-limit.ts` with:

```ts
import "server-only"

import { headers } from "next/headers"

import {
  createBucketKey,
  getRateLimitConfig,
  resolveClientSource,
  type AuthRateLimitScope,
} from "@/lib/auth/rate-limit-config"
import type { CompanyId } from "@/lib/auth/schema"
import { createSupabaseAdminClient } from "@/lib/supabase/admin"

export interface LimitDecision {
  allowed: boolean
  retryAfterSeconds: number
}

async function applyLimit(
  scope: AuthRateLimitScope,
  bucketKey: string,
  limit: number,
  mode: "check" | "failure" | "consume"
): Promise<LimitDecision> {
  const config = getRateLimitConfig()
  const client = createSupabaseAdminClient()
  const { data, error } = await client.rpc("apply_auth_rate_limit", {
    p_scope: scope,
    p_bucket_key: bucketKey,
    p_limit: limit,
    p_window_seconds: config.windowSeconds,
    p_lock_seconds: config.lockSeconds,
    p_mode: mode,
  })

  if (error || !data?.[0]) throw new Error("Auth rate-limit service unavailable")

  return {
    allowed: data[0].allowed,
    retryAfterSeconds: data[0].retry_after_seconds,
  }
}
```

Also export a `createRateLimitContext(companyId)` helper that awaits `headers()`, resolves the Vercel source, and creates separate account/source keys. Export `checkLoginLimits`, `recordLoginFailure`, `resetLoginLimits`, and `consumeRegistrationAttempt`. Check and record both login buckets; return the denied decision with the longest retry. Reset both login buckets after success. Registration uses only `register_source` in `consume` mode.

- [ ] **Step 5: Run focused and static checks**

Run:

```bash
pnpm test -- lib/auth/rate-limit-config.test.ts
pnpm typecheck
pnpm lint
```

Expected: all commands exit with code 0.

## Task 5: Build the testable auth service and Server Actions

**Files:**
- Create: `lib/auth/service.test.ts`
- Create: `lib/auth/errors.ts`
- Create: `lib/auth/service.ts`
- Create: `lib/auth/actions.ts`
- Create: `lib/auth/actions.test.ts`
- Create: `lib/auth/session.ts`
- Modify: `lib/supabase/server.ts`

- [ ] **Step 1: Write failing auth-service tests**

Create `lib/auth/service.test.ts`. Define narrow fakes and cover these assertions:

```ts
import { describe, expect, it, vi } from "vitest"

import { createAuthService } from "@/lib/auth/service"

function dependencies() {
  return {
    auth: {
      signInWithPassword: vi.fn(),
      signUp: vi.fn(),
    },
    limits: {
      checkLogin: vi.fn().mockResolvedValue({ allowed: true, retryAfterSeconds: 0 }),
      recordLoginFailure: vi
        .fn()
        .mockResolvedValue({ allowed: true, retryAfterSeconds: 0 }),
      resetLogin: vi.fn().mockResolvedValue(undefined),
      consumeRegistration: vi
        .fn()
        .mockResolvedValue({ allowed: true, retryAfterSeconds: 0 }),
    },
  }
}

describe("auth service", () => {
  it("uses the synthetic email without returning it", async () => {
    const deps = dependencies()
    deps.auth.signInWithPassword.mockResolvedValue({
      data: { session: { access_token: "opaque" } },
      error: null,
    })
    const service = createAuthService(deps)

    await expect(
      service.login({ companyId: "E12345", pin: "012345" })
    ).resolves.toEqual({ ok: true })
    expect(deps.auth.signInWithPassword).toHaveBeenCalledWith({
      email: "e12345@auth.scheduler.invalid",
      password: "012345",
    })
  })

  it("returns generic invalid credentials", async () => {
    const deps = dependencies()
    deps.auth.signInWithPassword.mockResolvedValue({
      data: { session: null },
      error: { code: "invalid_credentials", message: "Invalid login credentials" },
    })

    await expect(
      createAuthService(deps).login({ companyId: "E12345", pin: "123456" })
    ).resolves.toEqual({
      ok: false,
      code: "invalid_credentials",
      message: "The company ID or PIN is incorrect.",
    })
  })

  it("does not call Supabase while the account or source is locked", async () => {
    const deps = dependencies()
    deps.limits.checkLogin.mockResolvedValue({ allowed: false, retryAfterSeconds: 120 })

    const result = await createAuthService(deps).login({
      companyId: "E12345",
      pin: "123456",
    })

    expect(result).toMatchObject({ ok: false, code: "locked", retryAfterSeconds: 120 })
    expect(deps.auth.signInWithPassword).not.toHaveBeenCalled()
  })

  it("reports an already claimed Company ID during registration", async () => {
    const deps = dependencies()
    deps.auth.signUp.mockResolvedValue({
      data: { user: null, session: null },
      error: { code: "user_already_exists", message: "User already registered" },
    })

    await expect(
      createAuthService(deps).register({
        companyId: "E12345",
        pin: "123456",
        confirmPin: "123456",
      })
    ).resolves.toMatchObject({ ok: false, code: "company_id_claimed" })
  })

  it("fails safely when email confirmation prevents a session", async () => {
    const deps = dependencies()
    deps.auth.signUp.mockResolvedValue({
      data: { user: { id: "user-id" }, session: null },
      error: null,
    })

    await expect(
      createAuthService(deps).register({
        companyId: "E12345",
        pin: "123456",
        confirmPin: "123456",
      })
    ).resolves.toMatchObject({ ok: false, code: "configuration" })
  })
})
```

- [ ] **Step 2: Run the service test and verify failure**

Run:

```bash
pnpm test -- lib/auth/service.test.ts
```

Expected: FAIL because `service.ts` does not exist.

- [ ] **Step 3: Implement safe error translation**

Create `lib/auth/errors.ts` with a discriminated public result:

```ts
export type AuthFailureCode =
  | "invalid_credentials"
  | "company_id_claimed"
  | "locked"
  | "configuration"
  | "unavailable"

export type AuthResult =
  | { ok: true }
  | {
      ok: false
      code: AuthFailureCode
      message: string
      retryAfterSeconds?: number
    }

export const invalidCredentials = (): AuthResult => ({
  ok: false,
  code: "invalid_credentials",
  message: "The company ID or PIN is incorrect.",
})

export function isClaimedIdentityError(error: {
  code?: string
  message: string
}): boolean {
  return (
    error.code === "user_already_exists" ||
    error.message.toLowerCase().includes("already registered")
  )
}
```

Add constructors for lockout, configuration, and unavailable failures. Lockout copy must format minutes conservatively with `Math.max(1, Math.ceil(seconds / 60))` and say when another attempt is allowed.

- [ ] **Step 4: Implement the dependency-injected auth service**

Create `lib/auth/service.ts`. Its public dependency contract must contain only the methods used by tests, and `createAuthService(dependencies)` must return:

```ts
{
  login(input: LoginInput): Promise<AuthResult>
  register(input: RegisterInput): Promise<AuthResult>
}
```

Login order: check limits, call `signInWithPassword`, record both failed buckets on error, return lockout if the recorded failure reaches a threshold, otherwise return generic invalid credentials, reset both buckets on success.

Registration order: consume the source attempt, call `signUp` with synthetic email, PIN, and `options.data.company_id`, return claimed-ID only for the documented duplicate error, fail with configuration when `data.user` exists without `data.session`, and return success only with a session.

Catch unavailable rate-limit/Supabase transport failures at this boundary and return safe unavailable copy. Do not catch or stringify the PIN.

- [ ] **Step 5: Update the SSR client for explicit Server Action cookie writes**

Refactor `lib/supabase/server.ts` so `createSupabaseServerClient` continues to use `await cookies()`, `getAll`, and `setAll`. Keep the guarded cookie write because Server Components cannot write, while Server Actions will successfully execute the same `setAll` callback.

- [ ] **Step 6: Implement Server Actions**

Create `lib/auth/actions.ts` with `"use server"`. Each action must:

1. Read only named FormData values.
2. Validate with `safeParse`.
3. Return `AuthActionState` containing normalized Company ID but no PIN.
4. Construct the SSR Supabase client and rate-limit adapter only after validation.
5. Call the auth service.
6. Return safe error state or call `redirect("/")` after the caught work completes.

Use these signatures:

```ts
export async function loginAction(
  previousState: AuthActionState,
  formData: FormData
): Promise<AuthActionState>

export async function registerAction(
  previousState: AuthActionState,
  formData: FormData
): Promise<AuthActionState>
```

Increment `submissionId` for each returned failure so the form can remount PIN controls empty while restoring only Company ID.

- [ ] **Step 7: Test the public Server Action boundary**

Create `lib/auth/actions.test.ts`. Mock `createAuthService`, the Supabase server-client factory, the rate-limit adapter, and `next/navigation`. Cover an invalid form that returns field errors without constructing dependencies, a returned state whose serialized value contains no PIN, and a successful service result that calls `redirect("/")`.

Use a redirect mock that throws the same style of control-flow sentinel as Next.js so the test proves the redirect is not swallowed:

```ts
const mocks = vi.hoisted(() => ({
  login: vi.fn(),
  register: vi.fn(),
  redirect: vi.fn(() => {
    throw new Error("NEXT_REDIRECT")
  }),
}))

vi.mock("next/navigation", () => ({ redirect: mocks.redirect }))
```

For the valid Login case, submit:

```ts
const formData = new FormData()
formData.set("companyId", "E12345")
formData.set("pin", "123456")
mocks.login.mockResolvedValue({ ok: true })

await expect(loginAction(initialAuthActionState, formData)).rejects.toThrow(
  "NEXT_REDIRECT"
)
expect(mocks.redirect).toHaveBeenCalledWith("/")
```

For invalid input, assert `fieldErrors.companyId` and `fieldErrors.pin` exist and `JSON.stringify(state)` contains neither the submitted PIN nor `confirmPin` values.

- [ ] **Step 8: Add the auth-page session guard**

Create `lib/auth/session.ts`:

```ts
import "server-only"

import { redirect } from "next/navigation"

import {
  createSupabaseServerClient,
  getSupabaseConfiguration,
} from "@/lib/supabase/server"

export async function redirectAuthenticatedUser(): Promise<void> {
  const configuration = getSupabaseConfiguration()
  if (!configuration) return

  const supabase = await createSupabaseServerClient(configuration)
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (user) redirect("/")
}
```

- [ ] **Step 9: Run focused and static checks**

Run:

```bash
pnpm test -- lib/auth/service.test.ts lib/auth/actions.test.ts
pnpm typecheck
pnpm lint
```

Expected: all commands exit with code 0.

## Task 6: Build the shared auth shell and forms

**Files:**
- Modify: `components/ui/input-otp.tsx`
- Create: `components/auth/pin-field.tsx`
- Create: `components/auth/auth-shell.tsx`
- Create: `components/auth/login-form.tsx`
- Create: `components/auth/register-form.tsx`
- Create: `components/auth/auth-skeleton.tsx`
- Create: `components/auth/auth-forms.test.tsx`

- [ ] **Step 1: Make OTP slots mask-capable**

Extend generated `InputOTPSlot` with `masked?: boolean` and render:

```tsx
{masked && char ? "•" : char}
```

Keep the existing active-slot and fake-caret behavior. Do not alter the underlying single native input, paste behavior, or accessible semantics.

- [ ] **Step 2: Create the reusable PIN field**

Create `components/auth/pin-field.tsx` as a Client Component using `Field`, `FieldLabel`, `FieldDescription`, `FieldError`, `InputOTP`, one `InputOTPGroup`, six masked `InputOTPSlot` children, and `REGEXP_ONLY_DIGITS`.

Use this interface:

```ts
export interface PinFieldProps {
  id: string
  name: "pin" | "confirmPin"
  label: string
  description?: string
  error?: string[]
  disabled?: boolean
  autoComplete: "current-password" | "new-password"
}
```

The `InputOTP` must receive `id`, `name`, `maxLength={6}`, `pattern={REGEXP_ONLY_DIGITS}`, `inputMode="numeric"`, the supplied `autoComplete`, `required`, `disabled`, `aria-invalid`, and the description/error IDs through `aria-describedby`. Login passes `current-password`; both registration PIN fields pass `new-password`.

- [ ] **Step 3: Build the quiet split-screen shell**

Create `components/auth/auth-shell.tsx` as a Server Component. Use semantic `main`, an orientation `section`, and a single `Card` for form content. Wide layout uses two columns; below the medium breakpoint it stacks without horizontal overflow.

Use this content hierarchy:

```tsx
<p className="text-sm font-semibold">Scheduler</p>
<h1 className="max-w-[12ch] font-heading text-4xl/11 font-semibold tracking-tight sm:text-5xl/14">
  Keep every callback within reach.
</h1>
<p className="max-w-[48ch] text-base/7 text-muted-foreground">
  A private workspace for scheduling and rescheduling the customer follow-ups assigned to you.
</p>
```

The form card stays `max-w-md`, shadowless, and uses existing semantic surfaces/borders. Add no illustration, gradient, glow, fake schedule, or decorative feature grid.

- [ ] **Step 4: Build Login and Register forms**

Both Client Components use `useActionState`, `FieldGroup`, the existing `Button`, and generated `Spinner`. Put `key={state.submissionId}` on the field group that contains the inputs, set Company ID `defaultValue={state.companyId}`, and leave PIN fields empty so every failed server response clears credentials without putting them in action state.

Company ID control requirements:

```tsx
<Input
  id="company-id"
  name="companyId"
  defaultValue={state.companyId}
  autoCapitalize="characters"
  autoComplete="username"
  inputMode="text"
  maxLength={6}
  pattern="E[0-9]{5}"
  placeholder="E12345"
  required
/>
```

Login copy:

- Title: `Return to your callbacks`
- Description: `Use your company ID and six-digit PIN.`
- Action: `Log in`; pending label: `Logging in…`
- Footer link: `Need an account? Register`
- Recovery note: `PIN recovery is not currently available.`

Register copy:

- Title: `Create your callback workspace`
- Description: `Claim your company ID and choose a six-digit PIN.`
- Disclosure: `Registration claims this company ID. Scheduler does not verify employee identity.`
- Action: `Create account`; pending label: `Creating account…`
- Footer link: `Already registered? Log in`

Form-level failures render in a stable `role="alert"` region. Buttons remain at least 40px high and preserve width while pending.

- [ ] **Step 5: Write component tests**

Create `components/auth/auth-forms.test.tsx` using Testing Library. Test:

```tsx
expect(screen.getByRole("textbox", { name: /company id/i })).toHaveAttribute(
  "placeholder",
  "E12345"
)
expect(screen.getByLabelText(/^pin$/i)).toHaveAttribute("name", "pin")
expect(screen.queryByLabelText(/confirm pin/i)).not.toBeInTheDocument()
```

For Register, assert Confirm PIN and the non-verification disclosure exist. Use `userEvent.paste` to paste `123456` into the PIN input and assert six masked bullets are visible while the native input value remains available to form submission. Pass a test action that returns an error state and assert the Company ID remains while the PIN input resets after the response.

- [ ] **Step 6: Add the structural skeleton**

Create `components/auth/auth-skeleton.tsx` with the same outer grid, orientation text blocks, one card, three field-shaped skeletons at most, and one button-shaped skeleton. Login/Register route loading uses this shared shape without animated decorative content.

- [ ] **Step 7: Run focused and static checks**

Run:

```bash
pnpm test -- components/auth/auth-forms.test.tsx
pnpm typecheck
pnpm lint
```

Expected: all commands exit with code 0.

## Task 7: Add routes, redirects, environment guidance, and final validation

**Files:**
- Create: `app/(auth)/layout.tsx`
- Create: `app/(auth)/loading.tsx`
- Create: `app/(auth)/login/page.tsx`
- Create: `app/(auth)/register/page.tsx`
- Modify: `next.config.ts`
- Modify: `app/page.tsx`
- Modify: `.env.example`
- Modify: `README.md`

- [ ] **Step 1: Add guarded auth routes**

`app/(auth)/layout.tsx` returns `children` without duplicating the root providers. Login and Register pages await `redirectAuthenticatedUser()` and then render `AuthShell` with the corresponding form.

Use page metadata:

```ts
export const metadata = {
  title: "Log in | Scheduler",
  description: "Log in to your private callback workspace.",
}
```

and:

```ts
export const metadata = {
  title: "Register | Scheduler",
  description: "Create your private Scheduler callback workspace.",
}
```

`app/(auth)/loading.tsx` returns `<AuthSkeleton />`.

- [ ] **Step 2: Add canonical redirects**

Update `next.config.ts`:

```ts
import type { NextConfig } from "next"

const nextConfig: NextConfig = {
  async redirects() {
    return [
      { source: "/sign-in", destination: "/login", permanent: true },
      { source: "/sign-up", destination: "/register", permanent: true },
    ]
  },
}

export default nextConfig
```

Update the existing unauthenticated state in `app/page.tsx` to link to `/login`.

- [ ] **Step 3: Document environment and Supabase setup**

Add these names to `.env.example` without values:

```dotenv
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=
SUPABASE_SERVICE_ROLE_KEY=
AUTH_RATE_LIMIT_SECRET=
```

Add comments stating that `AUTH_RATE_LIMIT_SECRET` must be at least 32 random characters and both new variables are server-only. Do not copy values from `.env.local`.

Add a README Authentication Setup section that instructs the operator to:

1. Enable email/password authentication.
2. Disable email confirmation because `.invalid` synthetic addresses cannot receive mail.
3. Apply `supabase/migrations/20260902000000_auth_rate_limits.sql`.
4. Configure the four variables in Vercel.
5. Keep the service-role key and HMAC secret server-only.
6. Smoke-test Register, logout/session expiry, Login, duplicate registration, five failed account attempts, and source throttling.

- [ ] **Step 4: Run the complete automated suite**

Run:

```bash
pnpm test
pnpm typecheck
pnpm lint
pnpm build
```

Expected: every command exits with code 0 and no new warnings.

- [ ] **Step 5: Run diagnostics and the finish gate**

Check project diagnostics. Then inspect both pages at wide and narrow desktop widths in light and dark themes when a browser is available.

Verify:

- No clipping or horizontal page overflow.
- The layout remains usable at 200% zoom.
- PIN slots are masked, keyboard operable, and pasteable.
- Focus rings are visible.
- Loading does not shift the form width.
- Errors identify the field or next action.
- `/sign-in` and `/sign-up` redirect canonically.
- Authenticated visits to `/login` and `/register` redirect to `/`.
- No gradient, glow, shadow stack, fake customer data, dead control, `any`, `console.log`, or PIN logging exists.

- [ ] **Step 6: Record environment-only verification honestly**

If Supabase credentials or the migration are unavailable locally, report the real smoke test as not run. Do not claim end-to-end production verification from mocked tests or a successful static build.
