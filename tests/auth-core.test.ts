import { describe, expect, it, vi } from "vitest"

vi.mock("server-only", () => ({}))

import {
  classifyLoginError,
  classifyRegistrationError,
} from "@/lib/auth/errors"
import {
  companyIdToSyntheticEmail,
  normalizeCompanyId,
} from "@/lib/auth/identity"
import {
  createRateLimitKey,
  getAuthRateLimitSecret,
  getRateLimitConfiguration,
} from "@/lib/auth/rate-limit-core"
import { loginSchema, registerSchema, toFieldErrors } from "@/lib/auth/schema"

describe("auth identity", () => {
  it("normalizes Company IDs before deriving the synthetic identity", () => {
    expect(normalizeCompanyId("  e12345 ")).toBe("E12345")
    expect(companyIdToSyntheticEmail("  e12345 ")).toBe(
      "e12345@auth.scheduler.invalid"
    )
  })
})

describe("auth schemas", () => {
  it("accepts trimmed IDs and leading-zero six-digit PINs", () => {
    const result = loginSchema.safeParse({
      companyId: " e12345 ",
      pin: "000001",
    })

    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.companyId).toBe("E12345")
      expect(result.data.pin).toBe("000001")
    }
  })

  it("rejects invalid formats and reports fields without values", () => {
    const result = loginSchema.safeParse({ companyId: "E12", pin: "12345" })

    expect(result.success).toBe(false)
    if (!result.success) {
      const errors = toFieldErrors(result.error)
      expect(errors.companyId).toBeDefined()
      expect(errors.pin).toBeDefined()
      expect(JSON.stringify(errors)).not.toContain("000001")
    }
  })

  it("reports registration PIN mismatch on Confirm PIN", () => {
    const result = registerSchema.safeParse({
      companyId: "E12345",
      pin: "123456",
      confirmPin: "654321",
    })

    expect(result.success).toBe(false)
    if (!result.success) {
      expect(toFieldErrors(result.error).confirmPin).toContain(
        "PINs do not match."
      )
    }
  })
})

describe("rate-limit configuration", () => {
  it("uses the approved defaults", () => {
    const config = getRateLimitConfiguration({})

    expect(config.loginAccount).toEqual({
      windowSeconds: 900,
      maxAttempts: 5,
      lockoutSeconds: 900,
    })
    expect(config.loginSource).toEqual({
      windowSeconds: 900,
      maxAttempts: 20,
      lockoutSeconds: 900,
    })
    expect(config.registrationSource).toEqual({
      windowSeconds: 900,
      maxAttempts: 5,
      lockoutSeconds: 0,
    })
  })

  it("rejects non-positive overrides and short secrets", () => {
    expect(() =>
      getRateLimitConfiguration({ AUTH_LOGIN_ACCOUNT_MAX_ATTEMPTS: "0" })
    ).toThrow()
    expect(() =>
      getAuthRateLimitSecret({ AUTH_RATE_LIMIT_SECRET: "short" })
    ).toThrow()
  })

  it("accepts the minimum secret length and rejects one character less", () => {
    const secret = "a".repeat(32)

    expect(getAuthRateLimitSecret({ AUTH_RATE_LIMIT_SECRET: secret })).toBe(
      secret
    )
    expect(() =>
      getAuthRateLimitSecret({ AUTH_RATE_LIMIT_SECRET: "a".repeat(31) })
    ).toThrow()
  })

  it("rejects a whitespace-only minimum-length secret", () => {
    expect(() =>
      getAuthRateLimitSecret({ AUTH_RATE_LIMIT_SECRET: " ".repeat(32) })
    ).toThrow()
  })

  it("creates deterministic, scope-separated HMAC keys", () => {
    const secret = "a".repeat(32)
    const accountKey = createRateLimitKey("login-company", "E12345", secret)
    const sourceKey = createRateLimitKey("login-source", "E12345", secret)

    expect(accountKey).toHaveLength(64)
    expect(accountKey).toBe(
      createRateLimitKey("login-company", "E12345", secret)
    )
    expect(accountKey).not.toBe(sourceKey)
    expect(accountKey).not.toContain("E12345")
  })
})

describe("public auth errors", () => {
  it("keeps credential failures generic", () => {
    expect(classifyLoginError({ status: 400, message: "bad password" })).toBe(
      "invalid-credentials"
    )
    expect(
      classifyLoginError({ status: 503, message: "database details" })
    ).toBe("service-unavailable")
    expect(classifyRegistrationError({ code: "email_exists" })).toBe(
      "already-claimed"
    )
  })
})
