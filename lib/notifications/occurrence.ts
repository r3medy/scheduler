import type {
  NotificationKind,
  SchedulableCallback,
} from "@/lib/notifications/types"

/** Grace window after the trigger during which a due notification may fire. */
export const MISSED_GRACE_MS = 5 * 60 * 1000

export function getTriggerIso(input: SchedulableCallback): string | null {
  if (!input || typeof input.id !== "string" || input.id.length === 0)
    return null
  if (input.schedule_mode === "exact") {
    return typeof input.scheduled_at === "string" &&
      input.scheduled_at.length > 0
      ? input.scheduled_at
      : null
  }
  if (input.schedule_mode === "window") {
    return typeof input.window_start_at === "string" &&
      input.window_start_at.length > 0
      ? input.window_start_at
      : null
  }
  return null
}

export function getNotificationKind(
  input: SchedulableCallback
): NotificationKind | null {
  if (input.schedule_mode === "exact" && getTriggerIso(input)) return "exact"
  if (input.schedule_mode === "window" && getTriggerIso(input))
    return "window-start"
  return null
}

/** Stable key per schedule occurrence: callback id + trigger timestamp. */
export function getOccurrenceKey(input: SchedulableCallback): string | null {
  const trigger = getTriggerIso(input)
  if (!trigger || !input.id) return null
  return `${input.id}@${trigger}`
}

export function parseTriggerMs(triggerIso: string): number | null {
  const ms = Date.parse(triggerIso)
  return Number.isFinite(ms) ? ms : null
}

export type TriggerPlacement = "future" | "due" | "missed"

export function classifyTrigger(
  triggerIso: string,
  nowMs: number,
  graceMs: number = MISSED_GRACE_MS
): TriggerPlacement {
  const triggerMs = Date.parse(triggerIso)
  if (!Number.isFinite(triggerMs)) return "missed"
  if (nowMs < triggerMs) return "future"
  if (nowMs > triggerMs + graceMs) return "missed"
  return "due"
}

export function isMissed(
  triggerIso: string,
  nowMs: number,
  graceMs: number = MISSED_GRACE_MS
): boolean {
  return classifyTrigger(triggerIso, nowMs, graceMs) === "missed"
}
