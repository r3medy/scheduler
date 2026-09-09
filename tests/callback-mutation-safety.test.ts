import { beforeEach, describe, expect, it, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  getUser: vi.fn(),
  from: vi.fn(),
  rpc: vi.fn(),
  insert: vi.fn(),
  or: vi.fn(),
  eq: vi.fn(),
  neq: vi.fn(),
  update: vi.fn(),
  delete: vi.fn(),
  maybeSingle: vi.fn(),
  order: vi.fn(),
}))
vi.mock("@/lib/supabase/server", () => ({
  getSupabaseConfiguration: () => ({}),
  createSupabaseServerClient: async () => ({
    auth: { getUser: mocks.getUser },
    from: mocks.from,
    rpc: mocks.rpc,
  }),
}))

import { createCallback, updateCallback } from "@/lib/callbacks/create-callback"
import { __clearCallbackIdempotencyCache } from "@/lib/callbacks/callback-idempotency"
import { updateCallbackStatus } from "@/lib/callbacks/update-status"

const NOW = Date.parse("2026-09-05T08:00:00.000Z")
const FUTURE_START = "2026-09-05T09:00:00.000Z"
const PAST_START = "2026-09-05T07:00:00.000Z"
const STORED_UPDATED_AT = "2026-09-05T07:30:00.000Z"
const NEWER_UPDATED_AT = "2026-09-05T07:45:00.000Z"
const callbackId = "00000000-0000-4000-8000-000000000001"
const IDEMPOTENCY_KEY = "11111111-1111-4111-8111-111111111111"

function form(values: Record<string, string>) {
  const data = new FormData()
  for (const [key, value] of Object.entries(values)) data.set(key, value)
  return data
}

function baseInput(overrides: Record<string, string> = {}) {
  return form({
    phone_number: "0123456789",
    account_number: "123456",
    account_holder_name: "Test User",
    comments: "",
    schedule_mode: "exact",
    scheduled_at: FUTURE_START,
    ...overrides,
  })
}

beforeEach(() => {
  vi.resetAllMocks()
  vi.spyOn(Date, "now").mockReturnValue(NOW)
  __clearCallbackIdempotencyCache()
  mocks.getUser.mockResolvedValue({
    data: { user: { id: "signed-in-owner" } },
    error: null,
  })
  mocks.insert.mockResolvedValue({ error: null })
  const query = {
    insert: mocks.insert,
    update: mocks.update,
    delete: mocks.delete,
    eq: mocks.eq,
    neq: mocks.neq,
    or: mocks.or,
    select: () => query,
    maybeSingle: mocks.maybeSingle,
    order: mocks.order,
  }
  mocks.from.mockReturnValue(query)
  mocks.eq.mockReturnValue(query)
  mocks.neq.mockReturnValue(query)
  mocks.update.mockReturnValue(query)
  mocks.delete.mockReturnValue(query)
  mocks.maybeSingle.mockResolvedValue({
    data: { id: callbackId },
    error: null,
  })
  mocks.or.mockResolvedValue({ count: 0, error: null })
  mocks.order.mockResolvedValue({ data: [], error: null })
  mocks.rpc.mockResolvedValue({ data: callbackId, error: null })
})

