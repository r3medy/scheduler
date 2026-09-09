export const HISTORY_PAGE_SIZE = 25

export const HISTORY_SEARCH_MIN_LENGTH = 2
export const HISTORY_SEARCH_MAX_LENGTH = 64

export const HISTORY_OUTCOMES = {
  reached: "Reached",
  voicemail: "Voicemail",
  no_answer: "No answer",
} as const

export type HistoryOutcome = keyof typeof HISTORY_OUTCOMES

export interface HistoryRow {
  id: string
  account_holder_name: string
  accountReference: string | null
  schedule_mode: "exact" | "window"
  scheduled_at: string | null
  window_start_at: string | null
  window_end_at: string | null
  resolution_outcome: HistoryOutcome | null
  closed_at: string | null
}

export type HistoryResult =
  | {
      status: "success"
      rows: HistoryRow[]
      counts: Record<HistoryOutcome | "all", number>
      total: number
      page: number
    }
  | { status: "error" | "unauthenticated" }

export function maskAccountNumber(accountNumber: string): string | null {
  const compactAccountNumber = accountNumber.replace(/\s/g, "")
  if (!compactAccountNumber) return null
  if (compactAccountNumber.length <= 4) return "••••"
  return `•••• ${compactAccountNumber.slice(-4)}`
}

export function sanitizeHistorySearch(value: unknown): string {
  if (typeof value !== "string") return ""
  // Strip commas so the value cannot break the PostgREST `or` filter syntax.
  return value.trim().replace(/,/g, "").slice(0, HISTORY_SEARCH_MAX_LENGTH)
}

export function escapeLikePattern(value: string): string {
  return value.replace(/[\\%_]/g, (match) => `\\${match}`)
}
