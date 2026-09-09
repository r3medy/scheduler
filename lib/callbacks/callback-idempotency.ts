export type CreateCallbackResult =
  | { status: "success" }
  | { status: "error"; message: string; field?: string }
  | {
      status: "conflict"
      message: string
      reason?: "overlap" | "stale" | "idempotency"
    }

export function idempotencyKeyOf(formData: FormData): string | null {
  const raw = formData.get("idempotency_key")
  if (typeof raw !== "string") return null
  const value = raw.trim()
  return /^[0-9a-f-]{36}$/i.test(value) ? value : null
}

export function expectedUpdatedAtOf(formData: FormData): string | null {
  const raw = formData.get("expected_updated_at")
  if (typeof raw !== "string") return null
  const value = raw.trim()
  return value && Number.isFinite(Date.parse(value)) ? value : null
}

/**
 * Kept as a harmless compatibility hook for older test callers. Idempotency
 * authority is now the database request key, not process memory, so there is
 * no local state to clear between requests or workers.
 */
export function __clearCallbackIdempotencyCache() {}
