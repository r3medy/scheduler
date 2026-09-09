"use client"

import { useSyncExternalStore, useTransition } from "react"
import { usePathname, useRouter, useSearchParams } from "next/navigation"

import { CalendarSkeleton } from "@/components/scheduling-calendar/calendar-skeleton"
import { CalendarToolbar } from "@/components/scheduling-calendar/calendar-toolbar"
import { MonthView } from "@/components/scheduling-calendar/month-view"
import { TableView } from "@/components/scheduling-calendar/table-view"
import { UpNext } from "@/components/scheduling-calendar/up-next"
import { WeekView } from "@/components/scheduling-calendar/week-view"
import {
  addDaysToKey,
  getAdjacentDateKey,
  getCalendarRange,
  isMarkerInRange,
  mergeMarkersById,
  toDateKey,
} from "@/lib/calendar/date-utils"
import type { CalendarMarker, CalendarView } from "@/lib/calendar/types"
import { cn } from "@/lib/utils"

const subscribeToHydration = () => () => undefined

export interface SchedulingCalendarProps {
  focusedDate: string
  view: CalendarView
  markers: CalendarMarker[]
  overdueMarkers?: CalendarMarker[]
  className?: string
}

export function SchedulingCalendar({
  focusedDate,
  view,
  markers,
  overdueMarkers,
  className,
}: SchedulingCalendarProps) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const isClientReady = useSyncExternalStore(
    subscribeToHydration,
    () => true,
    () => false
  )
  const [isPending, startTransition] = useTransition()
  const today = toDateKey(new Date())
  const visibleRange = getCalendarRange(view, focusedDate)
  // Overlap (not start-only) so windows starting before the range but still
  // open at its start remain represented.
  const visibleMarkers = markers.filter((marker) =>
    isMarkerInRange(marker, visibleRange)
  )
  // Action-needed list is navigation-independent: overdue outside the visible
  // period is merged in (deduped) so it never disappears on navigation.
  const upNextMarkers = mergeMarkersById(visibleMarkers, overdueMarkers)

  function navigate(nextView: CalendarView, nextDate: string) {
    const params = new URLSearchParams(searchParams.toString())
    params.set("view", nextView)
    params.set("date", nextDate)

    startTransition(() => {
      router.push(`${pathname}?${params.toString()}`)
    })
  }

  if (!isClientReady) {
    return <CalendarSkeleton className={className} focusedDate={focusedDate} />
  }

  return (
    <section
      className={cn(
        "overflow-hidden rounded-lg border bg-background",
        isPending && "opacity-70",
        className
      )}
      aria-label="Callback calendar"
      aria-busy={isPending}
    >
      <CalendarToolbar
        focusedDate={focusedDate}
        today={today}
        view={view}
        onNavigate={(direction) =>
          navigate(view, getAdjacentDateKey(view, focusedDate, direction))
        }
        onToday={() => navigate(view, today)}
        onViewChange={(nextView) => {
          const nextDate =
            nextView === "week" ? focusedDate : addDaysToKey(focusedDate, 0)
          navigate(nextView, nextDate)
        }}
      />
      <UpNext markers={upNextMarkers} />
      {view === "month" ? (
        <MonthView focusedDate={focusedDate} markers={visibleMarkers} />
      ) : view === "week" ? (
        <WeekView focusedDate={focusedDate} markers={visibleMarkers} />
      ) : (
        <TableView markers={visibleMarkers} />
      )}
    </section>
  )
}
