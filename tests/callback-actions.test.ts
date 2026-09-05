import { beforeEach, describe, expect, it, vi } from "vitest"
import { readFileSync } from "node:fs"
import { resolve } from "node:path"

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
import { getCallback } from "@/lib/callbacks/get-callback"
import { deleteCallback } from "@/lib/callbacks/delete-callback"
import { updateCallbackStatus } from "@/lib/callbacks/update-status"
import { maskAccountNumber } from "@/lib/callbacks/presentation"
import {
  ACCOUNT_HOLDER_NAME_MAX_LENGTH,
  ACCOUNT_NUMBER_MAX_LENGTH,
  ATTEMPT_NOTE_MAX_LENGTH,
  COMMENTS_MAX_LENGTH,
  PHONE_NUMBER_MAX_LENGTH,
  attemptNoteSchema,
} from "@/lib/callbacks/validation"

function input() {
  const data = new FormData()
  for (const [key, value] of Object.entries({
    phone_number: "0123456789",
    account_number: "123456",
    account_holder_name: "Test User",
    schedule_mode: "exact",
    scheduled_at: "2026-09-05T09:00:00.000Z",
    user_id: "forged-owner",
  }))
    data.set(key, value)
  return data
}

const callbackId = "00000000-0000-4000-8000-000000000001"

function attemptInput(
  outcome: "voicemail" | "no_answer",
  action: "close" | "reschedule"
) {
  const data = new FormData()
  data.set("outcome", outcome)
  data.set("attempt_action", action)
  data.set("note", "Customer asked for another call")
  return data
}

