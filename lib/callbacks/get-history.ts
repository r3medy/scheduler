import "server-only"
import {
  requireAuth,
  type AuthGateResult,
} from "@/lib/callbacks/require-auth"
import {
  HISTORY_OUTCOMES,
  HISTORY_PAGE_SIZE,
  HISTORY_SEARCH_MIN_LENGTH,
  escapeLikePattern,
  maskAccountNumber,
  sanitizeHistorySearch,
  type HistoryOutcome,
  type HistoryResult,
} from "@/lib/callbacks/presentation"

export { HISTORY_OUTCOMES, HISTORY_PAGE_SIZE }
export type { HistoryOutcome, HistoryResult }

export async function getHistory(
  page: number,
  outcome?: HistoryOutcome,
  search?: string,
  providedGate?: AuthGateResult
): Promise<HistoryResult> {
  try {
    const gate = providedGate ?? (await requireAuth())
    if (gate.status === "unavailable") return { status: "error" }
    if (gate.status === "unauthenticated") return { status: "unauthenticated" }
    const { supabase, user } = gate
    const base = () =>
      supabase
        .from("callbacks")
        .select("id", { count: "exact", head: true })
        .eq("user_id", user.id)
        .eq("lifecycle_state", "closed")
    const countFor = async (key: HistoryOutcome | "all") => {
      const query = base()
      const result = await (key === "all"
        ? query
        : query.eq("resolution_outcome", key))
      return { key, result }
    }
    const totals = await Promise.all(
      (
        ["all", ...Object.keys(HISTORY_OUTCOMES)] as Array<
          HistoryOutcome | "all"
        >
      ).map(countFor)
    )
    if (totals.some(({ result }) => result.error)) return { status: "error" }
    const counts = Object.fromEntries(
      totals.map(({ key, result }) => [key, result.count ?? 0])
    ) as Record<HistoryOutcome | "all", number>
    // Owner-scoped customer-field search. A short or blank query is ignored so
    // search cannot be used to enumerate a customer directory; matching rows
    // stay masked and paged exactly like the unfiltered list.
    const searchTerm = sanitizeHistorySearch(search ?? "")
    const hasSearch = searchTerm.length >= HISTORY_SEARCH_MIN_LENGTH
    const searchPattern = hasSearch
      ? `%${escapeLikePattern(searchTerm)}%`
      : null
    const applySearch = <T>(query: T): T => {
      if (!searchPattern) return query
      return (query as unknown as {
        or: (filter: string) => T
      }).or(
        `account_holder_name.ilike.${searchPattern},phone_number.ilike.${searchPattern},account_number.ilike.${searchPattern}`
      )
    }
    let total = counts[outcome ?? "all"]
    if (searchPattern) {
      let countQuery = supabase
        .from("callbacks")
        .select("id", { count: "exact", head: true })
        .eq("user_id", user.id)
        .eq("lifecycle_state", "closed")
      if (outcome) countQuery = countQuery.eq("resolution_outcome", outcome)
      const { count, error: searchCountError } = await applySearch(countQuery)
      if (searchCountError) return { status: "error" }
      total = count ?? 0
    }
    page = Math.min(page, Math.max(1, Math.ceil(total / HISTORY_PAGE_SIZE)))
    let query = supabase
      .from("callbacks")
      .select(
        "id, account_holder_name, account_number, schedule_mode, scheduled_at, window_start_at, window_end_at, resolution_outcome, closed_at"
      )
      .eq("user_id", user.id)
      .eq("lifecycle_state", "closed")
    if (outcome) query = query.eq("resolution_outcome", outcome)
    const { data, error } = await applySearch(query)
      .order("closed_at", { ascending: false })
      .order("id")
      .range((page - 1) * HISTORY_PAGE_SIZE, page * HISTORY_PAGE_SIZE - 1)
    if (error) return { status: "error" }
    return {
      status: "success",
      counts,
      total,
      page,
      rows: data.map(({ account_number, ...row }) => ({
        ...row,
        accountReference: maskAccountNumber(account_number),
      })),
    }
  } catch {
    return { status: "error" }
  }
}
