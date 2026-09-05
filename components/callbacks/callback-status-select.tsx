"use client"

import { useId, useRef, useState } from "react"
import type { CallbackRecord } from "@/lib/callbacks/get-callback"
import { updateCallbackStatus } from "@/lib/callbacks/update-status"

export function CallbackStatusSelect({
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
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const saving = useRef(false)
  async function change(next: string) {
    if (saving.current || next === current) return
    saving.current = true
    setValue(next)
    setPending(true)
    setError(null)
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
      saving.current = false
      setPending(false)
    }
  }
  return (
    <div className="flex flex-col gap-2 text-sm">
      <label htmlFor={id} className="text-muted-foreground">
        Status
      </label>
      <select
        id={id}
        value={value}
        disabled={pending}
        onChange={(event) => void change(event.target.value)}
        aria-describedby={`${id}-feedback`}
        className="h-10 w-full rounded-md border border-input bg-popover px-3 text-popover-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
      >
        <option value="open">Open</option>
        <optgroup label="Close callback">
          <option value="reached">Completed — customer reached</option>
          <option value="voicemail">Closed — voicemail</option>
          <option value="no_answer">Closed — no answer</option>
        </optgroup>
      </select>
      <p
        id={`${id}-feedback`}
        role={error ? "alert" : "status"}
        className={error ? "text-destructive" : "text-muted-foreground"}
      >
        {error ??
          (pending
            ? "Saving status…"
            : "Changes save immediately. Due and overdue states are calculated from the schedule.")}
      </p>
    </div>
  )
}
