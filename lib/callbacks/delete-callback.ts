"use server"

import { requireAuth } from "@/lib/callbacks/require-auth"

export async function deleteCallback(
  id: string
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
      message: "Sign in again before deleting this callback.",
    }
  const { supabase, user } = gate
  try {
    const { data, error } = await supabase
      .from("callbacks")
      .delete()
      .eq("id", id)
      .eq("user_id", user.id)
      .select("id")
      .maybeSingle()
    if (error || !data)
      return {
        status: "error",
        message: "Could not delete this callback. Please try again.",
      }
    return { status: "success" }
  } catch {
    return {
      status: "error",
      message:
        "Could not confirm deletion. Check your connection and reload before trying again.",
    }
  }
}
