import "server-only"

import { createServerClient } from "@supabase/ssr"
import { cookies } from "next/headers"

import { getPublicSupabaseConfiguration } from "@/lib/config/runtime"
import type { Database } from "@/lib/supabase/database.types"

export type SupabaseConfiguration = {
  url: string
  publishableKey: string
}

export function getSupabaseConfiguration(): SupabaseConfiguration | null {
  return getPublicSupabaseConfiguration()
}

export async function createSupabaseServerClient(
  configuration: SupabaseConfiguration
) {
  const cookieStore = await cookies()

  return createServerClient<Database>(
    configuration.url,
    configuration.publishableKey,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
        setAll(cookiesToSet) {
          try {
            for (const { name, value, options } of cookiesToSet) {
              cookieStore.set(name, value, options)
            }
          } catch {
            // Server Components cannot write cookies. Session refresh belongs in proxy.ts.
          }
        },
      },
    }
  )
}
