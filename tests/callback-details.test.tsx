import { render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { beforeEach, expect, it, vi } from "vitest"
import { CallbackDetailsDialog } from "@/components/callbacks/callback-details-dialog"
import { MonthView } from "@/components/scheduling-calendar/month-view"
import { WeekView } from "@/components/scheduling-calendar/week-view"
import { chooseSchedule } from "./date-picker-helper"

const mocks = vi.hoisted(() => ({
  get: vi.fn(),
  update: vi.fn(),
  refresh: vi.fn(),
  delete: vi.fn(),
  status: vi.fn(),
  scheduleFromFormData: vi.fn(),
}))
vi.mock("@/lib/callbacks/get-callback", () => ({ getCallback: mocks.get }))
vi.mock("@/lib/callbacks/update-status", () => ({
  updateCallbackStatus: mocks.status,
}))
vi.mock("@/lib/callbacks/delete-callback", () => ({
  deleteCallback: mocks.delete,
}))
vi.mock("@/lib/callbacks/create-callback", () => ({
  updateCallback: mocks.update,
  createCallback: vi.fn(),
}))
vi.mock("@/lib/notifications/sync", () => ({
  cancelCallbackNotifications: vi.fn(),
  scheduleFromFormData: mocks.scheduleFromFormData,
  scheduleFromRecord: vi.fn(),
}))
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: mocks.refresh }),
}))

const record = {
  id: "00000000-0000-4000-8000-000000000001",
  account_holder_name: "Test Customer",
  phone_number: "0123456789",
  account_number: "123456789",
  comments: "Call about renewal",
  schedule_mode: "exact",
  scheduled_at: "2099-09-05T12:00:00.000Z",
  lifecycle_state: "open",
}
const marker = {
  id: record.id,
  accountHolderName: record.account_holder_name,
  accountReference: "•••• 6789",
  scheduleMode: "exact" as const,
  scheduledAt: record.scheduled_at,
  startsAt: record.scheduled_at,
  temporalState: "upcoming" as const,
}

beforeEach(() => {
  vi.resetAllMocks()
  mocks.get.mockResolvedValue({
    status: "success",
    callback: record,
  })
  mocks.update.mockResolvedValue({ status: "success" })
  mocks.delete.mockResolvedValue({ status: "success" })
  mocks.status.mockResolvedValue({ status: "success" })
})

it("marks completed directly and retains the old status on failure", async () => {
  const user = userEvent.setup()
  render(<MonthView focusedDate="2099-09-05" markers={[marker]} />)
  await user.click(screen.getByRole("button", { name: /Test Customer/ }))
  await screen.findByText("Call about renewal")
  mocks.status.mockResolvedValueOnce({
    status: "error",
    message: "Could not save status.",
  })
  await user.selectOptions(
    screen.getByRole("combobox", { name: "Status" }),
    "reached"
  )
  expect(await screen.findByRole("alert")).toHaveTextContent(
    "Could not save status"
  )
  expect(screen.getByRole("combobox", { name: "Status" })).toHaveValue("open")
  await user.selectOptions(
    screen.getByRole("combobox", { name: "Status" }),
    "reached"
  )
  expect(mocks.status).toHaveBeenLastCalledWith(record.id, "reached")
  await waitFor(() =>
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument()
  )
  expect(mocks.refresh).toHaveBeenCalledOnce()
})

it("requires Close or Reschedule for voicemail and submits the close", async () => {
  const user = userEvent.setup()
  render(<MonthView focusedDate="2099-09-05" markers={[marker]} />)
  await user.click(screen.getByRole("button", { name: /Test Customer/ }))
  await screen.findByText("Call about renewal")

  await user.selectOptions(
    screen.getByRole("combobox", { name: "Status" }),
    "voicemail"
  )
  expect(
    screen.getByRole("radiogroup", { name: "What should happen next?" })
  ).toBeInTheDocument()
  expect(screen.getByRole("radio", { name: /Close/ })).toBeChecked()
  await user.click(screen.getByRole("button", { name: "Close callback" }))

  await waitFor(() => expect(mocks.status).toHaveBeenCalledOnce())
  expect(mocks.status.mock.calls[0][0]).toBe(record.id)
  const data = mocks.status.mock.calls[0][1] as FormData
  expect(data.get("outcome")).toBe("voicemail")
  expect(data.get("attempt_action")).toBe("close")
  expect(mocks.refresh).toHaveBeenCalledOnce()
})

