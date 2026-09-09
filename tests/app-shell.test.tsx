import { act, render, screen } from "@testing-library/react"
import { afterEach, beforeEach, expect, it, vi } from "vitest"

const navigationMocks = vi.hoisted(() => ({
  refresh: vi.fn(),
}))

vi.mock("next/navigation", () => ({
  usePathname: () => "/",
  useRouter: () => navigationMocks,
}))
vi.mock("next/link", () => ({
  default: ({
    href,
    children,
    ...props
  }: {
    href: string
    children: React.ReactNode
  }) => (
    <a href={typeof href === "string" ? href : "/"} {...props}>
      {children}
    </a>
  ),
}))

const accountMocks = vi.hoisted(() => ({
  changePin: vi.fn(),
  deleteAccount: vi.fn(),
  signOutAccount: vi.fn(),
}))
vi.mock("@/lib/auth/account-actions", () => accountMocks)
vi.mock("@/lib/supabase/server", () => ({
  getSupabaseConfiguration: () => ({}),
  createSupabaseServerClient: async () => ({
    auth: { getUser: vi.fn() },
    from: vi.fn(),
  }),
}))

import { AppShell } from "@/components/app-shell"
import { __testUtils } from "@/hooks/use-notifications"
import { getSharedScheduler } from "@/lib/notifications/scheduler"

const T0 = Date.parse("2026-09-05T08:00:00.000Z")

function exactSchedule(id: string, offsetMs: number) {
  return {
    id,
    schedule_mode: "exact" as const,
    scheduled_at: new Date(T0 + offsetMs).toISOString(),
    window_start_at: null,
    window_end_at: null,
    lifecycle_state: "open",
  }
}

beforeEach(() => {
  vi.useFakeTimers({ now: T0 })
  navigationMocks.refresh.mockReset()
  __testUtils.resetSharedSchedulerForTests()
  __testUtils.resetNoticeStoreForTests()
  const NativeNotification = Object.assign(vi.fn(), {
    permission: "denied" as NotificationPermission,
    requestPermission: vi.fn(),
  })
  vi.stubGlobal("Notification", NativeNotification)
})

afterEach(() => {
  __testUtils.resetSharedSchedulerForTests()
  __testUtils.resetNoticeStoreForTests()
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

it("wraps the Settings sidebar entry in a tooltip like the other destinations", () => {
  render(
    <AppShell>
      <div>content</div>
    </AppShell>
  )
  // Parity with the Home/History links: the sidebar entry carries the tooltip
  // trigger wiring. (Opening the tooltip is not exercised here: Base UI
  // tooltip positioning wedges the jsdom worker.)
  for (const name of ["Home", "Callback history"]) {
    expect(screen.getByRole("link", { name }).getAttribute("data-slot")).toBe(
      "tooltip-trigger"
    )
  }
  const settings = screen.getByRole("button", { name: "Settings" })
  expect(settings.getAttribute("data-slot")).toBe("tooltip-trigger")
})

it("mounts the authenticated notification host and renders the denied-permission fallback", async () => {
  const { rerender } = render(
    <AppShell notificationSchedules={[]}>
      <div>content</div>
    </AppShell>
  )
  // A successful create/reload causes the server page to refresh this
  // complete owner projection; the host must consume the new schedule.
  rerender(
    <AppShell notificationSchedules={[exactSchedule("created", 60_000)]}>
      <div>content</div>
    </AppShell>
  )

  await act(async () => {
    vi.advanceTimersByTime(60_000)
  })

  expect(screen.getByText("Callback due now")).toBeInTheDocument()
  expect(screen.getByRole("status")).toHaveTextContent("Callback due now")
})

it("does not refresh the route when the mounted host reconciles schedules", async () => {
  render(
    <AppShell notificationSchedules={[exactSchedule("initial", 60_000)]}>
      <div>content</div>
    </AppShell>
  )

  await act(async () => {
    await Promise.resolve()
  })

  expect(navigationMocks.refresh).not.toHaveBeenCalled()
})

it("keeps timers through a partial query failure, then clears on unauthenticated state", async () => {
  const schedule = exactSchedule("preserve", 60_000)
  const { rerender } = render(
    <AppShell notificationSchedules={[schedule]}>
      <div>content</div>
    </AppShell>
  )
  expect(getSharedScheduler().getScheduled()).toHaveLength(1)

  // `undefined` represents a failed/incomplete owner query. Unmounting the
  // host must not cancel the module-singleton timer or reconcile partial data.
  rerender(
    <AppShell>
      <div>content</div>
    </AppShell>
  )
  expect(getSharedScheduler().getScheduled()).toHaveLength(1)

  // `null` is the explicit unauthenticated/logout state and must clear it.
  rerender(
    <AppShell notificationSchedules={null}>
      <div>content</div>
    </AppShell>
  )
  await act(async () => {
    await Promise.resolve()
  })
  expect(getSharedScheduler().getScheduled()).toEqual([])

  await act(async () => {
    vi.advanceTimersByTime(60_000)
  })
  expect(screen.queryByText("Callback due now")).not.toBeInTheDocument()
})

it("replaces schedules when the authenticated owner changes", async () => {
  const { rerender } = render(
    <AppShell notificationSchedules={[exactSchedule("owner-a", 60_000)]}>
      <div>content</div>
    </AppShell>
  )
  rerender(
    <AppShell notificationSchedules={[exactSchedule("owner-b", 120_000)]}>
      <div>content</div>
    </AppShell>
  )
  await act(async () => {
    await Promise.resolve()
  })

  expect(
    getSharedScheduler()
      .getScheduled()
      .map((entry) => entry.callbackId)
  ).toEqual(["owner-b"])
  await act(async () => {
    vi.advanceTimersByTime(60_000)
  })
  expect(screen.queryByText("Callback due now")).not.toBeInTheDocument()
})

it("marks a deferred occurrence overdue when the page returns from a long hide", async () => {
  const previousVisibility = document.visibilityState
  const hidden = Object.getOwnPropertyDescriptor(document, "visibilityState")
  const setVisibility = (value: "hidden" | "visible") => {
    Object.defineProperty(document, "visibilityState", {
      configurable: true,
      value,
    })
    document.dispatchEvent(new Event("visibilitychange"))
  }

  try {
    render(
      <AppShell notificationSchedules={[exactSchedule("hidden", 7 * 60 * 60_000)]}>
        <div>content</div>
      </AppShell>
    )
    setVisibility("hidden")
    vi.setSystemTime(T0 + 7 * 60 * 60_000 + 60_000)

    await act(async () => {
      setVisibility("visible")
      await Promise.resolve()
    })

    expect(screen.getByRole("alert")).toHaveTextContent("Callback overdue")
    expect(getSharedScheduler().getScheduled()[0]?.status).toBe("missed")
  } finally {
    if (hidden) Object.defineProperty(document, "visibilityState", hidden)
    else Object.defineProperty(document, "visibilityState", { value: previousVisibility })
  }
})
