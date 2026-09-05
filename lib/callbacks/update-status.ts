"use server"

import { z } from "zod"

import { requireAuth } from "@/lib/callbacks/require-auth"
import { attemptNoteSchema } from "@/lib/callbacks/validation"
import type { Database } from "@/lib/supabase/database.types"

type AttemptOutcome = "voicemail" | "no_answer"
type AttemptAction = "close" | "reschedule"
type RpcArgs =
  Database["public"]["Functions"]["record_callback_attempt"]["Args"]

export type CallbackStatusResult =
  { status: "success" } | { status: "error"; message: string; field?: string }

const callbackIdSchema = z.string().uuid()

function text(formData: FormData, name: string) {
  const value = formData.get(name)
  return typeof value === "string" ? value.trim() : ""
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
  | { status: "success"; args: Omit<RpcArgs, "p_callback_id"> }
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

  const noteResult = attemptNoteSchema.safeParse(text(formData, "note"))
  if (!noteResult.success)
    return {
      status: "error",
      field: "note",
      message: noteResult.error.issues[0]?.message ?? "Enter a valid note.",
    }

  const common = {
    p_outcome: outcome as AttemptOutcome,
    p_note: noteResult.data || null,
    p_action: action as AttemptAction,
  }
  if (action === "close")
    return {
      status: "success",
      args: {
        ...common,
        p_schedule_mode: null,
        p_scheduled_at: null,
        p_window_start_at: null,
        p_window_end_at: null,
      },
    }

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
      args: {
        ...common,
        p_schedule_mode: "exact",
        p_scheduled_at: scheduledAt.value,
        p_window_start_at: null,
        p_window_end_at: null,
      },
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
    args: {
      ...common,
      p_schedule_mode: "window",
      p_scheduled_at: null,
      p_window_start_at: windowStart.value,
      p_window_end_at: windowEnd.value,
    },
  }
}

export async function updateCallbackStatus(
  id: string,
  input: string | FormData
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
    try {
      const { data, error } = await supabase
        .from("callbacks")
        .update({
          lifecycle_state: input === "open" ? "open" : "closed",
          resolution_outcome: input === "open" ? null : "reached",
          closed_at: input === "open" ? null : new Date().toISOString(),
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

  const parsed = parseAttempt(input)
  if (parsed.status === "error") return parsed
  try {
    const { data, error } = await supabase.rpc("record_callback_attempt", {
      p_callback_id: id,
      ...parsed.args,
    })
    if (error || data !== id)
      return {
        status: "error",
        message: "Could not record the outcome. Please try again.",
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
