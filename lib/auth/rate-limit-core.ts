import { createHmac } from "node:crypto"

import { parseAuthRateLimitSecret } from "@/lib/config/runtime"

export interface RateLimitConfiguration {
  loginAccount: RateLimitBucketConfiguration
  loginSource: RateLimitBucketConfiguration
  registrationSource: RateLimitBucketConfiguration
}

export interface RateLimitBucketConfiguration {
  windowSeconds: number
  maxAttempts: number
  lockoutSeconds: number
}

export interface RateLimitDecision {
  allowed: boolean
  failureCount: number
  retryAt: string | null
}

export type RateLimitScope =
  "login-company" | "login-source" | "registration-source"

export interface RateLimitStore {
  check(
    scope: RateLimitScope,
    key: string,
    bucket: RateLimitBucketConfiguration
  ): Promise<RateLimitDecision>
  recordFailure(
    scope: RateLimitScope,
    key: string,
    bucket: RateLimitBucketConfiguration
  ): Promise<RateLimitDecision>
  reset(scope: RateLimitScope, key: string): Promise<void>
}

const DEFAULTS = {
  loginAccountWindowSeconds: 900,
  loginAccountMaxAttempts: 5,
  loginAccountLockoutSeconds: 900,
  loginSourceWindowSeconds: 900,
  loginSourceMaxAttempts: 20,
  loginSourceLockoutSeconds: 900,
  registrationSourceWindowSeconds: 900,
  registrationSourceMaxAttempts: 5,
  registrationSourceLockoutSeconds: 0,
} as const

const ENV_NAMES = {
  loginAccountWindowSeconds: "AUTH_LOGIN_ACCOUNT_WINDOW_SECONDS",
  loginAccountMaxAttempts: "AUTH_LOGIN_ACCOUNT_MAX_ATTEMPTS",
  loginAccountLockoutSeconds: "AUTH_LOGIN_ACCOUNT_LOCKOUT_SECONDS",
  loginSourceWindowSeconds: "AUTH_LOGIN_SOURCE_WINDOW_SECONDS",
  loginSourceMaxAttempts: "AUTH_LOGIN_SOURCE_MAX_ATTEMPTS",
  loginSourceLockoutSeconds: "AUTH_LOGIN_SOURCE_LOCKOUT_SECONDS",
  registrationSourceWindowSeconds: "AUTH_REGISTRATION_SOURCE_WINDOW_SECONDS",
  registrationSourceMaxAttempts: "AUTH_REGISTRATION_SOURCE_MAX_ATTEMPTS",
  registrationSourceLockoutSeconds: "AUTH_REGISTRATION_SOURCE_LOCKOUT_SECONDS",
} as const

function positiveInteger(
  env: Record<string, string | undefined>,
  name: string,
  fallback: number
): number {
  const rawValue = env[name]
  if (rawValue === undefined) return fallback
  if (rawValue === "") {
    throw new Error(`Invalid auth rate-limit setting: ${name}`)
  }

  const parsed = Number(rawValue)
  if (!Number.isSafeInteger(parsed) || parsed <= 0 || parsed > 86_400) {
    throw new Error(`Invalid auth rate-limit setting: ${name}`)
  }

  return parsed
}

function nonNegativeInteger(
  env: Record<string, string | undefined>,
  name: string,
  fallback: number
): number {
  const rawValue = env[name]
  if (rawValue === undefined) return fallback
  if (rawValue === "") {
    throw new Error(`Invalid auth rate-limit setting: ${name}`)
  }

  const parsed = Number(rawValue)
  if (!Number.isSafeInteger(parsed) || parsed < 0 || parsed > 86_400) {
    throw new Error(`Invalid auth rate-limit setting: ${name}`)
  }

  return parsed
}

export function getRateLimitConfiguration(
  env: Record<string, string | undefined> = process.env
): RateLimitConfiguration {
  const loginAccount = {
    windowSeconds: positiveInteger(
      env,
      ENV_NAMES.loginAccountWindowSeconds,
      DEFAULTS.loginAccountWindowSeconds
    ),
    maxAttempts: positiveInteger(
      env,
      ENV_NAMES.loginAccountMaxAttempts,
      DEFAULTS.loginAccountMaxAttempts
    ),
    lockoutSeconds: positiveInteger(
      env,
      ENV_NAMES.loginAccountLockoutSeconds,
      DEFAULTS.loginAccountLockoutSeconds
    ),
  }
  const loginSource = {
    windowSeconds: positiveInteger(
      env,
      ENV_NAMES.loginSourceWindowSeconds,
      DEFAULTS.loginSourceWindowSeconds
    ),
    maxAttempts: positiveInteger(
      env,
      ENV_NAMES.loginSourceMaxAttempts,
      DEFAULTS.loginSourceMaxAttempts
    ),
    lockoutSeconds: positiveInteger(
      env,
      ENV_NAMES.loginSourceLockoutSeconds,
      DEFAULTS.loginSourceLockoutSeconds
    ),
  }
  const registrationSource = {
    windowSeconds: positiveInteger(
      env,
      ENV_NAMES.registrationSourceWindowSeconds,
      DEFAULTS.registrationSourceWindowSeconds
    ),
    maxAttempts: positiveInteger(
      env,
      ENV_NAMES.registrationSourceMaxAttempts,
      DEFAULTS.registrationSourceMaxAttempts
    ),
    lockoutSeconds: nonNegativeInteger(
      env,
      ENV_NAMES.registrationSourceLockoutSeconds,
      DEFAULTS.registrationSourceLockoutSeconds
    ),
  }

  return { loginAccount, loginSource, registrationSource }
}

export function getAuthRateLimitSecret(
  env: Record<string, string | undefined> = process.env
): string {
  const secret = parseAuthRateLimitSecret(env.AUTH_RATE_LIMIT_SECRET)
  if (!secret) {
    throw new Error("AUTH_RATE_LIMIT_SECRET must be at least 32 characters")
  }

  return secret
}

export function createRateLimitKey(
  scope: RateLimitScope,
  value: string,
  secret: string
): string {
  return createHmac("sha256", secret)
    .update(`${scope}:${value}`, "utf8")
    .digest("hex")
}
