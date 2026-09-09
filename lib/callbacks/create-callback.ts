"use server"

import {
  expectedUpdatedAtOf,
  idempotencyKeyOf,
} from "@/lib/callbacks/callback-idempotency"
import type { CreateCallbackResult } from "@/lib/callbacks/callback-idempotency"
import {
  requireAuth,
  type AuthenticatedGate,
} from "@/lib/callbacks/require-auth"
import {
  parseCallbackCreateInput,
  parseCallbackUpdateInput,
  type CallbackValues,
  type ExistingSchedule,
} from "@/lib/callbacks/validation"

type ExistingCallback = ExistingSchedule & {
  id: string
  updated_at: string | null
}

const STALE_MESSAGE =
  "This callback changed in another tab. Refresh to see the latest version, then try again. Your entries are still in this form."

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
  const parsed = parseCallbackCreateInput(formData)
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
  const { supabase, user } = gate

  let existing: ExistingCallback | null = null
  try {
    const { data, error } = await supabase
      .from("callbacks")
      .select(
        "id,schedule_mode,scheduled_at,window_start_at,window_end_at,updated_at"
      )
      .eq("id", id)
      .eq("user_id", user.id)
      .maybeSingle()
    if (error || !data)
      return {
        status: "error",
        message:
          "Could not update this callback. It may have been deleted. Your entries are still in this form.",
      }
    existing = data as ExistingCallback
  } catch {
    return {
      status: "error",
      message:
        "The connection was interrupted. Your entries are saved in this form. Please try again.",
    }
  }

  const expected = expectedUpdatedAtOf(formData)
  if (expected && existing.updated_at && existing.updated_at !== expected) {
    return { status: "conflict", reason: "stale", message: STALE_MESSAGE }
  }

  const parsed = parseCallbackUpdateInput(formData, existing)
  if (parsed.status === "error") return parsed
  return saveCallback(gate, parsed.values, formData, id, existing)
}

async function saveCallback(
  gate: AuthenticatedGate,
  values: CallbackValues,
  formData: FormData,
  id?: string,
  existing?: ExistingCallback | null
): Promise<CreateCallbackResult> {
  const { supabase, user } = gate

  const idempotencyKey = !id ? idempotencyKeyOf(formData) : null

  try {
    if (formData.get("allowConflict") !== "true") {
      const start = values.scheduled_at ?? values.window_start_at!
      const end = values.scheduled_at ?? values.window_end_at!
      let query = supabase
        .from("callbacks")
        .select("id,create_request_key", { count: "exact" })
        .eq("user_id", user.id)
        .eq("lifecycle_state", "open")
      if (id) query = query.neq("id", id)
      const { data, count, error } = await query.or(
        `and(schedule_mode.eq.exact,scheduled_at.gte.${start},scheduled_at.lte.${end}),and(schedule_mode.eq.window,window_start_at.lte.${end},window_end_at.gte.${start})`
      )
      if (error)
        return {
          status: "error",
          message:
            "Could not check this schedule. Your entries are saved in this form. Please try again.",
        }
      // A committed retry may overlap its own original row. Let the durable
      // RPC resolve that key so response-loss retries return the same result;
      // a different payload is still rejected by the stored fingerprint.
      const isCommittedRetry =
        idempotencyKey != null &&
        data?.some((row) => row.create_request_key === idempotencyKey)
      if (count && count > 0 && !isCommittedRetry)
        return {
          status: "conflict",
          reason: "overlap",
          message:
            "This schedule overlaps an existing open callback. You can keep this time and save, or edit the schedule.",
        }
    }

    if (id) {
      let query = supabase
        .from("callbacks")
        .update(values)
        .eq("id", id)
        .eq("user_id", user.id)
      // Optimistic concurrency: only overwrite the version the tab loaded.
      if (existing?.updated_at)
        query = query.eq("updated_at", existing.updated_at)
      const { data, error } = await query.select("id").maybeSingle()
      if (error || !data) {
        const expected = expectedUpdatedAtOf(formData)
        if (expected)
          return { status: "conflict", reason: "stale", message: STALE_MESSAGE }
        return {
          status: "error",
          message:
            "Could not update this callback. It may have been deleted. Your entries are still in this form.",
        }
      }
      return { status: "success" }
    }
    if (idempotencyKey) {
      const { data, error } = await supabase.rpc("create_callback_idempotent", {
        p_request_key: idempotencyKey,
        p_phone_number: values.phone_number,
        p_account_number: values.account_number,
        p_account_holder_name: values.account_holder_name,
        p_comments: values.comments ?? null,
        p_schedule_mode: values.schedule_mode,
        p_scheduled_at: values.scheduled_at ?? null,
        p_window_start_at: values.window_start_at ?? null,
        p_window_end_at: values.window_end_at ?? null,
      })
      if (error)
        return {
          status: "error",
          message:
            "Could not save the callback. Your entries are saved in this form. Please try again.",
        }

      const row = Array.isArray(data) ? data[0] : data
      if (!row || row.same_payload === false)
        return {
          status: "conflict",
          reason: "idempotency",
          message:
            "This request key was already used for different callback details. Start a new callback and try again.",
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
