import type {
  CalendarMarker,
  CalendarRange,
  CalendarTemporalState,
  CalendarView,
} from "@/lib/calendar/types"

const DATE_KEY_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/
const MINUTE = 60_000

export const WEEKDAY_LABELS = [
  "Mon",
  "Tue",
  "Wed",
  "Thu",
  "Fri",
  "Sat",
  "Sun",
] as const

const MONTH_YEAR_FORMAT = new Intl.DateTimeFormat(undefined, {
  month: "long",
  year: "numeric",
})
const MONTH_YEAR_SHORT_FORMAT = new Intl.DateTimeFormat(undefined, {
  month: "short",
  year: "numeric",
})
const MONTH_SHORT_FORMAT = new Intl.DateTimeFormat(undefined, {
  month: "short",
})
const MONTH_DAY_FORMAT = new Intl.DateTimeFormat(undefined, {
  month: "short",
  day: "numeric",
})
const MONTH_DAY_YEAR_FORMAT = new Intl.DateTimeFormat(undefined, {
  month: "short",
  day: "numeric",
  year: "numeric",
})
const DAY_YEAR_FORMAT = new Intl.DateTimeFormat(undefined, {
  day: "numeric",
  year: "numeric",
})
const TIME_FORMAT = new Intl.DateTimeFormat(undefined, {
  hour: "numeric",
  minute: "2-digit",
})
const HOUR_FORMAT = new Intl.DateTimeFormat(undefined, { hour: "numeric" })

export function toDateKey(date: Date): string {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, "0")
  const day = String(date.getDate()).padStart(2, "0")

  return `${year}-${month}-${day}`
}

export function parseDateKey(value: string): Date | null {
  const match = DATE_KEY_PATTERN.exec(value)

  if (!match) return null

  const year = Number(match[1])
  const month = Number(match[2]) - 1
  const day = Number(match[3])
  const date = new Date(year, month, day, 12)

  if (
    date.getFullYear() !== year ||
    date.getMonth() !== month ||
    date.getDate() !== day
  ) {
    return null
  }

  return date
}

export function normalizeDateKey(
  value: string | undefined,
  now = new Date()
): string {
  return value && parseDateKey(value) ? value : toDateKey(now)
}

export function normalizeCalendarView(value: string | undefined): CalendarView {
  if (value === "week" || value === "table") return value
  return "month"
}

export function addDays(date: Date, amount: number): Date {
  const result = new Date(date)
  result.setDate(result.getDate() + amount)
  return result
}

export function addDaysToKey(dateKey: string, amount: number): string {
  const date = parseDateKey(dateKey)
  if (!date) return dateKey
  return toDateKey(addDays(date, amount))
}

export function startOfWeek(date: Date): Date {
  const result = new Date(date)
  const mondayOffset = (result.getDay() + 6) % 7
  result.setDate(result.getDate() - mondayOffset)
  return result
}

export function startOfMonthGrid(date: Date): Date {
  return startOfWeek(new Date(date.getFullYear(), date.getMonth(), 1, 12))
}

export function getCalendarRange(
  view: CalendarView,
  focusedDateKey: string
): CalendarRange {
  const focusedDate = parseDateKey(focusedDateKey) ?? new Date()

  if (view === "table") {
    const start = new Date(focusedDate.getFullYear(), focusedDate.getMonth(), 1)
    const end = new Date(focusedDate.getFullYear(), focusedDate.getMonth() + 1, 1)
    return {
      startDate: toDateKey(start),
      endDateExclusive: toDateKey(end),
    }
  }

  const start =
    view === "week" ? startOfWeek(focusedDate) : startOfMonthGrid(focusedDate)
  const dayCount =
    view === "week" ? 7 : getMonthDayCount(focusedDateKey)

  return {
    startDate: toDateKey(start),
    endDateExclusive: toDateKey(addDays(start, dayCount)),
  }
}

export function getMonthDayCount(focusedDateKey: string): number {
  const focusedDate = parseDateKey(focusedDateKey) ?? new Date()
  const start = startOfMonthGrid(focusedDate)
  const all = Array.from({ length: 42 }, (_, index) => addDays(start, index))
  const trailing = all.slice(35)
  const trailingAllOutside = trailing.every(
    (date) => !isSameMonth(date, focusedDateKey)
  )
  return trailingAllOutside ? 35 : 42
}

