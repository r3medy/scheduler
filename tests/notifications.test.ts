import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { buildNotificationContent } from "@/lib/notifications/content"
import {
  announceDelivery,
  announceSignOut,
  listenForDeliveries,
  listenForSignOut,
  tryClaimDelivery,
  type ClaimStorage,
} from "@/lib/notifications/dedupe"
import {
  getOccurrenceKey,
  MISSED_GRACE_MS,
} from "@/lib/notifications/occurrence"
import { createScheduler } from "@/lib/notifications/scheduler"
import type { SchedulableCallback } from "@/lib/notifications/types"

function memoryStorage(shared?: Map<string, string>): ClaimStorage {
  const map = shared ?? new Map<string, string>()
  return {
    getItem: (key: string) => (map.has(key) ? (map.get(key) as string) : null),
    setItem: (key: string, value: string) => {
      map.set(key, value)
    },
  }
}

function exactInput(id: string, triggerMs: number): SchedulableCallback {
  return {
    id,
    schedule_mode: "exact",
    scheduled_at: new Date(triggerMs).toISOString(),
    window_start_at: null,
    window_end_at: null,
  }
}

function windowInput(
  id: string,
  startMs: number,
  endMs: number
): SchedulableCallback {
  return {
    id,
    schedule_mode: "window",
    scheduled_at: null,
    window_start_at: new Date(startMs).toISOString(),
    window_end_at: new Date(endMs).toISOString(),
  }
}

const T0 = Date.parse("2026-09-05T08:00:00.000Z")

beforeEach(() => {
  vi.useFakeTimers()
  try {
    window.localStorage.clear()
  } catch {
    // jsdom storage may be unavailable; explicit memory storage covers tests.
  }
})

afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

describe("notification scheduling", () => {
  it("fires an exact-time trigger once with generic content", () => {
    let now = T0
    const showNative = vi.fn()
    const pushDue = vi.fn()
    const scheduler = createScheduler({
      now: () => now,
      showNative,
      pushDue,
      pushOverdue: vi.fn(),
      claim: () => true,
      announce: () => undefined,
      getPermission: () => "granted",
    })
    const result = scheduler.schedule(exactInput("cb-1", T0 + 60_000))
    expect(result.status).toBe("scheduled")

    vi.advanceTimersByTime(59_000)
    expect(showNative).not.toHaveBeenCalled()

    now = T0 + 60_000
    vi.advanceTimersByTime(1_000)
    expect(showNative).toHaveBeenCalledTimes(1)
    expect(showNative.mock.calls[0][0]).toMatchObject({
      title: "Callback due now",
    })
    expect(pushDue).toHaveBeenCalledTimes(1)

    // Never repeats while still in grace/overdue.
    now = T0 + 10 * 60_000
    vi.advanceTimersByTime(60_000)
    scheduler.sweep(now)
    expect(showNative).toHaveBeenCalledTimes(1)
  })

  it("fires a window callback at window start, not window end", () => {
    let now = T0
    const showNative = vi.fn()
    const scheduler = createScheduler({
      now: () => now,
      showNative,
      pushDue: vi.fn(),
      pushOverdue: vi.fn(),
      claim: () => true,
      announce: () => undefined,
      getPermission: () => "granted",
    })
    scheduler.schedule(windowInput("cb-w", T0 + 120_000, T0 + 3_600_000))

    now = T0 + 119_000
    vi.advanceTimersByTime(119_000)
    expect(showNative).not.toHaveBeenCalled()

    now = T0 + 120_000
    vi.advanceTimersByTime(1_000)
    expect(showNative).toHaveBeenCalledTimes(1)
  })
})

