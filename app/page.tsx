import Link from "next/link"
import type { Metadata } from "next"
import { AppShell } from "@/components/app-shell"
import {
  IconAlertTriangle,
  IconDatabaseCog,
  IconLogin,
} from "@tabler/icons-react"

import { CallbackWorkspace } from "@/components/callbacks/callback-workspace"
import { WorkloadSummary } from "@/components/callbacks/workload-summary"
import { buttonVariants } from "@/components/ui/button-variants"
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty"
import {
  getCalendarCallbacks,
  getOverdueCallbacks,
} from "@/lib/callbacks/get-calendar-callbacks"
import { getWorkloadSummary } from "@/lib/callbacks/get-workload-summary"
import { getOpenNotificationSchedules } from "@/lib/notifications/get-open-notification-schedules"
import { requireAuth } from "@/lib/callbacks/require-auth"
import {
  getCalendarRange,
  normalizeCalendarView,
  normalizeDateKey,
} from "@/lib/calendar/date-utils"
import type { CalendarLoadResult } from "@/lib/calendar/types"

interface PageProps {
  searchParams: Promise<{
    date?: string | string[]
    view?: string | string[]
  }>
}

export const metadata: Metadata = {
  title: "Home",
  description:
    "Your private Scheduler workspace for upcoming and overdue callbacks.",
  robots: {
    index: false,
    follow: false,
  },
}

function firstValue(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value
}

interface CalendarPageStateProps {
  result: Exclude<CalendarLoadResult, { status: "success" }>
  retryHref: string
}

function CalendarPageState({ result, retryHref }: CalendarPageStateProps) {
  if (result.status === "configuration-error") {
    return (
      <Empty className="min-h-[520px] border bg-background">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <IconDatabaseCog aria-hidden="true" />
          </EmptyMedia>
          <EmptyTitle className="font-sans tracking-normal">
            Connect Supabase
          </EmptyTitle>
          <EmptyDescription>
            Add `NEXT_PUBLIC_SUPABASE_URL` and
            `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` to your local environment.
            The calendar never substitutes sample callbacks when configuration
            is missing.
          </EmptyDescription>
        </EmptyHeader>
        <EmptyContent>
          <a
            className={buttonVariants({ variant: "outline" })}
            href="https://supabase.com/dashboard"
            target="_blank"
            rel="noreferrer"
          >
            Open Supabase dashboard
          </a>
        </EmptyContent>
      </Empty>
    )
  }

  if (result.status === "unauthenticated") {
    return (
      <Empty className="min-h-[520px] border bg-background">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <IconLogin aria-hidden="true" />
          </EmptyMedia>
          <EmptyTitle className="font-sans tracking-normal">
            Sign in to view callbacks
          </EmptyTitle>
          <EmptyDescription>
            Callback data is private and only loads for the authenticated agent.
          </EmptyDescription>
        </EmptyHeader>
        <EmptyContent>
          <Link className={buttonVariants()} href="/sign-in">
            Sign in
          </Link>
        </EmptyContent>
      </Empty>
    )
  }

  return (
    <Empty className="min-h-[520px] border bg-background">
      <EmptyHeader>
        <EmptyMedia variant="icon">
          <IconAlertTriangle aria-hidden="true" />
        </EmptyMedia>
        <EmptyTitle className="font-sans tracking-normal">
          Calendar unavailable
        </EmptyTitle>
        <EmptyDescription>
          Your callback data was not changed. Check the connection and try
          loading this period again.
        </EmptyDescription>
      </EmptyHeader>
      <EmptyContent>
        <a className={buttonVariants({ variant: "outline" })} href={retryHref}>
          Try again
        </a>
      </EmptyContent>
    </Empty>
  )
}

export function AuxiliaryDataWarnings({
  overdueUnavailable,
  retryHref,
}: {
  overdueUnavailable: boolean
  retryHref: string
}) {
  if (!overdueUnavailable) return null
  return (
    <p
      role="status"
      aria-live="polite"
      className="rounded-lg border border-destructive/40 bg-destructive/5 px-4 py-3 text-sm text-foreground"
    >
      Overdue callbacks could not be loaded, so the Up next list may be
      incomplete. <a className="underline" href={retryHref}>Try again</a>.
    </p>
  )
}

/**
 * Authenticate once for the home render, then share that gate with every
 * owner-scoped read. Each projection remains a separate query because the
 * calendar, overdue, workload, and notification surfaces have different
 * ranges and privacy requirements.
 */
export async function loadHomePageData(range: ReturnType<typeof getCalendarRange>) {
  const authGate = await requireAuth()
  return Promise.all([
    getCalendarCallbacks(range, authGate),
    getOverdueCallbacks(new Date(), authGate),
    getWorkloadSummary(authGate),
    getOpenNotificationSchedules(authGate),
  ])
}

export default async function Page({ searchParams }: PageProps) {
  const parameters = await searchParams
  const view = normalizeCalendarView(firstValue(parameters.view))
  const focusedDate = normalizeDateKey(firstValue(parameters.date))
  const range = getCalendarRange(view, focusedDate)
  const [result, overdueResult, workload, notificationResult] =
    await loadHomePageData(range)
  const retryHref = `/?view=${view}&date=${focusedDate}`

  return (
    <AppShell
      notificationSchedules={
        notificationResult.status === "success"
          ? notificationResult.schedules
          : notificationResult.status === "unauthenticated"
            ? null
            : undefined
      }
    >
      <main
        id="main-content"
        className="min-h-dvh bg-background p-4 sm:p-6 lg:p-8"
      >
        <div className="mx-auto w-full max-w-[1600px]">
          {result.status === "success" ? (
            <div className="flex flex-col gap-6">
              {workload.status === "success" ? (
                <WorkloadSummary
                  open={workload.open}
                  closedAts={workload.closedAts}
                  retryHref={retryHref}
                />
              ) : (
                <WorkloadSummary
                  open={[]}
                  closedAts={[]}
                  retryHref={retryHref}
                  unavailable
                />
              )}
              <AuxiliaryDataWarnings
                overdueUnavailable={overdueResult.status !== "success"}
                retryHref={retryHref}
              />
              <CallbackWorkspace
                focusedDate={focusedDate}
                view={view}
                markers={result.markers}
                overdueMarkers={
                  overdueResult.status === "success"
                    ? overdueResult.markers
                    : undefined
                }
              />
            </div>
          ) : (
            <CalendarPageState result={result} retryHref={retryHref} />
          )}
        </div>
      </main>
    </AppShell>
  )
}
