"use server"

import { requireAuth } from "@/lib/callbacks/require-auth"
import { FEEDBACK_MAX_LENGTH } from "@/lib/feedback/limits"

export type SubmitFeedbackResult =
  | { status: "success" }
  | { status: "error"; message: string; field?: "rating" | "feedback" }

export async function submitFeedback(
  rating: number,
  feedback: string
): Promise<SubmitFeedbackResult> {
  const gate = await requireAuth()
  if (gate.status !== "ok")
    return {
      status: "error",
      message:
        gate.status === "unavailable"
          ? "Feedback is unavailable. Please try again later."
          : "Your session has expired. Sign in again before sending feedback.",
    }

  if (!Number.isInteger(rating) || rating < 1 || rating > 4)
    return { status: "error", message: "Choose how helpful Scheduler is.", field: "rating" }

  const trimmed = feedback.trim()
  if (trimmed.length === 0)
    return { status: "error", message: "Write your feedback first.", field: "feedback" }
  if (trimmed.length > FEEDBACK_MAX_LENGTH)
    return {
      status: "error",
      message: `Feedback must be ${FEEDBACK_MAX_LENGTH} characters or fewer.`,
      field: "feedback",
    }

  try {
    const { error } = await gate.supabase.from("feedback").insert({
      user_id: gate.user.id,
      rating,
      feedback: trimmed,
    })
    if (error)
      return {
        status: "error",
        message: "Could not send your feedback. Please try again.",
      }
    return { status: "success" }
  } catch {
    return {
      status: "error",
      message: "The connection was interrupted. Please try again.",
    }
  }
}