describe("cancel on delete and replace on reschedule", () => {
  it("cancels a pending timer after deletion", () => {
    let now = T0
    const showNative = vi.fn()
    const scheduler = createScheduler({
      now: () => now,
      showNative,
      pushDue: vi.fn(),
      pushOverdue: vi.fn(),
      claim: () => true,
      announce: () => undefined,
      getPermission: () => "granted",
    })
    scheduler.schedule(exactInput("cb-del", T0 + 60_000))
    expect(scheduler.cancel("cb-del")).toBe(true)

    now = T0 + 120_000
    vi.advanceTimersByTime(120_000)
    scheduler.sweep(now)
    expect(showNative).not.toHaveBeenCalled()
  })

  it("drops deleted ids when reconciling fresh markers", () => {
    let now = T0
    const showNative = vi.fn()
    const scheduler = createScheduler({
      now: () => now,
      showNative,
      pushDue: vi.fn(),
      pushOverdue: vi.fn(),
      claim: () => true,
      announce: () => undefined,
      getPermission: () => "granted",
    })
    scheduler.syncFromMarkers([
      exactInput("keep", T0 + 60_000),
      exactInput("gone", T0 + 60_000),
    ])
    const summary = scheduler.syncFromMarkers([exactInput("keep", T0 + 60_000)])
    expect(summary.cancelledIds).toContain("gone")

    now = T0 + 60_000
    vi.advanceTimersByTime(60_000)
    expect(showNative).toHaveBeenCalledTimes(1)
    expect(showNative.mock.calls[0][0].tag).toContain("keep@")
  })

  it("replaces the prior occurrence after rescheduling", () => {
    let now = T0
    const showNative = vi.fn()
    const scheduler = createScheduler({
      now: () => now,
      showNative,
      pushDue: vi.fn(),
      pushOverdue: vi.fn(),
      claim: () => true,
      announce: () => undefined,
      getPermission: () => "granted",
    })
    scheduler.schedule(exactInput("cb-re", T0 + 60_000))
    // Same callback id, new occurrence key.
    scheduler.schedule(exactInput("cb-re", T0 + 180_000))

    now = T0 + 60_000
    vi.advanceTimersByTime(60_000)
    expect(showNative).not.toHaveBeenCalled()

    now = T0 + 180_000
    vi.advanceTimersByTime(120_000)
    expect(showNative).toHaveBeenCalledTimes(1)
    expect(showNative.mock.calls[0][0].tag).toBe(
      `cb-re@${new Date(T0 + 180_000).toISOString()}`
    )
  })

  it("does not deliver when an async claim resolves after cancellation", async () => {
    let now = T0
    let resolveClaim: (won: boolean) => void = () => undefined
    const claim = new Promise<boolean>((resolve) => {
      resolveClaim = resolve
    })
    const showNative = vi.fn()
    const pushDue = vi.fn()
    const scheduler = createScheduler({
      now: () => now,
      showNative,
      pushDue,
      pushOverdue: vi.fn(),
      claim: () => claim,
      announce: () => undefined,
      getPermission: () => "granted",
    })
    scheduler.schedule(exactInput("cb-async-cancel", T0 + 60_000))

    now = T0 + 60_000
    vi.advanceTimersByTime(60_000)
    expect(scheduler.getScheduled()[0]?.status).toBe("fired")
    expect(scheduler.cancel("cb-async-cancel")).toBe(true)

    resolveClaim(true)
    await Promise.resolve()
    await Promise.resolve()
    expect(showNative).not.toHaveBeenCalled()
    expect(pushDue).not.toHaveBeenCalled()
  })

  it("retains missed IDs long enough for a complete reconciliation to clear them", () => {
    const now = T0
    const scheduler = createScheduler({
      now: () => now,
      pushDue: vi.fn(),
      pushOverdue: vi.fn(),
      claim: () => true,
      announce: () => undefined,
      getPermission: () => "denied",
    })
    const trigger = T0 - MISSED_GRACE_MS - 1_000

    expect(scheduler.schedule(exactInput("cb-missed", trigger)).status).toBe(
      "missed"
    )
    const summary = scheduler.syncFromMarkers([])

    expect(summary.cancelledIds).toContain("cb-missed")
    expect(scheduler.getScheduled()).toEqual([])
  })
})

