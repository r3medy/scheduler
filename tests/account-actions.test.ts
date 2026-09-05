import { beforeEach, expect, it, vi } from "vitest"
const mocks = vi.hoisted(() => ({
  getUser: vi.fn(),
  verify: vi.fn(),
  update: vi.fn(),
  remove: vi.fn(),
  signOut: vi.fn(),
}))
vi.mock("server-only", () => ({}))
vi.mock("@/lib/auth/actions", () => ({ authenticateLogin: mocks.verify }))
vi.mock("@/lib/supabase/server", () => ({
  getSupabaseConfiguration: () => ({}),
  createSupabaseServerClient: () => ({
    auth: {
      getUser: mocks.getUser,
      updateUser: mocks.update,
      signOut: mocks.signOut,
    },
  }),
}))
vi.mock("@/lib/supabase/admin", () => ({
  createSupabaseAdminClient: () => ({
    auth: { admin: { deleteUser: mocks.remove } },
  }),
}))
vi.mock("@/lib/auth/rate-limit", () => ({
  createSupabaseRateLimitStore: () => ({}),
  getAuthRateLimitSecret: () => "test",
  getRateLimitConfiguration: () => ({}),
  getClientSource: () => "test",
}))
import { changePin, deleteAccount } from "@/lib/auth/account-actions"
function form() {
  const data = new FormData()
  for (const [key, value] of Object.entries({
    currentPin: "123456",
    newPin: "654321",
    confirmPin: "654321",
    confirmation: "DELETE",
    userId: "someone-else",
  }))
    data.set(key, value)
  return data
}
beforeEach(() => {
  vi.resetAllMocks()
  mocks.getUser.mockResolvedValue({
    data: {
      user: { id: "session-owner", email: "e12345@auth.scheduler.invalid" },
    },
    error: null,
  })
  mocks.verify.mockResolvedValue({ success: true })
  mocks.update.mockResolvedValue({ error: null })
  mocks.remove.mockResolvedValue({ error: null })
  mocks.signOut.mockResolvedValue({ error: null })
})
it("deletes only the authenticated owner after credential verification and clears the session", async () => {
  expect(await deleteAccount(form())).toMatchObject({ status: "success" })
  expect(mocks.verify.mock.calls[0][0]).toEqual({
    companyId: "E12345",
    pin: "123456",
  })
  expect(mocks.remove).toHaveBeenCalledWith("session-owner", false)
  expect(mocks.signOut).toHaveBeenCalledWith({ scope: "local" })
})
it("requires explicit confirmation before touching authentication", async () => {
  const data = form()
  data.delete("confirmation")
  expect(await deleteAccount(data)).toMatchObject({ status: "error" })
  expect(mocks.getUser).not.toHaveBeenCalled()
  expect(mocks.remove).not.toHaveBeenCalled()
})
it.each([deleteAccount, changePin])(
  "rejects unauthenticated and rate-limited mutations",
  async (action) => {
    mocks.getUser.mockResolvedValueOnce({ data: { user: null }, error: null })
    expect(await action(form())).toMatchObject({ status: "error" })
    mocks.verify.mockResolvedValueOnce({ formError: "Try again later." })
    expect(await action(form())).toMatchObject({
      status: "error",
      message: "Try again later.",
    })
    expect(mocks.remove).not.toHaveBeenCalled()
    expect(mocks.update).not.toHaveBeenCalled()
  }
)
it("validates PIN confirmation, then updates the verified user's PIN", async () => {
  const data = form()
  data.set("confirmPin", "000000")
  expect(await changePin(data)).toMatchObject({ status: "error" })
  expect(mocks.verify).not.toHaveBeenCalled()
  expect(await changePin(form())).toMatchObject({ status: "success" })
  expect(mocks.update).toHaveBeenCalledWith({ password: "654321" })
})
it("does not sign out or report success when deletion fails", async () => {
  mocks.remove.mockResolvedValue({ error: { message: "storage" } })
  expect(await deleteAccount(form())).toMatchObject({ status: "error" })
  expect(mocks.signOut).not.toHaveBeenCalled()
})
it("does not leak internal errors", async () => {
  mocks.verify.mockRejectedValue(new Error("private internal details"))
  expect(await changePin(form())).toEqual({
    status: "error",
    message: "Could not verify your account. Please try again.",
  })
})
