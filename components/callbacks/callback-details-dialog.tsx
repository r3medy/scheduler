"use client"

import {
  useEffect,
  useId,
  useRef,
  useState,
  type ComponentProps,
  type FormEvent,
  type RefObject,
} from "react"
import { IconX } from "@tabler/icons-react"
import { useRouter } from "next/navigation"
import { deleteCallback } from "@/lib/callbacks/delete-callback"
import { updateCallbackStatus } from "@/lib/callbacks/update-status"
import { ATTEMPT_NOTE_MAX_LENGTH } from "@/lib/callbacks/limits"
import { nextScheduleMinute } from "@/lib/callbacks/local-date"
import { CallbackAttemptHistory } from "@/components/callbacks/callback-attempt-history"
import { ScheduleDateTime } from "@/components/callbacks/schedule-date-time"
import {
  getCallback,
  type CallbackDetailResult,
  type CallbackRecord,
} from "@/lib/callbacks/get-callback"
import { NewCallbackDialog } from "@/components/callbacks/new-callback-dialog"
import { Button } from "@/components/ui/button"
import { Field, FieldError, FieldLabel } from "@/components/ui/field"
import { Textarea } from "@/components/ui/textarea"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import {
  Dialog,
  DialogTrigger,
  DialogContent,
  DialogTitle,
  DialogDescription,
  DialogClose,
} from "@/components/ui/dialog"

function formatCallbackDate(date: string) {
  return new Date(date).toLocaleString("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Africa/Cairo",
  })
}

type UnsuccessfulOutcome = "voicemail" | "no_answer"