export function getMonthDays(focusedDateKey: string): Date[] {
  const focusedDate = parseDateKey(focusedDateKey) ?? new Date()
  const start = startOfMonthGrid(focusedDate)

  return Array.from(
    { length: getMonthDayCount(focusedDateKey) },
    (_, index) => addDays(start, index)
  )
}

export function getWeekDays(focusedDateKey: string): Date[] {
  const focusedDate = parseDateKey(focusedDateKey) ?? new Date()
  const start = startOfWeek(focusedDate)

  return Array.from({ length: 7 }, (_, index) => addDays(start, index))
}

export function getAdjacentDateKey(
  view: CalendarView,
  focusedDateKey: string,
  direction: -1 | 1
): string {
  const focusedDate = parseDateKey(focusedDateKey) ?? new Date()

  if (view === "week") {
    return toDateKey(addDays(focusedDate, direction * 7))
  }

  return toDateKey(
    new Date(
      focusedDate.getFullYear(),
      focusedDate.getMonth() + direction,
      1,
      12
    )
  )
}

export function formatCalendarHeading(
  view: CalendarView,
  focusedDateKey: string
): string {
  const focusedDate = parseDateKey(focusedDateKey) ?? new Date()

  if (view === "month" || view === "table") {
    return MONTH_YEAR_FORMAT.format(focusedDate)
  }

  const days = getWeekDays(focusedDateKey)
  const start = days[0]
  const end = days[6]
  const sameMonth = start.getMonth() === end.getMonth()
  const sameYear = start.getFullYear() === end.getFullYear()
  const startLabel = (sameYear ? MONTH_DAY_FORMAT : MONTH_DAY_YEAR_FORMAT).format(
    start
  )
  const endLabel = (sameMonth ? DAY_YEAR_FORMAT : MONTH_DAY_YEAR_FORMAT).format(
    end
  )

  return `${startLabel}–${endLabel}`
}

export function formatCalendarControlLabel(
  view: CalendarView,
  focusedDateKey: string
): string {
  const focusedDate = parseDateKey(focusedDateKey) ?? new Date()

  if (view === "month" || view === "table") {
    return MONTH_YEAR_SHORT_FORMAT.format(focusedDate)
  }

  const [start, , , , , , end] = getWeekDays(focusedDateKey)
  const month = MONTH_SHORT_FORMAT.format(start)

  if (start.getMonth() === end.getMonth()) {
    return `${month} ${start.getDate()}–${end.getDate()}`
  }

  const endMonth = MONTH_SHORT_FORMAT.format(end)
  return `${month} ${start.getDate()}–${endMonth} ${end.getDate()}`
}

export function formatMonthBadge(dateKey: string): string {
  const date = parseDateKey(dateKey) ?? new Date()
  return MONTH_SHORT_FORMAT.format(date)
}

export function formatTime(isoTimestamp: string): string {
  return TIME_FORMAT.format(new Date(isoTimestamp))
}

export function formatHour(hour: number): string {
  return HOUR_FORMAT.format(new Date(2026, 0, 1, hour))
}

export function formatMarkerTime(marker: CalendarMarker): string {
  if (marker.scheduleMode === "exact") {
    return formatTime(marker.scheduledAt)
  }

  return `${formatTime(marker.windowStartAt)}–${formatTime(marker.windowEndAt)}`
}

export function formatMarkerAccessibleLabel(marker: CalendarMarker): string {
  const account = marker.accountReference
    ? `, account ${marker.accountReference}`
    : ""
  const state = CALENDAR_STATE_LABELS[marker.temporalState]
  const schedule =
    marker.scheduleMode === "exact"
      ? `at ${formatTime(marker.scheduledAt)}`
      : `from ${formatTime(marker.windowStartAt)} to ${formatTime(marker.windowEndAt)}`

  return `${marker.accountHolderName}${account}, ${schedule}, ${state}`
}

export function getMarkerDateKey(marker: CalendarMarker): string {
  return toDateKey(new Date(marker.startsAt))
}

export function groupMarkersByDate(
  markers: CalendarMarker[]
): Map<string, CalendarMarker[]> {
  const grouped = new Map<string, CalendarMarker[]>()

  for (const marker of markers) {
    const dateKey = getMarkerDateKey(marker)
    const dateMarkers = grouped.get(dateKey) ?? []
    dateMarkers.push(marker)
    grouped.set(dateKey, dateMarkers)
  }

  for (const dateMarkers of grouped.values()) {
    dateMarkers.sort(compareCalendarMarkers)
  }

  return grouped
}