it("retains the exact reschedule after a failed save", async () => {
  const user = userEvent.setup()
  mocks.status.mockResolvedValueOnce({
    status: "error",
    message: "Could not record the outcome.",
  })
  render(<MonthView focusedDate="2099-09-05" markers={[marker]} />)
  await user.click(screen.getByRole("button", { name: /Test Customer/ }))
  await screen.findByText("Call about renewal")
  await user.selectOptions(
    screen.getByRole("combobox", { name: "Status" }),
    "no_answer"
  )
  await user.click(screen.getByRole("radio", { name: /Reschedule/ }))
  await chooseSchedule(user, "New date and time", 7)
  await user.click(
    screen.getByRole("button", { name: "Save and reschedule" })
  )

  expect(await screen.findByRole("alert")).toHaveTextContent(
    "Could not record the outcome"
  )
  expect(screen.getByLabelText("New date and time time")).toHaveValue("12:00")
  const data = mocks.status.mock.calls[0][1] as FormData
  expect(data.get("outcome")).toBe("no_answer")
  expect(data.get("attempt_action")).toBe("reschedule")
  expect(data.get("schedule_mode")).toBe("exact")
  expect(data.get("scheduled_at")).toBe("2099-09-07T09:00:00.000Z")
  expect(mocks.refresh).not.toHaveBeenCalled()

  await user.click(
    screen.getByRole("button", { name: "Save and reschedule" })
  )
  await waitFor(() =>
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument()
  )
  expect(mocks.status).toHaveBeenCalledTimes(2)
  expect(mocks.refresh).toHaveBeenCalledOnce()
})

it("submits a structured future window for rescheduling", async () => {
  const user = userEvent.setup()
  render(<MonthView focusedDate="2099-09-05" markers={[marker]} />)
  await user.click(screen.getByRole("button", { name: /Test Customer/ }))
  await screen.findByText("Call about renewal")
  await user.selectOptions(
    screen.getByRole("combobox", { name: "Status" }),
    "voicemail"
  )
  await user.click(screen.getByRole("radio", { name: /Reschedule/ }))
  await user.click(screen.getByRole("button", { name: "Time window" }))
  await chooseSchedule(user, "New window start", 7)
  await chooseSchedule(user, "New window end", 8)
  await user.click(
    screen.getByRole("button", { name: "Save and reschedule" })
  )

  await waitFor(() => expect(mocks.status).toHaveBeenCalledOnce())
  const data = mocks.status.mock.calls[0][1] as FormData
  expect(data.get("schedule_mode")).toBe("window")
  expect(data.get("scheduled_at")).toBeNull()
  expect(data.get("window_start_at")).toBe("2099-09-07T09:00:00.000Z")
  expect(data.get("window_end_at")).toBe("2099-09-08T09:00:00.000Z")
})

it("closes with the header X without deleting", async () => {
  const user = userEvent.setup()
  render(<MonthView focusedDate="2099-09-05" markers={[marker]} />)
  await user.click(screen.getByRole("button", { name: /Test Customer/ }))
  await screen.findByText("Call about renewal")
  await user.click(
    screen.getByRole("button", { name: "Close callback details" })
  )
  await waitFor(() =>
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument()
  )
  expect(mocks.delete).not.toHaveBeenCalled()
})

