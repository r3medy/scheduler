import "server-only"

import { redirect } from "next/navigation"

import {
  createSupabaseServerClient,
  getSupabaseConfiguration,
} from "@/lib/supabase/server"

export async function redirectAuthenticatedUser() {
  const configuration = getSupabaseConfiguration()
  if (!configuration) return

  let user
  try {
    const supabase = await createSupabaseServerClient(configuration)
    const result = await supabase.auth.getUser()
    user = result.data.user
  } catch {
    return
  }

  if (user) redirect("/")
}
