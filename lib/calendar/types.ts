export type CalendarView = "month" | "week" | "table"

export type CalendarTemporalState = "upcoming" | "due" | "grace" | "overdue"

interface CalendarMarkerBase {
  id: string
  accountHolderName: string
  accountReference: string | null
  startsAt: string
  temporalState: CalendarTemporalState
}

export interface ExactCalendarMarker extends CalendarMarkerBase {
  scheduleMode: "exact"
  scheduledAt: string
}

export interface WindowCalendarMarker extends CalendarMarkerBase {
  scheduleMode: "window"
  windowStartAt: string
  windowEndAt: string
}

export type CalendarMarker = ExactCalendarMarker | WindowCalendarMarker

export interface CalendarRange {
  startDate: string
  endDateExclusive: string
}

export type CalendarLoadResult =
  | { status: "success"; markers: CalendarMarker[] }
  | { status: "configuration-error" }
  | { status: "unauthenticated" }
  | { status: "error" }
