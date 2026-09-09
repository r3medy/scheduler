import { beforeEach, expect, it, vi } from "vitest"

const state = vi.hoisted(() => ({
  requireAuth: vi.fn(),
  calendar: vi.fn(),
  overdue: vi.fn(),
  workload: vi.fn(),
  notifications: vi.fn(),
}))

vi.mock("server-only", () => ({}))
vi.mock("next/navigation", () => ({
  usePathname: () => "/",
  useRouter: () => ({ refresh: vi.fn() }),
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
    <a href={href} {...props}>
      {children}
    </a>
  ),
}))
vi.mock("@/lib/callbacks/require-auth", () => ({
  requireAuth: state.requireAuth,
}))
vi.mock("@/lib/callbacks/get-calendar-callbacks", () => ({
  getCalendarCallbacks: state.calendar,
  getOverdueCallbacks: state.overdue,
}))
vi.mock("@/lib/callbacks/get-workload-summary", () => ({
  getWorkloadSummary: state.workload,
}))
vi.mock("@/lib/notifications/get-open-notification-schedules", () => ({
  getOpenNotificationSchedules: state.notifications,
}))

import { loadHomePageData } from "@/app/page"

const range = {
  startDate: "2026-09-05",
  endDateExclusive: "2026-09-12",
}

beforeEach(() => {
  vi.resetAllMocks()
  const gate = {
    status: "ok" as const,
    user: { id: "owner" },
    supabase: {},
  }
  state.requireAuth.mockResolvedValue(gate)
  state.calendar.mockResolvedValue({ status: "success", markers: [] })
  state.overdue.mockResolvedValue({ status: "success", markers: [] })
  state.workload.mockResolvedValue({
    status: "success",
    open: [],
    closedAts: [],
  })
  state.notifications.mockResolvedValue({ status: "success", schedules: [] })
})

it("shares one authenticated gate across the initial home data reads", async () => {
  await loadHomePageData(range)

  expect(state.requireAuth).toHaveBeenCalledTimes(1)
  const gate = state.requireAuth.mock.results[0]?.value
  expect(state.calendar).toHaveBeenCalledWith(range, await gate)
  expect(state.overdue).toHaveBeenCalledWith(expect.any(Date), await gate)
  expect(state.workload).toHaveBeenCalledWith(await gate)
  expect(state.notifications).toHaveBeenCalledWith(await gate)
})
