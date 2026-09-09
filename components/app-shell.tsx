"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { IconHome, IconHistory } from "@tabler/icons-react"
import { FeedbackWidget } from "@/components/feedback/feedback-widget"
import { NotificationHost } from "@/components/notifications/notification-host"
import type { SchedulableCallback } from "@/lib/notifications/types"
import { SettingsDialog } from "@/components/settings-dialog"
import { Separator } from "@/components/ui/separator"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip"

export function AppShell({
  children,
  notificationSchedules,
}: {
  children: React.ReactNode
  /**
   * Complete owner-scoped schedules when the query succeeds. `null` is an
   * explicit unauthenticated state and clears the client registry; `undefined`
   * means the query failed and must not reconcile with partial data.
   */
  notificationSchedules?: SchedulableCallback[] | null
}) {
  const pathname = usePathname()
  return (
    <div className="min-h-dvh">
      <a
        href="#main-content"
        className="sr-only fixed top-2 left-2 z-50 rounded-md bg-primary p-3 text-primary-foreground focus:not-sr-only"
      >
        Skip to content
      </a>
      <aside className="app-rail" aria-label="Main navigation">
        <svg
          className="rail-shape"
          viewBox="0 0 88 460"
          preserveAspectRatio="none"
          aria-hidden="true"
        >
          <path
            transform="translate(88 0) scale(-1 1)"
            vectorEffect="non-scaling-stroke"
            d="M88 0 C88 38 71 49 40 55 C15 60 3.4 79 3.4 112 L3.4 348 C3.4 381 16 400 40 405 C70 411 88 422 88 460 Z"
          />
        </svg>
        <nav className="rail-links">
          {[
            { href: "/", label: "Home", icon: IconHome },
            { href: "/history", label: "Callback history", icon: IconHistory },
          ].map(({ href, label, icon: Icon }) => (
            <Tooltip key={href}>
              <TooltipTrigger
                render={
                  <Link
                    href={href}
                    className="rail-item"
                    aria-label={label}
                    aria-current={pathname === href ? "page" : undefined}
                  />
                }
              >
                <span className="rail-icon">
                  <Icon aria-hidden="true" />
                </span>
                <span>{href === "/history" ? "History" : label}</span>
              </TooltipTrigger>
              <TooltipContent side="right">{label}</TooltipContent>
            </Tooltip>
          ))}
          <Separator className="rail-divider" />
          <SettingsDialog />
        </nav>
      </aside>
      <div className="app-content">
        {notificationSchedules !== undefined ? (
          <NotificationHost schedules={notificationSchedules ?? []} />
        ) : null}
        {children}
      </div>
      <FeedbackWidget />
    </div>
  )
}
