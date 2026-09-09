import { beforeEach, describe, expect, it, vi } from "vitest"

const state = vi.hoisted(() => ({
  requireAuth: vi.fn(),
  selected: "",
  filters: [] as Array<[string, string]>,
  rows: [] as unknown[],
  pageCap: 1000,
  offsets: [] as number[],
  error: null as unknown,
}))

vi.mock("server-only", () => ({}))
vi.mock("@/lib/callbacks/require-auth", () => ({
  requireAuth: state.requireAuth,
}))

import { getOpenNotificationSchedules } from "@/lib/notifications/get-open-notification-schedules"

beforeEach(() => {
  vi.resetAllMocks()
  state.selected = ""
  state.filters = []
  state.rows = []
  state.pageCap = 1000
  state.offsets = []
  state.error = null
  state.requireAuth.mockResolvedValue({
    status: "ok",
    user: { id: "owner" },
    supabase: {
      from: () => {
        let offset = 0
        let end = 999
        const chain = {
          select: (columns: string) => {
            state.selected = columns
            return chain
          },
          eq: (key: string, value: string) => {
            state.filters.push([key, value])
            return chain
          },
          order: () => chain,
          range: (from: number, to: number) => {
            offset = from
            end = to
            state.offsets.push(from)
            return chain
          },
          then: (resolve: (value: unknown) => void) =>
            resolve({
              data: state.rows.slice(
                offset,
                Math.min(end + 1, offset + state.pageCap)
              ),
              error: state.error,
            }),
        }
        return chain
      },
    },
  })
})

describe("open notification schedule query", () => {
  it("returns the complete owner-scoped schedule projection without PII", async () => {
    state.rows = [
      {
        id: "callback-1",
        schedule_mode: "exact",
        scheduled_at: "2099-09-05T12:00:00.000Z",
        window_start_at: null,
        window_end_at: null,
        lifecycle_state: "open",
      },
    ]

    const result = await getOpenNotificationSchedules()

    expect(result).toEqual({
      status: "success",
      schedules: state.rows,
    })
    expect(state.selected).toBe(
      "id, schedule_mode, scheduled_at, window_start_at, window_end_at, lifecycle_state"
    )
    for (let index = 0; index < state.filters.length; index += 2) {
      expect(state.filters.slice(index, index + 2)).toEqual([
        ["user_id", "owner"],
        ["lifecycle_state", "open"],
      ])
    }
    expect(state.selected).not.toContain("phone")
    expect(state.selected).not.toContain("account")
    expect(state.selected).not.toContain("comments")
  })

  it("keeps schedules beyond a provider cap smaller than the requested page", async () => {
    state.pageCap = 250
    state.rows = Array.from({ length: 1001 }, (_, index) => ({
      id: `callback-${index}`,
      schedule_mode: "exact",
      scheduled_at: "2099-09-05T12:00:00.000Z",
      window_start_at: null,
      window_end_at: null,
      lifecycle_state: "open",
    }))

    const result = await getOpenNotificationSchedules()
    expect(result.status === "success" ? result.schedules.length : 0).toBe(1001)
    expect(result).toEqual({
      status: "success",
      schedules: state.rows,
    })
    expect(state.offsets).toEqual([0, 250, 500, 750, 1000, 1001])
  })

  it("does not query when the session is unavailable", async () => {
    state.requireAuth.mockResolvedValueOnce({ status: "unauthenticated" })

    await expect(getOpenNotificationSchedules()).resolves.toEqual({
      status: "unauthenticated",
    })
    expect(state.selected).toBe("")
  })
})
