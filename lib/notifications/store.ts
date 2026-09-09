import type { DueNotice } from "@/lib/notifications/types"

type Listener = () => void

export interface NoticeStore {
  getNotices(): DueNotice[]
  getOverdue(): DueNotice[]
  subscribe(listener: Listener): () => void
  pushDue(notice: DueNotice): void
  pushOverdue(notice: DueNotice): void
  dismiss(key: string): void
  clearForCallback(callbackId: string): void
  clearAll(): void
}

/** In-memory authenticated in-app fallback store (per tab, never persisted). */
export function createNoticeStore(): NoticeStore {
  let notices: DueNotice[] = []
  let overdue: DueNotice[] = []
  const listeners = new Set<Listener>()

  function emit() {
    for (const listener of listeners) {
      try {
        listener()
      } catch {
        // A failing subscriber must not break notification delivery.
      }
    }
  }

  function contains(key: string): boolean {
    return (
      notices.some((notice) => notice.key === key) ||
      overdue.some((notice) => notice.key === key)
    )
  }

  return {
    getNotices() {
      return notices
    },
    getOverdue() {
      return overdue
    },
    subscribe(listener: Listener) {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },
    pushDue(notice: DueNotice) {
      if (contains(notice.key)) return
      notices = [...notices, notice].slice(-20)
      emit()
    },
    pushOverdue(notice: DueNotice) {
      if (contains(notice.key)) return
      overdue = [...overdue, { ...notice, overdue: true }].slice(-20)
      emit()
    },
    dismiss(key: string) {
      const nextNotices = notices.filter((notice) => notice.key !== key)
      const nextOverdue = overdue.filter((notice) => notice.key !== key)
      if (
        nextNotices.length !== notices.length ||
        nextOverdue.length !== overdue.length
      ) {
        notices = nextNotices
        overdue = nextOverdue
        emit()
      }
    },
    clearForCallback(callbackId: string) {
      const nextNotices = notices.filter(
        (notice) => notice.callbackId !== callbackId
      )
      const nextOverdue = overdue.filter(
        (notice) => notice.callbackId !== callbackId
      )
      if (
        nextNotices.length !== notices.length ||
        nextOverdue.length !== overdue.length
      ) {
        notices = nextNotices
        overdue = nextOverdue
        emit()
      }
    },
    clearAll() {
      if (notices.length === 0 && overdue.length === 0) return
      notices = []
      overdue = []
      emit()
    },
  }
}

let shared: NoticeStore | null = null

export function getNoticeStore(): NoticeStore {
  if (!shared) shared = createNoticeStore()
  return shared
}

/** Test-only reset for the module singleton. */
export function resetNoticeStoreForTests(): void {
  shared = null
}
