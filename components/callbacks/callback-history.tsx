"use client"

import Link from "next/link"
import { useSyncExternalStore, useState } from "react"
import { useRouter } from "next/navigation"
import { IconArrowUpRight, IconHistory } from "@tabler/icons-react"
import { CallbackDetailsDialog } from "@/components/callbacks/callback-details-dialog"
import { NewCallbackDialog } from "@/components/callbacks/new-callback-dialog"
import { buttonVariants } from "@/components/ui/button-variants"
import {
  Empty,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
  EmptyDescription,
} from "@/components/ui/empty"
import { Skeleton } from "@/components/ui/skeleton"
import {
  HISTORY_OUTCOMES,
  HISTORY_PAGE_SIZE,
  type HistoryOutcome,
  type HistoryResult,
} from "@/lib/callbacks/presentation"

const HISTORY_COUNT_KEYS: readonly (HistoryOutcome | "all")[] = [
  "all",
  ...(Object.keys(HISTORY_OUTCOMES) as HistoryOutcome[]),
]

const subscribe = () => () => undefined
function LocalDate({ value }: { value: string | null }) {
  const hydrated = useSyncExternalStore(
    subscribe,
    () => true,
    () => false
  )
  if (!value) return <span>—</span>
  if (!hydrated) return <Skeleton className="h-4 w-32" />
  return (
    <time dateTime={value}>
      {new Date(value).toLocaleString("en-US", {
        dateStyle: "medium",
        timeStyle: "short",
        timeZone: "Africa/Cairo",
      })}
    </time>
  )
}
export function CallbackHistory({
  result,
  outcome,
}: {
  result: Extract<HistoryResult, { status: "success" }>
  outcome?: HistoryOutcome
}) {
  const router = useRouter()
  const [saved, setSaved] = useState(false)
  const { counts, rows, page, total } = result
  const href = (next: number) =>
    `/history?page=${next}${outcome ? `&outcome=${outcome}` : ""}`
  return (
    <div className="flex flex-col gap-8">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex flex-col gap-2">
          <h1 className="text-2xl font-semibold tracking-tight">
            Callback history
          </h1>
          <p className="text-sm text-muted-foreground">
            Closed callbacks and the outcomes you recorded.
          </p>
        </div>
        <NewCallbackDialog
          onOpen={() => setSaved(false)}
          onSaved={() => setSaved(true)}
        />
      </header>
      {saved && (
        <p role="status" className="text-sm text-primary">
          Callback saved.
        </p>
      )}
      <section
        aria-label="All-time callback counts"
        className="grid grid-cols-2 gap-y-6 border-y py-6 lg:grid-cols-4"
      >
        {HISTORY_COUNT_KEYS.map((key, i) => (
          <div key={key} className={i ? "border-l px-6" : "pr-6"}>
            <p className="text-sm text-muted-foreground">
              {key === "all" ? "Closed callbacks" : HISTORY_OUTCOMES[key]}
            </p>
            <p className="mt-2 text-3xl font-semibold tabular-nums">
              {counts[key].toLocaleString()}
            </p>
          </div>
        ))}
      </section>
      <section aria-label="Closed callbacks" className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="font-semibold">
            Records{" "}
            <span className="ml-2 text-sm font-normal text-muted-foreground">
              {total.toLocaleString()}
            </span>
          </h2>
          <div className="flex items-center gap-2">
            <label
              htmlFor="history-outcome"
              className="text-sm text-muted-foreground"
            >
              Outcome
            </label>
            <select
              id="history-outcome"
              value={outcome ?? "all"}
              onChange={(event) =>
                router.push(
                  event.target.value === "all"
                    ? "/history"
                    : `/history?outcome=${event.target.value}`
                )
              }
              className="h-9 rounded-md border bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <option value="all">All outcomes</option>
              {Object.entries(HISTORY_OUTCOMES).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </div>
        </div>
        {rows.length ? (
          <div className="overflow-x-auto rounded-lg border">
            <table className="w-full min-w-[640px] text-left text-sm">
              <thead className="border-b bg-muted/30 text-xs text-muted-foreground">
                <tr>
                  <th className="px-4 py-3 font-medium">Customer</th>
                  <th className="px-4 py-3 font-medium">Scheduled for</th>
                  <th className="px-4 py-3 font-medium">Closed</th>
                  <th className="px-4 py-3 font-medium">Outcome</th>
                  <th className="px-4 py-3">
                    <span className="sr-only">Details</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr
                    key={row.id}
                    className="border-b last:border-0 hover:bg-muted/20"
                  >
                    <td className="px-4 py-4">
                      <p className="font-medium">{row.account_holder_name}</p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {row.accountReference}
                      </p>
                    </td>
                    <td className="px-4 py-4 text-xs tabular-nums">
                      <LocalDate
                        value={row.scheduled_at ?? row.window_start_at}
                      />
                      {row.schedule_mode === "window" && (
                        <span className="mt-1 block text-muted-foreground">
                          to <LocalDate value={row.window_end_at} />
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-4 text-xs tabular-nums">
                      <LocalDate value={row.closed_at} />
                    </td>
                    <td className="px-4 py-4">
                      {row.resolution_outcome
                        ? HISTORY_OUTCOMES[row.resolution_outcome]
                        : "Closed"}
                    </td>
                    <td className="px-4 py-4">
                      <CallbackDetailsDialog
                        callbackId={row.id}
                        className={buttonVariants({
                          variant: "ghost",
                          size: "icon",
                        })}
                        aria-label={`View callback for ${row.account_holder_name}`}
                        title="View callback"
                      >
                        <IconArrowUpRight aria-hidden="true" />
                      </CallbackDetailsDialog>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <Empty className="min-h-64 border">
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <IconHistory />
              </EmptyMedia>
              <EmptyTitle className="font-sans">
                {outcome
                  ? "No callbacks with this outcome"
                  : "No closed callbacks yet"}
              </EmptyTitle>
              <EmptyDescription>
                {outcome
                  ? "Choose another outcome to see more records."
                  : "Callbacks appear here when you record an outcome and close them."}
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        )}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="max-w-prose text-xs text-muted-foreground">
            All-time counts include existing records only. Outcomes are
            agent-reported; deleted callbacks are excluded.
          </p>
          {total > HISTORY_PAGE_SIZE && (
            <nav aria-label="History pages" className="flex items-center gap-3">
              {page > 1 && (
                <Link
                  href={href(page - 1)}
                  className={buttonVariants({ variant: "outline", size: "sm" })}
                >
                  Previous
                </Link>
              )}
              <span className="text-xs tabular-nums">
                Page {page} of {Math.ceil(total / HISTORY_PAGE_SIZE)}
              </span>
              {page * HISTORY_PAGE_SIZE < total && (
                <Link
                  href={href(page + 1)}
                  className={buttonVariants({ variant: "outline", size: "sm" })}
                >
                  Next
                </Link>
              )}
            </nav>
          )}
        </div>
      </section>
    </div>
  )
}
