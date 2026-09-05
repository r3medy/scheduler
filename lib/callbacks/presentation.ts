export const HISTORY_PAGE_SIZE = 25

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
