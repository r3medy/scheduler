"use client"

import type { CalendarMarker } from "@/lib/calendar/types"
import type { SchedulableCallback } from "@/lib/notifications/types"
import { useNotificationsScheduler } from "@/hooks/use-notifications"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

function formatTrigger(triggerIso: string): string {
  const ms = Date.parse(triggerIso)
  if (!Number.isFinite(ms)) return ""
  try {
    return new Date(ms).toLocaleString([], {
      dateStyle: "medium",
      timeStyle: "short",
    })
  } catch {
    return ""
  }
}

/**
 * Authenticated in-app fallback: generic due/overdue list shown while the app
 * is open when native permission is denied/unsupported, plus overdue for
 * triggers missed while asleep (never replays native). Contains no PII.
 */
export function NotificationHost({
  markers,
  schedules,
}: {
  /** Kept for calendar callers that already use the host directly. */
  markers?: CalendarMarker[]
  /** Complete owner-scoped open schedules from the authenticated server query. */
  schedules?: SchedulableCallback[]
}) {
  const { notices, overdue, dismiss } = useNotificationsScheduler(
    schedules ?? markers
  )

  if (notices.length === 0 && overdue.length === 0) return null

  return (
    <section
      aria-label="Due callback notices"
      className="flex flex-col gap-2 rounded-lg border bg-background p-4"
    >
      {notices.map((notice) => (
        <div
          key={notice.key}
          role="status"
          className="flex flex-wrap items-center justify-between gap-2 rounded-md border bg-muted/40 px-3 py-2 text-sm"
        >
          <p>
            <strong className="font-medium">{notice.title}</strong>
            <span className="text-muted-foreground">
              {" "}
              · {formatTrigger(notice.triggerAt)}
            </span>
          </p>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => dismiss(notice.key)}
          >
            Dismiss
          </Button>
        </div>
      ))}
      {overdue.map((notice) => (
        <div
          key={notice.key}
          role="alert"
          className={cn(
            "flex flex-wrap items-center justify-between gap-2 rounded-md border px-3 py-2 text-sm",
            "border-destructive/40 bg-destructive/5"
          )}
        >
          <p>
            <strong className="font-medium">Callback overdue</strong>
            <span className="text-muted-foreground">
              {" "}
              · was due {formatTrigger(notice.triggerAt)}
            </span>
          </p>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => dismiss(notice.key)}
          >
            Dismiss
          </Button>
        </div>
      ))}
    </section>
  )
}
