"use client"

import { useSyncExternalStore } from "react"
import { CallbackWorkspaceSkeleton } from "@/components/callbacks/callback-workspace-skeleton"
import {
  SchedulingCalendar,
  type SchedulingCalendarProps,
} from "@/components/scheduling-calendar/scheduling-calendar"

const subscribe = () => () => undefined

export function CallbackWorkspace(props: SchedulingCalendarProps) {
  const hydrated = useSyncExternalStore(
    subscribe,
    () => true,
    () => false
  )
  if (!hydrated) return <CallbackWorkspaceSkeleton />

  return <SchedulingCalendar {...props} />
}
