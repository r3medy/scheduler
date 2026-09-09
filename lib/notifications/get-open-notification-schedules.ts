import "server-only"

import { requireAuth, type AuthGateResult } from "@/lib/callbacks/require-auth"
import type { SchedulableCallback } from "@/lib/notifications/types"

const NOTIFICATION_SCHEDULE_COLUMNS =
  "id, schedule_mode, scheduled_at, window_start_at, window_end_at, lifecycle_state"
const PAGE_SIZE = 1000

export type OpenNotificationSchedulesResult =
  | { status: "success"; schedules: SchedulableCallback[] }
  | { status: "error" | "unauthenticated" }

/**
 * Load the complete owner-scoped open schedule set used by the client
 * notification coordinator. This deliberately does not accept a calendar
 * range: the scheduler cancels IDs absent from reconciliation input, so a
 * visible month/week would otherwise cancel valid callbacks while navigating.
 * Only schedule fields are selected; customer fields never cross this
 * server/client boundary.
 */
export async function getOpenNotificationSchedules(
  providedGate?: AuthGateResult
): Promise<OpenNotificationSchedulesResult> {
  try {
    const gate = providedGate ?? (await requireAuth())
    if (gate.status === "unavailable") return { status: "error" }
    if (gate.status === "unauthenticated") return { status: "unauthenticated" }

    const schedules: SchedulableCallback[] = []
    for (let offset = 0; ;) {
      const { data, error } = await gate.supabase
        .from("callbacks")
        .select(NOTIFICATION_SCHEDULE_COLUMNS)
        .eq("user_id", gate.user.id)
        .eq("lifecycle_state", "open")
        .order("scheduled_at", { ascending: true, nullsFirst: false })
        .order("window_start_at", { ascending: true, nullsFirst: false })
        .order("id", { ascending: true })
        .range(offset, offset + PAGE_SIZE - 1)

      if (error) return { status: "error" }
      schedules.push(
        ...(data ?? []).map((row) => ({
          id: row.id,
          schedule_mode: row.schedule_mode,
          scheduled_at: row.scheduled_at,
          window_start_at: row.window_start_at,
          window_end_at: row.window_end_at,
          lifecycle_state: row.lifecycle_state,
        }))
      )
      // A short response may be the project's API row cap, not the final
      // page. Advance by actual rows and probe until the response is empty.
      if (!data || data.length === 0) break
      offset += data.length
    }

    return {
      status: "success",
      schedules,
    }
  } catch {
    return { status: "error" }
  }
}
