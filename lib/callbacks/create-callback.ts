"use server"

import {
  requireAuth,
  type AuthenticatedGate,
} from "@/lib/callbacks/require-auth"
import {
  parseCallbackInput,
  type CallbackValues,
} from "@/lib/callbacks/validation"

export type CreateCallbackResult =
  | { status: "success" }
  | { status: "error"; message: string; field?: string }
  | { status: "conflict"; message: string }

export async function createCallback(
  formData: FormData
): Promise<CreateCallbackResult> {
  const gate = await requireAuth()
  if (gate.status !== "ok")
    return {
      status: "error",
      message:
        gate.status === "unavailable"
          ? "Callbacks are unavailable. Please try again later."
          : "Your session has expired. Sign in again before saving.",
    }
  const parsed = parseCallbackInput(formData)
  if (parsed.status === "error") return parsed
  return saveCallback(gate, parsed.values, formData)
}

export async function updateCallback(
  id: string,
  formData: FormData
): Promise<CreateCallbackResult> {
  const gate = await requireAuth()
  if (gate.status !== "ok")
    return {
      status: "error",
      message:
        gate.status === "unavailable"
          ? "Callbacks are unavailable. Please try again later."
          : "Your session has expired. Sign in again before saving.",
    }
  if (!/^[0-9a-f-]{36}$/i.test(id))
    return { status: "error", message: "Callback unavailable." }
  const parsed = parseCallbackInput(formData)
  if (parsed.status === "error") return parsed
  return saveCallback(gate, parsed.values, formData, id)
}

async function saveCallback(
  gate: AuthenticatedGate,
  values: CallbackValues,
  formData: FormData,
  id?: string
): Promise<CreateCallbackResult> {
  const { supabase, user } = gate

  try {
    if (formData.get("allowConflict") !== "true") {
      const start = values.scheduled_at ?? values.window_start_at!
      const end = values.scheduled_at ?? values.window_end_at!
      let query = supabase
        .from("callbacks")
        .select("id", { count: "exact", head: true })
        .eq("user_id", user.id)
        .eq("lifecycle_state", "open")
      if (id) query = query.neq("id", id)
      const { count, error } = await query.or(
        `and(schedule_mode.eq.exact,scheduled_at.gte.${start},scheduled_at.lte.${end}),and(schedule_mode.eq.window,window_start_at.lte.${end},window_end_at.gte.${start})`
      )
      if (error)
        return {
          status: "error",
          message:
            "Could not check this schedule. Your entries are saved in this form. Please try again.",
        }
      if (count && count > 0)
        return {
          status: "conflict",
          message:
            "This schedule overlaps an existing open callback. You can keep this time and save, or edit the schedule.",
        }
    }

    if (id) {
      const { data, error } = await supabase
        .from("callbacks")
        .update(values)
        .eq("id", id)
        .eq("user_id", user.id)
        .select("id")
        .maybeSingle()
      if (error || !data)
        return {
          status: "error",
          message:
            "Could not update this callback. It may have been deleted. Your entries are still in this form.",
        }
      return { status: "success" }
    }
    const { error } = await supabase
      .from("callbacks")
      .insert({ ...values, user_id: user.id, lifecycle_state: "open" })
    if (error)
      return {
        status: "error",
        message:
          "Could not save the callback. Your entries are saved in this form. Please try again.",
      }
    return { status: "success" }
  } catch {
    return {
      status: "error",
      message:
        "The connection was interrupted. Your entries are saved in this form. Please try again.",
    }
  }
}