it("requires confirmation, focuses Cancel, and refreshes after deletion", async () => {
  const user = userEvent.setup()
  render(<MonthView focusedDate="2099-09-05" markers={[marker]} />)
  await user.click(screen.getByRole("button", { name: /Test Customer/ }))
  await screen.findByText("Call about renewal")
  await user.click(screen.getByRole("button", { name: "Delete callback" }))
  expect(screen.getByRole("alertdialog")).toBeInTheDocument()
  await waitFor(() =>
    expect(screen.getByRole("button", { name: "Cancel" })).toHaveFocus()
  )
  expect(mocks.delete).not.toHaveBeenCalled()
  await user.click(screen.getByRole("button", { name: "Cancel" }))
  expect(
    screen.getByRole("dialog", { name: "Callback details" })
  ).toBeInTheDocument()
  await user.click(screen.getByRole("button", { name: "Delete callback" }))
  mocks.delete.mockResolvedValueOnce({
    status: "error",
    message: "Could not delete.",
  })
  await user.click(screen.getByRole("button", { name: "Delete callback" }))
  expect(await screen.findByRole("alert")).toHaveTextContent("Could not delete")
  expect(mocks.refresh).not.toHaveBeenCalled()
  await user.click(screen.getByRole("button", { name: "Delete callback" }))
  await waitFor(() =>
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument()
  )
  expect(mocks.delete).toHaveBeenCalledWith(record.id)
  expect(mocks.refresh).toHaveBeenCalledOnce()
})

it.each([MonthView, WeekView])(
  "opens marker details in place with customer information and an edit icon",
  async (View) => {
    const user = userEvent.setup()
    render(<View focusedDate="2099-09-05" markers={[marker]} />)
    expect(screen.queryByRole("link")).not.toBeInTheDocument()
    await user.click(screen.getByRole("button", { name: /Test Customer/ }))
    expect(await screen.findByText("Call about renewal")).toBeInTheDocument()
    expect(screen.getByText("123456789")).toBeInTheDocument()
    await user.click(screen.getByRole("button", { name: "Edit callback" }))
    expect(
      screen.getByRole("dialog", { name: "Edit callback" })
    ).toBeInTheDocument()
    expect(screen.getByLabelText("Account-holder name")).toHaveValue(
      "Test Customer"
    )
    await chooseSchedule(user, "Date and time", 6)
    await user.click(screen.getByRole("button", { name: "Save callback" }))
    await waitFor(() => expect(mocks.update).toHaveBeenCalledOnce())
    expect(mocks.update.mock.calls[0][0]).toBe(record.id)
    expect(mocks.refresh).toHaveBeenCalledOnce()
  }
)

it("keeps a closed callback closed when its details are edited", async () => {
  const user = userEvent.setup()
  const closedRecord = {
    ...record,
    lifecycle_state: "closed" as const,
    resolution_outcome: "reached" as const,
    closed_at: "2099-09-05T12:05:00.000Z",
  }
  mocks.get.mockResolvedValueOnce({
    status: "success",
    callback: closedRecord,
  })
  mocks.update.mockResolvedValueOnce({ status: "success" })

  render(
    <CallbackDetailsDialog callbackId={closedRecord.id}>
      View closed callback
    </CallbackDetailsDialog>
  )
  await user.click(screen.getByRole("button", { name: "View closed callback" }))
  await screen.findByText("Call about renewal")
  await user.click(screen.getByRole("button", { name: "Edit callback" }))
  await user.click(screen.getByRole("button", { name: "Save callback" }))

  await waitFor(() => expect(mocks.update).toHaveBeenCalledOnce())
  expect(mocks.scheduleFromFormData).toHaveBeenCalledWith(
    closedRecord.id,
    expect.any(FormData),
    "closed"
  )
})

it("offers retry when details cannot load", async () => {
  mocks.get.mockResolvedValueOnce({
    status: "error",
    message: "Could not load callback.",
  })
  const user = userEvent.setup()
  render(<MonthView focusedDate="2099-09-05" markers={[marker]} />)
  await user.click(screen.getByRole("button", { name: /Test Customer/ }))
  expect(await screen.findByRole("alert")).toHaveTextContent("Could not load")
  await user.click(screen.getByRole("button", { name: "Try again" }))
  expect(await screen.findByText("Call about renewal")).toBeInTheDocument()
})