function CallbackOutcomeForm({
  callback,
  onSaved,
}: {
  callback: CallbackRecord
  onSaved: () => void
}) {
  const id = useId()
  const current =
    callback.lifecycle_state === "open"
      ? "open"
      : (callback.resolution_outcome ?? "reached")
  const [value, setValue] = useState(current)
  const [attemptAction, setAttemptAction] = useState<"close" | "reschedule">(
    "close"
  )
  const [mode, setMode] = useState<"exact" | "window">("exact")
  const [note, setNote] = useState("")
  const [minimum, setMinimum] = useState(nextScheduleMinute)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [errorField, setErrorField] = useState<string | null>(null)
  const formRef = useRef<HTMLFormElement>(null)
  const submitting = useRef(false)
  const unsuccessful =
    callback.lifecycle_state === "open" &&
    (value === "voicemail" || value === "no_answer")

  useEffect(() => {
    if (!unsuccessful || attemptAction !== "reschedule") return
    const timer = setInterval(() => setMinimum(nextScheduleMinute()), 1000)
    return () => clearInterval(timer)
  }, [attemptAction, unsuccessful])

  function focusField(field?: string) {
    if (!field) return
    const scheduleField =
      field === "scheduled_at" ||
      field === "window_start_at" ||
      field === "window_end_at"
    const target = scheduleField
      ? document.getElementById(`${id}-${field}`)
      : formRef.current?.elements.namedItem(field)
    if (target instanceof HTMLElement)
      requestAnimationFrame(() => target.focus())
  }

  async function change(next: string) {
    if (submitting.current || next === current) {
      setValue(current)
      return
    }
    setValue(next)
    setError(null)
    setErrorField(null)
    if (next === "voicemail" || next === "no_answer") {
      setAttemptAction("close")
      return
    }
    if (next !== "open" && next !== "reached") return
    submitting.current = true
    setPending(true)
    try {
      const result = await updateCallbackStatus(callback.id, next)
      if (result.status === "success") onSaved()
      else {
        setValue(current)
        setError(result.message)
      }
    } catch {
      setValue(current)
      setError(
        "Could not confirm the status change. Check your connection and reload."
      )
    } finally {
      submitting.current = false
      setPending(false)
    }
  }

  async function submitAttempt(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (submitting.current || !unsuccessful) return
    const data = new FormData(event.currentTarget)
    data.set("outcome", value as UnsuccessfulOutcome)
    data.set("attempt_action", attemptAction)
    data.set("note", note)
    if (attemptAction === "reschedule") {
      data.set("schedule_mode", mode)
      const fields =
        mode === "exact"
          ? ["scheduled_at"]
          : ["window_start_at", "window_end_at"]
      for (const field of fields) {
        const date = new Date(String(data.get(field)))
        if (!Number.isFinite(date.getTime()) || date.getTime() <= Date.now()) {
          setError("Choose a future date and time.")
          setErrorField(field)
          focusField(field)
          return
        }
        data.set(field, date.toISOString())
      }
      if (
        mode === "window" &&
        Date.parse(String(data.get("window_end_at"))) <=
          Date.parse(String(data.get("window_start_at")))
      ) {
        setError("Window end must be later than window start.")
        setErrorField("window_end_at")
        focusField("window_end_at")
        return
      }
    }
    submitting.current = true
    setPending(true)
    setError(null)
    setErrorField(null)
    try {
      const result = await updateCallbackStatus(callback.id, data)
      if (result.status === "success") onSaved()
      else {
        setError(result.message)
        setErrorField(result.field ?? null)
        focusField(result.field)
      }
    } catch {
      setError(
        "Could not confirm the outcome. Check your connection and reload."
      )
    } finally {
      submitting.current = false
      setPending(false)
    }
  }

  return (
    <div className="flex flex-col gap-2 text-sm">
      <label htmlFor={`${id}-status`} className="text-muted-foreground">
        Status
      </label>
      <select
        id={`${id}-status`}
        value={value}
        disabled={pending}
        onChange={(event) => void change(event.target.value)}
        aria-describedby={unsuccessful ? undefined : `${id}-feedback`}
        className="h-10 w-full rounded-md border border-input bg-popover px-3 text-popover-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
      >
        <option value="open">Open</option>
        {callback.lifecycle_state === "open" ? (
          <optgroup label="Record outcome">
            <option value="reached">Completed — customer reached</option>
            <option value="voicemail">Voicemail</option>
            <option value="no_answer">No answer</option>
          </optgroup>
        ) : (
          <option value={current} disabled>
            Closed — {current === "no_answer" ? "no answer" : current}
          </option>
        )}
      </select>
      {!unsuccessful && (
        <p
          id={`${id}-feedback`}
          role={error ? "alert" : "status"}
          className={error ? "text-destructive" : "text-muted-foreground"}
        >
          {error ??
            (pending
              ? "Saving status…"
              : callback.lifecycle_state === "open"
                ? "Due and overdue states are calculated from the schedule."
                : "Reopen the callback to make it actionable again.")}
        </p>
      )}
      {unsuccessful && (
        <form
          ref={formRef}
          onSubmit={submitAttempt}
          aria-busy={pending}
          className="mt-2 rounded-md border p-4"
        >
          <fieldset disabled={pending} className="flex flex-col gap-4">
            <legend className="font-medium">
              {value === "voicemail" ? "Voicemail" : "No answer"}
            </legend>
            <div
              role="radiogroup"
              aria-label="What should happen next?"
              aria-describedby={
                errorField === "attempt_action" ? `${id}-feedback` : undefined
              }
              className="grid gap-2 sm:grid-cols-2"
            >
              {(["close", "reschedule"] as const).map((choice) => (
                <label
                  key={choice}
                  className="flex cursor-pointer items-start gap-2 rounded-md border p-3 has-checked:border-primary"
                >
                  <input
                    type="radio"
                    name="attempt_action"
                    value={choice}
                    checked={attemptAction === choice}
                    onChange={() => {
                      setAttemptAction(choice)
                      setError(null)
                      setErrorField(null)
                      if (choice === "reschedule")
                        setMinimum(nextScheduleMinute())
                    }}
                  />
                  <span>
                    <span className="block font-medium">
                      {choice === "close" ? "Close" : "Reschedule"}
                    </span>
                    <span className="mt-1 block text-xs text-muted-foreground">
                      {choice === "close"
                        ? "Record the final outcome and close this callback."
                        : "Keep this callback open with a new schedule."}
                    </span>
                  </span>
                </label>
              ))}
            </div>
            <Field data-invalid={errorField === "note"}>
              <FieldLabel htmlFor={`${id}-note`}>
                Attempt note (optional)
              </FieldLabel>
              <Textarea
                id={`${id}-note`}
                name="note"
                value={note}
                maxLength={ATTEMPT_NOTE_MAX_LENGTH}
                aria-invalid={errorField === "note"}
                aria-describedby={
                  errorField === "note" ? `${id}-feedback` : undefined
                }
                onChange={(event) => {
                  setNote(event.target.value)
                  setError(null)
                  setErrorField(null)
                }}
              />
            </Field>
            {attemptAction === "reschedule" && (
              <>
                <Field data-invalid={errorField === "schedule_mode"}>
                  <FieldLabel id={`${id}-schedule-mode`}>
                    New scheduling mode
                  </FieldLabel>
                  <ToggleGroup
                    aria-labelledby={`${id}-schedule-mode`}
                    aria-describedby={
                      errorField === "schedule_mode"
                        ? `${id}-feedback`
                        : undefined
                    }
                    value={[mode]}
                    onValueChange={(values) => {
                      if (values[0] === "exact" || values[0] === "window") {
                        setMode(values[0])
                        setError(null)
                        setErrorField(null)
                      }
                    }}
                  >
                    <ToggleGroupItem value="exact">Exact time</ToggleGroupItem>
                    <ToggleGroupItem value="window">
                      Time window
                    </ToggleGroupItem>
                  </ToggleGroup>
                </Field>
                {mode === "exact" ? (
                  <Field data-invalid={errorField === "scheduled_at"}>
                    <FieldLabel htmlFor={`${id}-scheduled_at`}>
                      New date and time
                    </FieldLabel>
                    <ScheduleDateTime
                      id={`${id}-scheduled_at`}
                      name="scheduled_at"
                      label="New date and time"
                      minimum={minimum}
                      invalid={errorField === "scheduled_at"}
                      describedBy={
                        errorField === "scheduled_at"
                          ? `${id}-feedback`
                          : undefined
                      }
                      onChange={() => {
                        setError(null)
                        setErrorField(null)
                      }}
                    />
                  </Field>
                ) : (
                  <div className="grid gap-4 sm:grid-cols-2">
                    {(["window_start_at", "window_end_at"] as const).map(
                      (field) => {
                        const label =
                          field === "window_start_at"
                            ? "New window start"
                            : "New window end"
                        return (
                          <Field
                            key={field}
                            data-invalid={errorField === field}
                          >
                            <FieldLabel htmlFor={`${id}-${field}`}>
                              {label}
                            </FieldLabel>
                            <ScheduleDateTime
                              id={`${id}-${field}`}
                              name={field}
                              label={label}
                              minimum={minimum}
                              invalid={errorField === field}
                              describedBy={
                                errorField === field
                                  ? `${id}-feedback`
                                  : undefined
                              }
                              onChange={() => {
                                setError(null)
                                setErrorField(null)
                              }}
                            />
                          </Field>
                        )
                      }
                    )}
                  </div>
                )}
              </>
            )}
            {error && <FieldError id={`${id}-feedback`}>{error}</FieldError>}
            <div className="flex justify-end">
              <Button type="submit" disabled={pending} className="min-w-36">
                {pending
                  ? "Saving…"
                  : attemptAction === "close"
                    ? "Close callback"
                    : "Record and reschedule"}
              </Button>
            </div>
          </fieldset>
        </form>
      )}
    </div>
  )
}

