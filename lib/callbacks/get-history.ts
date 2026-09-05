import "server-only"
import {
  createSupabaseServerClient,
  getSupabaseConfiguration,
} from "@/lib/supabase/server"
import {
  HISTORY_OUTCOMES,
  HISTORY_PAGE_SIZE,
  maskAccountNumber,
  type HistoryOutcome,
  type HistoryResult,
} from "@/lib/callbacks/presentation"

export { HISTORY_OUTCOMES, HISTORY_PAGE_SIZE }
export type { HistoryOutcome, HistoryResult }

export async function getHistory(
  page: number,
  outcome?: HistoryOutcome
): Promise<HistoryResult> {
  try {
    const config = getSupabaseConfiguration()
    if (!config) return { status: "error" }
    const supabase = await createSupabaseServerClient(config)
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()
    if (authError || !user) return { status: "unauthenticated" }
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
    const total = counts[outcome ?? "all"]
    page = Math.min(page, Math.max(1, Math.ceil(total / HISTORY_PAGE_SIZE)))
    let query = supabase
      .from("callbacks")
      .select(
        "id, account_holder_name, account_number, schedule_mode, scheduled_at, window_start_at, window_end_at, resolution_outcome, closed_at"
      )
      .eq("user_id", user.id)
      .eq("lifecycle_state", "closed")
    if (outcome) query = query.eq("resolution_outcome", outcome)
    const { data, error } = await query
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
