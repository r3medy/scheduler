import type { CalendarMarker, CalendarRange } from "@/lib/calendar/types"
import { deriveTemporalState } from "@/lib/calendar/date-utils"
import {
  createSupabaseServerClient,
  getSupabaseConfiguration,
} from "@/lib/supabase/server"

import type { CalendarLoadResult } from "@/lib/calendar/types"
import { maskAccountNumber } from "@/lib/callbacks/presentation"

const CALENDAR_CALLBACK_COLUMNS =
  "id, account_holder_name, account_number, schedule_mode, scheduled_at, window_start_at, window_end_at, lifecycle_state"

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
  range: CalendarRange
): Promise<CalendarLoadResult> {
  const configuration = getSupabaseConfiguration()
  if (!configuration) return { status: "configuration-error" }

  const supabase = await createSupabaseServerClient(configuration)
  const {
    data: { user },
    error: authenticationError,
  } = await supabase.auth.getUser()

  if (authenticationError || !user) return { status: "unauthenticated" }

  const { start, endExclusive } = getBufferedUtcRange(range)
  const exactFilter = `and(schedule_mode.eq.exact,scheduled_at.gte.${start},scheduled_at.lt.${endExclusive})`
  const windowFilter = `and(schedule_mode.eq.window,window_start_at.gte.${start},window_start_at.lt.${endExclusive})`
  const { data, error } = await supabase
    .from("callbacks")
    .select(CALENDAR_CALLBACK_COLUMNS)
    .eq("lifecycle_state", "open")
    .or(`${exactFilter},${windowFilter}`)
    .order("scheduled_at", { ascending: true, nullsFirst: false })
    .order("window_start_at", { ascending: true, nullsFirst: false })

  if (error) return { status: "error" }

  const now = new Date()
  const markers = (data satisfies CalendarCallbackProjection[]).flatMap(
    (row) => {
      const marker = toCalendarMarker(row, now)
      return marker ? [marker] : []
    }
  )

  return { status: "success", markers }
}
