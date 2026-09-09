import { buildNotificationContent } from "@/lib/notifications/content"
import { announceDelivery, tryClaimDelivery } from "@/lib/notifications/dedupe"
import {
  classifyTrigger,
  getNotificationKind,
  getOccurrenceKey,
  getTriggerIso,
  MISSED_GRACE_MS,
} from "@/lib/notifications/occurrence"
import { getNoticeStore } from "@/lib/notifications/store"
import type {
  DueNotice,
  NativePayload,
  NotificationPermissionState,
  SchedulableCallback,
} from "@/lib/notifications/types"

export interface SchedulerDeps {
  now?: () => number
  setTimeoutFn?: (callback: () => void, ms: number) => unknown
  clearTimeoutFn?: (handle: unknown) => void
  showNative?: (payload: NativePayload) => void
  pushDue?: (notice: DueNotice) => void
  pushOverdue?: (notice: DueNotice) => void
  claim?: (occurrenceKey: string) => boolean | Promise<boolean>
  announce?: (occurrenceKey: string) => void
  getPermission?: () => NotificationPermissionState
  /** Exact setTimeout cap; farther triggers stay deferred until a later sync. */
  maxExactDelayMs?: number
}

export type ScheduleStatus =
  | "scheduled"
  | "deferred"
  | "fired-now"
  | "missed"
  | "already"
  | "invalid"
  | "cancelled-closed"

export interface ScheduleResult {
  status: ScheduleStatus
  key?: string
}

export interface SyncSummary {
  scheduled: number
  deferred: number
  fired: number
  missed: number
  cancelled: number
  cancelledIds: string[]
}

interface Entry {
  callbackId: string
  key: string
  triggerIso: string
  triggerMs: number
  kind: "exact" | "window-start"
  timer: unknown | null
  status: "scheduled" | "deferred" | "fired" | "missed"
}

export interface NotificationScheduler {
  schedule(
    input: SchedulableCallback,
    options?: { allowImmediate?: boolean }
  ): ScheduleResult
  scheduleMany(inputs: SchedulableCallback[]): SyncSummary
  syncFromMarkers(inputs: SchedulableCallback[]): SyncSummary
  cancel(callbackId: string): boolean
  cancelAll(): void
  sweep(
    nowMs?: number,
    options?: { resumedFromSuspension?: boolean }
  ): { fired: number; missed: number; armed: number }
  markDelivered(occurrenceKey: string): void
  getScheduled(): ReadonlyArray<{
    callbackId: string
    key: string
    triggerAt: string
    status: Entry["status"]
  }>
}

const DEFAULT_MAX_EXACT_DELAY_MS = 6 * 60 * 60 * 1000
// Timers can be delivered a few milliseconds late while a page is running.
// A larger delay is treated as a suspension/throttling boundary: native
// notifications must not be replayed after the browser wakes or regains
// focus. The in-app overdue surface still records the missed occurrence.
const TIMER_JITTER_TOLERANCE_MS = 5_000
const EMPTY_SUMMARY: SyncSummary = {
  scheduled: 0,
  deferred: 0,
  fired: 0,
  missed: 0,
  cancelled: 0,
  cancelledIds: [],
}

function defaultShowNative(payload: NativePayload): void {
  try {
    const NativeNotification = (
      globalThis as { Notification?: typeof Notification }
    ).Notification
    if (typeof NativeNotification === "undefined") return
    if (NativeNotification.permission !== "granted") return
    new NativeNotification(payload.title, {
      body: payload.body,
      tag: payload.tag,
    })
  } catch {
    // Native delivery is best-effort; in-app fallback covers the rest.
  }
}

function defaultGetPermission(): NotificationPermissionState {
  try {
    const NativeNotification = (
      globalThis as { Notification?: typeof Notification }
    ).Notification
    if (typeof NativeNotification === "undefined") return "unsupported"
    return NativeNotification.permission ?? "default"
  } catch {
    return "unsupported"
  }
}

