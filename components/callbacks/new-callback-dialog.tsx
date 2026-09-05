"use client"

import { useEffect, useRef, useState, type FormEvent } from "react"
import { useRouter } from "next/navigation"
import { IconPlus, IconPencil } from "@tabler/icons-react"
import type { CallbackRecord } from "@/lib/callbacks/get-callback"
import { nextScheduleMinute, toLocalDateTime } from "@/lib/callbacks/local-date"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import {
  Field,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import { ScheduleDateTime } from "@/components/callbacks/schedule-date-time"
import {
  createCallback,
  updateCallback,
  type CreateCallbackResult,
} from "@/lib/callbacks/create-callback"
import {
  ACCOUNT_HOLDER_NAME_MAX_LENGTH,
  ACCOUNT_NUMBER_MAX_LENGTH,
  COMMENTS_MAX_LENGTH,
  PHONE_NUMBER_MAX_LENGTH,
} from "@/lib/callbacks/limits"

const CALLBACK_INPUT_MAX_LENGTHS: Record<string, number> = {
  phone_number: PHONE_NUMBER_MAX_LENGTH,
  account_number: ACCOUNT_NUMBER_MAX_LENGTH,
  account_holder_name: ACCOUNT_HOLDER_NAME_MAX_LENGTH,
}

export function NewCallbackDialog({
  onSaved,
  onOpen,
  callback,
}: {
  onSaved: () => void
  onOpen: () => void
  callback?: CallbackRecord
}) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [mode, setMode] = useState<"exact" | "window">("exact")
  const [pending, setPending] = useState(false)
  const [result, setResult] = useState<CreateCallbackResult | null>(null)
  const submitting = useRef(false)
  const formRef = useRef<HTMLFormElement>(null)
  const [minimum, setMinimum] = useState(nextScheduleMinute)
  useEffect(() => {
    if (!open) return
    const timer = setInterval(() => setMinimum(nextScheduleMinute()), 1000)
    return () => clearInterval(timer)
  }, [open])

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (submitting.current) return
    const data = new FormData(event.currentTarget)
    data.set("schedule_mode", mode)
    data.set("allowConflict", String(result?.status === "conflict"))
    for (const field of mode === "exact"
      ? ["scheduled_at"]
      : ["window_start_at", "window_end_at"]) {
      const value = new Date(String(data.get(field)))
      if (!Number.isFinite(value.getTime()) || value.getTime() <= Date.now()) {
        setResult({
          status: "error",
          field,
          message: "Choose a future date and time.",
        })
        document.getElementById(`new-${field}`)?.focus()
        return
      }
      data.set(
        field,
        Number.isFinite(value.getTime()) ? value.toISOString() : ""
      )
    }
    submitting.current = true
    setPending(true)
    try {
      const next = await (callback
        ? updateCallback(callback.id, data)
        : createCallback(data))
      setResult(next)
      if (next.status === "success") {
        setOpen(false)
        onSaved()
        router.refresh()
      } else if (next.status === "error" && next.field) {
        const input = formRef.current?.elements.namedItem(next.field)
        if (input instanceof HTMLElement)
          requestAnimationFrame(() => input.focus())
      }
    } catch {
      setResult({
        status: "error",
        message:
          "The connection was interrupted. Check your connection and try again.",
      })
    } finally {
      submitting.current = false
      setPending(false)
    }
  }

  const error = (name: string) =>
    result?.status === "error" && result.field === name
      ? result.message
      : undefined
  function inputField(name: string, label: string, type = "text") {
    return (
      <Field key={name} data-invalid={!!error(name)}>
        <FieldLabel htmlFor={`new-${name}`}>{label}</FieldLabel>
        {type === "datetime-local" ? (
          <ScheduleDateTime
            id={`new-${name}`}
            name={name}
            label={label}
            minimum={minimum}
            defaultValue={
              callback?.[name as keyof CallbackRecord]
                ? toLocalDateTime(
                    String(callback[name as keyof CallbackRecord])
                  )
                : ""
            }
            invalid={!!error(name)}
            describedBy={error(name) ? `new-${name}-error` : undefined}
            onChange={() => setResult(null)}
          />
        ) : (
          <Input
            id={`new-${name}`}
            name={name}
            type={type}
            defaultValue={
              callback
                ? String(callback[name as keyof CallbackRecord] ?? "")
                : undefined
            }
            required
            maxLength={CALLBACK_INPUT_MAX_LENGTHS[name]}
            aria-invalid={!!error(name)}
            aria-describedby={error(name) ? `new-${name}-error` : undefined}
          />
        )}
        {error(name) && (
          <FieldError id={`new-${name}-error`}>{error(name)}</FieldError>
        )}
      </Field>
    )
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next, event) => {
        if (submitting.current) {
          event.cancel()
          return
        }
        if (next) {
          setResult(null)
          setMode(callback?.schedule_mode ?? "exact")
          setMinimum(nextScheduleMinute())
          onOpen()
        }
        setOpen(next)
      }}
    >
      <DialogTrigger
        render={
          <Button
            type="button"
            variant={callback ? "ghost" : "default"}
            size={callback ? "icon" : "default"}
            aria-label={callback ? "Edit callback" : undefined}
            title={callback ? "Edit callback" : undefined}
          />
        }
      >
        {callback ? (
          <IconPencil aria-hidden="true" />
        ) : (
          <>
            <IconPlus aria-hidden="true" data-icon="inline-start" />
            New Callback
          </>
        )}
      </DialogTrigger>
      <DialogContent>
        <div className="flex flex-col gap-2 border-b p-6">
          <DialogTitle>
            {callback ? "Edit callback" : "New Callback"}
          </DialogTitle>
          <DialogDescription>
            Add customer details and choose when to call. Times use your
            device’s local timezone.
          </DialogDescription>
        </div>
        <form
          ref={formRef}
          onSubmit={submit}
          onChange={() => setResult(null)}
          className="flex min-h-0 flex-col"
          aria-busy={pending}
        >
          <fieldset disabled={pending} className="min-h-0 overflow-y-auto p-6">
            <FieldGroup>
              {inputField("phone_number", "Callback phone number", "tel")}
              {inputField("account_number", "Account number")}
              {inputField("account_holder_name", "Account-holder name")}
              <Field>
                <FieldLabel id="new-schedule-mode">Scheduling mode</FieldLabel>
                <ToggleGroup
                  aria-labelledby="new-schedule-mode"
                  value={[mode]}
                  onValueChange={(values) => {
                    if (values[0] === "exact" || values[0] === "window") {
                      setMode(values[0])
                      setResult(null)
                    }
                  }}
                >
                  <ToggleGroupItem value="exact">Exact time</ToggleGroupItem>
                  <ToggleGroupItem value="window">Time window</ToggleGroupItem>
                </ToggleGroup>
              </Field>
              {mode === "exact" ? (
                inputField("scheduled_at", "Date and time", "datetime-local")
              ) : (
                <div className="grid gap-4 sm:grid-cols-2">
                  {inputField(
                    "window_start_at",
                    "Window start",
                    "datetime-local"
                  )}
                  {inputField("window_end_at", "Window end", "datetime-local")}
                </div>
              )}
              <Field>
                <FieldLabel htmlFor="new-comments">
                  Additional comments (optional)
                </FieldLabel>
                <Textarea
                  id="new-comments"
                  name="comments"
                  defaultValue={callback?.comments ?? ""}
                  maxLength={COMMENTS_MAX_LENGTH}
                />
              </Field>
              {result?.status === "error" && !result.field && (
                <FieldError>{result.message}</FieldError>
              )}
              {result?.status === "conflict" && (
                <p
                  role="status"
                  className="rounded-md border bg-muted p-3 text-sm"
                >
                  {result.message}
                </p>
              )}
            </FieldGroup>
          </fieldset>
          <div className="flex shrink-0 justify-end gap-2 border-t p-4">
            <DialogClose
              render={
                <Button type="button" variant="outline" disabled={pending} />
              }
            >
              Cancel
            </DialogClose>
            <Button type="submit" disabled={pending} className="min-w-32">
              {pending ? "Saving…" : "Save callback"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}
