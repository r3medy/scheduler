import { beforeEach, describe, expect, it, vi } from "vitest"

const state = vi.hoisted(() => ({
  getUser: vi.fn(),
  from: vi.fn(),
  queries: [] as Array<{
    columns: string
    filters: Record<string, string>
    gteFilters: Record<string, string>
    limitValue?: number
    rangeValue?: [number, number]
  }>,
  openRows: [] as Array<Record<string, string | null>>,
  closedRows: [] as Array<{ closed_at: string | null }>,
  apiPageSize: Number.POSITIVE_INFINITY,
  fail: false,
}))

vi.mock("server-only", () => ({}))
vi.mock("@/lib/supabase/server", () => ({
  getSupabaseConfiguration: () => ({}),
  createSupabaseServerClient: () => ({
    auth: { getUser: state.getUser },
    from: state.from,
  }),
}))

import { getWorkloadSummary } from "@/lib/callbacks/get-workload-summary"
import { computeWorkloadCounts } from "@/components/callbacks/workload-summary"
import type { WorkloadOpenRow } from "@/lib/callbacks/get-workload-summary"

beforeEach(() => {
  vi.resetAllMocks()
  state.queries = []
  state.fail = false
  state.openRows = []
  state.closedRows = []
  state.apiPageSize = Number.POSITIVE_INFINITY
  state.getUser.mockResolvedValue({
    data: { user: { id: "owner" } },
    error: null,
  })
  state.from.mockImplementation(() => {
    const query: {
      columns: string
      filters: Record<string, string>
      gteFilters: Record<string, string>
      limitValue?: number
      rangeValue?: [number, number]
    } = { columns: "", filters: {}, gteFilters: {} }
    state.queries.push(query)
    const chain = {
      select: (columns: string) => {
        query.columns = columns
        return chain
      },
      eq: (key: string, value: string) => {
        query.filters[key] = value
        return chain
      },
      gte: (key: string, value: string) => {
        query.gteFilters[key] = value
        return chain
      },
      order: () => chain,
      limit: (value: number) => {
        query.limitValue = value
        return chain
      },
      range: (from: number, to: number) => {
        query.rangeValue = [from, to]
        return chain
      },
      then: (resolve: (value: unknown) => void) => {
        if (state.fail) return resolve({ data: null, error: { message: "db" } })
        const rows = query.columns.includes("schedule_mode")
          ? state.openRows
          : state.closedRows
        const page = query.rangeValue
          ? rows.slice(
              query.rangeValue[0],
              Math.min(
                query.rangeValue[1] + 1,
                query.rangeValue[0] + state.apiPageSize
              )
            )
          : rows
        return resolve({
          data: page,
          error: null,
        })
      },
    }
    return chain
  })
})

describe("workload summary query", () => {
  it("scopes open and closed reads to the owner without customer details", async () => {
    const result = await getWorkloadSummary()
    expect(result).toEqual({ status: "success", open: [], closedAts: [] })
    expect(state.queries).toHaveLength(2)
    for (const query of state.queries) {
      expect(query.filters).toMatchObject({ user_id: "owner" })
      expect(query.columns).not.toContain("account_number")
      expect(query.columns).not.toContain("phone_number")
      expect(query.columns).not.toContain("account_holder_name")
    }
    const [openQuery, closedQuery] = state.queries
    expect(openQuery.filters).toMatchObject({ lifecycle_state: "open" })
    expect(closedQuery.filters).toMatchObject({ lifecycle_state: "closed" })
    expect(closedQuery.gteFilters).toHaveProperty("closed_at")
    expect(openQuery.limitValue).toBeGreaterThan(0)
  })

  it("returns closed timestamps while dropping nulls", async () => {
    state.closedRows = [
      { closed_at: "2026-09-06T08:00:00.000Z" },
      { closed_at: null },
    ]
    const result = await getWorkloadSummary()
    expect(result).toEqual({
      status: "success",
      open: [],
      closedAts: ["2026-09-06T08:00:00.000Z"],
    })
  })

  it("reads all owner rows beyond the former result cap", async () => {
    state.openRows = Array.from({ length: 2_001 }, (_, index) => ({
      id: `cb-${index}`,
      schedule_mode: "exact",
      scheduled_at: "2026-09-06T08:00:00.000Z",
      window_start_at: null,
      window_end_at: null,
    }))

    const result = await getWorkloadSummary()

    expect(result).toEqual({
      status: "success",
      open: state.openRows,
      closedAts: [],
    })
    expect(
      state.queries.filter((query) => query.columns.includes("schedule_mode"))[
        3
      ].rangeValue
    ).toEqual([2_001, 3_000])
  })

  it("continues after a provider page smaller than the requested range", async () => {
    state.apiPageSize = 250
    state.openRows = Array.from({ length: 1_001 }, (_, index) => ({
      id: `cb-${index}`,
      schedule_mode: "exact",
      scheduled_at: "2026-09-06T08:00:00.000Z",
      window_start_at: null,
      window_end_at: null,
    }))

    const result = await getWorkloadSummary()

    expect(result.status).toBe("success")
    expect(result.status === "success" ? result.open : []).toHaveLength(1_001)
    expect(
      state.queries
        .filter((query) => query.columns.includes("schedule_mode"))
        .map((query) => query.rangeValue?.[0])
    ).toEqual([0, 250, 500, 750, 1_000, 1_001])
  })

  it("requires authentication before querying", async () => {
    state.getUser.mockResolvedValue({ data: { user: null }, error: null })
    expect(await getWorkloadSummary()).toEqual({ status: "unauthenticated" })
    expect(state.from).not.toHaveBeenCalled()
  })

  it("reports errors instead of zero workload", async () => {
    state.fail = true
    expect(await getWorkloadSummary()).toEqual({ status: "error" })
  })
})

