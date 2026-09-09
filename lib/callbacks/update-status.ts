"use server"

import { z } from "zod"

import { requireAuth } from "@/lib/callbacks/require-auth"

type AttemptOutcome = "voicemail" | "no_answer"
type AttemptAction = "close" | "reschedule"
type AttemptSchedule =
  | { mode: "exact"; scheduledAt: string }
  | { mode: "window"; windowStartAt: string; windowEndAt: string }

export type CallbackStatusResult =
  | { status: "success" }
  | { status: "error"; message: string; field?: string }
  | { status: "conflict"; message: string; reason?: "stale" }

const callbackIdSchema = z.string().uuid()

const STALE_STATUS_MESSAGE =
  "This callback changed in another tab. Refresh to see the latest version, then try again."

function text(formData: FormData, name: string) {
  const value = formData.get(name)
  return typeof value === "string" ? value.trim() : ""
}

function expectedUpdatedAtOf(formData: FormData): string | null {
  const raw = formData.get("expected_updated_at")
  if (typeof raw !== "string") return null
  const value = raw.trim()
  return value && Number.isFinite(Date.parse(value)) ? value : null
}

function parseTimestamp(
  formData: FormData,
  field: string
):
  | { status: "success"; value: string }
  | Extract<CallbackStatusResult, { status: "error" }> {
  const value = text(formData, field)
  if (
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value) ||
    !Number.isFinite(Date.parse(value)) ||
    new Date(value).toISOString() !== value
  ) {
    return {
      status: "error",
      field,
      message: "Enter a valid date and time.",
    }
  }
  if (Date.parse(value) <= Date.now()) {
    return {
      status: "error",
      field,
      message: "Choose a date and time in the future.",
    }
  }
  return { status: "success", value }
}

function parseAttempt(
  formData: FormData
):
  | {
      status: "success"
      outcome: AttemptOutcome
      action: AttemptAction
      schedule: AttemptSchedule | null
    }
  | Extract<CallbackStatusResult, { status: "error" }> {
  const outcome = text(formData, "outcome")
  if (outcome !== "voicemail" && outcome !== "no_answer")
    return {
      status: "error",
      field: "outcome",
      message: "Choose Voicemail or No answer.",
    }

  const action = text(formData, "attempt_action")
  if (action !== "close" && action !== "reschedule")
    return {
      status: "error",
      field: "attempt_action",
      message: "Choose whether to close or reschedule the callback.",
    }

  // Outcomes overwrite the callback's current resolution fields. No attempt
  // history is preserved (explicit scope cut).
  const common = {
    outcome: outcome as AttemptOutcome,
    action: action as AttemptAction,
  }
  if (action === "close")
    return { status: "success", ...common, schedule: null }

  const mode = text(formData, "schedule_mode")
  if (mode !== "exact" && mode !== "window")
    return {
      status: "error",
      field: "schedule_mode",
      message: "Choose a scheduling mode.",
    }

  if (mode === "exact") {
    const scheduledAt = parseTimestamp(formData, "scheduled_at")
    if (scheduledAt.status === "error") return scheduledAt
    return {
      status: "success",
      ...common,
      schedule: { mode: "exact", scheduledAt: scheduledAt.value },
    }
  }

  const windowStart = parseTimestamp(formData, "window_start_at")
  if (windowStart.status === "error") return windowStart
  const windowEnd = parseTimestamp(formData, "window_end_at")
  if (windowEnd.status === "error") return windowEnd
  if (Date.parse(windowEnd.value) <= Date.parse(windowStart.value))
    return {
      status: "error",
      field: "window_end_at",
      message: "Window end must be later than window start.",
    }
  return {
    status: "success",
    ...common,
    schedule: {
      mode: "window",
      windowStartAt: windowStart.value,
      windowEndAt: windowEnd.value,
    },
  }
}

