"use client"

import { useEffect, useState } from "react"
import { CallbackDetailsDialog } from "@/components/callbacks/callback-details-dialog"
import { cn } from "@/lib/utils"
import {
  CALENDAR_DISPLAY_LABELS,
  formatMarkerAccessibleLabel,
  formatMarkerTime,
  formatRelativeTime,
  getDisplayState,
  sortMarkersByPriority,
} from "@/lib/calendar/date-utils"
import type { CalendarMarker } from "@/lib/calendar/types"
import type { CalendarDisplayState } from "@/lib/calendar/date-utils"

const MAX_VISIBLE = 5

const dotStyles = {
  overdue: "bg-overdue",
  due: "bg-warning",
  grace: "bg-warning",
  today: "bg-primary",
  upcoming: "bg-muted-foreground",
} satisfies Record<CalendarDisplayState, string>

const relativeStyles = {
  overdue: "text-overdue",
  due: "text-warning",
  grace: "text-warning",
  today: "text-foreground",
  upcoming: "text-muted-foreground",
} satisfies Record<CalendarDisplayState, string>

const pillStyles = {
  overdue: "border-overdue/50 bg-overdue/10 text-overdue",
  due: "border-warning/50 bg-warning/10 text-warning",
  grace: "border-warning/50 bg-warning/10 text-warning",
  today: "border-primary/40 bg-primary/10 text-foreground",
  upcoming: "border-border bg-muted/40 text-muted-foreground",
} satisfies Record<CalendarDisplayState, string>

export interface UpNextProps {
  markers: CalendarMarker[]
}

export function UpNext({ markers }: UpNextProps) {
  const [now, setNow] = useState(() => new Date())

  // Display state is derived from `now` on every render (see getDisplayState),
  // so each tick re-evaluates due/grace/overdue without reload. Timers are
  // throttled while the tab is hidden, so refresh immediately on resume.
  useEffect(() => {
    const refresh = () => setNow(new Date())
    const interval = window.setInterval(refresh, 30_000)
    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") refresh()
    }
    document.addEventListener("visibilitychange", onVisibilityChange)
    window.addEventListener("focus", refresh)
    return () => {
      window.clearInterval(interval)
      document.removeEventListener("visibilitychange", onVisibilityChange)
      window.removeEventListener("focus", refresh)
    }
  }, [])

  if (markers.length === 0) return null

  const sorted = sortMarkersByPriority(markers, now)
  const visible = sorted.slice(0, MAX_VISIBLE)
  const remaining = sorted.length - visible.length

  return (
    <section
      aria-labelledby="up-next-heading"
      className="border-b bg-card"
    >
      <div className="flex items-center justify-between gap-3 px-4 pt-3">
        <h2
          id="up-next-heading"
          className="text-xs font-semibold tracking-wide text-foreground uppercase"
        >
          Up next · Action needed
        </h2>
        <span className="text-xs text-muted-foreground tabular-nums">
          {sorted.length} {sorted.length === 1 ? "callback" : "callbacks"}
        </span>
      </div>
      <ul className="divide-y divide-border px-4 pb-2">
        {visible.map((marker) => {
          const display = getDisplayState(marker, now)
          const relative = formatRelativeTime(marker, now)
          return (
            <li
              key={marker.id}
              className="flex items-center gap-3 py-2"
            >
              <span
                className={cn(
                  "size-2 shrink-0 rounded-full",
                  dotStyles[display]
                )}
                aria-hidden="true"
              />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium text-foreground">
                  {marker.accountHolderName}
                  {marker.accountReference && (
                    <span className="ml-2 font-normal text-muted-foreground tabular-nums">
                      {marker.accountReference}
                    </span>
                  )}
                </span>
                <span className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs tabular-nums">
                  <span
                    className={cn("font-medium", relativeStyles[display])}
                  >
                    {relative}
                  </span>
                  <span className="text-muted-foreground">
                    {new Date(marker.startsAt).toLocaleDateString("en-US", {
                      month: "short",
                      day: "numeric",
                    })}{" "}
                    · {formatMarkerTime(marker)}
                  </span>
                  <span
                    className={cn(
                      "inline-flex items-center rounded-md border px-1.5 py-px text-[10px] font-medium",
                      pillStyles[display]
                    )}
                  >
                    {CALENDAR_DISPLAY_LABELS[display]}
                  </span>
                </span>
              </span>
              <CallbackDetailsDialog
                callbackId={marker.id}
                aria-label={`Open ${formatMarkerAccessibleLabel(marker)}`}
                className="inline-flex h-8 shrink-0 items-center rounded-md border px-3 text-xs font-medium text-foreground outline-none hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring"
              >
                Open
              </CallbackDetailsDialog>
            </li>
          )
        })}
      </ul>
      {remaining > 0 && (
        <p className="px-4 pb-3 text-xs text-muted-foreground tabular-nums">
          +{remaining} more — switch to Table view for the full list.
        </p>
      )}
    </section>
  )
}
