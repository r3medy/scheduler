import "server-only"

const MIN_AUTH_RATE_LIMIT_SECRET_LENGTH = 32

const RUNTIME_VARIABLES = {
  supabaseUrl: "NEXT_PUBLIC_SUPABASE_URL",
  supabasePublishableKey: "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
  supabaseServiceRoleKey: "SUPABASE_SERVICE_ROLE_KEY",
  authRateLimitSecret: "AUTH_RATE_LIMIT_SECRET",
} as const

type RuntimeVariable =
  (typeof RUNTIME_VARIABLES)[keyof typeof RUNTIME_VARIABLES]

export interface RuntimeConfiguration {
  supabaseUrl: string
  supabasePublishableKey: string
  supabaseServiceRoleKey: string
  authRateLimitSecret: string
}

export interface RuntimeConfigurationIssue {
  variable: RuntimeVariable
  reason: "missing" | "invalid"
}

export type RuntimeConfigurationValidation =
  { ok: true } | { ok: false; issues: readonly RuntimeConfigurationIssue[] }

export class RuntimeConfigurationError extends Error {
  readonly issues: readonly RuntimeConfigurationIssue[]

  constructor(issues: readonly RuntimeConfigurationIssue[]) {
    super(
      `Invalid runtime configuration: ${issues
        .map(({ variable }) => variable)
        .join(", ")}`
    )
    this.name = "RuntimeConfigurationError"
    this.issues = issues
  }
}

function nonEmpty(value: string | undefined): string | null {
  if (value === undefined || value.trim() === "") return null
  return value.trim()
}

export function parseAuthRateLimitSecret(
  value: string | undefined
): string | null {
  const secret = nonEmpty(value)
  return secret && secret.length >= MIN_AUTH_RATE_LIMIT_SECRET_LENGTH
    ? secret
    : null
}

function isSupabaseUrl(value: string): boolean {
  try {
    const url = new URL(value)
    return url.protocol === "http:" || url.protocol === "https:"
  } catch {
    return false
  }
}

function validatePublicConfiguration(
  env: Record<string, string | undefined>
): RuntimeConfigurationIssue[] {
  const issues: RuntimeConfigurationIssue[] = []
  const url = nonEmpty(env[RUNTIME_VARIABLES.supabaseUrl])
  const publishableKey = nonEmpty(env[RUNTIME_VARIABLES.supabasePublishableKey])

  if (!url) {
    issues.push({ variable: RUNTIME_VARIABLES.supabaseUrl, reason: "missing" })
  } else if (!isSupabaseUrl(url)) {
    issues.push({ variable: RUNTIME_VARIABLES.supabaseUrl, reason: "invalid" })
  }

  if (!publishableKey) {
    issues.push({
      variable: RUNTIME_VARIABLES.supabasePublishableKey,
      reason: "missing",
    })
  }

  return issues
}

export function getPublicSupabaseConfiguration(
  env: Record<string, string | undefined> = process.env
): { url: string; publishableKey: string } | null {
  const url = nonEmpty(env[RUNTIME_VARIABLES.supabaseUrl])
  const publishableKey = nonEmpty(env[RUNTIME_VARIABLES.supabasePublishableKey])

  if (!url || !publishableKey || !isSupabaseUrl(url)) return null

  return { url, publishableKey }
}

export function validateRuntimeConfiguration(
  env: Record<string, string | undefined> = process.env
): RuntimeConfigurationValidation {
  const issues = validatePublicConfiguration(env)
  const serviceRoleKey = nonEmpty(env[RUNTIME_VARIABLES.supabaseServiceRoleKey])
  const rawAuthRateLimitSecret = env[RUNTIME_VARIABLES.authRateLimitSecret]
  const authRateLimitSecret = parseAuthRateLimitSecret(rawAuthRateLimitSecret)

  if (!serviceRoleKey) {
    issues.push({
      variable: RUNTIME_VARIABLES.supabaseServiceRoleKey,
      reason: "missing",
    })
  }

  if (!authRateLimitSecret) {
    issues.push({
      variable: RUNTIME_VARIABLES.authRateLimitSecret,
      reason: rawAuthRateLimitSecret === undefined ? "missing" : "invalid",
    })
  }

  return issues.length ? { ok: false, issues } : { ok: true }
}

export function getRuntimeConfiguration(
  env: Record<string, string | undefined> = process.env
): RuntimeConfiguration | null {
  const validation = validateRuntimeConfiguration(env)
  if (!validation.ok) return null

  return {
    supabaseUrl: nonEmpty(env[RUNTIME_VARIABLES.supabaseUrl])!,
    supabasePublishableKey: nonEmpty(
      env[RUNTIME_VARIABLES.supabasePublishableKey]
    )!,
    supabaseServiceRoleKey: nonEmpty(
      env[RUNTIME_VARIABLES.supabaseServiceRoleKey]
    )!,
    authRateLimitSecret: parseAuthRateLimitSecret(
      env[RUNTIME_VARIABLES.authRateLimitSecret]
    )!,
  }
}

export function assertRuntimeConfiguration(
  env: Record<string, string | undefined> = process.env
): RuntimeConfiguration {
  const validation = validateRuntimeConfiguration(env)
  if (!validation.ok) throw new RuntimeConfigurationError(validation.issues)

  return {
    supabaseUrl: nonEmpty(env[RUNTIME_VARIABLES.supabaseUrl])!,
    supabasePublishableKey: nonEmpty(
      env[RUNTIME_VARIABLES.supabasePublishableKey]
    )!,
    supabaseServiceRoleKey: nonEmpty(
      env[RUNTIME_VARIABLES.supabaseServiceRoleKey]
    )!,
    authRateLimitSecret: parseAuthRateLimitSecret(
      env[RUNTIME_VARIABLES.authRateLimitSecret]
    )!,
  }
}

let reportedProductionConfigurationFailure = false

export function reportRuntimeConfiguration(
  env: Record<string, string | undefined> = process.env
): RuntimeConfigurationValidation {
  const validation = validateRuntimeConfiguration(env)
  if (
    env.NODE_ENV === "production" &&
    !validation.ok &&
    !reportedProductionConfigurationFailure
  ) {
    reportedProductionConfigurationFailure = true
    console.error(
      `[runtime-config] Required configuration is missing or invalid: ${validation.issues
        .map(({ variable, reason }) => `${variable} (${reason})`)
        .join(", ")}`
    )
  }

  return validation
}
