"use client"

import { useSyncExternalStore } from "react"
import { CallbacksSection } from "@/components/callbacks/callbacks-section"
import { CallbackWorkspaceSkeleton } from "@/components/callbacks/callback-workspace-skeleton"
import {
  SchedulingCalendar,
  type SchedulingCalendarProps,
} from "@/components/scheduling-calendar/scheduling-calendar"
import { getCalendarRange, getMarkerDateKey } from "@/lib/calendar/date-utils"

const subscribe = () => () => undefined

export function CallbackWorkspace(props: SchedulingCalendarProps) {
  const hydrated = useSyncExternalStore(
    subscribe,
    () => true,
    () => false
  )
  if (!hydrated) return <CallbackWorkspaceSkeleton />
  const range = getCalendarRange(props.view, props.focusedDate)
  const visibleCount = props.markers.filter((marker) => {
    const date = getMarkerDateKey(marker)
    return date >= range.startDate && date < range.endDateExclusive
  }).length

  return (
    <div className="flex flex-col gap-6">
      <CallbacksSection view={props.view} visibleCount={visibleCount} />
      <SchedulingCalendar {...props} />
    </div>
  )
}
