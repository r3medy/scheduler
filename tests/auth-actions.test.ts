import { describe, expect, it, vi } from "vitest"

vi.mock("server-only", () => ({}))

import {
  authenticateLogin,
  authenticateRegistration,
  loginAction,
  type AuthDependencies,
} from "@/lib/auth/actions"
import type { RateLimitStore } from "@/lib/auth/rate-limit-core"

function createDependencies(
  overrides: Partial<AuthDependencies> = {}
): AuthDependencies {
  const rateLimits: RateLimitStore = {
    check: vi.fn(async () => ({
      allowed: true,
      failureCount: 0,
      retryAt: null,
    })),
    recordFailure: vi.fn(async () => ({
      allowed: true,
      failureCount: 1,
      retryAt: null,
    })),
    reset: vi.fn(async () => undefined),
  }

  return {
    auth: {
      signInWithPassword: vi.fn(async () => ({
        data: { session: {} },
        error: null,
      })),
      signUp: vi.fn(async () => ({
        data: { user: {}, session: {} },
        error: null,
      })),
    },
    rateLimits,
    rateLimitConfiguration: {
      loginAccount: {
        windowSeconds: 900,
        maxAttempts: 5,
        lockoutSeconds: 900,
      },
      loginSource: {
        windowSeconds: 900,
        maxAttempts: 20,
        lockoutSeconds: 900,
      },
      registrationSource: {
        windowSeconds: 900,
        maxAttempts: 5,
        lockoutSeconds: 0,
      },
    },
    rateLimitSecret: "a".repeat(32),
    clientSource: "local-development",
    ...overrides,
  }
}

describe("auth actions", () => {
  it("redirect-ready login success resets both buckets", async () => {
    const dependencies = createDependencies()
    const result = await authenticateLogin(
      { companyId: "E12345", pin: "123456" },
      dependencies
    )

    expect(result).toEqual({ success: true })
    expect(dependencies.auth.signInWithPassword).toHaveBeenCalledWith({
      email: "e12345@auth.scheduler.invalid",
      password: "123456",
    })
    expect(dependencies.rateLimits.reset).toHaveBeenCalledTimes(2)
  })

  it("blocks an account before password verification", async () => {
    const dependencies = createDependencies()
    vi.mocked(dependencies.rateLimits.check).mockResolvedValueOnce({
      allowed: false,
      failureCount: 5,
      retryAt: new Date(Date.now() + 60_000).toISOString(),
    })

    const result = await authenticateLogin(
      { companyId: "E12345", pin: "123456" },
      dependencies
    )

    expect("formError" in result).toBe(true)
    if ("formError" in result) {
      expect(result.formError).toMatch(/Too many attempts/)
    }
    expect(dependencies.auth.signInWithPassword).not.toHaveBeenCalled()
  })

  it("does not reveal whether a Company ID exists on bad credentials", async () => {
    const dependencies = createDependencies()
    vi.mocked(dependencies.auth.signInWithPassword).mockResolvedValueOnce({
      data: { session: null },
      error: { status: 400, message: "invalid password" },
    })

    const result = await authenticateLogin(
      { companyId: "E12345", pin: "123456" },
      dependencies
    )

    expect(result).toEqual({
      formError: "The company ID or PIN is incorrect.",
    })
    expect(JSON.stringify(result)).not.toContain("password")
  })

  it("returns a claimed-ID error for duplicate registration", async () => {
    const dependencies = createDependencies()
    vi.mocked(dependencies.auth.signUp).mockResolvedValueOnce({
      data: { user: null, session: null },
      error: { code: "email_exists", message: "user already registered" },
    })

    const result = await authenticateRegistration(
      { companyId: "E12345", pin: "123456", confirmPin: "123456" },
      dependencies
    )

    expect(result).toEqual({
      formError: "That company ID has already been claimed.",
    })
  })

  it("returns field errors without contacting auth for invalid action input", async () => {
    const result = await loginAction(
      {},
      (() => {
        const formData = new FormData()
        formData.set("companyId", "E12")
        formData.set("pin", "12")
        return formData
      })()
    )

    expect(result.fieldErrors?.companyId).toBeDefined()
    expect(result.fieldErrors?.pin).toBeDefined()
    expect(result.formError).toBeUndefined()
    expect(result.resetToken).toEqual(expect.any(String))
  })
})
