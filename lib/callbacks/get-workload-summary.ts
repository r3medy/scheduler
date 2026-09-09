import "server-only"
import { requireAuth, type AuthGateResult } from "@/lib/callbacks/require-auth"

export interface WorkloadOpenRow {
  /** Stable tie-breaker used only for deterministic pagination. */
  id?: string
  schedule_mode: "exact" | "window"
  scheduled_at: string | null
  window_start_at: string | null
  window_end_at: string | null
}

export type WorkloadSummaryResult =
  | {
      status: "success"
      open: WorkloadOpenRow[]
      closedAts: string[]
    }
  | { status: "error" | "unauthenticated" }

// Paged retrieval for per-agent summaries. Open callbacks carry schedule
// fields only (plus an opaque id tie-breaker); closed rows carry just
// `closed_at` and an opaque id so local-day grouping can happen without
// exposing customer details. The result is complete for the owner-scoped
// query; the page size only bounds each request.
const WORKLOAD_PAGE_SIZE = 1_000
// Covers the full local "today" from any device timezone (UTC offset plus a
// complete local day of closed records).
const WORKLOAD_CLOSED_LOOKBACK_HOURS = 72

interface WorkloadPage<T> {
  data: T[] | null
  error: unknown
}

interface WorkloadQuery<T> {
  limit: (value: number) => WorkloadQuery<T>
  range?: (from: number, to: number) => WorkloadQuery<T>
  then: <TResult>(
    onfulfilled?: ((value: WorkloadPage<T>) => TResult | PromiseLike<TResult>) | null
  ) => PromiseLike<TResult>
}

interface PagedRows<T> {
  rows: T[]
  error: boolean
}

/** Fetch every matching row with deterministic forward ranges. Advancing by
 * the number actually returned handles providers whose configured response
 * cap is smaller than our requested page size without leaving gaps. The
 * empty-page probe makes a short final page distinguishable from such a cap. */
async function readAllPages<T>(
  buildPage: () => WorkloadQuery<T>
): Promise<PagedRows<T>> {
  const rows: T[] = []
  for (let offset = 0; ; ) {
    const query = buildPage()
    query.limit(WORKLOAD_PAGE_SIZE)
    const hasRange = typeof query.range === "function"
    const pageQuery = hasRange
      ? query.range!(offset, offset + WORKLOAD_PAGE_SIZE - 1)
      : query
    const { data, error } = await pageQuery
    if (error) return { rows: [], error: true }
    const page = Array.isArray(data) ? data : []
    if (page.length === 0) return { rows, error: false }
    rows.push(...page)
    if (!hasRange) return { rows, error: false }
    offset += page.length
  }
}

export async function getWorkloadSummary(
  providedGate?: AuthGateResult
): Promise<WorkloadSummaryResult> {
  try {
    const gate = providedGate ?? (await requireAuth())
    if (gate.status === "unavailable") return { status: "error" }
    if (gate.status === "unauthenticated") return { status: "unauthenticated" }
    const { supabase, user } = gate
    const cutoff = new Date(
      Date.now() - WORKLOAD_CLOSED_LOOKBACK_HOURS * 60 * 60 * 1000
    ).toISOString()
    const [openResult, closedResult] = await Promise.all([
      readAllPages<WorkloadOpenRow>(() => {
        const query = supabase
          .from("callbacks")
          .select("id, schedule_mode, scheduled_at, window_start_at, window_end_at")
          .eq("user_id", user.id)
          .eq("lifecycle_state", "open")
          .order("scheduled_at", { ascending: true, nullsFirst: false })
          .order("window_start_at", { ascending: true, nullsFirst: false })
          .order("id", { ascending: true })
        return query as unknown as WorkloadQuery<WorkloadOpenRow>
      }),
      readAllPages<{ closed_at: string | null; id?: string }>(() => {
        const query = supabase
          .from("callbacks")
          .select("id, closed_at")
          .eq("user_id", user.id)
          .eq("lifecycle_state", "closed")
          .gte("closed_at", cutoff)
          .order("closed_at", { ascending: false })
          .order("id", { ascending: true })
        return query as unknown as WorkloadQuery<{
          closed_at: string | null
          id?: string
        }>
      }),
    ])
    if (openResult.error || closedResult.error) return { status: "error" }
    const result: Extract<WorkloadSummaryResult, { status: "success" }> = {
      status: "success",
      open: openResult.rows,
      closedAts: closedResult.rows
        .map((row) => row.closed_at)
        .filter((value): value is string => value !== null),
    }
    return result
  } catch {
    return { status: "error" }
  }
}