export function compareCalendarMarkers(
  first: CalendarMarker,
  second: CalendarMarker
): number {
  const timeDifference =
    new Date(first.startsAt).getTime() - new Date(second.startsAt).getTime()

  return timeDifference || first.id.localeCompare(second.id)
}

export function deriveTemporalState(
  scheduleMode: "exact" | "window",
  startsAt: string,
  windowEndAt: string | null,
  now = new Date()
): CalendarTemporalState {
  const currentTime = now.getTime()
  const startTime = new Date(startsAt).getTime()

  if (currentTime < startTime) return "upcoming"

  if (scheduleMode === "exact") {
    return currentTime < startTime + 5 * MINUTE ? "due" : "overdue"
  }

  const endTime = new Date(windowEndAt ?? startsAt).getTime()
  if (currentTime <= endTime) return "due"
  return currentTime < endTime + 5 * MINUTE ? "grace" : "overdue"
}

export const CALENDAR_STATE_LABELS = {
  upcoming: "Scheduled",
  due: "Due now",
  grace: "Grace period",
  overdue: "Overdue",
} satisfies Record<CalendarTemporalState, string>

const CALENDAR_STATE_PRIORITY = {
  upcoming: 0,
  grace: 1,
  due: 2,
  overdue: 3,
} satisfies Record<CalendarTemporalState, number>

export function getMostUrgentState(
  markers: CalendarMarker[]
): CalendarTemporalState | null {
  let mostUrgent: CalendarTemporalState | null = null

  for (const marker of markers) {
    if (
      mostUrgent === null ||
      CALENDAR_STATE_PRIORITY[marker.temporalState] >
        CALENDAR_STATE_PRIORITY[mostUrgent]
    ) {
      mostUrgent = marker.temporalState
    }
  }

  return mostUrgent
}

export type CalendarDisplayState =
  | "overdue"
  | "due"
  | "grace"
  | "today"
  | "upcoming"

export const CALENDAR_DISPLAY_LABELS = {
  overdue: "Overdue",
  due: "Due now",
  grace: "Grace period",
  today: "Today",
  upcoming: "Scheduled",
} satisfies Record<CalendarDisplayState, string>

const CALENDAR_DISPLAY_PRIORITY = {
  upcoming: 1,
  today: 2,
  grace: 3,
  due: 3,
  overdue: 4,
} satisfies Record<CalendarDisplayState, number>

export function getDisplayState(
  marker: CalendarMarker,
  now = new Date()
): CalendarDisplayState {
  if (marker.temporalState === "overdue") return "overdue"
  if (marker.temporalState === "due") return "due"
  if (marker.temporalState === "grace") return "grace"
  const markerDay = toDateKey(new Date(marker.startsAt))
  return markerDay === toDateKey(now) ? "today" : "upcoming"
}

export function getMostUrgentDisplayState(
  markers: CalendarMarker[],
  now = new Date()
): CalendarDisplayState | null {
  let mostUrgent: CalendarDisplayState | null = null
  for (const marker of markers) {
    const display = getDisplayState(marker, now)
    if (
      mostUrgent === null ||
      CALENDAR_DISPLAY_PRIORITY[display] >
        CALENDAR_DISPLAY_PRIORITY[mostUrgent]
    ) {
      mostUrgent = display
    }
  }
  return mostUrgent
}

export function sortMarkersByPriority(
  markers: CalendarMarker[],
  now = new Date()
): CalendarMarker[] {
  return [...markers].sort((first, second) => {
    const priority =
      CALENDAR_DISPLAY_PRIORITY[getDisplayState(second, now)] -
      CALENDAR_DISPLAY_PRIORITY[getDisplayState(first, now)]
    if (priority !== 0) return priority
    return compareCalendarMarkers(first, second)
  })
}

function formatDuration(minutes: number): string {
  if (minutes < 1) return "less than a minute"
  if (minutes < 60) return `${minutes} min`
  const hours = Math.floor(minutes / 60)
  const remainder = minutes % 60
  if (minutes < 24 * 60) {
    const hourLabel = hours === 1 ? "hr" : "hrs"
    if (remainder === 0) return `${hours} ${hourLabel}`
    return `${hours} ${hourLabel} ${remainder} min`
  }
  const days = Math.floor(minutes / (24 * 60))
  return days === 1 ? "1 day" : `${days} days`
}

