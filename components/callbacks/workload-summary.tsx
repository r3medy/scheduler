"use client"

import { useEffect, useState, useSyncExternalStore } from "react"
import { deriveTemporalState, toDateKey } from "@/lib/calendar/date-utils"
import type { WorkloadOpenRow } from "@/lib/callbacks/get-workload-summary"
import { NewCallbackDialog } from "@/components/callbacks/new-callback-dialog"
import { Skeleton } from "@/components/ui/skeleton"

const subscribe = () => () => undefined

export interface WorkloadCounts {
  scheduledToday: number
  dueGrace: number
  overdue: number
  upcoming: number
  completedToday: number
}

// Owner-scoped workload math over the agent's own surviving records, using the
// shared temporal calculation and the device-local day (PRODUCT §17). Values
// are intentionally not mutually exclusive: a callback due today counts toward
// both scheduled-today and due/grace.
export function computeWorkloadCounts(
  open: WorkloadOpenRow[],
  closedAts: Array<string | null>,
  now = new Date()
): WorkloadCounts {
  const todayKey = toDateKey(now)
  let scheduledToday = 0
  let dueGrace = 0
  let overdue = 0
  let upcoming = 0
  for (const row of open) {
    const startsAt =
      row.schedule_mode === "exact" ? row.scheduled_at : row.window_start_at
    if (!startsAt) continue
    const windowEndAt =
      row.schedule_mode === "window" ? row.window_end_at : null
    if (row.schedule_mode === "window" && !windowEndAt) continue
    const state = deriveTemporalState(
      row.schedule_mode,
      startsAt,
      windowEndAt,
      now
    )
    if (state === "overdue") overdue += 1
    else if (state === "due" || state === "grace") dueGrace += 1
    const dayKey = toDateKey(new Date(startsAt))
    if (dayKey === todayKey) scheduledToday += 1
    else if (dayKey > todayKey && state !== "overdue") upcoming += 1
  }
  let completedToday = 0
  for (const closedAt of closedAts) {
    if (!closedAt) continue
    if (toDateKey(new Date(closedAt)) === todayKey) completedToday += 1
  }
  return { scheduledToday, dueGrace, overdue, upcoming, completedToday }
}

const WORKLOAD_CELLS: ReadonlyArray<{
  key: keyof WorkloadCounts
  label: string
}> = [
  { key: "scheduledToday", label: "Scheduled today" },
  { key: "dueGrace", label: "Due or grace" },
  { key: "overdue", label: "Overdue" },
  { key: "upcoming", label: "Upcoming" },
  { key: "completedToday", label: "Completed today" },
]

export function WorkloadSummary({
  open,
  closedAts,
  unavailable = false,
  retryHref,
}: {
  open: WorkloadOpenRow[]
  closedAts: string[]
  unavailable?: boolean
  retryHref?: string
}) {
  const hydrated = useSyncExternalStore(
    subscribe,
    () => true,
    () => false
  )
  const [saved, setSaved] = useState(false)
  const [, setTick] = useState(0)
  useEffect(() => {
    // Recompute on the device clock so due, grace, and overdue move without
    // navigating or reloading.
    const timer = setInterval(() => {
      setTick((tick) => tick + 1)
    }, 60_000)
    return () => clearInterval(timer)
  }, [])
  // Device-local grouping; computed during render once hydrated so server and
  // client markup agree.
  const counts = hydrated
    ? computeWorkloadCounts(open, closedAts, new Date())
    : null
  return (
    <section
      aria-label="Today's workload"
      className="rounded-lg border bg-background p-6"
    >
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex flex-col gap-2">
          <h2 className="text-lg font-semibold">Today&apos;s workload</h2>
          <p className="text-sm text-muted-foreground">
            Your open callbacks and today&apos;s completions.
          </p>
        </div>
        <NewCallbackDialog
          onSaved={() => setSaved(true)}
          onOpen={() => setSaved(false)}
        />
      </div>
      <p role="status" aria-live="polite" className="text-sm text-primary">
        {unavailable
          ? "Workload summary is unavailable. The calendar is still available. Try again to reload it."
          : saved
            ? "Callback saved."
            : ""}
        {unavailable && retryHref ? (
          <a
            className="ml-2 underline underline-offset-4"
            href={retryHref}
          >
            Try again
          </a>
        ) : null}
      </p>
      {unavailable ? (
        <div className="mt-4 border-t pt-6 text-sm text-muted-foreground">
          No workload counts are shown until the owner-scoped query succeeds.
        </div>
      ) : counts ? (
        <dl className="mt-4 grid grid-cols-2 gap-y-6 border-t pt-6 sm:grid-cols-3 lg:grid-cols-5">
          {WORKLOAD_CELLS.map(({ key, label }, index) => (
            <div key={key} className={index ? "border-l px-6" : "pr-6"}>
              <dt className="text-sm text-muted-foreground">{label}</dt>
              <dd className="mt-2 text-3xl font-semibold tabular-nums">
                {counts[key].toLocaleString()}
              </dd>
            </div>
          ))}
        </dl>
      ) : (
        <div className="mt-4 grid grid-cols-2 gap-y-6 border-t pt-6 sm:grid-cols-3 lg:grid-cols-5">
          {WORKLOAD_CELLS.map(({ label }) => (
            <div key={label} className="pr-6">
              <p className="text-sm text-muted-foreground">{label}</p>
              <Skeleton className="mt-2 h-9 w-16" />
            </div>
          ))}
        </div>
      )}
    </section>
  )
}
