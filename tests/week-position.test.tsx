import { render, screen, within } from "@testing-library/react"
import { expect, it, vi } from "vitest"
import { WeekView } from "@/components/scheduling-calendar/week-view"
import type { CalendarMarker } from "@/lib/calendar/types"

vi.mock("@/components/callbacks/callback-details-dialog", () => ({
  CallbackDetailsDialog: ({
    callbackId,
    ...props
  }: React.ComponentProps<"button"> & { callbackId: string }) => (
    <button data-id={callbackId} {...props} />
  ),
}))

function marker(time: string): CalendarMarker {
  const stamp = new Date(`2099-09-05T${time}:00`).toISOString()
  return {
    id: time,
    accountHolderName: time,
    accountReference: null,
    scheduleMode: "exact",
    scheduledAt: stamp,
    startsAt: stamp,
    temporalState: "upcoming",
  }
}

it("keeps a late-minute callback in its scheduled hour cell", () => {
  render(<WeekView focusedDate="2099-09-05" markers={[marker("18:55")]} />)
  const callback = screen.getByRole("button", { name: /18:55/ })
  const row = callback.closest("[data-week-hour]")
  expect(row).toHaveAttribute("data-week-hour", "18")
  expect(within(row as HTMLElement).getByText("6 PM")).toBeVisible()
  expect(callback).toHaveTextContent("6:55 PM")
})

it("keeps all nearby callbacks in the final hour without adding a next-day row", () => {
  render(
    <WeekView
      focusedDate="2099-09-05"
      markers={[marker("23:40"), marker("23:59")]}
    />
  )
  const first = screen.getByRole("button", { name: /23:40/ })
  const last = screen.getByRole("button", { name: /23:59/ })
  expect(first.parentElement).toBe(last.parentElement)
  expect(last.closest("[data-week-hour]")).toHaveAttribute(
    "data-week-hour",
    "23"
  )
  expect(screen.queryByText("12 AM")).not.toBeInTheDocument()
})

it("renders every hour including noon and 1 PM in a complete row of seven cells", () => {
  const { container } = render(
    <WeekView focusedDate="2099-09-05" markers={[]} />
  )
  const rows = Array.from(container.querySelectorAll("[data-week-hour]"))
  expect(rows.map((row) => Number(row.getAttribute("data-week-hour")))).toEqual(
    Array.from({ length: 10 }, (_, index) => index + 8)
  )
  for (const row of rows) {
    expect(row.querySelectorAll("[data-week-day]")).toHaveLength(7)
    expect(row.querySelector("time")).toBeVisible()
  }
  expect(screen.getByText("12 PM")).toBeVisible()
  expect(screen.getByText("1 PM")).toBeVisible()
})