beforeEach(() => {
  vi.resetAllMocks()
  vi.spyOn(Date, "now").mockReturnValue(Date.parse("2026-09-05T08:00:00.000Z"))
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

describe("callback creation", () => {
  it.each([
    ["phone_number", PHONE_NUMBER_MAX_LENGTH],
    ["account_number", ACCOUNT_NUMBER_MAX_LENGTH],
    ["account_holder_name", ACCOUNT_HOLDER_NAME_MAX_LENGTH],
    ["comments", COMMENTS_MAX_LENGTH],
  ] as const)(
    "rejects oversized %s values at the server boundary",
    async (field, limit) => {
      const data = input()
      data.set(field, "x".repeat(limit + 1))

      expect(await createCallback(data)).toMatchObject({
        status: "error",
        field,
      })
      expect(mocks.insert).not.toHaveBeenCalled()
    }
  )

  it("rejects an oversized attempt note at its validation boundary", () => {
    expect(
      attemptNoteSchema.safeParse("x".repeat(ATTEMPT_NOTE_MAX_LENGTH + 1))
        .success
    ).toBe(false)
  })

  it("keeps phone and account formats permissive while trimming boundaries", async () => {
    const data = input()
    data.set("phone_number", " +20 (0) 123-456 ")
    data.set("account_number", " ACCT/001  ")

    expect(await createCallback(data)).toEqual({ status: "success" })
    expect(mocks.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        phone_number: "+20 (0) 123-456",
        account_number: "ACCT/001",
      })
    )
  })

  it("marks reached directly and scopes the update to the signed-in owner", async () => {
    expect(await updateCallbackStatus(callbackId, "reached")).toEqual({
      status: "success",
    })
    expect(mocks.update).toHaveBeenCalledWith({
      lifecycle_state: "closed",
      resolution_outcome: "reached",
      closed_at: expect.any(String),
    })
    expect(mocks.eq).toHaveBeenCalledWith("id", callbackId)
    expect(mocks.eq).toHaveBeenCalledWith("user_id", "signed-in-owner")
  })

  it("requires a structured choice for unsuccessful outcomes", async () => {
    expect(await updateCallbackStatus(callbackId, "voicemail")).toMatchObject({
      status: "error",
    })
    expect(mocks.update).not.toHaveBeenCalled()
    expect(mocks.rpc).not.toHaveBeenCalled()
  })

  it("records a closing unsuccessful attempt without accepting schedule values", async () => {
    const data = attemptInput("voicemail", "close")
    data.set("schedule_mode", "exact")
    data.set("scheduled_at", "2099-09-05T12:00:00.000Z")

    expect(await updateCallbackStatus(callbackId, data)).toEqual({
      status: "success",
    })
    expect(mocks.rpc).toHaveBeenCalledWith("record_callback_attempt", {
      p_callback_id: callbackId,
      p_outcome: "voicemail",
      p_note: "Customer asked for another call",
      p_action: "close",
      p_schedule_mode: null,
      p_scheduled_at: null,
      p_window_start_at: null,
      p_window_end_at: null,
    })
  })

  it("reschedules an exact attempt on the same callback id", async () => {
    const data = attemptInput("no_answer", "reschedule")
    data.set("schedule_mode", "exact")
    data.set("scheduled_at", "2026-09-05T09:00:00.000Z")

    expect(await updateCallbackStatus(callbackId, data)).toEqual({
      status: "success",
    })
    expect(mocks.rpc).toHaveBeenCalledWith(
      "record_callback_attempt",
      expect.objectContaining({
        p_callback_id: callbackId,
        p_outcome: "no_answer",
        p_action: "reschedule",
        p_schedule_mode: "exact",
        p_scheduled_at: "2026-09-05T09:00:00.000Z",
        p_window_start_at: null,
        p_window_end_at: null,
      })
    )
  })

  it("reschedules a window with distinct start and end arguments", async () => {
    const data = attemptInput("voicemail", "reschedule")
    data.set("schedule_mode", "window")
    data.set("window_start_at", "2026-09-05T09:00:00.000Z")
    data.set("window_end_at", "2026-09-05T10:00:00.000Z")

    expect(await updateCallbackStatus(callbackId, data)).toEqual({
      status: "success",
    })
    expect(mocks.rpc).toHaveBeenCalledWith(
      "record_callback_attempt",
      expect.objectContaining({
        p_callback_id: callbackId,
        p_schedule_mode: "window",
        p_scheduled_at: null,
        p_window_start_at: "2026-09-05T09:00:00.000Z",
        p_window_end_at: "2026-09-05T10:00:00.000Z",
      })
    )
  })

  it("does not claim an RPC failure succeeded", async () => {
    mocks.rpc.mockResolvedValue({ data: null, error: { code: "42501" } })
    expect(
      await updateCallbackStatus(callbackId, attemptInput("no_answer", "close"))
    ).toMatchObject({ status: "error" })
  })

  it("rejects anonymous attempt writes before calling the RPC", async () => {
    mocks.getUser.mockResolvedValue({ data: { user: null }, error: null })
    expect(
      await updateCallbackStatus(callbackId, attemptInput("no_answer", "close"))
    ).toMatchObject({ status: "error" })
    expect(mocks.rpc).not.toHaveBeenCalled()
  })
  it("deletes only the signed-in owner's target and rejects anonymous or missing targets", async () => {
    expect(await deleteCallback("target")).toEqual({ status: "success" })
    expect(mocks.eq).toHaveBeenCalledWith("id", "target")
    expect(mocks.eq).toHaveBeenCalledWith("user_id", "signed-in-owner")
    mocks.maybeSingle.mockResolvedValue({ data: null, error: null })
    expect(await deleteCallback("missing")).toMatchObject({ status: "error" })
    mocks.delete.mockClear()
    mocks.getUser.mockResolvedValue({ data: { user: null }, error: null })
    expect(await deleteCallback("target")).toMatchObject({ status: "error" })
    expect(mocks.delete).not.toHaveBeenCalled()
  })
  const id = "00000000-0000-4000-8000-000000000001"
  it("rejects past exact dates for both creation and editing", async () => {
    const data = input()
    data.set("scheduled_at", "2026-09-05T07:59:00.000Z")
    expect(await createCallback(data)).toMatchObject({
      status: "error",
      field: "scheduled_at",
    })
    expect(await updateCallback(id, data)).toMatchObject({
      status: "error",
      field: "scheduled_at",
    })
    expect(mocks.insert).not.toHaveBeenCalled()
    expect(mocks.update).not.toHaveBeenCalled()
  })
  it("rejects windows that already started even when their end is future", async () => {
    const data = input()
    data.set("schedule_mode", "window")
    data.set("window_start_at", "2026-09-05T07:59:00.000Z")
    data.set("window_end_at", "2026-09-05T10:00:00.000Z")
    expect(await updateCallback(id, data)).toMatchObject({
      status: "error",
      field: "window_start_at",
    })
    expect(await createCallback(data)).toMatchObject({
      status: "error",
      field: "window_start_at",
    })
  })
  it("updates only the owned callback, excludes itself from overlaps, and preserves lifecycle", async () => {
    expect(await updateCallback(id, input())).toEqual({ status: "success" })
    expect(mocks.eq).toHaveBeenCalledWith("id", id)
    expect(mocks.eq).toHaveBeenCalledWith("user_id", "signed-in-owner")
    expect(mocks.neq).toHaveBeenCalledWith("id", id)
    expect(mocks.update.mock.calls[0][0]).not.toHaveProperty("lifecycle_state")
    expect(mocks.update.mock.calls[0][0]).not.toHaveProperty("user_id")
  })
  it("does not report missing or inaccessible updates as success", async () => {
    mocks.maybeSingle.mockResolvedValue({ data: null, error: null })
    expect(await updateCallback(id, input())).toMatchObject({ status: "error" })
  })
  it("loads details only for the authenticated owner", async () => {
    expect(await getCallback(id)).toMatchObject({ status: "success" })
    expect(mocks.eq).toHaveBeenCalledWith("user_id", "signed-in-owner")
    expect(mocks.from).toHaveBeenCalledWith("callback_attempts")
    expect(mocks.eq).toHaveBeenCalledWith("callback_id", id)
    expect(mocks.order).toHaveBeenCalledWith("attempted_at", {
      ascending: false,
    })
    mocks.getUser.mockResolvedValue({ data: { user: null }, error: null })
    expect(await getCallback(id)).toMatchObject({ status: "error" })
  })
  it("assigns ownership from the authenticated session", async () => {
    expect(await createCallback(input())).toEqual({ status: "success" })
    expect(mocks.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        user_id: "signed-in-owner",
        lifecycle_state: "open",
        window_start_at: null,
      })
    )
    expect(mocks.eq).toHaveBeenCalledWith("user_id", "signed-in-owner")
  })

  it("rejects anonymous creation", async () => {
    mocks.getUser.mockResolvedValue({ data: { user: null }, error: null })
    expect(await createCallback(input())).toMatchObject({ status: "error" })
    expect(mocks.insert).not.toHaveBeenCalled()
  })

  it("warns on inclusive overlaps, then permits saving", async () => {
    mocks.or.mockResolvedValue({ count: 1, error: null })
    const data = input()
    expect(await createCallback(data)).toMatchObject({ status: "conflict" })
    expect(mocks.insert).not.toHaveBeenCalled()
    expect(mocks.or).toHaveBeenCalledWith(
      expect.stringContaining(
        "window_start_at.lte.2026-09-05T09:00:00.000Z,window_end_at.gte.2026-09-05T09:00:00.000Z"
      )
    )
    data.set("allowConflict", "true")
    expect(await createCallback(data)).toEqual({ status: "success" })
  })

  it("rejects invalid windows before querying the database", async () => {
    const data = input()
    data.set("schedule_mode", "window")
    data.set("window_start_at", "2026-09-05T10:00:00.000Z")
    data.set("window_end_at", "2026-09-05T09:00:00.000Z")
    expect(await createCallback(data)).toMatchObject({
      status: "error",
      field: "window_end_at",
    })
    expect(mocks.insert).not.toHaveBeenCalled()
  })

  it("rejects missing contact details", async () => {
    const data = input()
    data.set("account_number", "  ")
    expect(await createCallback(data)).toMatchObject({
      status: "error",
      field: "account_number",
    })
    expect(mocks.insert).not.toHaveBeenCalled()
  })

  it("does not report failed persistence as success", async () => {
    mocks.insert.mockResolvedValue({ error: { code: "42501" } })
    expect(await createCallback(input())).toMatchObject({ status: "error" })
  })
})