describe("one notification per occurrence across tabs", () => {
  it("allows a single native winner via a shared claimed-delivery flag", () => {
    let now = T0
    const nowFn = () => now
    const shared = new Map<string, string>()
    const nativeA = vi.fn()
    const nativeB = vi.fn()
    const tabA = createScheduler({
      now: nowFn,
      showNative: nativeA,
      pushDue: vi.fn(),
      pushOverdue: vi.fn(),
      claim: (key) => tryClaimDelivery(key, memoryStorage(shared)),
      announce: () => undefined,
      getPermission: () => "granted",
    })
    const tabB = createScheduler({
      now: nowFn,
      showNative: nativeB,
      pushDue: vi.fn(),
      pushOverdue: vi.fn(),
      claim: (key) => tryClaimDelivery(key, memoryStorage(shared)),
      announce: () => undefined,
      getPermission: () => "granted",
    })
    const input = exactInput("cb-tabs", T0 + 60_000)
    tabA.schedule(input)
    tabB.schedule(input)

    now = T0 + 60_000
    vi.advanceTimersByTime(60_000)
    expect(nativeA.mock.calls.length + nativeB.mock.calls.length).toBe(1)
  })

  it("announces deliveries over BroadcastChannel and honors remote claims", () => {
    const posted: unknown[] = []
    class MockChannel {
      static instances = new Set<MockChannel>()
      onmessage: ((event: { data: unknown }) => void) | null = null
      constructor(public name: string) {
        MockChannel.instances.add(this)
      }
      postMessage(message: unknown) {
        posted.push(message)
        for (const instance of MockChannel.instances) {
          if (instance === this) continue
          try {
            instance.onmessage?.({ data: message })
          } catch {
            // Listener failures must not break delivery.
          }
        }
      }
      close() {
        MockChannel.instances.delete(this)
      }
    }
    vi.stubGlobal("BroadcastChannel", MockChannel)

    const seen: string[] = []
    const unsubscribe = listenForDeliveries((key) => {
      seen.push(key)
    })
    announceDelivery("cb-1@2026-09-05T08:01:00.000Z")
    expect(posted).toHaveLength(1)
    expect(seen).toContain("cb-1@2026-09-05T08:01:00.000Z")
    unsubscribe()

    // A tab told about a remote delivery suppresses its own pending timer.
    let now = T0
    const showNative = vi.fn()
    const scheduler = createScheduler({
      now: () => now,
      showNative,
      pushDue: vi.fn(),
      pushOverdue: vi.fn(),
      claim: () => true,
      announce: () => undefined,
      getPermission: () => "granted",
    })
    const input = exactInput("cb-remote", T0 + 60_000)
    scheduler.schedule(input)
    scheduler.markDelivered(`cb-remote@${new Date(T0 + 60_000).toISOString()}`)
    now = T0 + 60_000
    vi.advanceTimersByTime(60_000)
    expect(showNative).not.toHaveBeenCalled()
    expect(input.id).toBe("cb-remote")
  })

  it("broadcasts a PII-free sign-out signal to other tabs", () => {
    const messages: unknown[] = []
    class AuthChannel {
      static instances = new Set<AuthChannel>()
      onmessage: ((event: { data: unknown }) => void) | null = null
      constructor(public name: string) {
        AuthChannel.instances.add(this)
      }
      postMessage(message: unknown) {
        messages.push(message)
        for (const instance of AuthChannel.instances) {
          if (instance !== this) instance.onmessage?.({ data: message })
        }
      }
      close() {
        AuthChannel.instances.delete(this)
      }
    }
    // Keep the existing delivery channel behavior out of this focused test;
    // sign-out uses its own channel name.
    vi.stubGlobal("BroadcastChannel", AuthChannel)
    const onSignOut = vi.fn()
    const unsubscribe = listenForSignOut(onSignOut)

    announceSignOut()

    expect(messages).toEqual([{ type: "scheduler-auth-signed-out" }])
    expect(onSignOut).toHaveBeenCalled()
    expect(JSON.stringify(messages)).not.toContain("owner")
    unsubscribe()
  })

  it("serializes default claims with Web Locks before touching shared storage", async () => {
    const shared = new Map<string, string>()
    const pending: Array<() => Promise<void>> = []
    const locks = {
      request: (_name: string, callback: (lock: unknown) => Promise<boolean>) =>
        new Promise<boolean>((resolve) => {
          pending.push(async () => resolve(await callback({})))
        }),
    }
    vi.stubGlobal("localStorage", memoryStorage(shared))
    vi.stubGlobal("navigator", { locks })

    const first = tryClaimDelivery("cb-race@2026-09-05T08:01:00.000Z")
    const second = tryClaimDelivery("cb-race@2026-09-05T08:01:00.000Z")
    expect(first).toBeInstanceOf(Promise)
    expect(second).toBeInstanceOf(Promise)
    expect(pending).toHaveLength(2)

    await pending[0]()
    await pending[1]()
    expect(await first).toBe(true)
    expect(await second).toBe(false)
  })

  it("fails closed when shared storage has no atomic cross-tab lock", () => {
    const shared = new Map<string, string>()
    vi.stubGlobal("localStorage", memoryStorage(shared))
    vi.stubGlobal("navigator", {})

    expect(tryClaimDelivery("cb-unsupported@2026-09-05T08:01:00.000Z")).toBe(
      false
    )
    expect(shared.size).toBe(0)
  })

  it("fails closed when no cross-tab coordination primitive exists", () => {
    vi.stubGlobal("localStorage", undefined)
    vi.stubGlobal("navigator", {})

    expect(
      tryClaimDelivery("cb-no-coordination@2026-09-05T08:01:00.000Z")
    ).toBe(false)
  })

  it("fails closed when shared claim storage throws", () => {
    const broken: ClaimStorage = {
      getItem: () => {
        throw new Error("storage unavailable")
      },
      setItem: () => undefined,
    }
    expect(
      tryClaimDelivery("cb-storage-error@2026-09-05T08:01:00.000Z", broken)
    ).toBe(false)
  })
})