function pluralize(value: number, singular: string): string {
  return value === 1 ? `1 ${singular}` : `${value} ${singular}s`
}

export function formatRelativeTime(
  marker: CalendarMarker,
  now = new Date()
): string {
  const currentTime = now.getTime()
  if (marker.scheduleMode === "exact") {
    const startTime = new Date(marker.scheduledAt).getTime()
    if (currentTime < startTime) {
      const minutes = Math.floor((startTime - currentTime) / MINUTE)
      const markerDay = toDateKey(new Date(marker.startsAt))
      const todayKey = toDateKey(now)
      if (markerDay !== todayKey) {
        if (markerDay === addDaysToKey(todayKey, 1)) return "Tomorrow"
        return `in ${formatDuration(minutes)}`
      }
      return `in ${formatDuration(minutes)}`
    }
    if (currentTime < startTime + 5 * MINUTE) return "Due now"
    const overdueMinutes = Math.floor(
      (currentTime - (startTime + 5 * MINUTE)) / MINUTE
    )
    if (overdueMinutes < 1) return "just now overdue"
    return `${formatDuration(overdueMinutes)} overdue`
  }

  const startTime = new Date(marker.windowStartAt).getTime()
  const endTime = new Date(marker.windowEndAt).getTime()
  const graceEnd = endTime + 5 * MINUTE
  if (currentTime < startTime) {
    const minutes = Math.floor((startTime - currentTime) / MINUTE)
    const markerDay = toDateKey(new Date(marker.startsAt))
    const todayKey = toDateKey(now)
    if (markerDay !== todayKey) {
      if (markerDay === addDaysToKey(todayKey, 1)) return "Tomorrow"
      return `in ${formatDuration(minutes)}`
    }
    return `in ${formatDuration(minutes)}`
  }
  if (currentTime <= endTime) return "Due now"
  if (currentTime < graceEnd) {
    const remaining = Math.max(
      1,
      Math.ceil((graceEnd - currentTime) / MINUTE)
    )
    return `Grace · ${pluralize(remaining, "min")} left`
  }
  const overdueMinutes = Math.floor((currentTime - graceEnd) / MINUTE)
  if (overdueMinutes < 1) return "just now overdue"
  return `${formatDuration(overdueMinutes)} overdue`
}

export function isSameMonth(date: Date, focusedDateKey: string): boolean {
  const focusedDate = parseDateKey(focusedDateKey) ?? new Date()
  return (
    date.getFullYear() === focusedDate.getFullYear() &&
    date.getMonth() === focusedDate.getMonth()
  )
}

export function isToday(date: Date, now = new Date()): boolean {
  return toDateKey(date) === toDateKey(now)
}

export function getMarkerMinuteOfDay(marker: CalendarMarker): number {
  const date = new Date(marker.startsAt)
  return date.getHours() * 60 + date.getMinutes()
}

export function getWeekHourBounds(markers: CalendarMarker[]): {
  startHour: number
  endHour: number
} {
  if (markers.length === 0) return { startHour: 8, endHour: 18 }

  const minutes = markers.map(getMarkerMinuteOfDay)
  const earliestHour = Math.floor(Math.min(...minutes) / 60)
  const latestHour = Math.floor(Math.max(...minutes) / 60) + 1

  return {
    startHour: Math.max(0, Math.min(8, earliestHour)),
    endHour: Math.min(24, Math.max(18, latestHour)),
  }
}

export interface MarkerCluster {
  primary: CalendarMarker
  hiddenCount: number
}

export function clusterNearbyMarkers(
  markers: CalendarMarker[],
  thresholdMinutes = 45
): MarkerCluster[] {
  const sorted = [...markers].sort(compareCalendarMarkers)
  const clusters: MarkerCluster[] = []

  for (const marker of sorted) {
    const current = clusters.at(-1)

    if (
      current &&
      getMarkerMinuteOfDay(marker) - getMarkerMinuteOfDay(current.primary) <
        thresholdMinutes
    ) {
      current.hiddenCount += 1
      continue
    }

    clusters.push({ primary: marker, hiddenCount: 0 })
  }

  return clusters
}
