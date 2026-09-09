import "server-only"

import { isIP } from "node:net"

import { headers } from "next/headers"
import type { SupabaseClient } from "@supabase/supabase-js"

import {
  type RateLimitDecision,
  type RateLimitAdmission,
  type RateLimitStore,
} from "@/lib/auth/rate-limit-core"
import {
  getCurrentDeployRegion,
  getTrustedClientSourceSettings,
} from "@/lib/config/runtime"
import type { Database } from "@/lib/supabase/database.types"

export {
  createRateLimitKey,
  getAuthRateLimitSecret,
  getRateLimitConfiguration,
} from "@/lib/auth/rate-limit-core"
export type {
  RateLimitBucketConfiguration,
  RateLimitConfiguration,
  RateLimitDecision,
  RateLimitAdmission,
  RateLimitScope,
  RateLimitStore,
} from "@/lib/auth/rate-limit-core"

/**
 * Fallback source when no trustworthy client address is available. It is
 * still HMAC-hashed into rate-limit keys, so unattributed callers share one
 * throttling bucket instead of bypassing limits — but operators must
 * configure `TRUSTED_CLIENT_IP_HEADER` (see docs/auth-configuration.md)
 * before relying on per-source throttling in production.
 */
export const UNKNOWN_CLIENT_SOURCE = "unknown-source"

/**
 * Legacy Vercel-only behavior: `x-vercel-forwarded-for` is trusted only when
 * the platform-set `VERCEL=1` flag is present. New deployments should set
 * `TRUSTED_CLIENT_IP_HEADER=x-vercel-forwarded-for` explicitly instead of
 * relying on this implicit path.
 */
const VERCEL_FORWARDED_FOR_HEADER = "x-vercel-forwarded-for"
const UNKNOWN_VERCEL_SOURCE = "unknown-production-source"

function singleIpFromHeader(
  value: string | null | undefined,
  fallback: string = UNKNOWN_CLIENT_SOURCE
): string {
  const candidate = value?.trim() ?? ""

  if (candidate === "" || candidate.includes(",") || isIP(candidate) === 0) {
    return fallback
  }

  return candidate
}

/**
 * Pure client-source resolution for unit testing. Never trusts arbitrary
 * forwarded headers: a real IP is returned only from the explicitly
 * configured trusted header (within the optional region allowlist), or —
 * as a legacy path — from Vercel's platform-controlled header when
 * `VERCEL=1`. Everything else maps to a shared unknown bucket.
 */
export function resolveClientSource(
  env: Record<string, string | undefined>,
  getHeader: (name: string) => string | null | undefined
): string {
  const settings = getTrustedClientSourceSettings(env)

  if (settings.allowedRegions) {
    const currentRegion = getCurrentDeployRegion(env)
    if (!currentRegion || !settings.allowedRegions.includes(currentRegion)) {
      return UNKNOWN_CLIENT_SOURCE
    }
  }

  if (settings.headerName) {
    return singleIpFromHeader(getHeader(settings.headerName))
  }

  if (env.VERCEL === "1") {
    return singleIpFromHeader(
      getHeader(VERCEL_FORWARDED_FOR_HEADER),
      UNKNOWN_VERCEL_SOURCE
    )
  }

  return UNKNOWN_CLIENT_SOURCE
}

export async function getClientSource(
  env: Record<string, string | undefined> = process.env
): Promise<string> {
  try {
    const requestHeaders = await headers()
    return resolveClientSource(env, (name) => requestHeaders.get(name))
  } catch {
    return UNKNOWN_CLIENT_SOURCE
  }
}

function getDecision(
  data:
    Database["public"]["Functions"]["auth_rate_limit_status"]["Returns"] | null,
  error: unknown
): RateLimitDecision {
  if (error || !data?.[0]) {
    throw new Error("Auth rate-limit operation failed")
  }

  const row = data[0]
  return {
    allowed: row.allowed,
    failureCount: row.failure_count,
    retryAt: row.retry_at,
  }
}

function getAdmission(
  data:
    Database["public"]["Functions"]["auth_rate_limit_admit"]["Returns"] | null,
  error: unknown
): RateLimitAdmission {
  if (error || !data?.[0]) {
    throw new Error("Auth rate-limit admission failed")
  }

  const row = data[0]
  return {
    allowed: row.allowed,
    failureCount: row.failure_count,
    retryAt: row.retry_at,
    admissionToken: row.admission_token,
  }
}

export function createSupabaseRateLimitStore(
  client: SupabaseClient<Database>
): RateLimitStore {
  return {
    async check(scope, key, bucket) {
      const { data, error } = await client.rpc("auth_rate_limit_status", {
        p_scope: scope,
        p_key: key,
        p_window_seconds: bucket.windowSeconds,
        p_max_attempts: bucket.maxAttempts,
        p_lockout_seconds: bucket.lockoutSeconds,
      })

      return getDecision(data, error)
    },

    async admit(scope, key, bucket) {
      const { data, error } = await client.rpc("auth_rate_limit_admit", {
        p_scope: scope,
        p_key: key,
        p_window_seconds: bucket.windowSeconds,
        p_max_attempts: bucket.maxAttempts,
        p_lockout_seconds: bucket.lockoutSeconds,
      })

      return getAdmission(data, error)
    },

    async recordFailure(scope, key, bucket, admissionToken) {
      const { data, error } = await client.rpc(
        "auth_rate_limit_record_failure",
        {
          p_scope: scope,
          p_key: key,
          p_window_seconds: bucket.windowSeconds,
          p_max_attempts: bucket.maxAttempts,
          p_lockout_seconds: bucket.lockoutSeconds,
          p_admission_token: admissionToken,
        }
      )

      return getDecision(data, error)
    },

    async reset(scope, key, admissionToken) {
      const { error } = await client.rpc("auth_rate_limit_reset", {
        p_scope: scope,
        p_key: key,
        p_admission_token: admissionToken,
      })

      if (error) throw new Error("Auth rate-limit reset failed")
    },

    async release(scope, key, admissionToken) {
      const { error } = await client.rpc("auth_rate_limit_release", {
        p_scope: scope,
        p_key: key,
        p_admission_token: admissionToken,
      })

      if (error) throw new Error("Auth rate-limit release failed")
    },
  }
}