function DetailsContent({
  result,
  callback,
  onRetry,
  onStatusSaved,
}: {
  result: CallbackDetailResult | null
  callback: CallbackRecord | null
  onRetry: () => void
  onStatusSaved: () => void
}) {
  if (!result) return <p role="status">Loading callback…</p>
  if (result.status === "error")
    return (
      <div className="flex flex-col gap-4">
        <p role="alert">{result.message}</p>
        <Button variant="outline" onClick={onRetry}>
          Try again
        </Button>
      </div>
    )
  if (!callback) return null
  return (
    <>
      <dl className="grid gap-4 text-sm">
        {[
          ["Account-holder name", callback.account_holder_name],
          ["Callback phone number", callback.phone_number],
          ["Account number", callback.account_number],
          [
            "Schedule",
            callback.schedule_mode === "exact"
              ? formatCallbackDate(callback.scheduled_at!)
              : `${formatCallbackDate(callback.window_start_at!)} – ${formatCallbackDate(callback.window_end_at!)}`,
          ],
          [
            "Additional comments",
            callback.comments || "No additional comments.",
          ],
        ].map(([label, value]) => (
          <div key={label} className="flex flex-col gap-1">
            <dt className="text-muted-foreground">{label}</dt>
            <dd className="break-words whitespace-pre-wrap">{value}</dd>
          </div>
        ))}
      </dl>
      <div className="mt-4">
        <CallbackOutcomeForm
          key={`${callback.id}-${callback.updated_at}`}
          callback={callback}
          onSaved={onStatusSaved}
        />
      </div>
      <CallbackAttemptHistory attempts={result.attempts} />
    </>
  )
}

function DetailsFooter({
  confirmDelete,
  deleting,
  canDelete,
  cancelRef,
  deleteRef,
  onCancelDelete,
  onRequestDelete,
  onConfirmDelete,
}: {
  confirmDelete: boolean
  deleting: boolean
  canDelete: boolean
  cancelRef: RefObject<HTMLButtonElement | null>
  deleteRef: RefObject<HTMLButtonElement | null>
  onCancelDelete: () => void
  onRequestDelete: () => void
  onConfirmDelete: () => void
}) {
  if (confirmDelete)
    return (
      <>
        <Button
          ref={cancelRef}
          variant="outline"
          disabled={deleting}
          onClick={onCancelDelete}
        >
          Cancel
        </Button>
        <Button
          variant="destructive"
          disabled={deleting}
          onClick={onConfirmDelete}
        >
          {deleting ? "Deleting…" : "Delete callback"}
        </Button>
      </>
    )
  return (
    <Button
      ref={deleteRef}
      variant="destructive"
      disabled={!canDelete}
      onClick={onRequestDelete}
    >
      Delete callback
    </Button>
  )
}

