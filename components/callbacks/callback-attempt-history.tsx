import type { CallbackAttemptRecord } from "@/lib/callbacks/get-callback"

function formatAttemptDate(value: string) {
  return new Date(value).toLocaleString("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Africa/Cairo",
  })
}

function priorSchedule(attempt: CallbackAttemptRecord) {
  if (!attempt.caused_rescheduling || !attempt.prior_schedule_mode) return null
  if (attempt.prior_schedule_mode === "exact" && attempt.prior_scheduled_at)
    return `Previously scheduled for ${formatAttemptDate(attempt.prior_scheduled_at)}`
  if (
    attempt.prior_schedule_mode === "window" &&
    attempt.prior_window_start_at &&
    attempt.prior_window_end_at
  )
    return `Previous window: ${formatAttemptDate(attempt.prior_window_start_at)} – ${formatAttemptDate(attempt.prior_window_end_at)}`
  return null
}

export function CallbackAttemptHistory({
  attempts,
}: {
  attempts: CallbackAttemptRecord[]
}) {
  return (
    <section aria-label="Attempt history" className="mt-6 border-t pt-6">
      <h3 className="font-medium">Attempt history</h3>
      {attempts.length === 0 ? (
        <p className="mt-2 text-sm text-muted-foreground">
          No unsuccessful attempts recorded.
        </p>
      ) : (
        <ol className="mt-3 flex flex-col gap-3">
          {attempts.map((attempt) => {
            const prior = priorSchedule(attempt)
            return (
              <li key={attempt.id} className="rounded-md border p-3 text-sm">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="font-medium">
                    {attempt.outcome === "voicemail"
                      ? "Voicemail"
                      : "No answer"}
                  </p>
                  <time
                    dateTime={attempt.attempted_at}
                    className="text-xs text-muted-foreground tabular-nums"
                  >
                    {formatAttemptDate(attempt.attempted_at)}
                  </time>
                </div>
                <p className="mt-1 text-xs text-muted-foreground">
                  {attempt.caused_rescheduling
                    ? "Callback rescheduled"
                    : "Callback closed after this attempt"}
                </p>
                {prior && <p className="mt-2 text-xs">{prior}</p>}
                {attempt.note && (
                  <p className="mt-2 break-words whitespace-pre-wrap">
                    {attempt.note}
                  </p>
                )}
              </li>
            )
          })}
        </ol>
      )}
    </section>
  )
}
