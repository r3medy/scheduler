"use client"

import { useCallback, useEffect, useSyncExternalStore } from "react"
import type { CalendarMarker } from "@/lib/calendar/types"
import {
  listenForDeliveries,
} from "@/lib/notifications/dedupe"
import {
  getSharedScheduler,
  resetSharedSchedulerForTests,
} from "@/lib/notifications/scheduler"
import {
  getNoticeStore,
  resetNoticeStoreForTests,
} from "@/lib/notifications/store"
import {
  syncNotificationMarkers,
  syncNotificationSchedules,
} from "@/lib/notifications/sync"
import type {
  DueNotice,
  NotificationPermissionState,
  SchedulableCallback,
} from "@/lib/notifications/types"

export function getNotificationPermissionState(): NotificationPermissionState {
  try {
    if (typeof window === "undefined") return "unsupported"
    const NativeNotification = (
      window as { Notification?: typeof Notification }
    ).Notification
    if (typeof NativeNotification === "undefined") return "unsupported"
    return (
      (NativeNotification.permission as NotificationPermissionState) ??
      "default"
    )
  } catch {
    return "unsupported"
  }
}

/**
 * Browser permission must be requested from a user gesture. Returns the
 * resulting state without ever implying background delivery.
 */
export async function requestNotificationPermission(): Promise<NotificationPermissionState> {
  try {
    if (typeof window === "undefined") return "unsupported"
    const NativeNotification = (
      window as { Notification?: typeof Notification }
    ).Notification
    if (typeof NativeNotification === "undefined") return "unsupported"
    if (NativeNotification.permission === "granted") return "granted"
    if (NativeNotification.permission === "denied") return "denied"
    const next = await NativeNotification.requestPermission()
    return (next as NotificationPermissionState) ?? "default"
  } catch {
    return getNotificationPermissionState()
  }
}

export function useNotificationPermission(): {
  status: NotificationPermissionState
  request: () => Promise<NotificationPermissionState>
  refresh: () => void
} {
  const status = useSyncExternalStore(
    subscribeToPermission,
    getPermissionSnapshot,
    getPermissionServerSnapshot
  )
  const refresh = useCallback(() => {
    for (const listener of [...permissionListeners]) {
      try {
        listener()
      } catch {
        // A failing subscriber must not break permission updates.
      }
    }
  }, [])
  const request = useCallback(async () => {
    const next = await requestNotificationPermission()
    refresh()
    return next
  }, [refresh])
  return { status, request, refresh }
}

function subscribeToNotices(listener: () => void): () => void {
  return getNoticeStore().subscribe(listener)
}

const permissionListeners = new Set<() => void>()

function subscribeToPermission(listener: () => void): () => void {
  permissionListeners.add(listener)
  return () => {
    permissionListeners.delete(listener)
  }
}

function getPermissionSnapshot(): NotificationPermissionState {
  return getNotificationPermissionState()
}

function getPermissionServerSnapshot(): NotificationPermissionState {
  return "unsupported"
}

const EMPTY_NOTICES: DueNotice[] = []

function getNoticesSnapshot(): DueNotice[] {
  return getNoticeStore().getNotices()
}

function getOverdueSnapshot(): DueNotice[] {
  return getNoticeStore().getOverdue()
}

function getEmptyNoticesSnapshot(): DueNotice[] {
  return EMPTY_NOTICES
}

export function useDueNotices(): {
  notices: DueNotice[]
  overdue: DueNotice[]
  dismiss: (key: string) => void
} {
  const notices = useSyncExternalStore(
    subscribeToNotices,
    getNoticesSnapshot,
    getEmptyNoticesSnapshot
  )
  const overdue = useSyncExternalStore(
    subscribeToNotices,
    getOverdueSnapshot,
    getEmptyNoticesSnapshot
  )
  const dismiss = useCallback((key: string) => {
    try {
      getNoticeStore().dismiss(key)
    } catch {
      // Dismissal is best-effort.
    }
  }, [])
  return { notices, overdue, dismiss }
}

const SWEEP_INTERVAL_MS = 30 * 1000
const VISIBILITY_SUSPENSION_THRESHOLD_MS = 30 * 1000

/**
 * Central scheduler hook. Syncs open markers into the module-singleton
 * scheduler (timers live outside React so navigation remounts do not lose
 * them), sweeps for drift/sleep resume, and suppresses cross-tab duplicates.
 * Unmount removes listeners only — it never cancels scheduled occurrences.
 */
export function useNotificationsScheduler(
  inputs?: CalendarMarker[] | SchedulableCallback[]
): ReturnType<typeof useDueNotices> & {
  permission: NotificationPermissionState
  requestPermission: () => Promise<NotificationPermissionState>
} {
  const { notices, overdue, dismiss } = useDueNotices()
  const { status, request } = useNotificationPermission()

  useEffect(() => {
    if (!inputs) return
    if (inputs.length === 0) {
      syncNotificationSchedules([])
      return
    }
    const first = inputs[0]
    if (first && "scheduleMode" in first) {
      syncNotificationMarkers(inputs as CalendarMarker[])
      return
    }
    syncNotificationSchedules(inputs as SchedulableCallback[])
  }, [inputs])

  useEffect(() => {
    const scheduler = getSharedScheduler()
    const unsubscribe = listenForDeliveries((occurrenceKey) => {
      try {
        scheduler.markDelivered(occurrenceKey)
      } catch {
        // Cross-tab hint only.
      }
    })
    const interval = window.setInterval(() => {
      try {
        scheduler.sweep()
      } catch {
        // Sweep failures must not break the page.
      }
    }, SWEEP_INTERVAL_MS)
    let hiddenAt: number | null = null
    const onVisible = () => {
      if (document.visibilityState === "hidden") {
        hiddenAt = Date.now()
        return
      }
      if (document.visibilityState === "visible") {
        try {
          const hiddenFor = hiddenAt === null ? 0 : Date.now() - hiddenAt
          hiddenAt = null
          scheduler.sweep(undefined, {
            resumedFromSuspension:
              hiddenFor >= VISIBILITY_SUSPENSION_THRESHOLD_MS,
          })
        } catch {
          // Ignore resume-sweep failures.
        }
      }
    }
    document.addEventListener("visibilitychange", onVisible)
    return () => {
      window.clearInterval(interval)
      document.removeEventListener("visibilitychange", onVisible)
      unsubscribe()
    }
  }, [])

  return {
    notices,
    overdue,
    dismiss,
    permission: status,
    requestPermission: request,
  }
}

export const __testUtils = {
  resetSharedSchedulerForTests,
  resetNoticeStoreForTests,
}