export function CallbackDetailsDialog({
  callbackId,
  ...triggerProps
}: ComponentProps<"button"> & { callbackId: string }) {
  const [result, setResult] = useState<CallbackDetailResult | null>(null)
  const [open, setOpen] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [deleteError, setDeleteError] = useState<string | null>(null)
  const cancelRef = useRef<HTMLButtonElement>(null)
  const deleteRef = useRef<HTMLButtonElement>(null)
  const deletingRef = useRef(false)
  const request = useRef(0)
  const router = useRouter()
  async function remove() {
    if (deletingRef.current) return
    deletingRef.current = true
    setDeleting(true)
    setDeleteError(null)
    try {
      const outcome = await deleteCallback(callbackId)
      if (outcome.status === "success") {
        setOpen(false)
        request.current++
        setResult(null)
        router.refresh()
      } else setDeleteError(outcome.message)
    } catch {
      setDeleteError(
        "Could not confirm deletion. Check your connection and reload before trying again."
      )
    } finally {
      deletingRef.current = false
      setDeleting(false)
    }
  }
  async function load() {
    const current = ++request.current
    setResult(null)
    try {
      const next = await getCallback(callbackId)
      if (current === request.current) setResult(next)
    } catch {
      if (current === request.current)
        setResult({
          status: "error",
          message: "Could not load the callback. Please try again.",
        })
    }
  }
  const callback = result?.status === "success" ? result.callback : null
  return (
    <Dialog
      open={open}
      onOpenChange={(open, event) => {
        if (deletingRef.current) {
          event.cancel()
          return
        }
        setOpen(open)
        setConfirmDelete(false)
        setDeleteError(null)
        if (open) void load()
        else {
          request.current++
          setResult(null)
        }
      }}
    >
      <DialogTrigger {...triggerProps} type="button" />
      <DialogContent role={confirmDelete ? "alertdialog" : "dialog"}>
        <div
          className={`flex items-center justify-between gap-4 p-6 ${confirmDelete ? "" : "border-b"}`}
        >
          <div className="flex flex-col gap-2">
            <DialogTitle>
              {confirmDelete ? "Delete callback?" : "Callback details"}
            </DialogTitle>
            <DialogDescription>
              {confirmDelete
                ? "This permanently deletes the callback and any associated attempt history. This cannot be undone."
                : "Customer information and scheduled callback time."}
            </DialogDescription>
          </div>
          <div className="flex shrink-0 items-center gap-1">
            {callback && !confirmDelete && (
              <NewCallbackDialog
                callback={callback}
                onOpen={() => {}}
                onSaved={() => {
                  void load()
                }}
              />
            )}
            <DialogClose
              render={
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  aria-label="Close callback details"
                  title="Close"
                  disabled={deleting}
                />
              }
            >
              <IconX aria-hidden="true" />
            </DialogClose>
          </div>
        </div>
        {confirmDelete ? (
          deleteError && (
            <div className="px-6 pb-6">
              <p role="alert" className="text-sm text-destructive">
                {deleteError}
              </p>
            </div>
          )
        ) : (
          <div className="overflow-y-auto p-6">
            <DetailsContent
              result={result}
              callback={callback}
              onRetry={() => void load()}
              onStatusSaved={() => {
                setOpen(false)
                request.current++
                setResult(null)
                router.refresh()
              }}
            />
            {deleteError && (
              <p role="alert" className="text-sm text-destructive">
                {deleteError}
              </p>
            )}
          </div>
        )}
        <div className="flex justify-end gap-2 border-t p-4">
          <DetailsFooter
            confirmDelete={confirmDelete}
            deleting={deleting}
            canDelete={callback !== null}
            cancelRef={cancelRef}
            deleteRef={deleteRef}
            onCancelDelete={() => {
              setConfirmDelete(false)
              setDeleteError(null)
            }}
            onRequestDelete={() => {
              setConfirmDelete(true)
              requestAnimationFrame(() => cancelRef.current?.focus())
            }}
            onConfirmDelete={() => void remove()}
          />
        </div>
      </DialogContent>
    </Dialog>
  )
}
