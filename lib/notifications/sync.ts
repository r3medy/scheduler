import type { CalendarMarker } from "@/lib/calendar/types"
import {
  getSharedScheduler,
  type SyncSummary,
} from "@/lib/notifications/scheduler"
import { getOccurrenceKey } from "@/lib/notifications/occurrence"
import { getNoticeStore } from "@/lib/notifications/store"
import type { SchedulableCallback } from "@/lib/notifications/types"

type ScheduleForm = Pick<FormData, "get">

function textOf(source: ScheduleForm, name: string): string | null {
  try {
    const value = source.get(name)
    if (typeof value !== "string") return null
    const trimmed = value.trim()
    return trimmed.length > 0 ? trimmed : null
  } catch {
    return null
  }
}

/** Convert calendar markers (point at exact time / window start) to schedules. */
export function markerToSchedulable(
  marker: CalendarMarker
): SchedulableCallback {
  if (marker.scheduleMode === "exact") {
    return {
      id: marker.id,
      schedule_mode: "exact",
      scheduled_at: marker.scheduledAt,
      window_start_at: null,
      window_end_at: null,
    }
  }
  return {
    id: marker.id,
    schedule_mode: "window",
    scheduled_at: null,
    window_start_at: marker.windowStartAt,
    window_end_at: marker.windowEndAt,
  }
}

function nullSummary(): SyncSummary {
  return {
    scheduled: 0,
    deferred: 0,
    fired: 0,
    missed: 0,
    cancelled: 0,
    cancelledIds: [],
  }
}

/**
 * Thin client wrapper for mutation call sites. Never touches validation or
 * persistence — it only mirrors the already-validated schedule into the
 * central scheduler after a successful save.
 */
export function scheduleFromRecord(record: {
  id: string
  schedule_mode: "exact" | "window"
  scheduled_at: string | null
  window_start_at: string | null
  window_end_at: string | null
  lifecycle_state?: string | null
}): void {
  try {
    const scheduled: SchedulableCallback = {
      id: record.id,
      schedule_mode: record.schedule_mode,
      scheduled_at: record.scheduled_at,
      window_start_at: record.window_start_at,
      window_end_at: record.window_end_at,
      lifecycle_state: record.lifecycle_state ?? "open",
    }
    scheduleReplacingExisting(scheduled)
  } catch {
    // Scheduling must never break the save flow.
  }
}

/** Schedule (or replace) the occurrence described by submitted form values. */
export function scheduleFromFormData(
  callbackId: string | null | undefined,
  form: ScheduleForm,
  lifecycleState: "open" | "closed" = "open"
): void {
  try {
    if (!callbackId) return
    const mode = textOf(form, "schedule_mode")
    if (mode !== "exact" && mode !== "window") return
    const scheduled: SchedulableCallback =
      mode === "exact"
        ? {
            id: callbackId,
            schedule_mode: "exact",
            scheduled_at: textOf(form, "scheduled_at"),
            window_start_at: null,
            window_end_at: null,
            lifecycle_state: lifecycleState,
          }
        : {
            id: callbackId,
            schedule_mode: "window",
            scheduled_at: null,
            window_start_at: textOf(form, "window_start_at"),
            window_end_at: textOf(form, "window_end_at"),
            lifecycle_state: lifecycleState,
          }
    scheduleReplacingExisting(scheduled)
  } catch {
    // Scheduling must never break the save flow.
  }
}

/**
 * Clear fallback notices only when a callback's occurrence is actually being
 * replaced. Keeping an unchanged due occurrence's notice is important when a
 * detail-only edit is saved while the callback is already due.
 */
function scheduleReplacingExisting(input: SchedulableCallback): void {
  if (input.lifecycle_state === "closed") {
    cancelCallbackNotifications(input.id)
    return
  }
  const scheduler = getSharedScheduler()
  const nextKey = getOccurrenceKey(input)
  const existing = scheduler
    .getScheduled()
    .find((entry) => entry.callbackId === input.id)
  if (existing && existing.key !== nextKey)
    getNoticeStore().clearForCallback(input.id)
  // A mutation can reopen an old record after its trigger passed. Treat that
  // as an overdue in-app state; never replay native output for a schedule
  // that was not observed as active at its trigger.
  scheduler.schedule(input, { allowImmediate: false })
}

/** Cancel timers + in-app notices after closure or permanent deletion. */
export function cancelCallbackNotifications(callbackId: string): void {
  try {
    getSharedScheduler().cancel(callbackId)
  } catch {
    // Ignore scheduler cleanup failures.
  }
  try {
    getNoticeStore().clearForCallback(callbackId)
  } catch {
    // Ignore store cleanup failures.
  }
}

/** Clear local notification state after the authenticated session ends. */
export function clearAllNotificationState(): void {
  try {
    getSharedScheduler().cancelAll()
  } catch {
    // Ignore scheduler cleanup failures.
  }
  try {
    getNoticeStore().clearAll()
  } catch {
    // Ignore notice cleanup failures.
  }
}

/** Reconcile the central scheduler with freshly loaded open markers. */
export function syncNotificationMarkers(
  markers: CalendarMarker[]
): SyncSummary {
  return syncNotificationSchedules(markers.map(markerToSchedulable))
}

/**
 * Reconcile the complete owner-scoped schedule set. Unlike calendar markers,
 * these inputs are intentionally independent of the visible calendar range.
 */
export function syncNotificationSchedules(
  schedules: SchedulableCallback[]
): SyncSummary {
  try {
    const scheduler = getSharedScheduler()
    const nextKeys = new Map(
      (schedules ?? []).map((schedule) => [
        schedule.id,
        getOccurrenceKey(schedule),
      ])
    )
    // Clear stale fallback notices before sync can fire a replacement due
    // occurrence, so the new notice is never accidentally dismissed.
    for (const entry of scheduler.getScheduled()) {
      if (nextKeys.get(entry.callbackId) !== entry.key) {
        try {
          getNoticeStore().clearForCallback(entry.callbackId)
        } catch {
          // Ignore per-callback cleanup failures.
        }
      }
    }
    const summary = scheduler.syncFromMarkers(schedules ?? [])
    for (const callbackId of summary.cancelledIds) {
      try {
        getNoticeStore().clearForCallback(callbackId)
      } catch {
        // Ignore per-callback cleanup failures.
      }
    }
    return summary
  } catch {
    return nullSummary()
  }
}
