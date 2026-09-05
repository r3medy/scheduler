"use client"

import { CallbackDetailsDialog } from "@/components/callbacks/callback-details-dialog"

import { cn } from "@/lib/utils"
import {
  CALENDAR_DISPLAY_LABELS,
  formatMarkerAccessibleLabel,
  formatMarkerTime,
  getDisplayState,
  getMonthDays,
  getMostUrgentDisplayState,
  groupMarkersByDate,
  isSameMonth,
  isToday,
  toDateKey,
  WEEKDAY_LABELS,
} from "@/lib/calendar/date-utils"
import type { CalendarMarker } from "@/lib/calendar/types"
import type { CalendarDisplayState } from "@/lib/calendar/date-utils"

const MAX_VISIBLE_MARKERS = 2

const markerStyles = {
  overdue: "border-overdue/50 bg-overdue/10",
  due: "border-warning/50 bg-warning/10",
  grace: "border-warning/50 bg-warning/10",
  today: "border-primary/40 bg-primary/10",
  upcoming: "border-border bg-muted/40",
} satisfies Record<CalendarDisplayState, string>

const dotStyles = {
  overdue: "bg-overdue",
  due: "bg-warning",
  grace: "bg-warning",
  today: "bg-primary",
  upcoming: "bg-muted-foreground",
} satisfies Record<CalendarDisplayState, string>

const urgentTextStyles = {
  overdue: "text-overdue",
  due: "text-warning",
  grace: "text-warning",
  today: "text-foreground",
  upcoming: "text-muted-foreground",
} satisfies Record<CalendarDisplayState, string>

export interface MonthViewProps {
  focusedDate: string
  markers: CalendarMarker[]
}

export function MonthView({ focusedDate, markers }: MonthViewProps) {
  const days = getMonthDays(focusedDate)
  const groupedMarkers = groupMarkersByDate(markers)
  const now = new Date()

  return (
    <div className="overflow-x-auto">
      <div className="min-w-[840px]">
        <div className="grid grid-cols-7 border-b bg-muted/25">
          {WEEKDAY_LABELS.map((weekday) => (
            <div
              key={weekday}
              className="px-3 py-2.5 text-[10px] font-medium text-muted-foreground uppercase"
            >
              {weekday}
            </div>
          ))}
        </div>

        <div className="grid grid-cols-7">
          {days.map((date, index) => {
            const dateKey = toDateKey(date)
            const dateMarkers = groupedMarkers.get(dateKey) ?? []
            const urgentState = getMostUrgentDisplayState(dateMarkers, now)
            const overflowCount = Math.max(
              0,
              dateMarkers.length - MAX_VISIBLE_MARKERS
            )
            const isOutsideMonth = !isSameMonth(date, focusedDate)
            const today = isToday(date)

            return (
              <section
                key={dateKey}
                aria-labelledby={`calendar-day-${dateKey}`}
                className={cn(
                  "relative min-h-28 border-r border-b p-2",
                  index % 7 === 6 && "border-r-0",
                  isOutsideMonth && "bg-muted/25"
                )}
              >
                <div className="mb-1 flex h-8 items-center justify-between gap-2">
                  <time
                    id={`calendar-day-${dateKey}`}
                    dateTime={dateKey}
                    className={cn(
                      "grid size-7 place-items-center rounded-full text-xs tabular-nums",
                      isOutsideMonth && "text-muted-foreground",
                      !isOutsideMonth && !today && "text-foreground",
                      today && "bg-foreground text-background"
                    )}
                  >
                    {date.getDate()}
                  </time>

                  {urgentState && (
                    <span
                      className={cn(
                        "truncate text-[10px] font-medium tabular-nums",
                        urgentTextStyles[urgentState]
                      )}
                    >
                      {dateMarkers.length} ·{" "}
                      {CALENDAR_DISPLAY_LABELS[urgentState]}
                    </span>
                  )}
                </div>

                <div className="flex flex-col gap-1">
                  {dateMarkers.slice(0, MAX_VISIBLE_MARKERS).map((marker) => {
                    const display = getDisplayState(marker, now)
                    return (
                      <CallbackDetailsDialog
                        key={marker.id}
                        callbackId={marker.id}
                        aria-label={formatMarkerAccessibleLabel(marker)}
                        className={cn(
                          "group flex h-6 min-w-0 items-center gap-1 rounded-md border px-1.5 text-left text-[10px] outline-none hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring",
                          markerStyles[display]
                        )}
                      >
                        <span
                          className={cn(
                            "size-1.5 shrink-0 rounded-full",
                            dotStyles[display]
                          )}
                          aria-hidden="true"
                        />
                        <span className="min-w-0 flex-1 truncate font-medium text-foreground">
                          {marker.accountHolderName}
                        </span>
                        <time className="shrink-0 text-[10px] text-muted-foreground tabular-nums">
                          {formatMarkerTime(marker)}
                        </time>
                      </CallbackDetailsDialog>
                    )
                  })}

                  {overflowCount > 0 && (
                    <span className="px-1.5 text-[10px] font-medium text-muted-foreground tabular-nums">
                      +{overflowCount} more
                    </span>
                  )}
                </div>
              </section>
            )
          })}
        </div>
      </div>
    </div>
  )
}
