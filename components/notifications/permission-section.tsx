"use client"

import { useState } from "react"
import { useNotificationPermission } from "@/hooks/use-notifications"
import { Button } from "@/components/ui/button"

const STATUS_COPY: Record<string, string> = {
  granted: "Native notifications are on. You will get one generic notice per schedule occurrence while Scheduler is open.",
  denied: "Native notifications are blocked. Scheduler will show due callbacks in the app instead. It cannot notify you while closed.",
  default: "Native notifications are not enabled yet. Enable them to get one generic notice per schedule occurrence while Scheduler is open.",
  unsupported: "This browser does not support native notifications. Scheduler will show due callbacks in the app instead.",
}

/**
 * Settings-only permission/status surface. Explains the authenticated
 * in-app fallback and never promises closed-browser delivery.
 */
export function NotificationPermissionSection() {
  const { status, request } = useNotificationPermission()
  const [busy, setBusy] = useState(false)

  async function enable() {
    if (busy) return
    setBusy(true)
    try {
      await request()
    } finally {
      setBusy(false)
    }
  }

  return (
    <section aria-labelledby="notification-permission-heading" className="flex flex-col gap-2">
      <h2 id="notification-permission-heading" className="font-medium">
        Notifications
      </h2>
      <p className="text-sm text-muted-foreground">
        {STATUS_COPY[status] ?? STATUS_COPY.unsupported}
      </p>
      {status === "default" ? (
        <Button
          type="button"
          variant="outline"
          className="self-start"
          disabled={busy}
          onClick={() => void enable()}
        >
          {busy ? "Requesting…" : "Enable notifications"}
        </Button>
      ) : null}
      <p className="text-xs text-muted-foreground">
        Notices are generic (“Callback due now” plus the time) and never
        include customer details. Missed triggers are not replayed; overdue
        work appears in the app.
      </p>
    </section>
  )
}
