import { act, fireEvent, render, screen } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"

const routeState = vi.hoisted(() => ({
  search: "",
  push: vi.fn(),
}))

const router = {
  push: (href: string) => {
    routeState.push(href)
  },
}

vi.mock("server-only", () => ({}))
vi.mock("next/navigation", () => ({
  usePathname: () => "/",
  useRouter: () => router,
  useSearchParams: () => new URLSearchParams(routeState.search),
}))
vi.mock("next/link", () => ({
  default: ({
    href,
    children,
    ...props
  }: {
    href: string
    children: React.ReactNode
  }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}))
vi.mock("@/components/callbacks/callback-details-dialog", () => ({
  CallbackDetailsDialog: ({
    callbackId,
    children,
    ...props
  }: React.ComponentProps<"button"> & {
    callbackId: string
  }) => (
    <button type="button" data-callback-id={callbackId} {...props}>
      {children}
    </button>
  ),
}))
vi.mock("@/components/scheduling-calendar/month-view", () => ({
  MonthView: () => <div aria-label="month view" />,
}))
vi.mock("@/components/scheduling-calendar/week-view", () => ({
  WeekView: () => <div aria-label="week view" />,
}))
vi.mock("@/components/scheduling-calendar/table-view", () => ({
  TableView: () => <div aria-label="table view" />,
}))
vi.mock("@/components/scheduling-calendar/up-next", () => ({
  UpNext: () => null,
}))

import { CallbackHistory } from "@/components/callbacks/callback-history"
import { SchedulingCalendar } from "@/components/scheduling-calendar/scheduling-calendar"
import type { HistoryResult } from "@/lib/callbacks/presentation"

const historyResult: Extract<HistoryResult, { status: "success" }> = {
  status: "success",
  counts: { all: 0, reached: 0, voicemail: 0, no_answer: 0 },
  total: 0,
  page: 1,
  rows: [],
}

beforeEach(() => {
  vi.useFakeTimers()
  routeState.search = ""
  routeState.push.mockReset()
})

describe("client route lifecycle", () => {
  it("stabilizes history search after one debounced route update", async () => {
    const { rerender } = render(
      <CallbackHistory result={historyResult} search={undefined} />
    )
    expect(routeState.push).not.toHaveBeenCalled()

    fireEvent.change(screen.getByRole("searchbox"), {
      target: { value: "Layla" },
    })
    await act(async () => {
      vi.advanceTimersByTime(300)
    })

    expect(routeState.push).toHaveBeenCalledTimes(1)
    expect(routeState.push).toHaveBeenCalledWith("/history?q=Layla")

    await act(async () => {
      rerender(<CallbackHistory result={historyResult} search="Layla" />)
      await Promise.resolve()
    })
    expect(routeState.push).toHaveBeenCalledTimes(1)
  })

  it("performs one calendar navigation and stabilizes after route props update", async () => {
    routeState.search = "?view=week&date=2026-09-05"
    const { rerender } = render(
      <SchedulingCalendar
        view="week"
        focusedDate="2026-09-05"
        markers={[]}
      />
    )

    fireEvent.click(screen.getByRole("button", { name: "Next week" }))

    expect(routeState.push).toHaveBeenCalledTimes(1)
    expect(routeState.push.mock.calls[0]?.[0]).toContain(
      "/?view=week&date=2026-09-12"
    )

    await act(async () => {
      rerender(
        <SchedulingCalendar
          view="week"
          focusedDate="2026-09-12"
          markers={[]}
        />
      )
      await Promise.resolve()
    })
    expect(routeState.push).toHaveBeenCalledTimes(1)
  })
})
