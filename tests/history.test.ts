import { beforeEach, expect, it, vi } from "vitest"
const state = vi.hoisted(() => ({
  getUser: vi.fn(),
  from: vi.fn(),
  error: false,
  queries: [] as Array<{ filters: Record<string, string>; range?: number[] }>,
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
  state.error = false
  state.getUser.mockResolvedValue({
    data: { user: { id: "owner" } },
    error: null,
  })
  state.from.mockImplementation(() => {
    const query: { filters: Record<string, string>; range?: number[] } = {
      filters: {},
    }
    state.queries.push(query)
    const chain = {
      select: () => chain,
      eq: (key: string, value: string) => {
        query.filters[key] = value
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
                    account_holder_name: "Customer",
                    account_number: "123456789",
                    lifecycle_state: "closed",
                    resolution_outcome: "reached",
                    scheduled_at: "2099-09-05T12:00:00Z",
                    closed_at: "2099-09-05T12:05:00Z",
                  },
                ],
                error: null,
              }
            : {
                count: query.filters.resolution_outcome ? 30 : 90,
                error: state.error ? { message: "failure" } : null,
              }
        ),
    }
    return chain
  })
})
it("scopes all queries to the verified owner and excludes full account numbers from the client projection", async () => {
  const result = await getHistory(1)
  expect(result.status).toBe("success")
  if (result.status !== "success") return
  expect(result.counts).toEqual({
    all: 90,
    reached: 30,
    voicemail: 30,
    no_answer: 30,
  })
  expect(result.rows[0].accountReference).toBe("•••• 6789")
  expect(result.rows[0]).not.toHaveProperty("account_number")
  expect(state.queries).toHaveLength(5)
  for (const query of state.queries)
    expect(query.filters).toMatchObject({
      user_id: "owner",
      lifecycle_state: "closed",
    })
})
it("filters and clamps pagination to surviving records", async () => {
  const result = await getHistory(500, "reached")
  expect(result).toMatchObject({ status: "success", page: 2, total: 30 })
  expect(state.queries.at(-1)).toMatchObject({
    filters: { resolution_outcome: "reached" },
    range: [25, 49],
  })
})
it("does not query private history without authentication", async () => {
  state.getUser.mockResolvedValue({ data: { user: null }, error: null })
  expect(await getHistory(1)).toEqual({ status: "unauthenticated" })
  expect(state.from).not.toHaveBeenCalled()
})
it("does not present zero metrics when a count query fails", async () => {
  state.error = true
  expect(await getHistory(1)).toEqual({ status: "error" })
})
