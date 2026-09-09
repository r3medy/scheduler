import { beforeEach, describe, expect, it, vi } from "vitest"

const state = vi.hoisted(() => ({
  getUser: vi.fn(),
  from: vi.fn(),
  orFilter: "",
  eqFilters: [] as Array<[string, string]>,
  rangeCalls: [] as Array<[number, number]>,
  rows: [] as Array<Record<string, string | null>>,
  pageCap: 1000,
}))

vi.mock("server-only", () => ({}))
vi.mock("@/lib/supabase/server", () => ({
  getSupabaseConfiguration: () => ({}),
  createSupabaseServerClient: async () => ({
    auth: { getUser: state.getUser },
    from: state.from,
  }),
}))

import {
  getCalendarCallbacks,
  getOverdueCallbacks,
} from "@/lib/callbacks/get-calendar-callbacks"

beforeEach(() => {
  vi.resetAllMocks()
  state.orFilter = ""
  state.eqFilters = []
  state.rangeCalls = []
  state.rows = []
  state.pageCap = 1000
  state.getUser.mockResolvedValue({
    data: { user: { id: "owner" } },
    error: null,
  })
  state.from.mockImplementation(() => {
    let range: [number, number] | null = null
    const chain = {
      select: () => chain,
      eq: (key: string, value: string) => {
        state.eqFilters.push([key, value])
        return chain
      },
      or: (filter: string) => {
        state.orFilter = filter
        return chain
      },
      order: () => chain,
      range: (from: number, to: number) => {
        range = [from, to]
        state.rangeCalls.push([from, to])
        return chain
      },
      then: (resolve: (value: unknown) => void) =>
        resolve({
          data: range
            ? state.rows.slice(
                range[0],
                Math.min(range[1] + 1, range[0] + state.pageCap)
              )
            : state.rows,
          error: null,
        }),
    }
    return chain
  })
})

describe("calendar range query", () => {
  it("matches windows by overlap (end >= range start), not start-only", async () => {
    const result = await getCalendarCallbacks({
      startDate: "2026-09-06",
      endDateExclusive: "2026-09-07",
    })

    expect(result.status).toBe("success")
    // Window clause must constrain the end against the range start so a
    // window starting before the range but still open is retrieved.
    expect(state.orFilter).toContain("window_end_at.gte.")
    expect(state.orFilter).toContain("window_start_at.lt.")
    expect(state.orFilter).not.toContain("window_start_at.gte.")
    expect(state.eqFilters).toContainEqual(["lifecycle_state", "open"])
  })

  it("requires authentication before querying", async () => {
    state.getUser.mockResolvedValue({ data: { user: null }, error: null })
    expect(
      await getCalendarCallbacks({
        startDate: "2026-09-06",
        endDateExclusive: "2026-09-07",
      })
    ).toEqual({ status: "unauthenticated" })
    expect(state.from).not.toHaveBeenCalled()
  })

  it.each([1000, 250])(
    "reads all calendar rows with a provider cap of %i",
    async (pageCap) => {
      state.pageCap = pageCap
      state.rows = Array.from({ length: 1_001 }, (_, index) => ({
        id: `cb-${index}`,
        account_holder_name: "Agent",
        account_number: "1234567890",
        schedule_mode: "exact",
        scheduled_at: `2026-09-06T08:${String(index % 60).padStart(2, "0")}:00.000Z`,
        window_start_at: null,
        window_end_at: null,
        lifecycle_state: "open",
      }))

      const result = await getCalendarCallbacks({
        startDate: "2026-09-06",
        endDateExclusive: "2026-09-07",
      })

      expect(result.status).toBe("success")
      expect(result.status === "success" ? result.markers : []).toHaveLength(
        1_001
      )
      expect(state.rangeCalls.map(([offset]) => offset)).toEqual(
        pageCap === 1000 ? [0, 1000, 1001] : [0, 250, 500, 750, 1000, 1001]
      )
    }
  )
})

describe("overdue workload query", () => {
  it("fetches overdue independent of navigation using the grace cutoff", async () => {
    const now = new Date("2026-09-06T12:00:00.000Z")
    const result = await getOverdueCallbacks(now)

    expect(result.status).toBe("success")
    // Cutoff is now minus the 5-minute grace period.
    expect(state.orFilter).toContain("2026-09-06T11:55:00.000Z")
    expect(state.orFilter).toContain("scheduled_at.lte.")
    expect(state.orFilter).toContain("window_end_at.lte.")
    expect(state.eqFilters).toContainEqual(["lifecycle_state", "open"])
  })

  it("requires authentication before querying overdue", async () => {
    state.getUser.mockResolvedValue({ data: { user: null }, error: null })
    expect(await getOverdueCallbacks()).toEqual({
      status: "unauthenticated",
    })
    expect(state.from).not.toHaveBeenCalled()
  })
})