export function createScheduler(
  deps: SchedulerDeps = {}
): NotificationScheduler {
  const entries = new Map<string, Entry>()

  const nowFn = deps.now ?? Date.now
  const maxExactDelayMs = deps.maxExactDelayMs ?? DEFAULT_MAX_EXACT_DELAY_MS
  const pushDue =
    deps.pushDue ?? ((notice: DueNotice) => getNoticeStore().pushDue(notice))
  const pushOverdue =
    deps.pushOverdue ??
    ((notice: DueNotice) => getNoticeStore().pushOverdue(notice))
  const claimFn = deps.claim ?? ((key: string) => tryClaimDelivery(key))
  const announceFn = deps.announce ?? ((key: string) => announceDelivery(key))
  const permissionFn = deps.getPermission ?? defaultGetPermission
  const showNativeFn = deps.showNative ?? defaultShowNative

  function setTimer(callback: () => void, ms: number): unknown {
    const setter =
      deps.setTimeoutFn ??
      ((cb: () => void, delay: number) => setTimeout(cb, delay))
    return setter(callback, Math.max(0, Math.min(ms, maxExactDelayMs)))
  }

  function clearTimer(handle: unknown): void {
    if (handle === null || handle === undefined) return
    try {
      if (deps.clearTimeoutFn) deps.clearTimeoutFn(handle)
      else clearTimeout(handle as ReturnType<typeof setTimeout>)
    } catch {
      // Timer cleanup is best-effort.
    }
  }

  function toNotice(entry: Entry, overdue: boolean): DueNotice {
    const content = buildNotificationContent(entry.triggerIso, entry.kind)
    return {
      key: entry.key,
      callbackId: entry.callbackId,
      triggerAt: entry.triggerIso,
      kind: entry.kind,
      title: content.title,
      body: content.body,
      overdue,
      createdAt: new Date(nowFn()).toISOString(),
    }
  }

  function deliver(entry: Entry, won: boolean): void {
    // A claim can resolve asynchronously after logout, deletion, or a
    // reschedule replaced this entry. Never deliver an orphaned occurrence.
    if (entries.get(entry.callbackId) !== entry) return
    let permission: NotificationPermissionState = "granted"
    try {
      permission = permissionFn()
    } catch {
      permission = "granted"
    }
    if (won && permission === "granted") {
      try {
        showNativeFn({
          title: buildNotificationContent(entry.triggerIso, entry.kind).title,
          body: buildNotificationContent(entry.triggerIso, entry.kind).body,
          tag: entry.key,
        })
      } catch {
        // Fall through to the in-app notice below.
      }
      try {
        announceFn(entry.key)
      } catch {
        // Cross-tab hint only.
      }
    }
    // Authenticated in-app fallback: always recorded, even for the native
    // winner, and the only surface when permission is denied/unsupported.
    pushDue(toNotice(entry, false))
  }

  function fire(
    entry: Entry,
    options: { resumedFromSuspension?: boolean; fromTimer?: boolean } = {}
  ): "fired" | "missed" {
    const nowMs = nowFn()
    // Sleeping/closed browser: never replay a notification past its grace.
    if (
      classifyTrigger(entry.triggerIso, nowMs, MISSED_GRACE_MS) === "missed"
    ) {
      entry.timer = null
      entry.status = "missed"
      pushOverdue(toNotice(entry, true))
      return "missed"
    }
    const lateByMs = Math.max(0, nowMs - entry.triggerMs)
    if (
      options.resumedFromSuspension ||
      (options.fromTimer && lateByMs > TIMER_JITTER_TOLERANCE_MS)
    ) {
      entry.timer = null
      entry.status = "missed"
      pushOverdue(toNotice(entry, true))
      return "missed"
    }
    let claim: boolean | Promise<boolean> = true
    try {
      claim = claimFn(entry.key)
    } catch {
      // A claim failure must not prevent the authenticated in-app fallback.
      claim = false
    }
    entry.timer = null
    entry.status = "fired"
    if (typeof claim === "object" && claim !== null && "then" in claim) {
      void Promise.resolve(claim).then(
        (won) => deliver(entry, won),
        () => deliver(entry, false)
      )
    } else {
      try {
        deliver(entry, claim)
      } catch {
        // Delivery must never break the scheduler.
      }
    }
    return "fired"
  }

  function arm(entry: Entry, delayMs: number): void {
    clearTimer(entry.timer)
    entry.timer = setTimer(() => {
      fire(entry, { fromTimer: true })
    }, delayMs)
    entry.status = "scheduled"
  }

  function scheduleOne(
    input: SchedulableCallback,
    options: { allowImmediate?: boolean } = {}
  ): ScheduleResult {
    if (!input || typeof input.id !== "string" || input.id.length === 0)
      return { status: "invalid" }
    if (input.lifecycle_state === "closed") {
      cancelOne(input.id)
      return { status: "cancelled-closed" }
    }
    const triggerIso = getTriggerIso(input)
    const kind = getNotificationKind(input)
    const key = getOccurrenceKey(input)
    if (!triggerIso || !kind || !key) return { status: "invalid" }
    const triggerMs = Date.parse(triggerIso)
    if (!Number.isFinite(triggerMs)) return { status: "invalid" }

    const existing = entries.get(input.id)
    if (
      existing &&
      existing.key === key &&
      (existing.status === "scheduled" ||
        existing.status === "deferred" ||
        existing.status === "fired" ||
        existing.status === "missed")
    ) {
      return { status: "already", key }
    }
    if (existing) {
      clearTimer(existing.timer)
      entries.delete(input.id)
    }

    const nowMs = nowFn()
    const placement = classifyTrigger(triggerIso, nowMs, MISSED_GRACE_MS)
    if (placement === "missed") {
      const missedEntry: Entry = {
        callbackId: input.id,
        key,
        triggerIso,
        triggerMs,
        kind,
        timer: null,
        status: "missed",
      }
      // Keep the occurrence in the registry so a later complete
      // reconciliation can report/cancel the ID and clear its in-app
      // overdue notice when the callback was closed or deleted elsewhere.
      entries.set(input.id, missedEntry)
      pushOverdue(toNotice(missedEntry, true))
      return { status: "missed", key }
    }
    const entry: Entry = {
      callbackId: input.id,
      key,
      triggerIso,
      triggerMs,
      kind,
      timer: null,
      status: "deferred",
    }
    if (placement === "due" && options.allowImmediate !== false) {
      entries.set(input.id, entry)
      fire(entry)
      return { status: "fired-now", key }
    }
    if (placement === "due") {
      // A complete reconciliation happens after a reload/navigation. A
      // trigger that is already past cannot be proven to have occurred while
      // this page was active, so record it as overdue instead of replaying a
      // native notification after wake.
      entry.status = "missed"
      entries.set(input.id, entry)
      pushOverdue(toNotice(entry, true))
      return { status: "missed", key }
    }
    const delayMs = triggerMs - nowMs
    if (delayMs > maxExactDelayMs) {
      entries.set(input.id, entry)
      return { status: "deferred", key }
    }
    entries.set(input.id, entry)
    arm(entry, delayMs)
    return { status: "scheduled", key }
  }

  function cancelOne(callbackId: string): boolean {
    const existing = entries.get(callbackId)
    if (!existing) return false
    clearTimer(existing.timer)
    entries.delete(callbackId)
    return true
  }

  const scheduler: NotificationScheduler = {
    schedule(
      input: SchedulableCallback,
      options?: { allowImmediate?: boolean }
    ): ScheduleResult {
      try {
        return scheduleOne(input, options)
      } catch {
        return { status: "invalid" }
      }
    },
    scheduleMany(inputs: SchedulableCallback[]): SyncSummary {
      const summary: SyncSummary = { ...EMPTY_SUMMARY, cancelledIds: [] }
      for (const input of inputs ?? []) {
        const result = scheduleOne(input)
        if (result.status === "scheduled") summary.scheduled += 1
        else if (result.status === "deferred") summary.deferred += 1
        else if (result.status === "fired-now") summary.fired += 1
        else if (result.status === "missed") summary.missed += 1
        else if (result.status === "cancelled-closed") summary.cancelled += 1
      }
      return summary
    },
    syncFromMarkers(inputs: SchedulableCallback[]): SyncSummary {
      const summary: SyncSummary = { ...EMPTY_SUMMARY, cancelledIds: [] }
      const seen = new Set<string>()
      for (const input of inputs ?? []) {
        if (input?.id) seen.add(input.id)
        const result = scheduleOne(input, { allowImmediate: false })
        if (result.status === "scheduled") summary.scheduled += 1
        else if (result.status === "deferred") summary.deferred += 1
        else if (result.status === "fired-now") summary.fired += 1
        else if (result.status === "missed") summary.missed += 1
        else if (result.status === "cancelled-closed") summary.cancelled += 1
      }
      for (const callbackId of [...entries.keys()]) {
        if (!seen.has(callbackId)) {
          if (cancelOne(callbackId)) {
            summary.cancelled += 1
            summary.cancelledIds.push(callbackId)
          }
        }
      }
      return summary
    },
    cancel(callbackId: string): boolean {
      try {
        return cancelOne(callbackId)
      } catch {
        return false
      }
    },
    cancelAll(): void {
      for (const entry of entries.values()) clearTimer(entry.timer)
      entries.clear()
    },
    sweep(
      nowMs?: number,
      options?: { resumedFromSuspension?: boolean }
    ): { fired: number; missed: number; armed: number } {
      const now = typeof nowMs === "number" ? nowMs : nowFn()
      let fired = 0
      let missed = 0
      let armed = 0
      for (const entry of entries.values()) {
        if (entry.status === "fired" || entry.status === "missed") continue
        const placement = classifyTrigger(
          entry.triggerIso,
          now,
          MISSED_GRACE_MS
        )
        if (placement === "missed") {
          clearTimer(entry.timer)
          entry.timer = null
          entry.status = "missed"
          pushOverdue(toNotice(entry, true))
          missed += 1
        } else if (placement === "due") {
          clearTimer(entry.timer)
          const outcome = fire(entry, {
            resumedFromSuspension: options?.resumedFromSuspension,
            fromTimer: true,
          })
          if (outcome === "fired") fired += 1
          else missed += 1
        } else if (entry.status === "deferred") {
          const delayMs = entry.triggerMs - now
          if (delayMs <= maxExactDelayMs) {
            arm(entry, delayMs)
            armed += 1
          }
        }
      }
      return { fired, missed, armed }
    },
    markDelivered(occurrenceKey: string): void {
      for (const entry of entries.values()) {
        if (entry.key === occurrenceKey && entry.status !== "fired") {
          clearTimer(entry.timer)
          entry.timer = null
          entry.status = "fired"
        }
      }
    },
    getScheduled() {
      return [...entries.values()].map((entry) => ({
        callbackId: entry.callbackId,
        key: entry.key,
        triggerAt: entry.triggerIso,
        status: entry.status,
      }))
    },
  }

  return scheduler
}

let sharedScheduler: NotificationScheduler | null = null

/**
 * Module singleton so timers survive client-side navigation: components may
 * mount/unmount, but the registry lives in module scope. Cleanup on unmount
 * must remove listeners only — never cancelAll().
 */
export function getSharedScheduler(): NotificationScheduler {
  if (!sharedScheduler) sharedScheduler = createScheduler()
  return sharedScheduler
}

/** Test-only reset for the module singleton. */
export function resetSharedSchedulerForTests(): void {
  try {
    sharedScheduler?.cancelAll()
  } catch {
    // Ignore cleanup failures in tests.
  }
  sharedScheduler = null
}
