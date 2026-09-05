import "server-only"

import { createClient } from "@supabase/supabase-js"

import {
  getSupabaseAdminConfiguration,
  type SupabaseAdminConfiguration,
} from "@/lib/config/runtime"
import type { Database } from "@/lib/supabase/database.types"

export function createSupabaseAdminClient(
  configuration: SupabaseAdminConfiguration | null = getSupabaseAdminConfiguration()
) {
  if (!configuration) return null

  return createClient<Database>(
    configuration.url,
    configuration.serviceRoleKey,
    {
      auth: {
        autoRefreshToken: false,
        detectSessionInUrl: false,
        persistSession: false,
      },
    }
  )
}
