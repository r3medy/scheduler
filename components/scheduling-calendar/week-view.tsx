"use client"

import { CallbackDetailsDialog } from "@/components/callbacks/callback-details-dialog"
import { cn } from "@/lib/utils"
import {
  formatHour,
  formatMarkerAccessibleLabel,
  formatMarkerTime,
  getDisplayState,
  getMarkerMinuteOfDay,
  getWeekDays,
  getWeekHourBounds,
  groupMarkersByDate,
  isToday,
  toDateKey,
  WEEKDAY_LABELS,
} from "@/lib/calendar/date-utils"
import type { CalendarMarker } from "@/lib/calendar/types"
import type { CalendarDisplayState } from "@/lib/calendar/date-utils"

const markerStyles = {
  overdue: "border-overdue/50 bg-overdue/10",
  due: "border-warning/50 bg-warning/10",
  grace: "border-warning/50 bg-warning/10",
  today: "border-primary/40 bg-primary/10",
  upcoming: "border-border bg-muted/40",
} satisfies Record<CalendarDisplayState, string>

export interface WeekViewProps {
  focusedDate: string
  markers: CalendarMarker[]
}

export function WeekView({ focusedDate, markers }: WeekViewProps) {
  const days = getWeekDays(focusedDate)
  const dayKeys = new Set(days.map(toDateKey))
  const visibleMarkers = markers.filter((marker) =>
    dayKeys.has(toDateKey(new Date(marker.startsAt)))
  )
  const groupedMarkers = groupMarkersByDate(visibleMarkers)
  const { startHour, endHour } = getWeekHourBounds(visibleMarkers)
  const hours = Array.from(
    { length: endHour - startHour },
    (_, index) => startHour + index
  )
  const now = new Date()

  return (
    <div className="overflow-x-auto">
      <div className="grid min-w-[996px] grid-cols-[72px_repeat(7,minmax(132px,1fr))]">
        <div className="col-span-full grid grid-cols-subgrid bg-muted/20">
          <div aria-hidden="true" className="bg-muted/10" />
          {days.map((date, index) => {
            const today = isToday(date)
            return (
              <div
                key={toDateKey(date)}
                data-week-header={toDateKey(date)}
                className={cn(
                  "flex min-h-16 flex-col items-center justify-center gap-1 border-l px-2 py-2",
                  index > 4 && "bg-muted/10"
                )}
              >
                <span className="text-[10px] font-medium text-muted-foreground uppercase">
                  {WEEKDAY_LABELS[index]}
                </span>
                <time
                  dateTime={toDateKey(date)}
                  className={cn(
                    "grid size-7 place-items-center rounded-full text-xs tabular-nums",
                    !today && "text-foreground",
                    today && "bg-foreground text-background"
                  )}
                >
                  {date.getDate()}
                </time>
              </div>
            )
          })}
        </div>

        {hours.map((hour) => (
          <div
            key={hour}
            data-week-hour={hour}
            className="col-span-full grid min-h-14 grid-cols-subgrid border-t border-border/60"
          >
            <div className="flex items-center justify-end bg-muted/6 px-3">
              <time className="text-[10px] whitespace-nowrap text-muted-foreground tabular-nums">
                {formatHour(hour)}
              </time>
            </div>
            {days.map((date, dayIndex) => {
              const dateKey = toDateKey(date)
              const callbacks = (groupedMarkers.get(dateKey) ?? []).filter(
                (marker) =>
                  Math.floor(getMarkerMinuteOfDay(marker) / 60) === hour
              )
              return (
                <div
                  key={dateKey}
                  data-week-day={dateKey}
                  aria-label={`Callbacks for ${date.toLocaleDateString(
                    "en-US",
                    {
                      weekday: "long",
                      month: "long",
                      day: "numeric",
                      year: "numeric",
                      timeZone: "Africa/Cairo",
                    }
                  )}, ${formatHour(hour)}`}
                  className={cn(
                    "flex min-w-0 flex-col justify-center gap-1 border-l p-1.5",
                    dayIndex > 4 && "bg-muted/4.5"
                  )}
                >
                  {callbacks.map((marker) => (
                    <CallbackDetailsDialog
                      key={marker.id}
                      callbackId={marker.id}
                      aria-label={formatMarkerAccessibleLabel(marker)}
                      className={cn(
                        "flex min-h-10 w-full min-w-0 shrink-0 flex-col justify-center rounded-md border border-l-2 px-2 py-1 text-left outline-none hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring",
                        markerStyles[getDisplayState(marker, now)]
                      )}
                    >
                      <span className="block w-full truncate text-[10px] font-medium text-foreground">
                        {marker.accountHolderName}
                      </span>
                      <time className="block w-full truncate text-[10px] text-muted-foreground tabular-nums">
                        {formatMarkerTime(marker)}
                      </time>
                    </CallbackDetailsDialog>
                  ))}
                </div>
              )
            })}
          </div>
        ))}
      </div>
    </div>
  )
}
