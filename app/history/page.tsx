import Link from "next/link"
import { redirect } from "next/navigation"
import { AppShell } from "@/components/app-shell"
import { CallbackHistory } from "@/components/callbacks/callback-history"
import { getHistory } from "@/lib/callbacks/get-history"
import {
  HISTORY_OUTCOMES,
  type HistoryOutcome,
} from "@/lib/callbacks/presentation"
import {
  Empty,
  EmptyHeader,
  EmptyTitle,
  EmptyDescription,
  EmptyContent,
} from "@/components/ui/empty"
import { buttonVariants } from "@/components/ui/button-variants"

export default async function HistoryPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string; outcome?: string }>
}) {
  const params = await searchParams
  const page = Math.max(
    1,
    Math.min(1000000, Number.parseInt(params.page ?? "1", 10) || 1)
  )
  const outcome =
    params.outcome && Object.hasOwn(HISTORY_OUTCOMES, params.outcome)
      ? (params.outcome as HistoryOutcome)
      : undefined
  const result = await getHistory(page, outcome)
  if (result.status === "unauthenticated") redirect("/login")
  return (
    <AppShell>
      <main id="main-content" className="min-h-dvh p-4 sm:p-6 lg:p-8">
        <div className="mx-auto max-w-[1600px]">
          {result.status === "success" ? (
            <CallbackHistory result={result} outcome={outcome} />
          ) : (
            <Empty className="min-h-96 border">
              <EmptyHeader>
                <EmptyTitle className="font-sans">
                  History unavailable
                </EmptyTitle>
                <EmptyDescription>
                  Could not load your callback history. Check your connection
                  and try again.
                </EmptyDescription>
              </EmptyHeader>
              <EmptyContent>
                <Link
                  href="/history"
                  className={buttonVariants({ variant: "outline" })}
                >
                  Try again
                </Link>
                <Link href="/" className={buttonVariants({ variant: "ghost" })}>
                  Back to Home
                </Link>
              </EmptyContent>
            </Empty>
          )}
        </div>
      </main>
    </AppShell>
  )
}