describe("callback presentation", () => {
  it.each([
    [" 12 34 5678 ", "•••• 5678"],
    ["1", "••••"],
    ["12", "••••"],
    ["123", "••••"],
    ["1234", "••••"],
    [" \t\r\n", null],
  ])("masks account identifiers safely: %s", (value, expected) => {
    expect(maskAccountNumber(value)).toBe(expected)
    const compact = value.replace(/\s/g, "")
    if (compact.length > 0) {
      expect(maskAccountNumber(value)).not.toContain(compact)
    }
  })
})

describe("callback attempt migration", () => {
  const migration = readFileSync(
    resolve(
      process.cwd(),
      "supabase/migrations/20260905015000_callback_attempts.sql"
    ),
    "utf8"
  )

  it("keeps attempts owner-scoped, append-only, and parent-cascaded", () => {
    expect(migration).toMatch(
      /callback_id uuid not null references public\.callbacks \(id\) on delete cascade/i
    )
    expect(migration).toMatch(
      /alter table public\.callback_attempts enable row level security/i
    )
    expect(migration).toMatch(/callbacks\.user_id = \(select auth\.uid\(\)\)/i)
    expect(migration).toMatch(
      /revoke all on table public\.callback_attempts from public, anon, authenticated/i
    )
    expect(migration).toMatch(
      /grant select on table public\.callback_attempts to authenticated/i
    )
    expect(migration).not.toMatch(
      /grant\s+(?:update|delete|[\s\S]*?update|[\s\S]*?delete)\s+on table public\.callback_attempts/i
    )
  })

  it("uses the note domain and validates unsuccessful outcomes and snapshots", () => {
    expect(migration).toMatch(/note public\.callback_attempt_note/i)
    expect(migration).toMatch(/outcome in \('voicemail', 'no_answer'\)/i)
    expect(migration).toMatch(/callback_attempts_valid_prior_schedule/i)
    expect(migration).toMatch(
      /caused_rescheduling\s+and prior_schedule_mode is not null/i
    )
    expect(migration).toMatch(/prior_window_end_at > prior_window_start_at/i)
  })

  it("locks an owned open callback and atomically inserts before updating the same id", () => {
    expect(migration).toMatch(/security definer[\s\S]*set search_path = ''/i)
    expect(migration).toMatch(
      /callbacks\.user_id = v_user_id[\s\S]*callbacks\.lifecycle_state = 'open'[\s\S]*for update/i
    )
    expect(migration).toMatch(
      /insert into public\.callback_attempts[\s\S]*v_callback\.schedule_mode[\s\S]*update public\.callbacks[\s\S]*where id = v_callback\.id/i
    )
    expect(migration).toMatch(/p_window_start_at > now\(\)/i)
    expect(migration).toMatch(/p_scheduled_at > now\(\)/i)
  })

  it("exposes the RPC only to authenticated callers", () => {
    expect(migration).toMatch(
      /revoke all on function public\.record_callback_attempt\([\s\S]*?\) from public, anon, authenticated/i
    )
    expect(migration).toMatch(
      /grant execute on function public\.record_callback_attempt\([\s\S]*?\) to authenticated/i
    )
  })
})
