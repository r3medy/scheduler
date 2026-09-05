"use client"

import { CallbackDetailsDialog } from "@/components/callbacks/callback-details-dialog"
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from "@/components/ui/empty"
import { cn } from "@/lib/utils"
import {
  CALENDAR_DISPLAY_LABELS,
  compareCalendarMarkers,
  formatMarkerAccessibleLabel,
  formatMarkerTime,
  getDisplayState,
} from "@/lib/calendar/date-utils"
import type { CalendarMarker } from "@/lib/calendar/types"
import type { CalendarDisplayState } from "@/lib/calendar/date-utils"

const statusStyles = {
  overdue: "border-overdue/50 bg-overdue/10 text-overdue",
  due: "border-warning/50 bg-warning/10 text-warning",
  grace: "border-warning/50 bg-warning/10 text-warning",
  today: "border-primary/40 bg-primary/10 text-foreground",
  upcoming: "border-border bg-muted/40 text-foreground",
} satisfies Record<CalendarDisplayState, string>

const statusDotStyles = {
  overdue: "bg-overdue",
  due: "bg-warning",
  grace: "bg-warning",
  today: "bg-primary",
  upcoming: "bg-muted-foreground",
} satisfies Record<CalendarDisplayState, string>

const SCHEDULE_LABELS = {
  exact: "Exact time",
  window: "Time window",
} satisfies Record<CalendarMarker["scheduleMode"], string>

export interface TableViewProps {
  markers: CalendarMarker[]
}

export function TableView({ markers }: TableViewProps) {
  const sorted = [...markers].sort(compareCalendarMarkers)
  const now = new Date()

  if (sorted.length === 0) {
    return (
      <Empty className="min-h-[320px] border-0">
        <EmptyHeader>
          <EmptyTitle className="font-sans tracking-normal">
            No open callbacks in this period
          </EmptyTitle>
          <EmptyDescription>
            Navigate to a different month to see scheduled callbacks.
          </EmptyDescription>
        </EmptyHeader>
      </Empty>
    )
  }

  return (
    <div
      className="overflow-x-auto"
      role="region"
      aria-label="Callback table"
      tabIndex={0}
    >
      <div className="min-w-[640px]">
        <div className="grid grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)_minmax(0,0.8fr)_minmax(0,0.8fr)_minmax(0,0.9fr)] border-b bg-muted/25 text-xs font-medium text-muted-foreground">
          <span className="border-r px-3 py-2.5">Scheduled</span>
          <span className="border-r px-3 py-2.5">Account holder</span>
          <span className="border-r px-3 py-2.5">Account</span>
          <span className="border-r px-3 py-2.5">Schedule</span>
          <span className="px-3 py-2.5">Status</span>
        </div>

        {sorted.map((marker) => {
          const display = getDisplayState(marker, now)
          return (
            <CallbackDetailsDialog
              key={marker.id}
              callbackId={marker.id}
              aria-label={formatMarkerAccessibleLabel(marker)}
              className={cn(
                "grid w-full grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)_minmax(0,0.8fr)_minmax(0,0.8fr)_minmax(0,0.9fr)] border-b text-left text-sm outline-none transition-colors hover:bg-muted/40 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
              )}
            >
              <span className="border-r px-3 py-2.5 tabular-nums">
                <span className="block font-medium text-foreground">
                  {new Date(marker.startsAt).toLocaleDateString("en-US", {
                    month: "short",
                    day: "numeric",
                    timeZone: "Africa/Cairo",
                  })}
                </span>
                <span className="block text-xs text-muted-foreground">
                  {formatMarkerTime(marker)}
                </span>
              </span>
              <span className="border-r px-3 py-2.5">
                <span className="block truncate font-medium text-foreground">
                  {marker.accountHolderName}
                </span>
              </span>
              <span className="border-r px-3 py-2.5 tabular-nums text-muted-foreground">
                {marker.accountReference ?? "—"}
              </span>
              <span className="border-r px-3 py-2.5 text-muted-foreground">
                {SCHEDULE_LABELS[marker.scheduleMode]}
              </span>
              <span className="px-3 py-2.5">
                <span
                  className={cn(
                    "inline-flex items-center gap-1.5 rounded-md border px-2 py-0.5 text-xs font-medium",
                    statusStyles[display]
                  )}
                >
                  <span
                    className={cn(
                      "size-1.5 rounded-full",
                      statusDotStyles[display]
                    )}
                    aria-hidden="true"
                  />
                  {CALENDAR_DISPLAY_LABELS[display]}
                </span>
              </span>
            </CallbackDetailsDialog>
          )
        })}
      </div>
    </div>
  )
}
