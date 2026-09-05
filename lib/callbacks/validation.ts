import { z } from "zod"

import type { Database } from "@/lib/supabase/database.types"
import {
  ACCOUNT_HOLDER_NAME_MAX_LENGTH,
  ACCOUNT_NUMBER_MAX_LENGTH,
  ATTEMPT_NOTE_MAX_LENGTH,
  COMMENTS_MAX_LENGTH,
  PHONE_NUMBER_MAX_LENGTH,
} from "@/lib/callbacks/limits"

export {
  ACCOUNT_HOLDER_NAME_MAX_LENGTH,
  ACCOUNT_NUMBER_MAX_LENGTH,
  ATTEMPT_NOTE_MAX_LENGTH,
  CALLBACK_FIELD_MAX_LENGTHS,
  COMMENTS_MAX_LENGTH,
  PHONE_NUMBER_MAX_LENGTH,
} from "@/lib/callbacks/limits"

const callbackTextSchema = z.object({
  phone_number: z
    .string()
    .min(1, "Enter the callback phone number.")
    .max(
      PHONE_NUMBER_MAX_LENGTH,
      `Callback phone number must be ${PHONE_NUMBER_MAX_LENGTH} characters or fewer.`
    ),
  account_number: z
    .string()
    .min(1, "Enter the account number.")
    .max(
      ACCOUNT_NUMBER_MAX_LENGTH,
      `Account number must be ${ACCOUNT_NUMBER_MAX_LENGTH} characters or fewer.`
    ),
  account_holder_name: z
    .string()
    .min(1, "Enter the account-holder name.")
    .max(
      ACCOUNT_HOLDER_NAME_MAX_LENGTH,
      `Account-holder name must be ${ACCOUNT_HOLDER_NAME_MAX_LENGTH} characters or fewer.`
    ),
  comments: z
    .string()
    .max(
      COMMENTS_MAX_LENGTH,
      `Comments must be ${COMMENTS_MAX_LENGTH} characters or fewer.`
    ),
})

export const attemptNoteSchema = z
  .string()
  .trim()
  .max(
    ATTEMPT_NOTE_MAX_LENGTH,
    `Attempt note must be ${ATTEMPT_NOTE_MAX_LENGTH} characters or fewer.`
  )

export type CallbackValues = Omit<
  Database["public"]["Tables"]["callbacks"]["Insert"],
  "user_id"
>

export function parseCallbackInput(
  formData: FormData
):
  | { status: "success"; values: CallbackValues }
  | { status: "error"; field: string; message: string } {
  const text = (name: string) => {
    const value = formData.get(name)
    return typeof value === "string" ? value.trim() : ""
  }
  const textFields = {
    phone_number: text("phone_number"),
    account_number: text("account_number"),
    account_holder_name: text("account_holder_name"),
    comments: text("comments"),
  }
  const textValidation = callbackTextSchema.safeParse(textFields)
  if (!textValidation.success) {
    const issue = textValidation.error.issues[0]
    const field = issue?.path[0]
    return {
      status: "error",
      field: typeof field === "string" ? field : "comments",
      message: issue?.message ?? "Enter valid callback details.",
    }
  }
  const mode = text("schedule_mode")
  if (mode !== "exact" && mode !== "window")
    return {
      status: "error",
      field: "schedule_mode",
      message: "Choose a scheduling mode.",
    }
  const fields =
    mode === "exact" ? ["scheduled_at"] : ["window_start_at", "window_end_at"]
  for (const field of fields) {
    const value = text(field)
    // The browser converts device-local input to UTC before submission.
    if (
      !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value) ||
      !Number.isFinite(Date.parse(value)) ||
      new Date(value).toISOString() !== value
    ) {
      return { status: "error", field, message: "Enter a valid date and time." }
    }
  }
  if (
    mode === "window" &&
    Date.parse(text("window_end_at")) <= Date.parse(text("window_start_at"))
  ) {
    return {
      status: "error",
      field: "window_end_at",
      message: "Window end must be later than window start.",
    }
  }
  const startField = mode === "exact" ? "scheduled_at" : "window_start_at"
  if (Date.parse(text(startField)) <= Date.now()) {
    return {
      status: "error",
      field: startField,
      message: "Choose a date and time in the future.",
    }
  }
  return {
    status: "success",
    values: {
      phone_number: textValidation.data.phone_number,
      account_number: textValidation.data.account_number,
      account_holder_name: textValidation.data.account_holder_name,
      comments: textValidation.data.comments || null,
      schedule_mode: mode,
      scheduled_at: mode === "exact" ? text("scheduled_at") : null,
      window_start_at: mode === "window" ? text("window_start_at") : null,
      window_end_at: mode === "window" ? text("window_end_at") : null,
    },
  }
}
