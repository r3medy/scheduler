import { render } from "@testing-library/react"
import { beforeEach, expect, it, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  listen: vi.fn(),
  clear: vi.fn(),
}))

vi.mock("@/lib/notifications/dedupe", () => ({
  listenForSignOut: mocks.listen,
}))
vi.mock("@/lib/notifications/sync", () => ({
  clearAllNotificationState: mocks.clear,
}))

import { NotificationAuthLifecycle } from "@/components/notifications/notification-auth-lifecycle"

beforeEach(() => {
  vi.resetAllMocks()
  mocks.listen.mockReturnValue(vi.fn())
})

it("keeps sign-out cleanup mounted outside route loading boundaries", () => {
  const unsubscribe = vi.fn()
  mocks.listen.mockReturnValueOnce(unsubscribe)
  const { unmount } = render(<NotificationAuthLifecycle />)

  expect(mocks.listen).toHaveBeenCalledWith(mocks.clear)
  const onSignOut = mocks.listen.mock.calls[0]?.[0] as () => void
  onSignOut()
  expect(mocks.clear).toHaveBeenCalledOnce()

  unmount()
  expect(unsubscribe).toHaveBeenCalledOnce()
})
