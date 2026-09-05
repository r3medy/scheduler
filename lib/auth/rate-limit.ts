import "server-only"

import { isIP } from "node:net"

import { headers } from "next/headers"
import type { SupabaseClient } from "@supabase/supabase-js"

import {
  type RateLimitDecision,
  type RateLimitStore,
} from "@/lib/auth/rate-limit-core"
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
  RateLimitScope,
  RateLimitStore,
} from "@/lib/auth/rate-limit-core"

export async function getClientSource(): Promise<string> {
  const isVercelRuntime = process.env.VERCEL === "1"

  if (!isVercelRuntime) return "local-development"

  const requestHeaders = await headers()
  const forwardedFor = requestHeaders.get("x-vercel-forwarded-for")?.trim()

  if (!forwardedFor || forwardedFor.includes(",") || isIP(forwardedFor) === 0) {
    return "unknown-production-source"
  }

  return forwardedFor
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

    async recordFailure(scope, key, bucket) {
      const { data, error } = await client.rpc(
        "auth_rate_limit_record_failure",
        {
          p_scope: scope,
          p_key: key,
          p_window_seconds: bucket.windowSeconds,
          p_max_attempts: bucket.maxAttempts,
          p_lockout_seconds: bucket.lockoutSeconds,
        }
      )

      return getDecision(data, error)
    },

    async reset(scope, key) {
      const { error } = await client.rpc("auth_rate_limit_reset", {
        p_scope: scope,
        p_key: key,
      })

      if (error) throw new Error("Auth rate-limit reset failed")
    },
  }
}
