import type { CalendarMarker, CalendarRange } from "@/lib/calendar/types"
import { deriveTemporalState } from "@/lib/calendar/date-utils"
import { requireAuth, type AuthGateResult } from "@/lib/callbacks/require-auth"

import type { CalendarLoadResult } from "@/lib/calendar/types"
import { maskAccountNumber } from "@/lib/callbacks/presentation"

const CALENDAR_CALLBACK_COLUMNS =
  "id, account_holder_name, account_number, schedule_mode, scheduled_at, window_start_at, window_end_at, lifecycle_state"
const CALENDAR_PAGE_SIZE = 1_000

interface QueryPage<T> {
  data: T[] | null
  error: unknown
}

interface PageQuery<T> {
  range?: (from: number, to: number) => PageQuery<T>
  then: <TResult>(
    onfulfilled?:
      ((value: QueryPage<T>) => TResult | PromiseLike<TResult>) | null
  ) => PromiseLike<TResult>
}

/** Read every matching row in bounded pages so Supabase's default row cap
 * cannot silently hide calendar entries. Callers supply a fresh query per
 * page because PostgREST range is part of the request, not local slicing. */
async function readAllPages<T>(
  buildPage: () => PageQuery<T>
): Promise<{ rows: T[]; error: boolean }> {
  const rows: T[] = []
  for (let offset = 0; ;) {
    const query = buildPage()
    const hasRange = typeof query.range === "function"
    const pageQuery = hasRange
      ? query.range!(offset, offset + CALENDAR_PAGE_SIZE - 1)
      : query
    const { data, error } = await pageQuery
    if (error) return { rows: [], error: true }
    const page = Array.isArray(data) ? data : []
    rows.push(...page)
    if (!hasRange) return { rows, error: false }
    // The provider may cap responses below the requested range size.
    if (page.length === 0) return { rows, error: false }
    offset += page.length
  }
}

function getBufferedUtcRange(range: CalendarRange): {
  start: string
  endExclusive: string
} {
  const start = new Date(`${range.startDate}T00:00:00.000Z`)
  const endExclusive = new Date(`${range.endDateExclusive}T00:00:00.000Z`)
  start.setUTCDate(start.getUTCDate() - 1)
  endExclusive.setUTCDate(endExclusive.getUTCDate() + 1)

  return {
    start: start.toISOString(),
    endExclusive: endExclusive.toISOString(),
  }
}

interface CalendarCallbackProjection {
  id: string
  account_holder_name: string
  account_number: string
  schedule_mode: "exact" | "window"
  scheduled_at: string | null
  window_start_at: string | null
  window_end_at: string | null
  lifecycle_state: "open" | "closed"
}

function toCalendarMarker(
  row: CalendarCallbackProjection,
  now: Date
): CalendarMarker | null {
  const common = {
    id: row.id,
    accountHolderName: row.account_holder_name,
    accountReference: maskAccountNumber(row.account_number),
  }

  if (row.schedule_mode === "exact" && row.scheduled_at) {
    return {
      ...common,
      scheduleMode: "exact",
      startsAt: row.scheduled_at,
      scheduledAt: row.scheduled_at,
      temporalState: deriveTemporalState("exact", row.scheduled_at, null, now),
    }
  }

  if (
    row.schedule_mode === "window" &&
    row.window_start_at &&
    row.window_end_at
  ) {
    return {
      ...common,
      scheduleMode: "window",
      startsAt: row.window_start_at,
      windowStartAt: row.window_start_at,
      windowEndAt: row.window_end_at,
      temporalState: deriveTemporalState(
        "window",
        row.window_start_at,
        row.window_end_at,
        now
      ),
    }
  }

  return null
}

export async function getCalendarCallbacks(
  range: CalendarRange,
  providedGate?: AuthGateResult
): Promise<CalendarLoadResult> {
  const gate = providedGate ?? (await requireAuth())
  if (gate.status === "unavailable") return { status: "configuration-error" }
  if (gate.status === "unauthenticated") return { status: "unauthenticated" }
  const { supabase, user } = gate

  const { start, endExclusive } = getBufferedUtcRange(range)
  const exactFilter = `and(schedule_mode.eq.exact,scheduled_at.gte.${start},scheduled_at.lt.${endExclusive})`
  // Overlap: a window is visible when it is still open at the range start,
  // not only when it starts inside the range (midnight / boundary spans).
  const windowFilter = `and(schedule_mode.eq.window,window_start_at.lt.${endExclusive},window_end_at.gte.${start})`
  const page = await readAllPages<CalendarCallbackProjection>(() => {
    const query = supabase
      .from("callbacks")
      .select(CALENDAR_CALLBACK_COLUMNS)
      .eq("user_id", user.id)
      .eq("lifecycle_state", "open")
      .or(`${exactFilter},${windowFilter}`)
      .order("scheduled_at", { ascending: true, nullsFirst: false })
      .order("window_start_at", { ascending: true, nullsFirst: false })
      .order("id", { ascending: true })
    return query as unknown as PageQuery<CalendarCallbackProjection>
  })

  if (page.error) return { status: "error" }

  const now = new Date()
  const markers = (page.rows satisfies CalendarCallbackProjection[]).flatMap(
    (row) => {
      const marker = toCalendarMarker(row, now)
      return marker ? [marker] : []
    }
  )

  return { status: "success", markers }
}

const OVERDUE_GRACE_MS = 5 * 60_000

/**
 * Owner-scoped workload query independent of calendar navigation.
 * Returns open callbacks whose effective end (scheduled_at / window_end_at)
 * plus the 5-minute grace period is at or before `now`, so older overdue
 * items never disappear when the user navigates weeks/months. RLS scopes
 * rows to the authenticated owner, matching getCalendarCallbacks.
 */
export async function getOverdueCallbacks(
  now = new Date(),
  providedGate?: AuthGateResult
): Promise<CalendarLoadResult> {
  const gate = providedGate ?? (await requireAuth())
  if (gate.status === "unavailable") return { status: "configuration-error" }
  if (gate.status === "unauthenticated") return { status: "unauthenticated" }
  const { supabase, user } = gate

  const cutoff = new Date(now.getTime() - OVERDUE_GRACE_MS).toISOString()
  const exactOverdue = `and(schedule_mode.eq.exact,scheduled_at.lte.${cutoff})`
  const windowOverdue = `and(schedule_mode.eq.window,window_end_at.lte.${cutoff})`
  const page = await readAllPages<CalendarCallbackProjection>(() => {
    const query = supabase
      .from("callbacks")
      .select(CALENDAR_CALLBACK_COLUMNS)
      .eq("user_id", user.id)
      .eq("lifecycle_state", "open")
      .or(`${exactOverdue},${windowOverdue}`)
      .order("scheduled_at", { ascending: true, nullsFirst: false })
      .order("window_start_at", { ascending: true, nullsFirst: false })
      .order("id", { ascending: true })
    return query as unknown as PageQuery<CalendarCallbackProjection>
  })

  if (page.error) return { status: "error" }

  const markers = (page.rows satisfies CalendarCallbackProjection[]).flatMap(
    (row) => {
      const marker = toCalendarMarker(row, now)
      return marker ? [marker] : []
    }
  )

  return { status: "success", markers }
}