describe("callback mutation safety", () => {
  it("allows an overdue detail edit without rescheduling", async () => {
    mocks.maybeSingle
      .mockResolvedValueOnce({
        data: {
          id: callbackId,
          schedule_mode: "exact",
          scheduled_at: PAST_START,
          window_start_at: null,
          window_end_at: null,
          updated_at: STORED_UPDATED_AT,
        },
        error: null,
      })
      .mockResolvedValueOnce({ data: { id: callbackId }, error: null })
    const data = baseInput({
      phone_number: "0999888777",
      scheduled_at: PAST_START,
    })
    data.set("expected_updated_at", STORED_UPDATED_AT)

    const result = await updateCallback(callbackId, data)

    expect(result).toEqual({ status: "success" })
    expect(mocks.update).toHaveBeenCalledWith(
      expect.objectContaining({
        phone_number: "0999888777",
        scheduled_at: PAST_START,
      })
    )
  })

  it("still rejects a past start on create", async () => {
    const result = await createCallback(baseInput({ scheduled_at: PAST_START }))

    expect(result).toMatchObject({
      status: "error",
      field: "scheduled_at",
    })
    expect(mocks.insert).not.toHaveBeenCalled()
  })

  it("rejects a past start when the update changes the schedule", async () => {
    mocks.maybeSingle.mockResolvedValueOnce({
      data: {
        id: callbackId,
        schedule_mode: "exact",
        scheduled_at: FUTURE_START,
        window_start_at: null,
        window_end_at: null,
        updated_at: STORED_UPDATED_AT,
      },
      error: null,
    })
    const data = baseInput({ scheduled_at: PAST_START })
    data.set("expected_updated_at", STORED_UPDATED_AT)

    const result = await updateCallback(callbackId, data)

    expect(result).toMatchObject({
      status: "error",
      field: "scheduled_at",
    })
    expect(mocks.update).not.toHaveBeenCalled()
  })

  it("returns a stale conflict instead of silently overwriting", async () => {
    mocks.maybeSingle.mockResolvedValueOnce({
      data: {
        id: callbackId,
        schedule_mode: "exact",
        scheduled_at: FUTURE_START,
        window_start_at: null,
        window_end_at: null,
        updated_at: NEWER_UPDATED_AT,
      },
      error: null,
    })
    const data = baseInput({ phone_number: "0999888777" })
    data.set("expected_updated_at", STORED_UPDATED_AT)

    const result = await updateCallback(callbackId, data)

    expect(result).toMatchObject({ status: "conflict", reason: "stale" })
    expect(mocks.update).not.toHaveBeenCalled()
  })

  it("dedupes double-submit creates with the same idempotency key", async () => {
    const payload = () => baseInput({ idempotency_key: IDEMPOTENCY_KEY })

    const first = await createCallback(payload())
    const second = await createCallback(payload())

    expect(first).toEqual({ status: "success" })
    expect(second).toEqual({ status: "success" })
    expect(mocks.rpc).toHaveBeenCalledTimes(2)
    expect(mocks.insert).not.toHaveBeenCalled()
  })

  it("does not turn a committed retry into an overlap warning", async () => {
    mocks.or.mockResolvedValueOnce({
      count: 1,
      data: [{ create_request_key: IDEMPOTENCY_KEY }],
      error: null,
    })

    const result = await createCallback(
      baseInput({ idempotency_key: IDEMPOTENCY_KEY })
    )

    expect(result).toEqual({ status: "success" })
    expect(mocks.rpc).toHaveBeenCalledTimes(1)
  })

  it("returns a safe conflict when a key is reused for different payload data", async () => {
    mocks.rpc
      .mockResolvedValueOnce({
        data: [
          {
            callback_id: callbackId,
            created: true,
            same_payload: true,
          },
        ],
        error: null,
      })
      .mockResolvedValueOnce({
        data: [
          {
            callback_id: callbackId,
            created: false,
            same_payload: false,
          },
        ],
        error: null,
      })

    const first = await createCallback(
      baseInput({ idempotency_key: IDEMPOTENCY_KEY })
    )
    const retryWithDifferentPayload = await createCallback(
      baseInput({
        idempotency_key: IDEMPOTENCY_KEY,
        account_number: "different-account",
      })
    )

    expect(first).toEqual({ status: "success" })
    expect(retryWithDifferentPayload).toMatchObject({
      status: "conflict",
      reason: "idempotency",
    })
  })

  it("returns a stale conflict for status changes from an outdated tab", async () => {
    mocks.maybeSingle.mockResolvedValueOnce({
      data: { updated_at: NEWER_UPDATED_AT },
      error: null,
    })

    const result = await updateCallbackStatus(
      callbackId,
      "reached",
      STORED_UPDATED_AT
    )

    expect(result).toMatchObject({ status: "conflict", reason: "stale" })
    expect(mocks.update).not.toHaveBeenCalled()
  })
})