async function checkFreshness(
  supabase: Awaited<ReturnType<typeof import("@/lib/supabase/server").createSupabaseServerClient>>,
  userId: string,
  id: string,
  expected: string
): Promise<CallbackStatusResult | null> {
  try {
    const { data, error } = await supabase
      .from("callbacks")
      .select("updated_at")
      .eq("id", id)
      .eq("user_id", userId)
      .maybeSingle()
    if (error || !data)
      return {
        status: "error",
        message: "Could not change the status. Please try again.",
      }
    const current = (data as { updated_at?: string | null }).updated_at
    if (current && current !== expected)
      return {
        status: "conflict",
        reason: "stale",
        message: STALE_STATUS_MESSAGE,
      }
    return null
  } catch {
    return {
      status: "error",
      message:
        "Could not confirm the status change. Check your connection and reload.",
    }
  }
}

export async function updateCallbackStatus(
  id: string,
  input: string | FormData,
  expectedUpdatedAt?: string
): Promise<CallbackStatusResult> {
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
  if (!callbackIdSchema.safeParse(id).success)
    return { status: "error", message: "Choose a valid callback." }

  const { supabase, user } = gate
  if (typeof input === "string") {
    if (input !== "open" && input !== "reached")
      return {
        status: "error",
        message:
          "Choose Close or Reschedule before saving an unsuccessful outcome.",
      }
    const expected =
      typeof expectedUpdatedAt === "string" &&
      Number.isFinite(Date.parse(expectedUpdatedAt))
        ? expectedUpdatedAt
        : null
    if (expected) {
      const stale = await checkFreshness(supabase, user.id, id, expected)
      if (stale) return stale
    }
    try {
      let query = supabase
        .from("callbacks")
        .update({
          lifecycle_state: input === "open" ? "open" : "closed",
          resolution_outcome: input === "open" ? null : "reached",
          closed_at: input === "open" ? null : new Date().toISOString(),
        })
        .eq("id", id)
        .eq("user_id", user.id)
      if (expected) query = query.eq("updated_at", expected)
      const { data, error } = await query.select("id").maybeSingle()
      if (error || !data) {
        if (expected)
          return {
            status: "conflict",
            reason: "stale",
            message: STALE_STATUS_MESSAGE,
          }
        return {
          status: "error",
          message: "Could not change the status. Please try again.",
        }
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

  const parsed = parseAttempt(input)
  if (parsed.status === "error") return parsed
  const expected = expectedUpdatedAtOf(input)
  if (expected) {
    const stale = await checkFreshness(supabase, user.id, id, expected)
    if (stale) return stale
  }
  try {
    let values:
      | {
          lifecycle_state: "closed"
          resolution_outcome: AttemptOutcome
          closed_at: string
        }
      | {
          schedule_mode: "exact" | "window"
          scheduled_at: string | null
          window_start_at: string | null
          window_end_at: string | null
          lifecycle_state: "open"
          resolution_outcome: null
          closed_at: null
        }
    if (parsed.action === "close") {
      values = {
        lifecycle_state: "closed",
        resolution_outcome: parsed.outcome,
        closed_at: new Date().toISOString(),
      }
    } else if (parsed.schedule?.mode === "exact") {
      values = {
        schedule_mode: "exact",
        scheduled_at: parsed.schedule.scheduledAt,
        window_start_at: null,
        window_end_at: null,
        lifecycle_state: "open",
        resolution_outcome: null,
        closed_at: null,
      }
    } else if (parsed.schedule) {
      values = {
        schedule_mode: "window",
        scheduled_at: null,
        window_start_at: parsed.schedule.windowStartAt,
        window_end_at: parsed.schedule.windowEndAt,
        lifecycle_state: "open",
        resolution_outcome: null,
        closed_at: null,
      }
    } else {
      return {
        status: "error",
        message: "Could not record the outcome. Please try again.",
      }
    }
    let query = supabase
      .from("callbacks")
      .update(values)
      .eq("id", id)
      .eq("user_id", user.id)
    if (expected) query = query.eq("updated_at", expected)
    const { data, error } = await query.select("id").maybeSingle()
    if (error || !data) {
      if (expected)
        return {
          status: "conflict",
          reason: "stale",
          message: STALE_STATUS_MESSAGE,
        }
      return {
        status: "error",
        message: "Could not record the outcome. Please try again.",
      }
    }
    return { status: "success" }
  } catch {
    return {
      status: "error",
      message:
        "Could not confirm the outcome. Check your connection and reload.",
    }
  }
}
