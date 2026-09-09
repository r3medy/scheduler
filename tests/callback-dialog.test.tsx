import { fireEvent, render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { beforeEach, describe, expect, it, vi } from "vitest"

const mocks = vi.hoisted(() => ({ create: vi.fn(), refresh: vi.fn() }))
vi.mock("@/lib/callbacks/create-callback", () => ({
  createCallback: mocks.create,
}))
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: mocks.refresh }),
}))
import { WorkloadSummary } from "@/components/callbacks/workload-summary"
import { chooseSchedule } from "./date-picker-helper"

beforeEach(() => vi.resetAllMocks())

async function openForm() {
  const user = userEvent.setup()
  render(<WorkloadSummary open={[]} closedAts={[]} />)
  await user.click(screen.getByRole("button", { name: "New Callback" }))
  return user
}

async function fillForm(user: ReturnType<typeof userEvent.setup>) {
  for (const [label, value] of [
    ["Callback phone number", "0123456789"],
    ["Account number", "123456"],
    ["Account-holder name", "Test User"],
  ]) {
    fireEvent.change(screen.getByLabelText(label), { target: { value } })
  }
  await chooseSchedule(user)
}

describe("New Callback modal", () => {
  it("requires a date from the calendar before submission", async () => {
    const user = await openForm()
    for (const label of [
      "Callback phone number",
      "Account number",
      "Account-holder name",
    ])
      fireEvent.change(screen.getByLabelText(label), {
        target: { value: "123456" },
      })
    fireEvent.change(screen.getByLabelText("Date and time time"), {
      target: { value: "12:00" },
    })
    await user.click(screen.getByRole("button", { name: "Save callback" }))
    expect(mocks.create).not.toHaveBeenCalled()
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Enter a valid date and time"
    )
  })
  it("opens in place and restores focus after Escape", async () => {
    const user = await openForm()
    expect(
      screen.getByRole("dialog", { name: "New Callback" })
    ).toBeInTheDocument()
    expect(
      screen.queryByRole("link", { name: /New Callback/i })
    ).not.toBeInTheDocument()
    await user.keyboard("{Escape}")
    await waitFor(() =>
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument()
    )
    expect(screen.getByRole("button", { name: "New Callback" })).toHaveFocus()
  })

  it("preserves inputs on failure and closes with a refresh on success", async () => {
    const user = await openForm()
    await fillForm(user)
    mocks.create.mockResolvedValueOnce({
      status: "error",
      message: "Could not save. Please try again.",
    })
    await user.click(screen.getByRole("button", { name: "Save callback" }))
    expect(await screen.findByRole("alert")).toHaveTextContent("Could not save")
    expect(screen.getByLabelText("Account-holder name")).toHaveValue(
      "Test User"
    )
    expect(mocks.refresh).not.toHaveBeenCalled()
    mocks.create.mockResolvedValueOnce({ status: "success" })
    await user.click(screen.getByRole("button", { name: "Save callback" }))
    await waitFor(() =>
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument()
    )
    expect(mocks.refresh).toHaveBeenCalledOnce()
    expect(screen.getByRole("status")).toHaveTextContent("Callback saved.")
    expect(mocks.create.mock.calls[0][0].get("scheduled_at")).toBe(
      new Date("2099-09-05T12:00").toISOString()
    )
  })

  it("switches to time-window inputs", async () => {
    const user = await openForm()
    await user.click(screen.getByRole("button", { name: "Time window" }))
    expect(screen.getByLabelText("Window start")).toBeInTheDocument()
    expect(screen.getByLabelText("Window end")).toBeInTheDocument()
    expect(screen.queryByLabelText("Date and time")).not.toBeInTheDocument()
  })

  it("submits each time-window endpoint in UTC", async () => {
    const user = await openForm()
    await fillForm(user)
    await user.click(screen.getByRole("button", { name: "Time window" }))
    await chooseSchedule(user, "Window start", 5)
    await chooseSchedule(user, "Window end", 6)
    mocks.create.mockResolvedValueOnce({ status: "success" })
    await user.click(screen.getByRole("button", { name: "Save callback" }))
    await waitFor(() => expect(mocks.create).toHaveBeenCalledOnce())
    const data = mocks.create.mock.calls[0][0]
    expect(data.get("window_start_at")).toBe(
      new Date("2099-09-05T12:00").toISOString()
    )
    expect(data.get("window_end_at")).toBe(
      new Date("2099-09-06T12:00").toISOString()
    )
  })

  it("disables past dates in the shadcn calendar", async () => {
    const user = await openForm()
    await user.click(screen.getByLabelText("Date and time", { exact: true }))
    await user.selectOptions(
      screen.getByRole("combobox", { name: /year/i }),
      "2000"
    )
    await user.selectOptions(
      screen.getByRole("combobox", { name: /month/i }),
      "8"
    )
    expect(
      screen.getByRole("button", { name: /September 5.*2000/ })
    ).toBeDisabled()
  })

  it("keeps creation available from the workload section", () => {
    render(<WorkloadSummary open={[]} closedAts={[]} />)
    expect(
      screen.getByRole("button", { name: "New Callback" })
    ).toBeInTheDocument()
    expect(
      screen.getByRole("heading", { name: "Today's workload" })
    ).toBeInTheDocument()
  })

  it("surfaces unavailable workload data without fabricating zero counts", () => {
    render(
      <WorkloadSummary
        open={[]}
        closedAts={[]}
        unavailable
        retryHref="/?view=week&date=2026-09-05"
      />
    )
    expect(screen.getByRole("status")).toHaveTextContent(
      "Workload summary is unavailable"
    )
    expect(screen.getByRole("link", { name: "Try again" })).toHaveAttribute(
      "href",
      "/?view=week&date=2026-09-05"
    )
    expect(screen.queryByText("0")).not.toBeInTheDocument()
  })

  it("lets the agent save after an overlap warning", async () => {
    const user = await openForm()
    await fillForm(user)
    mocks.create.mockResolvedValueOnce({
      status: "conflict",
      message: "This schedule overlaps an existing callback.",
    })
    await user.click(screen.getByRole("button", { name: "Save callback" }))
    expect(
      screen.getByText("This schedule overlaps an existing callback.")
    ).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Save callback" })).toBeEnabled()
    mocks.create.mockResolvedValueOnce({ status: "success" })
    await user.click(screen.getByRole("button", { name: "Save callback" }))
    expect(mocks.create.mock.calls[1][0].get("allowConflict")).toBe("true")
  })
})