describe("computeWorkloadCounts", () => {
  const noon = new Date(2026, 8, 6, 12, 0, 0)
  const iso = (offsetMs: number) =>
    new Date(noon.getTime() + offsetMs).toISOString()
  const exact = (scheduledAt: string): WorkloadOpenRow => ({
    schedule_mode: "exact",
    scheduled_at: scheduledAt,
    window_start_at: null,
    window_end_at: null,
  })
  const window = (start: string, end: string): WorkloadOpenRow => ({
    schedule_mode: "window",
    scheduled_at: null,
    window_start_at: start,
    window_end_at: end,
  })

  it("groups scheduled-today, due/grace, overdue, upcoming, and completed-today", async () => {
    const open: WorkloadOpenRow[] = [
      exact(iso(-2 * 60_000)), // due now, today
      exact(iso(2 * 60 * 60_000)), // later today
      exact(iso(-10 * 60_000)), // overdue, today
      exact(iso(24 * 60 * 60_000)), // tomorrow
      exact(iso(-24 * 60 * 60_000)), // overdue, before today
      window(iso(-60 * 60_000), iso(60 * 60_000)), // active window, today
      window(iso(-2 * 60 * 60_000), iso(-2 * 60_000)), // grace, today
    ]
    const counts = computeWorkloadCounts(
      open,
      [iso(60_000), iso(-24 * 60 * 60_000)],
      noon
    )
    // Values overlap by design: a callback due today is both scheduled-today
    // and due/grace.
    expect(counts.scheduledToday).toBe(5)
    expect(counts.dueGrace).toBe(3)
    expect(counts.overdue).toBe(2)
    expect(counts.upcoming).toBe(1)
    expect(counts.completedToday).toBe(1)
  })

  it("applies the five-minute window-end overdue boundary", async () => {
    const grace = computeWorkloadCounts(
      [window(iso(-60 * 60_000), iso(-4 * 60_000))],
      [],
      noon
    )
    expect(grace).toMatchObject({ dueGrace: 1, overdue: 0 })
    const overdue = computeWorkloadCounts(
      [window(iso(-60 * 60_000), iso(-5 * 60_000))],
      [],
      noon
    )
    expect(overdue).toMatchObject({ dueGrace: 0, overdue: 1 })
  })

  it("skips rows without a usable schedule", async () => {
    const counts = computeWorkloadCounts(
      [
        exact(null as unknown as string),
        {
          schedule_mode: "window",
          scheduled_at: null,
          window_start_at: iso(60_000),
          window_end_at: null,
        },
      ],
      [null],
      noon
    )
    expect(counts).toEqual({
      scheduledToday: 0,
      dueGrace: 0,
      overdue: 0,
      upcoming: 0,
      completedToday: 0,
    })
  })
})
