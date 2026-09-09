import { describe, expect, it, vi } from "vitest"

vi.mock("server-only", () => ({}))

import { loginAction } from "@/lib/auth/actions"
import {
  authenticateLogin,
  authenticateRegistration,
  type AuthDependencies,
} from "@/lib/auth/credentials"
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
    admit: vi.fn(async () => ({
      allowed: true,
      failureCount: 0,
      retryAt: null,
      admissionToken: 1,
    })),
    recordFailure: vi.fn(async () => ({
      allowed: true,
      failureCount: 1,
      retryAt: null,
    })),
    reset: vi.fn(async () => undefined),
    release: vi.fn(async () => undefined),
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
    expect(dependencies.rateLimits.reset).toHaveBeenNthCalledWith(
      1,
      "login-company",
      expect.any(String),
      1
    )
  })

  it("blocks an account before password verification", async () => {
    const dependencies = createDependencies()
    vi.mocked(dependencies.rateLimits.admit).mockResolvedValueOnce({
      allowed: false,
      failureCount: 5,
      retryAt: new Date(Date.now() + 60_000).toISOString(),
      admissionToken: null,
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

  it("fails closed when atomic admission is unavailable", async () => {
    const dependencies = createDependencies()
    vi.mocked(dependencies.rateLimits.admit).mockRejectedValueOnce(
      new Error("database unavailable")
    )

    const result = await authenticateLogin(
      { companyId: "E12345", pin: "123456" },
      dependencies
    )

    expect(result).toEqual({
      formError:
        "Authentication is temporarily unavailable. Try again shortly.",
    })
    expect(dependencies.auth.signInWithPassword).not.toHaveBeenCalled()
  })

  it("releases an admission when Auth is unavailable instead of recording a failure", async () => {
    const dependencies = createDependencies()
    vi.mocked(dependencies.auth.signInWithPassword).mockResolvedValueOnce({
      data: { session: null },
      error: { status: 503, message: "temporarily unavailable" },
    })

    const result = await authenticateLogin(
      { companyId: "E12345", pin: "123456" },
      dependencies
    )

    expect(result).toMatchObject({
      formError: expect.stringMatching(/temporarily unavailable/),
    })
    expect(dependencies.rateLimits.release).toHaveBeenCalledTimes(2)
    expect(dependencies.rateLimits.recordFailure).not.toHaveBeenCalled()
  })

  it("releases still-active tokens after partial failure completion", async () => {
    const dependencies = createDependencies()
    vi.mocked(dependencies.auth.signInWithPassword).mockResolvedValueOnce({
      data: { session: null },
      error: { status: 400, message: "invalid password" },
    })
    vi.mocked(dependencies.rateLimits.recordFailure)
      .mockResolvedValueOnce({
        allowed: true,
        failureCount: 1,
        retryAt: null,
      })
      .mockRejectedValueOnce(new Error("database unavailable"))

    const result = await authenticateLogin(
      { companyId: "E12345", pin: "123456" },
      dependencies
    )

    expect(result).toEqual({
      formError:
        "Authentication is temporarily unavailable. Try again shortly.",
    })
    expect(dependencies.rateLimits.release).toHaveBeenCalledTimes(2)
  })

  it("releases still-active tokens after partial success cleanup", async () => {
    const dependencies = createDependencies()
    vi.mocked(dependencies.rateLimits.reset)
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(new Error("database unavailable"))

    const result = await authenticateLogin(
      { companyId: "E12345", pin: "123456" },
      dependencies
    )

    expect(result).toEqual({
      formError:
        "Authentication is temporarily unavailable. Try again shortly.",
    })
    expect(dependencies.rateLimits.release).toHaveBeenCalledTimes(2)
  })

  it("bounds concurrent Auth calls with atomic admissions", async () => {
    const dependencies = createDependencies()
    let active = 0
    let calls = 0
    let token = 0
    let releaseAuth!: () => void
    const authReleased = new Promise<void>((resolve) => {
      releaseAuth = resolve
    })

    vi.mocked(dependencies.rateLimits.admit).mockImplementation(
      async (scope) => {
        if (scope === "login-company") {
          if (active >= 2)
            return {
              allowed: false,
              failureCount: 0,
              retryAt: null,
              admissionToken: null,
            }
          active += 1
          token += 1
          return {
            allowed: true,
            failureCount: 0,
            retryAt: null,
            admissionToken: token,
          }
        }
        return {
          allowed: true,
          failureCount: 0,
          retryAt: null,
          admissionToken: 1,
        }
      }
    )
    vi.mocked(dependencies.rateLimits.reset).mockImplementation(
      async (scope) => {
        if (scope === "login-company") active -= 1
      }
    )
    vi.mocked(dependencies.auth.signInWithPassword).mockImplementation(
      async () => {
        calls += 1
        await authReleased
        return { data: { session: {} }, error: null }
      }
    )

    const pending = Promise.all([
      authenticateLogin({ companyId: "E12345", pin: "123456" }, dependencies),
      authenticateLogin({ companyId: "E12345", pin: "123456" }, dependencies),
      authenticateLogin({ companyId: "E12345", pin: "123456" }, dependencies),
      authenticateLogin({ companyId: "E12345", pin: "123456" }, dependencies),
    ])

    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(calls).toBe(2)
    releaseAuth()
    const results = await pending
    expect(results.filter((result) => "success" in result)).toHaveLength(2)
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
