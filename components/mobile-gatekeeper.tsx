"use client"

import { useSyncExternalStore } from "react"

const NARROW_QUERY = "(max-width: 639px)"
const COARSE_POINTER_QUERY = "(pointer: coarse)"
const MOBILE_UA_PATTERN =
  /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i

export function isMobileDevice(): boolean {
  if (typeof window === "undefined") return false
  if (typeof window.matchMedia !== "function") return false
  const isNarrow = window.matchMedia(NARROW_QUERY).matches
  const hasCoarsePointer = window.matchMedia(COARSE_POINTER_QUERY).matches
  const userAgent =
    typeof navigator !== "undefined" ? navigator.userAgent : ""
  const isMobileUA = MOBILE_UA_PATTERN.test(userAgent)
  return isNarrow && hasCoarsePointer && isMobileUA
}

function subscribe(onChange: () => void) {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
    return () => undefined
  }
  const narrow = window.matchMedia(NARROW_QUERY)
  const coarse = window.matchMedia(COARSE_POINTER_QUERY)
  narrow.addEventListener("change", onChange)
  coarse.addEventListener("change", onChange)
  return () => {
    narrow.removeEventListener("change", onChange)
    coarse.removeEventListener("change", onChange)
  }
}

function getServerSnapshot() {
  return false
}

export function MobileGatekeeper() {
  const isMobile = useSyncExternalStore(
    subscribe,
    isMobileDevice,
    getServerSnapshot
  )

  if (!isMobile) return null

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Unsupported Device"
      className="fixed inset-0 z-50 flex items-center justify-center bg-background p-6 text-center sm:hidden"
    >
      <div className="flex max-w-sm flex-col gap-3">
        <h1 className="text-xl font-semibold tracking-tight">
          Unsupported Device
        </h1>
        <p className="text-sm text-pretty text-muted-foreground">
          Scheduler is not supported on phones. Please continue on a larger
          screen. This is an unsupported-device deterrent, not a security
          boundary.
        </p>
      </div>
    </div>
  )
}
