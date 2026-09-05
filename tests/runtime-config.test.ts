import { describe, expect, it, vi } from "vitest"

vi.mock("server-only", () => ({}))

import {
  assertRuntimeConfiguration,
  getPublicSupabaseConfiguration,
  getRuntimeConfiguration,
  reportRuntimeConfiguration,
  validateRuntimeConfiguration,
} from "@/lib/config/runtime"

const validEnvironment = {
  NODE_ENV: "test",
  NEXT_PUBLIC_SUPABASE_URL: "https://project.supabase.co",
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "publishable-key",
  SUPABASE_SERVICE_ROLE_KEY: "service-role-secret",
  AUTH_RATE_LIMIT_SECRET: "a".repeat(32),
}

describe("runtime configuration", () => {
  it("accepts all required settings without putting secrets in validation status", () => {
    expect(validateRuntimeConfiguration(validEnvironment)).toEqual({ ok: true })
    expect(getRuntimeConfiguration(validEnvironment)).toEqual({
      supabaseUrl: validEnvironment.NEXT_PUBLIC_SUPABASE_URL,
      supabasePublishableKey:
        validEnvironment.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
      supabaseServiceRoleKey: validEnvironment.SUPABASE_SERVICE_ROLE_KEY,
      authRateLimitSecret: validEnvironment.AUTH_RATE_LIMIT_SECRET,
    })
    expect(
      JSON.stringify(validateRuntimeConfiguration(validEnvironment))
    ).not.toContain(validEnvironment.SUPABASE_SERVICE_ROLE_KEY)
    expect(
      JSON.stringify(validateRuntimeConfiguration(validEnvironment))
    ).not.toContain(validEnvironment.AUTH_RATE_LIMIT_SECRET)
  })

  it("reports every missing required variable without exposing values", () => {
    const environment = {
      NODE_ENV: "production",
      NEXT_PUBLIC_SUPABASE_URL: undefined,
      NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: undefined,
      SUPABASE_SERVICE_ROLE_KEY: undefined,
      AUTH_RATE_LIMIT_SECRET: undefined,
    }
    const validation = validateRuntimeConfiguration(environment)

    expect(validation.ok).toBe(false)
    if (!validation.ok) {
      expect(validation.issues.map((issue) => issue.variable)).toEqual([
        "NEXT_PUBLIC_SUPABASE_URL",
        "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
        "SUPABASE_SERVICE_ROLE_KEY",
        "AUTH_RATE_LIMIT_SECRET",
      ])
      expect(JSON.stringify(validation)).not.toContain("secret")
    }
    expect(getRuntimeConfiguration(environment)).toBeNull()
  })

  it("rejects malformed public URLs and short rate-limit secrets", () => {
    const environment = {
      ...validEnvironment,
      NEXT_PUBLIC_SUPABASE_URL: "supabase.example",
      AUTH_RATE_LIMIT_SECRET: "a".repeat(31),
    }
    const validation = validateRuntimeConfiguration(environment)

    expect(validation.ok).toBe(false)
    if (!validation.ok) {
      expect(validation.issues).toEqual([
        { variable: "NEXT_PUBLIC_SUPABASE_URL", reason: "invalid" },
        { variable: "AUTH_RATE_LIMIT_SECRET", reason: "invalid" },
      ])
    }
    expect(() => assertRuntimeConfiguration(environment)).toThrow(
      /NEXT_PUBLIC_SUPABASE_URL.*AUTH_RATE_LIMIT_SECRET/
    )
  })

  it("rejects a whitespace-only minimum-length rate-limit secret", () => {
    const validation = validateRuntimeConfiguration({
      ...validEnvironment,
      AUTH_RATE_LIMIT_SECRET: " ".repeat(32),
    })

    expect(validation).toEqual({
      ok: false,
      issues: [{ variable: "AUTH_RATE_LIMIT_SECRET", reason: "invalid" }],
    })
  })

  it("keeps public request guards usable when server-only settings are absent", () => {
    const environment = {
      ...validEnvironment,
      SUPABASE_SERVICE_ROLE_KEY: undefined,
      AUTH_RATE_LIMIT_SECRET: undefined,
    }

    expect(getPublicSupabaseConfiguration(environment)).toEqual({
      url: validEnvironment.NEXT_PUBLIC_SUPABASE_URL,
      publishableKey: validEnvironment.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    })
    expect(getRuntimeConfiguration(environment)).toBeNull()
  })

  it("reports production failures using variable names only", () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => undefined)
    const environment = {
      ...validEnvironment,
      NODE_ENV: "production",
      AUTH_RATE_LIMIT_SECRET: undefined,
    }

    expect(reportRuntimeConfiguration(environment)).toMatchObject({ ok: false })
    expect(error).toHaveBeenCalledWith(
      expect.stringContaining("AUTH_RATE_LIMIT_SECRET (missing)")
    )
    expect(error.mock.calls[0]?.[0]).not.toContain("service-role-secret")
    error.mockRestore()
  })
})
