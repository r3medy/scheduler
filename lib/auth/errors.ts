export const AUTH_SERVICE_UNAVAILABLE_MESSAGE =
  "Authentication is temporarily unavailable. Try again shortly."
export const INVALID_CREDENTIALS_MESSAGE = "The company ID or PIN is incorrect."
export const COMPANY_ID_CLAIMED_MESSAGE =
  "That company ID has already been claimed."

export type SupabaseAuthFailureKind =
  "invalid-credentials" | "already-claimed" | "service-unavailable"

interface SupabaseErrorShape {
  code?: string
  message?: string
  status?: number
}

function getErrorShape(error: unknown): SupabaseErrorShape {
  if (!error || typeof error !== "object") return {}

  const candidate = error as Record<string, unknown>
  return {
    code: typeof candidate.code === "string" ? candidate.code : undefined,
    message:
      typeof candidate.message === "string" ? candidate.message : undefined,
    status: typeof candidate.status === "number" ? candidate.status : undefined,
  }
}

export function classifyLoginError(
  error: unknown
): Extract<
  SupabaseAuthFailureKind,
  "invalid-credentials" | "service-unavailable"
> {
  const { code, status } = getErrorShape(error)

  if (code === "invalid_credentials" || status === 400) {
    return "invalid-credentials"
  }

  return "service-unavailable"
}

export function classifyRegistrationError(
  error: unknown
): Extract<SupabaseAuthFailureKind, "already-claimed" | "service-unavailable"> {
  const { code, message } = getErrorShape(error)
  const normalizedMessage = message?.toLowerCase() ?? ""

  if (
    code === "email_exists" ||
    normalizedMessage.includes("already registered") ||
    normalizedMessage.includes("already exists") ||
    normalizedMessage.includes("user already")
  ) {
    return "already-claimed"
  }

  return "service-unavailable"
}

export function getRetryMessage(retryAt: string | null): string {
  const retryTimestamp = retryAt ? Date.parse(retryAt) : Number.NaN
  const remainingMinutes = Number.isFinite(retryTimestamp)
    ? Math.max(1, Math.ceil((retryTimestamp - Date.now()) / 60_000))
    : 15

  return `Too many attempts. Try again in ${remainingMinutes} minute${remainingMinutes === 1 ? "" : "s"}.`
}
