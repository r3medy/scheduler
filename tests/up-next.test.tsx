import { act, render, screen } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { UpNext } from "@/components/scheduling-calendar/up-next"
import type { CalendarMarker } from "@/lib/calendar/types"

vi.mock("@/components/callbacks/callback-details-dialog", () => ({
  CallbackDetailsDialog: ({
    callbackId,
    ...props
  }: React.ComponentProps<"button"> & { callbackId: string }) => (
    <button data-id={callbackId} {...props} />
  ),
}))

function exactMarker(id: string, scheduledAt: string): CalendarMarker {
  return {
    id,
    accountHolderName: id,
    accountReference: null,
    scheduleMode: "exact",
    scheduledAt,
    startsAt: scheduledAt,
    // Deliberately stale: stored at load time, must be recomputed from now.
    temporalState: "upcoming",
  }
}

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(new Date("2026-09-05T09:01:00.000Z"))
})

afterEach(() => {
  vi.useRealTimers()
})

describe("UpNext live temporal transitions", () => {
  it("moves due -> overdue on tick without reload despite stale stored state", async () => {
    render(
      <UpNext markers={[exactMarker("live-1", "2026-09-05T09:00:00.000Z")]} />
    )

    expect(screen.getAllByText("Due now").length).toBeGreaterThan(0)

    vi.setSystemTime(new Date("2026-09-05T09:06:00.000Z"))
    await act(async () => {
      vi.advanceTimersByTime(30_000)
    })

    expect(screen.getAllByText("Overdue").length).toBeGreaterThan(0)
  })

  it("refreshes on tab resume via visibilitychange without waiting for the interval", async () => {
    render(
      <UpNext markers={[exactMarker("live-2", "2026-09-05T09:00:00.000Z")]} />
    )
    expect(screen.getAllByText("Due now").length).toBeGreaterThan(0)

    // Time passes while hidden; no interval tick fires yet.
    vi.setSystemTime(new Date("2026-09-05T09:10:00.000Z"))
    await act(async () => {
      document.dispatchEvent(new Event("visibilitychange"))
    })

    expect(screen.getAllByText("Overdue").length).toBeGreaterThan(0)
  })

  it("renders overdue that started outside the visible period", () => {
    render(
      <UpNext markers={[exactMarker("old-overdue", "2026-08-01T09:00:00.000Z")]} />
    )
    expect(screen.getByText("old-overdue")).toBeInTheDocument()
    expect(screen.getAllByText("Overdue").length).toBeGreaterThan(0)
  })
})
