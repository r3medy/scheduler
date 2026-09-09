import type { NotificationKind } from "@/lib/notifications/types"

export const NOTIFICATION_TITLE = "Callback due now"

/**
 * Generic, PII-free notification copy. Intentionally accepts only the trigger
 * timestamp and kind — never customer names, phone numbers, account numbers,
 * comments, or attempt notes.
 */
export function formatDueTime(triggerIso: string): string {
  const ms = Date.parse(triggerIso)
  if (!Number.isFinite(ms)) return ""
  try {
    return new Date(ms).toLocaleTimeString([], {
      hour: "numeric",
      minute: "2-digit",
    })
  } catch {
    return ""
  }
}

export function buildNotificationContent(
  triggerIso: string,
  kind: NotificationKind
): { title: string; body: string } {
  const time = formatDueTime(triggerIso)
  const when = time ? ` at ${time}` : ""
  if (kind === "window-start") {
    return {
      title: NOTIFICATION_TITLE,
      body: `A callback window starts${when}. Open Scheduler to see details.`,
    }
  }
  return {
    title: NOTIFICATION_TITLE,
    body: `A callback is due${when}. Open Scheduler to see details.`,
  }
}
