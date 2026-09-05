"use server"

import {
  createSupabaseServerClient,
  getSupabaseConfiguration,
} from "@/lib/supabase/server"
import type { Database } from "@/lib/supabase/database.types"

export type CallbackRecord = Database["public"]["Tables"]["callbacks"]["Row"]
export type CallbackDetailResult =
  | { status: "success"; callback: CallbackRecord }
  | { status: "error"; message: string }

export async function getCallback(id: string): Promise<CallbackDetailResult> {
  try {
    const configuration = getSupabaseConfiguration()
    if (!configuration)
      return {
        status: "error",
        message: "Callbacks are unavailable. Please try again.",
      }
    const supabase = await createSupabaseServerClient(configuration)
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()
    if (authError || !user)
      return {
        status: "error",
        message: "Sign in again to view this callback.",
      }
    const { data, error } = await supabase
      .from("callbacks")
      .select("*")
      .eq("id", id)
      .eq("user_id", user.id)
      .maybeSingle()
    if (error || !data)
      return {
        status: "error",
        message:
          "Could not load this callback. It may have been deleted, or the connection is unavailable.",
      }
    return { status: "success", callback: data }
  } catch {
    return {
      status: "error",
      message:
        "Could not load this callback. Check your connection and try again.",
    }
  }
}
