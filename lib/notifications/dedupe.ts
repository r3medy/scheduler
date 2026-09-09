export const NOTIFICATION_CHANNEL = "scheduler-notifications"
const AUTH_SIGN_OUT_CHANNEL = "scheduler-auth"
const AUTH_SIGN_OUT_STORAGE_KEY = "scheduler.auth.signed-out"

const CLAIM_PREFIX = "scheduler.notification.claimed."

export interface ClaimStorage {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
}

type LockManagerLike = {
  request: <T>(
    name: string,
    callback: (lock: unknown) => T | PromiseLike<T>
  ) => Promise<T>
}

function resolveStorage(explicit?: ClaimStorage | null): ClaimStorage | null {
  if (explicit) return explicit
  try {
    const candidate = (globalThis as { localStorage?: ClaimStorage })
      .localStorage
    if (candidate && typeof candidate.getItem === "function") return candidate
  } catch {
    return null
  }
  return null
}

export function claimStorageKey(occurrenceKey: string): string {
  return `${CLAIM_PREFIX}${occurrenceKey}`
}

/** True when another tab (or this tab earlier) already claimed this occurrence. */
export function hasDeliveryClaim(
  occurrenceKey: string,
  storage?: ClaimStorage | null
): boolean {
  const store = resolveStorage(storage)
  if (!store) return false
  try {
    return store.getItem(claimStorageKey(occurrenceKey)) !== null
  } catch {
    return false
  }
}

/**
 * Atomically-ish claim one delivery per schedule occurrence across tabs.
 * Returns true for the single winner; losers must suppress native output.
 * When no shared storage or Web Locks coordination exists, this fails closed
 * because the tab cannot establish a single native-delivery winner. A Web
 * Locks browser without persistent claim storage also fails closed because
 * the lock alone cannot remember a prior winner.
 */
export function tryClaimDelivery(
  occurrenceKey: string,
  storage?: ClaimStorage | null
): boolean | Promise<boolean> {
  // The Web Locks API gives cooperating tabs an actual cross-document
  // critical section. localStorage's get/set pair is not atomic on its own;
  // use the lock when available and keep the synchronous storage fallback for
  // browsers without Web Locks and deterministic unit-test stores.
  let lockUnavailable = false
  if (!storage) {
    try {
      const locks = (globalThis as { navigator?: { locks?: LockManagerLike } })
        .navigator?.locks
      if (locks && typeof locks.request === "function") {
        return locks.request(
          `scheduler-notification:${occurrenceKey}`,
          async (lock) => {
            if (!lock) return false
            const store = resolveStorage()
            if (!store) return false
            try {
              if (store.getItem(claimStorageKey(occurrenceKey)) !== null)
                return false
              store.setItem(claimStorageKey(occurrenceKey), String(Date.now()))
              return true
            } catch {
              return false
            }
          }
        )
      }
    } catch {
      // A localStorage get/set pair is not an atomic cross-tab primitive. If
      // the lock request itself failed, fail closed rather than risk a
      // duplicate native delivery.
      lockUnavailable = true
    }
  }
  const store = resolveStorage(storage)
  // Without either a shared claim store or Web Locks, this tab cannot know
  // whether another open tab already delivered the occurrence. Suppress the
  // native side effect; the authenticated in-app fallback remains available.
  if (!store) return false
  if (!storage && lockUnavailable) return false
  if (!storage) {
    // localStorage is useful for persistence, but without Web Locks two tabs
    // can both observe a missing key before either writes it. Suppress native
    // output in that unsupported coordination case; each tab still receives
    // the authenticated in-app fallback.
    try {
      const locks = (globalThis as { navigator?: { locks?: LockManagerLike } })
        .navigator?.locks
      if (!locks || typeof locks.request !== "function") return false
    } catch {
      return false
    }
  }
  try {
    if (store.getItem(claimStorageKey(occurrenceKey)) !== null) return false
    store.setItem(claimStorageKey(occurrenceKey), String(Date.now()))
    return true
  } catch {
    // A storage error means this tab cannot establish a shared claim. Fail
    // closed so a second tab cannot emit a duplicate native notification;
    // the in-app fallback remains available to the authenticated user.
    return false
  }
}

