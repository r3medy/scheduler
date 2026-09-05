import { render, screen } from "@testing-library/react"
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

function marker(id: string, local: string): CalendarMarker {
  const stamp = new Date(local).toISOString()
  return {
    id,
    accountHolderName: id,
    accountReference: null,
    scheduleMode: "exact",
    scheduledAt: stamp,
    startsAt: stamp,
    temporalState: "upcoming",
  }
}

it("renders a Saturday marker inside the Saturday column", () => {
  render(
    <WeekView
      focusedDate="2026-09-05"
      markers={[marker("sat-callback", "2026-09-05T17:50:00")]}
    />
  )
  const button = screen.getByRole("button", { name: /sat-callback/ })
  const column = button.closest("div[aria-label^='Callbacks for']")
  expect(column?.getAttribute("aria-label")).toMatch(/September 5/)
})

it("keeps callback cards in normal flow inside their day cell", () => {
  render(
    <WeekView
      focusedDate="2026-09-05"
      markers={[marker("sat-callback", "2026-09-05T17:50:00")]}
    />
  )
  const button = screen.getByRole("button", {
    name: /sat-callback/,
  }) as HTMLElement
  expect(button.closest("[data-week-day]")).toHaveAttribute(
    "data-week-day",
    "2026-09-05"
  )
  expect(button).not.toHaveClass("absolute")
  expect(button.style.top).toBe("")
  expect(button.style.left).toBe("")
  expect(button.style.right).toBe("")
  expect(button.style.width).toBe("")
})

it("places markers for several days each in their own column", () => {
  render(
    <WeekView
      focusedDate="2026-09-05"
      markers={[
        marker("mon-callback", "2026-08-31T09:00:00"),
        marker("wed-callback", "2026-09-02T14:30:00"),
        marker("sun-callback", "2026-09-06T11:15:00"),
      ]}
    />
  )
  for (const [id, day] of [
    ["mon-callback", "August 31"],
    ["wed-callback", "September 2"],
    ["sun-callback", "September 6"],
  ] as const) {
    const button = screen.getByRole("button", { name: new RegExp(id) })
    const column = button.closest("div[aria-label^='Callbacks for']")
    expect(column?.getAttribute("aria-label")).toMatch(new RegExp(day))
  }
})
