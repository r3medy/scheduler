import Link from "next/link"
import { AppShell } from "@/components/app-shell"
import {
  IconAlertTriangle,
  IconDatabaseCog,
  IconLogin,
} from "@tabler/icons-react"

import { CallbackWorkspace } from "@/components/callbacks/callback-workspace"
import { buttonVariants } from "@/components/ui/button-variants"
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty"
import { getCalendarCallbacks } from "@/lib/callbacks/get-calendar-callbacks"
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

export default async function Page({ searchParams }: PageProps) {
  const parameters = await searchParams
  const view = normalizeCalendarView(firstValue(parameters.view))
  const focusedDate = normalizeDateKey(firstValue(parameters.date))
  const range = getCalendarRange(view, focusedDate)
  const result = await getCalendarCallbacks(range)
  const retryHref = `/?view=${view}&date=${focusedDate}`

  return (
    <AppShell>
      <main
        id="main-content"
        className="min-h-dvh bg-background p-4 sm:p-6 lg:p-8"
      >
        <div className="mx-auto w-full max-w-[1600px]">
          {result.status === "success" ? (
            <CallbackWorkspace
              focusedDate={focusedDate}
              view={view}
              markers={result.markers}
            />
          ) : (
            <CalendarPageState result={result} retryHref={retryHref} />
          )}
        </div>
      </main>
    </AppShell>
  )
}
