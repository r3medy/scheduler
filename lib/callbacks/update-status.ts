"use server"

import { requireAuth } from "@/lib/callbacks/require-auth"

export async function updateCallbackStatus(
  id: string,
  status: string
): Promise<{ status: "success" } | { status: "error"; message: string }> {
  const gate = await requireAuth()
  if (gate.status === "unavailable")
    return {
      status: "error",
      message: "Callbacks are unavailable. Please try again.",
    }
  if (gate.status === "unauthenticated")
    return {
      status: "error",
      message: "Sign in again before changing this callback.",
    }
  if (
    status !== "open" &&
    status !== "reached" &&
    status !== "voicemail" &&
    status !== "no_answer"
  ) {
    return { status: "error", message: "Choose a valid callback status." }
  }
  const { supabase, user } = gate
  try {
    const { data, error } = await supabase
      .from("callbacks")
      .update({
        lifecycle_state: status === "open" ? "open" : "closed",
        resolution_outcome: status === "open" ? null : status,
        closed_at: status === "open" ? null : new Date().toISOString(),
      })
      .eq("id", id)
      .eq("user_id", user.id)
      .select("id")
      .maybeSingle()
    if (error || !data)
      return {
        status: "error",
        message: "Could not change the status. Please try again.",
      }
    return { status: "success" }
  } catch {
    return {
      status: "error",
      message:
        "Could not confirm the status change. Check your connection and reload.",
    }
  }
}
