import { render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { beforeEach, expect, it, vi } from "vitest"
const mocks = vi.hoisted(() => ({ change: vi.fn(), remove: vi.fn() }))
vi.mock("@/lib/auth/account-actions", () => ({
  changePin: mocks.change,
  deleteAccount: mocks.remove,
}))
import { SettingsDialog } from "@/components/settings-dialog"
beforeEach(() => vi.resetAllMocks())
it("opens settings in place and confirms deletion with safe initial focus", async () => {
  const user = userEvent.setup()
  render(<SettingsDialog />)
  await user.click(screen.getByRole("button", { name: "Settings" }))
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
  await user.click(screen.getByRole("button", { name: "Settings" }))
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
