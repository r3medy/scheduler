import { fireEvent, render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { beforeEach, expect, it, vi } from "vitest"
const mocks = vi.hoisted(() => ({
  change: vi.fn(),
  remove: vi.fn(),
  signOut: vi.fn(),
  announceSignOut: vi.fn(),
  clearAllNotificationState: vi.fn(),
}))
vi.mock("@/lib/auth/account-actions", () => ({
  changePin: mocks.change,
  deleteAccount: mocks.remove,
  signOutAccount: mocks.signOut,
}))
vi.mock("@/lib/notifications/dedupe", () => ({
  announceSignOut: mocks.announceSignOut,
}))
vi.mock("@/lib/notifications/sync", () => ({
  clearAllNotificationState: mocks.clearAllNotificationState,
}))
import { SettingsDialog } from "@/components/settings-dialog"
beforeEach(() => {
  vi.resetAllMocks()
  vi.spyOn(console, "error").mockImplementation(() => undefined)
})
it("opens settings in place and confirms deletion with safe initial focus", async () => {
  const user = userEvent.setup()
  render(<SettingsDialog />)
  // Open with fireEvent: user-event hover would open the sidebar tooltip,
  // whose positioning loop wedges the jsdom worker.
  fireEvent.click(screen.getByRole("button", { name: "Settings" }))
  expect(screen.getByRole("dialog", { name: "Settings" })).toBeInTheDocument()
  await user.click(screen.getByRole("button", { name: "Delete account…" }))
  expect(screen.getByRole("alertdialog")).toHaveTextContent(
    "permanently removed"
  )
  await waitFor(() =>
    expect(screen.getByRole("button", { name: "Cancel" })).toHaveFocus()
  )
  expect(mocks.remove).not.toHaveBeenCalled()
  await user.click(screen.getByRole("button", { name: "Cancel" }))
  expect(screen.getByRole("dialog", { name: "Settings" })).toBeInTheDocument()
})
it("shows failed PIN updates without losing inputs, then confirms success", async () => {
  const user = userEvent.setup()
  render(<SettingsDialog />)
  // Open with fireEvent: user-event hover would open the sidebar tooltip,
  // whose positioning loop wedges the jsdom worker.
  fireEvent.click(screen.getByRole("button", { name: "Settings" }))
  await user.type(screen.getByLabelText("Current PIN"), "123456")
  await user.type(screen.getByLabelText("New PIN"), "654321")
  await user.type(screen.getByLabelText("Confirm new PIN"), "654321")
  mocks.change.mockResolvedValueOnce({
    status: "error",
    message: "Try again later.",
  })
  await user.click(screen.getByRole("button", { name: "Update PIN" }))
  expect(await screen.findByRole("alert")).toHaveTextContent("Try again later")
  expect(screen.getByLabelText("New PIN")).toHaveValue("654321")
  mocks.change.mockResolvedValueOnce({
    status: "success",
    message: "Your PIN has been changed.",
  })
  await user.click(screen.getByRole("button", { name: "Update PIN" }))
  expect(await screen.findByRole("status")).toHaveTextContent(
    "PIN has been changed"
  )
  expect(screen.getByLabelText("Current PIN")).toHaveValue("")
})

it("clears and broadcasts notification state after a successful logout", async () => {
  const user = userEvent.setup()
  mocks.signOut.mockResolvedValueOnce({
    status: "success",
    message: "You have been logged out.",
  })
  render(<SettingsDialog />)
  fireEvent.click(screen.getByRole("button", { name: "Settings" }))
  await user.click(screen.getByRole("button", { name: "Log out" }))

  await waitFor(() => expect(mocks.signOut).toHaveBeenCalledOnce())
  expect(mocks.clearAllNotificationState).toHaveBeenCalledOnce()
  expect(mocks.announceSignOut).toHaveBeenCalledOnce()
})