describe("generic content contains no customer PII", () => {
  it("never embeds names, numbers, or notes", () => {
    const name = "Alice Example"
    const phone = "0123456789"
    const account = "ACCT-998877"
    const note = "secret-note-about-renewal"
    for (const content of [
      buildNotificationContent(new Date(T0).toISOString(), "exact"),
      buildNotificationContent(new Date(T0).toISOString(), "window-start"),
    ]) {
      expect(content.title).toBe("Callback due now")
      for (const secret of [name, phone, account, note]) {
        expect(content.body).not.toContain(secret)
        expect(content.title).not.toContain(secret)
      }
    }
    // Occurrence keys carry only the callback id + trigger time.
    const key = getOccurrenceKey(exactInput("cb-pii", T0))
    expect(key).toBe(`cb-pii@${new Date(T0).toISOString()}`)
    expect(key).not.toContain(name)
  })
})

describe("missed triggers are skipped, never replayed", () => {
  it("does not replay an already-due occurrence during reload reconciliation", () => {
    const now = T0
    const showNative = vi.fn()
    const pushOverdue = vi.fn()
    const scheduler = createScheduler({
      now: () => now,
      showNative,
      pushDue: vi.fn(),
      pushOverdue,
      claim: () => true,
      announce: () => undefined,
      getPermission: () => "granted",
    })

    const result = scheduler.syncFromMarkers([
      exactInput("cb-reload", T0 - 30_000),
    ])
    expect(result.missed).toBe(1)
    expect(showNative).not.toHaveBeenCalled()
    expect(pushOverdue).toHaveBeenCalledTimes(1)
  })

  it("treats a timer delayed beyond normal jitter as a wake boundary", () => {
    let now = T0
    const showNative = vi.fn()
    const pushOverdue = vi.fn()
    const scheduler = createScheduler({
      now: () => now,
      showNative,
      pushDue: vi.fn(),
      pushOverdue,
      claim: () => true,
      announce: () => undefined,
      getPermission: () => "granted",
    })
    scheduler.schedule(exactInput("cb-wake", T0 + 60_000))

    // The timer callback runs after the device/browser resumes, still within
    // the product's five-minute due grace. It must not replay natively.
    now = T0 + 60_000 + 30_000
    vi.advanceTimersByTime(60_000)
    expect(showNative).not.toHaveBeenCalled()
    expect(pushOverdue).toHaveBeenCalledTimes(1)
  })

  it("shows an in-app overdue instead of a late native notification", () => {
    const now = T0
    const showNative = vi.fn()
    const pushOverdue = vi.fn()
    const scheduler = createScheduler({
      now: () => now,
      showNative,
      pushDue: vi.fn(),
      pushOverdue,
      claim: () => true,
      announce: () => undefined,
      getPermission: () => "granted",
    })
    const trigger = T0 - (MISSED_GRACE_MS + 60_000)
    const result = scheduler.schedule(exactInput("cb-late", trigger))
    expect(result.status).toBe("missed")
    expect(showNative).not.toHaveBeenCalled()
    expect(pushOverdue).toHaveBeenCalledTimes(1)
    expect(pushOverdue.mock.calls[0][0]).toMatchObject({ overdue: true })
  })

  it("converts a slept-through timer into overdue at fire time", () => {
    let now = T0
    const showNative = vi.fn()
    const pushOverdue = vi.fn()
    const scheduler = createScheduler({
      now: () => now,
      showNative,
      pushDue: vi.fn(),
      pushOverdue,
      claim: () => true,
      announce: () => undefined,
      getPermission: () => "granted",
    })
    scheduler.schedule(exactInput("cb-sleep", T0 + 60_000))
    // Device slept past the 5-minute grace before the timer ran.
    now = T0 + MISSED_GRACE_MS + 120_000
    vi.advanceTimersByTime(60_000)
    expect(showNative).not.toHaveBeenCalled()
    expect(pushOverdue).toHaveBeenCalled()
  })
})
