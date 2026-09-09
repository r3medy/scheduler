import "server-only"

const MIN_AUTH_RATE_LIMIT_SECRET_LENGTH = 32

const RUNTIME_VARIABLES = {
  supabaseUrl: "NEXT_PUBLIC_SUPABASE_URL",
  supabasePublishableKey: "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
  supabaseServiceRoleKey: "SUPABASE_SERVICE_ROLE_KEY",
  authRateLimitSecret: "AUTH_RATE_LIMIT_SECRET",
} as const

const TRUSTED_SOURCE_VARIABLES = {
  trustedClientIpHeader: "TRUSTED_CLIENT_IP_HEADER",
  trustedDeployRegions: "TRUSTED_DEPLOY_REGIONS",
} as const

const MAX_TRUSTED_HEADER_NAME_LENGTH = 64
const TRUSTED_HEADER_NAME_PATTERN = /^[a-z0-9-]+$/

type RuntimeVariable =
  (typeof RUNTIME_VARIABLES)[keyof typeof RUNTIME_VARIABLES]

export interface RuntimeConfiguration {
  supabaseUrl: string
  supabasePublishableKey: string
  supabaseServiceRoleKey: string
  authRateLimitSecret: string
}

export interface SupabaseAdminConfiguration {
  url: string
  serviceRoleKey: string
}

export interface TrustedClientSourceSettings {
  /**
   * Lowercase name of the single provider-controlled header trusted as the
   * client source, or null when no header is trusted. Never defaults to
   * `x-forwarded-for`: arbitrary forwarded headers are spoofable.
   */
  headerName: string | null
  /**
   * Optional allowlist of deployment regions that may use the trusted header,
   * or null when any region may use it.
   */
  allowedRegions: readonly string[] | null
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

/**
 * Parse the operator-configured trusted client-IP header. Malformed values
 * fail closed to null (no header trusted). See docs/auth-configuration.md.
 */
export function parseTrustedClientIpHeader(
  value: string | undefined
): string | null {
  if (value === undefined) return null
  const name = value.trim().toLowerCase()
  if (
    name === "" ||
    name.length > MAX_TRUSTED_HEADER_NAME_LENGTH ||
    !TRUSTED_HEADER_NAME_PATTERN.test(name)
  ) {
    return null
  }
  return name
}

/**
 * Parse the optional comma-separated region allowlist for the trusted client
 * source header. Returns null when unset or empty (no region restriction).
 */
export function parseTrustedDeployRegions(
  value: string | undefined
): readonly string[] | null {
  if (value === undefined) return null
  const regions = value
    .split(",")
    .map((region) => region.trim())
    .filter((region) => region !== "")
  return regions.length > 0 ? regions : null
}

export function getTrustedClientSourceSettings(
  env: Record<string, string | undefined> = process.env
): TrustedClientSourceSettings {
  return {
    headerName: parseTrustedClientIpHeader(
      env[TRUSTED_SOURCE_VARIABLES.trustedClientIpHeader]
    ),
    allowedRegions: parseTrustedDeployRegions(
      env[TRUSTED_SOURCE_VARIABLES.trustedDeployRegions]
    ),
  }
}

/**
 * Current deployment region from hosting-provider variables, or null when
 * unknown. Used only to gate the trusted client-source header.
 */
export function getCurrentDeployRegion(
  env: Record<string, string | undefined> = process.env
): string | null {
  const region = env.DEPLOY_REGION ?? env.VERCEL_REGION ?? env.FLY_REGION
  if (typeof region !== "string") return null
  const trimmed = region.trim()
  return trimmed === "" ? null : trimmed
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

export function getSupabaseAdminConfiguration(
  env: Record<string, string | undefined> = process.env
): SupabaseAdminConfiguration | null {
  const url = nonEmpty(env[RUNTIME_VARIABLES.supabaseUrl])
  const serviceRoleKey = nonEmpty(env[RUNTIME_VARIABLES.supabaseServiceRoleKey])

  if (!url || !serviceRoleKey || !isSupabaseUrl(url)) return null

  return { url, serviceRoleKey }
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
