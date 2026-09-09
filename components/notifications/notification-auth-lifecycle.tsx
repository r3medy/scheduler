"use client"

import { useEffect } from "react"
import { listenForSignOut } from "@/lib/notifications/dedupe"
import { clearAllNotificationState } from "@/lib/notifications/sync"

/**
 * Keep auth cleanup alive even while a route is showing its loading or error
 * boundary. The notification host is intentionally absent for incomplete
 * server projections so it cannot reconcile away valid timers; this listener
 * still clears the singleton when another tab signs out.
 */
export function NotificationAuthLifecycle() {
  useEffect(() => listenForSignOut(clearAllNotificationState), [])
  return null
}
