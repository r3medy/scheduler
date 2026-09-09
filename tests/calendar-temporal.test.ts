import { describe, expect, it } from "vitest"
import {
  deriveTemporalState,
  getDisplayState,
  getMarkerDateKeys,
  groupMarkersByDate,
  isMarkerInRange,
  mergeMarkersById,
  sortMarkersByPriority,
} from "@/lib/calendar/date-utils"
import type { CalendarMarker } from "@/lib/calendar/types"

function exactMarker(
  id: string,
  scheduledAt: string,
  temporalState: CalendarMarker["temporalState"] = "upcoming"
): CalendarMarker {
  return {
    id,
    accountHolderName: id,
    accountReference: null,
    scheduleMode: "exact",
    scheduledAt,
    startsAt: scheduledAt,
    temporalState,
  }
}

function windowMarker(
  id: string,
  start: string,
  end: string,
  temporalState: CalendarMarker["temporalState"] = "upcoming"
): CalendarMarker {
  return {
    id,
    accountHolderName: id,
    accountReference: null,
    scheduleMode: "window",
    windowStartAt: start,
    windowEndAt: end,
    startsAt: start,
    temporalState,
  }
}

function localStamp(
  year: number,
  month: number,
  day: number,
  hour: number,
  minute = 0
): string {
  return new Date(year, month - 1, day, hour, minute).toISOString()
}

describe("getDisplayState recalculates from timestamps", () => {
  it("ignores a stale stored upcoming state for exact due/grace/overdue", () => {
    const start = "2026-09-05T09:00:00.000Z"
    const marker = exactMarker("exact-1", start, "upcoming")

    expect(getDisplayState(marker, new Date("2026-09-04T08:59:00.000Z"))).toBe(
      "upcoming"
    )
    // Same-day future is "today".
    // Due inside the 5-minute exact window despite stored "upcoming".
    expect(getDisplayState(marker, new Date("2026-09-05T09:01:00.000Z"))).toBe(
      "due"
    )
    // Overdue after the window despite stored "upcoming".
    expect(getDisplayState(marker, new Date("2026-09-05T09:06:00.000Z"))).toBe(
      "overdue"
    )
  })

  it("ignores a stale stored due state after the exact window passes", () => {
    const marker = exactMarker("exact-2", "2026-09-05T09:00:00.000Z", "due")
    expect(getDisplayState(marker, new Date("2026-09-05T09:30:00.000Z"))).toBe(
      "overdue"
    )
  })

  it("transitions window markers due -> grace -> overdue from now", () => {
    const marker = windowMarker(
      "window-1",
      "2026-09-05T09:00:00.000Z",
      "2026-09-05T10:00:00.000Z",
      "upcoming"
    )

    expect(getDisplayState(marker, new Date("2026-09-05T09:30:00.000Z"))).toBe(
      "due"
    )
    expect(getDisplayState(marker, new Date("2026-09-05T10:03:00.000Z"))).toBe(
      "grace"
    )
    expect(getDisplayState(marker, new Date("2026-09-05T10:06:00.000Z"))).toBe(
      "overdue"
    )
    expect(deriveTemporalState("window", marker.startsAt, "2026-09-05T10:00:00.000Z", new Date("2026-09-05T10:03:00.000Z"))).toBe(
      "grace"
    )
  })

  it("falls back to today/upcoming only while not due", () => {
    const futureLocal = localStamp(2099, 9, 5, 12)
    const future = exactMarker("future", futureLocal, "upcoming")
    expect(getDisplayState(future, new Date(2099, 8, 1, 12))).toBe("upcoming")
    expect(getDisplayState(future, new Date(2099, 8, 5, 8))).toBe("today")
  })
})

describe("midnight-spanning windows", () => {
  it("groups a 23:00-01:00 window under both calendar dates", () => {
    const marker = windowMarker(
      "midnight",
      localStamp(2026, 9, 5, 23),
      localStamp(2026, 9, 6, 1)
    )

    expect(getMarkerDateKeys(marker)).toEqual(["2026-09-05", "2026-09-06"])

    const grouped = groupMarkersByDate([marker])
    expect(grouped.get("2026-09-05")?.map((item) => item.id)).toEqual([
      "midnight",
    ])
    expect(grouped.get("2026-09-06")?.map((item) => item.id)).toEqual([
      "midnight",
    ])
  })

  it("keeps exact callbacks on a single date", () => {
    const marker = exactMarker("exact-day", localStamp(2026, 9, 5, 12))
    expect(getMarkerDateKeys(marker)).toEqual(["2026-09-05"])
  })
})

describe("range-boundary active windows", () => {
  it("includes a window that started before the range but is still open", () => {
    const marker = windowMarker(
      "spanning",
      localStamp(2026, 9, 5, 23),
      localStamp(2026, 9, 6, 1)
    )
    // Viewing only Sep 6 must still represent the window open past midnight.
    expect(
      isMarkerInRange(marker, {
        startDate: "2026-09-06",
        endDateExclusive: "2026-09-07",
      })
    ).toBe(true)
  })

  it("excludes a window that ended before the range starts", () => {
    const marker = windowMarker(
      "ended",
      localStamp(2026, 9, 4, 9),
      localStamp(2026, 9, 4, 10)
    )
    expect(
      isMarkerInRange(marker, {
        startDate: "2026-09-06",
        endDateExclusive: "2026-09-07",
      })
    ).toBe(false)
  })

  it("excludes markers starting on the exclusive end date", () => {
    const marker = exactMarker("next-day", localStamp(2026, 9, 7, 9))
    expect(
      isMarkerInRange(marker, {
        startDate: "2026-09-06",
        endDateExclusive: "2026-09-07",
      })
    ).toBe(false)
  })
})

describe("overdue outside the visible range", () => {
  it("merges navigation-independent overdue without duplicates", () => {
    const visible = [exactMarker("a", localStamp(2026, 9, 6, 9))]
    const overdue = [
      exactMarker("a", localStamp(2026, 9, 6, 9)),
      exactMarker("old", localStamp(2026, 8, 1, 9), "overdue"),
    ]

    const merged = mergeMarkersById(visible, overdue)
    expect(merged.map((marker) => marker.id).sort()).toEqual(["a", "old"])
  })

  it("returns visible markers unchanged when no overdue list exists", () => {
    const visible = [exactMarker("a", localStamp(2026, 9, 6, 9))]
    expect(mergeMarkersById(visible, undefined)).toBe(visible)
  })

  it("sorts merged overdue above upcoming from now", () => {
    const now = new Date("2026-09-06T12:00:00.000Z")
    const upcoming = exactMarker("up", "2099-09-06T09:00:00.000Z", "upcoming")
    // Stored state claims upcoming, but timestamps prove overdue.
    const staleOverdue = exactMarker(
      "old",
      "2026-09-01T09:00:00.000Z",
      "upcoming"
    )
    const sorted = sortMarkersByPriority([upcoming, staleOverdue], now)
    expect(sorted[0].id).toBe("old")
  })
})