type BroadcastPoster = {
  postMessage: (message: unknown) => void
  close?: () => void
}

type BroadcastListener = BroadcastPoster & {
  onmessage: ((event: { data: unknown }) => void) | null
}

function openChannel(): BroadcastPoster | null {
  try {
    const ctor = (
      globalThis as {
        BroadcastChannel?: new (name: string) => BroadcastPoster
      }
    ).BroadcastChannel
    if (typeof ctor !== "function") return null
    return new ctor(NOTIFICATION_CHANNEL)
  } catch {
    return null
  }
}

function openAuthChannel(): BroadcastListener | null {
  try {
    const ctor = (
      globalThis as {
        BroadcastChannel?: new (name: string) => BroadcastListener
      }
    ).BroadcastChannel
    if (typeof ctor !== "function") return null
    return new ctor(AUTH_SIGN_OUT_CHANNEL)
  } catch {
    return null
  }
}

/** Notify other open tabs that the authenticated session has ended. */
export function announceSignOut(): void {
  const channel = openAuthChannel()
  if (channel) {
    try {
      channel.postMessage({ type: "scheduler-auth-signed-out" })
    } catch {
      // localStorage signal below remains available as a fallback.
    } finally {
      try {
        channel.close?.()
      } catch {
        // Ignore close failures.
      }
    }
  }
  try {
    const storage = (globalThis as { localStorage?: ClaimStorage }).localStorage
    storage?.setItem(AUTH_SIGN_OUT_STORAGE_KEY, String(Date.now()))
  } catch {
    // Cross-tab hint only; the initiating tab clears itself directly.
  }
}

/** Subscribe to cross-tab sign-out signals. Returns unsubscribe. */
export function listenForSignOut(onSignOut: () => void): () => void {
  const channel = openAuthChannel()
  const onMessage = (event: { data: unknown }) => {
    if (
      (event?.data as { type?: unknown } | null)?.type ===
      "scheduler-auth-signed-out"
    ) {
      onSignOut()
    }
  }
  if (channel) channel.onmessage = onMessage
  const onStorage = (event: StorageEvent) => {
    if (event.key === AUTH_SIGN_OUT_STORAGE_KEY) onSignOut()
  }
  try {
    globalThis.addEventListener?.("storage", onStorage)
  } catch {
    // BroadcastChannel remains available when storage events are blocked.
  }
  return () => {
    if (channel) {
      try {
        channel.close?.()
      } catch {
        // Ignore cleanup failures.
      }
    }
    try {
      globalThis.removeEventListener?.("storage", onStorage)
    } catch {
      // Ignore cleanup failures.
    }
  }
}

/** Tell other open tabs this occurrence already fired natively. */
export function announceDelivery(occurrenceKey: string): void {
  const channel = openChannel()
  if (!channel) return
  try {
    channel.postMessage({
      type: "scheduler-notification-delivered",
      occurrenceKey,
    })
  } catch {
    // Cross-tab hint only; delivery already claimed via storage.
  } finally {
    try {
      channel.close?.()
    } catch {
      // Ignore close failures.
    }
  }
}

/** Subscribe to deliveries announced by other tabs. Returns unsubscribe. */
export function listenForDeliveries(
  onDelivered: (occurrenceKey: string) => void
): () => void {
  try {
    const ctor = (
      globalThis as {
        BroadcastChannel?: new (name: string) => {
          postMessage: (message: unknown) => void
          onmessage: ((event: { data: unknown }) => void) | null
          close: () => void
        }
      }
    ).BroadcastChannel
    if (typeof ctor !== "function") return () => undefined
    const channel = new ctor(NOTIFICATION_CHANNEL)
    channel.onmessage = (event) => {
      const data = event?.data as {
        type?: unknown
        occurrenceKey?: unknown
      } | null
      if (
        data?.type === "scheduler-notification-delivered" &&
        typeof data.occurrenceKey === "string"
      ) {
        onDelivered(data.occurrenceKey)
      }
    }
    return () => {
      try {
        channel.close()
      } catch {
        // Ignore close failures.
      }
    }
  } catch {
    return () => undefined
  }
}
