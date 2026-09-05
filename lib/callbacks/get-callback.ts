"use server"

import type { Database } from "@/lib/supabase/database.types"
import { requireAuth } from "@/lib/callbacks/require-auth"

export type CallbackRecord = Database["public"]["Tables"]["callbacks"]["Row"]
export type CallbackAttemptRecord =
  Database["public"]["Tables"]["callback_attempts"]["Row"]
export type CallbackDetailResult =
  | {
      status: "success"
      callback: CallbackRecord
      attempts: CallbackAttemptRecord[]
    }
  | { status: "error"; message: string }

export async function getCallback(id: string): Promise<CallbackDetailResult> {
  try {
    const gate = await requireAuth()
    if (gate.status === "unavailable")
      return {
        status: "error",
        message: "Callbacks are unavailable. Please try again.",
      }
    if (gate.status === "unauthenticated")
      return {
        status: "error",
        message: "Sign in again to view this callback.",
      }
    const { supabase, user } = gate
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
    const { data: attempts, error: attemptsError } = await supabase
      .from("callback_attempts")
      .select("*")
      .eq("callback_id", id)
      .order("attempted_at", { ascending: false })
    if (attemptsError || !attempts)
      return {
        status: "error",
        message:
          "Could not load this callback's attempt history. Please try again.",
      }
    return { status: "success", callback: data, attempts }
  } catch {
    return {
      status: "error",
      message:
        "Could not load this callback. Check your connection and try again.",
    }
  }
}
