import { beforeEach, describe, expect, it, vi } from "vitest"

const state = vi.hoisted(() => ({
  getUser: vi.fn(),
  from: vi.fn(),
  queries: [] as Array<{
    columns: string
    filters: Record<string, string>
    orFilter: string | null
    range?: number[]
  }>,
}))

vi.mock("server-only", () => ({}))
vi.mock("@/lib/supabase/server", () => ({
  getSupabaseConfiguration: () => ({}),
  createSupabaseServerClient: () => ({
    auth: { getUser: state.getUser },
    from: state.from,
  }),
}))

import { getHistory } from "@/lib/callbacks/get-history"

beforeEach(() => {
  vi.resetAllMocks()
  state.queries = []
  state.getUser.mockResolvedValue({
    data: { user: { id: "owner" } },
    error: null,
  })
  state.from.mockImplementation(() => {
    const query: {
      columns: string
      filters: Record<string, string>
      orFilter: string | null
      range?: number[]
    } = { columns: "", filters: {}, orFilter: null }
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
      or: (filter: string) => {
        query.orFilter = filter
        return chain
      },
      order: () => chain,
      range: (start: number, end: number) => {
        query.range = [start, end]
        return chain
      },
      then: (resolve: (value: unknown) => void) =>
        resolve(
          query.range
            ? {
                data: [
                  {
                    id: "callback",
                    account_holder_name: "Layla Hassan",
                    account_number: "12",
                    schedule_mode: "exact",
                    scheduled_at: "2099-09-05T12:00:00Z",
                    window_start_at: null,
                    window_end_at: null,
                    resolution_outcome: "reached",
                    closed_at: "2099-09-05T12:05:00Z",
                  },
                ],
                error: null,
              }
            : { count: 3, error: null }
        ),
    }
    return chain
  })
})

describe("history customer-field search", () => {
  it("scopes ilike search to the owner and returns masked rows", async () => {
    const result = await getHistory(1, undefined, "Layla")
    expect(result.status).toBe("success")
    if (result.status !== "success") return
    const pageQuery = state.queries.find((query) => query.range)
    expect(pageQuery?.orFilter).toContain("account_holder_name.ilike.")
    expect(pageQuery?.orFilter).toContain("phone_number.ilike.")
    expect(pageQuery?.orFilter).toContain("account_number.ilike.")
    expect(pageQuery?.orFilter).toContain("Layla")
    for (const query of state.queries) {
      expect(query.filters).toMatchObject({
        user_id: "owner",
        lifecycle_state: "closed",
      })
    }
    // Short account numbers are never fully exposed in search results.
    expect(result.rows[0].accountReference).toBe("••••")
    expect(result.rows[0]).not.toHaveProperty("account_number")
    // Phone is searchable but never part of the client projection.
    expect(pageQuery?.columns).not.toContain("phone_number")
    // Search pages stay bounded like the unfiltered list.
    expect(pageQuery?.range).toEqual([0, 24])
  })

  it("ignores blank or single-character search instead of listing records", async () => {
    for (const search of ["", "  ", "x"]) {
      state.queries = []
      const result = await getHistory(1, undefined, search)
      expect(result.status).toBe("success")
      expect(
        state.queries.every((query) => query.orFilter === null)
      ).toBe(true)
    }
  })

  it("keeps all-time counts while the total reflects the filtered search", async () => {
    const result = await getHistory(1, "voicemail", "Layla")
    expect(result).toMatchObject({ status: "success", total: 3 })
    if (result.status !== "success") return
    // The four all-time count queries stay unfiltered.
    const countQueries = state.queries.filter((query) => !query.range)
    expect(countQueries).toHaveLength(5)
    expect(
      countQueries.filter((query) => query.orFilter === null)
    ).toHaveLength(4)
    // The filtered total respects the outcome filter plus search.
    const searchCount = countQueries.find((query) => query.orFilter !== null)
    expect(searchCount?.filters).toMatchObject({
      resolution_outcome: "voicemail",
    })
    expect(searchCount?.orFilter).toContain("Layla")
    expect(result.counts).toEqual({
      all: 3,
      reached: 3,
      voicemail: 3,
      no_answer: 3,
    })
  })

  it("escapes like wildcards and strips commas from the search filter", async () => {
    await getHistory(1, undefined, "100%_,x")
    const pageQuery = state.queries.find((query) => query.range)
    expect(pageQuery?.orFilter).toContain("100\\%\\_x")
    expect(pageQuery?.orFilter).not.toContain(",x")
  })
})
