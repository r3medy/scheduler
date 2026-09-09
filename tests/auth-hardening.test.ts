import { readdirSync, readFileSync, statSync } from "node:fs"
import { join, resolve } from "node:path"
import { beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("server-only", () => ({}))

const serverMocks = vi.hoisted(() => ({
  getSupabaseConfiguration: vi.fn(),
  createSupabaseServerClient: vi.fn(),
  getUser: vi.fn(),
}))

vi.mock("@/lib/supabase/server", () => ({
  getSupabaseConfiguration: serverMocks.getSupabaseConfiguration,
  createSupabaseServerClient: serverMocks.createSupabaseServerClient,
}))

import { getSessionStatus } from "@/lib/auth/session"
import {
  UNKNOWN_CLIENT_SOURCE,
  resolveClientSource,
} from "@/lib/auth/rate-limit"
import {
  getCurrentDeployRegion,
  getPublicSupabaseConfiguration,
  getTrustedClientSourceSettings,
  parseTrustedClientIpHeader,
  parseTrustedDeployRegions,
} from "@/lib/config/runtime"
import { parseCallbackInput } from "@/lib/callbacks/validation"
import {
  ACCOUNT_HOLDER_NAME_MAX_LENGTH,
  ACCOUNT_NUMBER_MAX_LENGTH,
  COMMENTS_MAX_LENGTH,
  PHONE_NUMBER_MAX_LENGTH,
} from "@/lib/callbacks/limits"

function readSource(relativePath: string): string {
  return readFileSync(resolve(process.cwd(), relativePath), "utf8")
}

function walkFiles(directory: string): string[] {
  const entries = readdirSync(directory)
  return entries.flatMap((entry) => {
    const full = join(directory, entry)
    if (statSync(full).isDirectory()) return walkFiles(full)
    return /\.(ts|tsx)$/.test(entry) ? [full] : []
  })
}

describe("server-only auth boundary", () => {
  it("keeps credential helpers in a server-only module", () => {
    expect(readSource("lib/auth/credentials.ts")).toContain(
      'import "server-only"'
    )
  })

  it("exposes only thin wrappers from the server-action module", () => {
    const actions = readSource("lib/auth/actions.ts")

    expect(actions).toContain('"use server"')
    expect(actions).toContain("export async function loginAction")
    expect(actions).toContain("export async function registerAction")
    expect(actions).not.toMatch(
      /export async function authenticate(Login|Registration)/
    )
    expect(actions).not.toMatch(/export \{[^}]*authenticateLogin/)
  })

  it("wires account helpers to the server-only module, not the action module", () => {
    const accountActions = readSource("lib/auth/account-actions.ts")

    expect(accountActions).toContain('from "@/lib/auth/credentials"')
    expect(accountActions).not.toMatch(/from "@\/lib\/auth\/actions"/)
  })
})

describe("trusted client-source handling", () => {
  const header = (value: string | null | undefined) => () => value

  it("defaults to the shared unknown bucket without trusting forwarded headers", () => {
    expect(resolveClientSource({}, header("203.0.113.8"))).toBe(
      UNKNOWN_CLIENT_SOURCE
    )
    expect(resolveClientSource({}, () => undefined)).toBe(UNKNOWN_CLIENT_SOURCE)
    // An arbitrary X-Forwarded-For must never be trusted without opt-in.
    expect(
      resolveClientSource({}, (name) =>
        name === "x-forwarded-for" ? "203.0.113.8" : null
      )
    ).toBe(UNKNOWN_CLIENT_SOURCE)
  })

  it("trusts the configured header only for a single valid IP", () => {
    const env = { TRUSTED_CLIENT_IP_HEADER: "cf-connecting-ip" }
    const get = (value: string | null) => (name: string) =>
      name === "cf-connecting-ip" ? value : null

    expect(resolveClientSource(env, get("203.0.113.8"))).toBe("203.0.113.8")
    expect(resolveClientSource(env, get("2001:db8::1"))).toBe("2001:db8::1")
    expect(resolveClientSource(env, get(null))).toBe(UNKNOWN_CLIENT_SOURCE)
    expect(resolveClientSource(env, get("not-an-ip"))).toBe(
      UNKNOWN_CLIENT_SOURCE
    )
    expect(resolveClientSource(env, get("203.0.113.8, 198.51.100.7"))).toBe(
      UNKNOWN_CLIENT_SOURCE
    )
  })

  it("treats header names case-insensitively and rejects malformed opt-ins", () => {
    expect(
      resolveClientSource(
        { TRUSTED_CLIENT_IP_HEADER: "CF-Connecting-IP" },
        (name) => (name === "cf-connecting-ip" ? "203.0.113.8" : null)
      )
    ).toBe("203.0.113.8")
    expect(parseTrustedClientIpHeader("x-forwarded-for; evil")).toBeNull()
    expect(parseTrustedClientIpHeader("   ")).toBeNull()
    expect(
      resolveClientSource(
        { TRUSTED_CLIENT_IP_HEADER: "x-forwarded-for; evil" },
        () => "203.0.113.8"
      )
    ).toBe(UNKNOWN_CLIENT_SOURCE)
  })

  it("enforces the optional deploy-region allowlist", () => {
    const env = {
      TRUSTED_CLIENT_IP_HEADER: "x-vercel-forwarded-for",
      TRUSTED_DEPLOY_REGIONS: "iad1, fra1",
      VERCEL_REGION: "gru1",
    }

    expect(resolveClientSource(env, () => "203.0.113.8")).toBe(
      UNKNOWN_CLIENT_SOURCE
    )
    expect(
      resolveClientSource(
        { ...env, VERCEL_REGION: "iad1" },
        () => "203.0.113.8"
      )
    ).toBe("203.0.113.8")
    expect(parseTrustedDeployRegions("  ")).toBeNull()
    expect(getCurrentDeployRegion({})).toBeNull()
    expect(
      getCurrentDeployRegion({ DEPLOY_REGION: "iad1", VERCEL_REGION: "fra1" })
    ).toBe("iad1")
  })

  it("keeps the legacy Vercel path platform-gated", () => {
    const get = (value: string | null) => (name: string) =>
      name === "x-vercel-forwarded-for" ? value : null

    expect(resolveClientSource({ VERCEL: "1" }, get("203.0.113.8"))).toBe(
      "203.0.113.8"
    )
    expect(resolveClientSource({ VERCEL: "1" }, get("bogus"))).toBe(
      "unknown-production-source"
    )
    expect(resolveClientSource({}, get("203.0.113.8"))).toBe(
      UNKNOWN_CLIENT_SOURCE
    )
  })

  it("parses trusted-source settings without exposing values in errors", () => {
    expect(
      getTrustedClientSourceSettings({
        TRUSTED_CLIENT_IP_HEADER: "  CF-Connecting-IP  ",
        TRUSTED_DEPLOY_REGIONS: "iad1,, fra1",
      })
    ).toEqual({
      headerName: "cf-connecting-ip",
      allowedRegions: ["iad1", "fra1"],
    })
    expect(getTrustedClientSourceSettings({})).toEqual({
      headerName: null,
      allowedRegions: null,
    })
  })
})

describe("session semantics", () => {
  beforeEach(() => {
    vi.resetAllMocks()
    serverMocks.createSupabaseServerClient.mockResolvedValue({
      auth: { getUser: serverMocks.getUser },
    })
  })

  it("reports configuration-error when Supabase settings are missing", async () => {
    serverMocks.getSupabaseConfiguration.mockReturnValue(null)

    expect(await getSessionStatus()).toBe("configuration-error")
    expect(serverMocks.getUser).not.toHaveBeenCalled()
  })

  it("denies anonymous or failing sessions without leaking details", async () => {
    serverMocks.getSupabaseConfiguration.mockReturnValue({})
    serverMocks.getUser.mockResolvedValue({ data: { user: null }, error: null })
    expect(await getSessionStatus()).toBe("unauthenticated")

    serverMocks.getUser.mockResolvedValue({
      data: { user: null },
      error: { message: "internal db detail" },
    })
    expect(await getSessionStatus()).toBe("unauthenticated")

    serverMocks.createSupabaseServerClient.mockRejectedValueOnce(
      new Error("boom")
    )
    expect(await getSessionStatus()).toBe("unauthenticated")
  })

  it("accepts a verified session", async () => {
    serverMocks.getSupabaseConfiguration.mockReturnValue({})
    serverMocks.getUser.mockResolvedValue({
      data: { user: { id: "owner" } },
      error: null,
    })

    expect(await getSessionStatus()).toBe("ok")
  })

  it("defines local-only PIN-change behavior in the account contract", () => {
    const accountActions = readSource("lib/auth/account-actions.ts")

    expect(accountActions).toMatch(/scope:\s*"local"/)
    expect(accountActions).toMatch(/does not revoke existing sessions/i)
  })
})

describe("large callback payloads", () => {
  const HUGE = "x".repeat(200_000)

  function validInput(): FormData {
    const data = new FormData()
    data.set("phone_number", "0123456789")
    data.set("account_number", "123456")
    data.set("account_holder_name", "Test User")
    data.set("comments", "ok")
    data.set("schedule_mode", "exact")
    data.set("scheduled_at", "2099-01-01T09:00:00.000Z")
    return data
  }

  it.each([
    "phone_number",
    "account_number",
    "account_holder_name",
    "comments",
  ] as const)(
    "rejects a 200k-character %s payload at the server boundary",
    (field) => {
      const data = validInput()
      data.set(field, HUGE)

      expect(parseCallbackInput(data)).toMatchObject({
        status: "error",
        field,
      })
    }
  )

  it("accepts payloads exactly at the agreed limits", () => {
    const data = validInput()
    data.set("phone_number", "1".repeat(PHONE_NUMBER_MAX_LENGTH))
    data.set("account_number", "2".repeat(ACCOUNT_NUMBER_MAX_LENGTH))
    data.set("account_holder_name", "3".repeat(ACCOUNT_HOLDER_NAME_MAX_LENGTH))
    data.set("comments", "4".repeat(COMMENTS_MAX_LENGTH))

    expect(parseCallbackInput(data)).toMatchObject({ status: "success" })
  })
})

describe("secret and credential hygiene", () => {
  it("never exposes a service-role key through a NEXT_PUBLIC variable", () => {
    const files = [
      ...walkFiles(resolve(process.cwd(), "lib")),
      resolve(process.cwd(), "proxy.ts"),
      ...walkFiles(resolve(process.cwd(), "app")),
    ]

    for (const file of files) {
      const content = readFileSync(file, "utf8")
      expect(`${file}: ${content}`).not.toMatch(
        /NEXT_PUBLIC_[A-Z_]*(SERVICE|SECRET)/
      )
    }
  })

  it("never logs PINs, passwords, or phone values in lib/app sources", () => {
    const files = [
      ...walkFiles(resolve(process.cwd(), "lib")),
      ...walkFiles(resolve(process.cwd(), "app")),
    ]

    for (const file of files) {
      for (const line of readFileSync(file, "utf8").split("\n")) {
        if (!/console\.(log|info|debug|warn|error)/.test(line)) continue
        expect(`${file}: ${line}`).not.toMatch(/pin|password|phone/i)
      }
    }
  })

  it("keeps the public Supabase configuration free of secrets", () => {
    const configuration = getPublicSupabaseConfiguration({
      NEXT_PUBLIC_SUPABASE_URL: "https://project.supabase.co",
      NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "publishable-key",
      SUPABASE_SERVICE_ROLE_KEY: "service-role-secret",
      AUTH_RATE_LIMIT_SECRET: "a".repeat(32),
    })

    expect(Object.keys(configuration ?? {}).sort()).toEqual([
      "publishableKey",
      "url",
    ])
    expect(JSON.stringify(configuration)).not.toContain("service-role-secret")
  })
})
