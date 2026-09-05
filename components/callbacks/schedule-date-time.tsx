"use client"

import { useRef, useState } from "react"
import { IconCalendar, IconClock } from "@tabler/icons-react"
import { Calendar } from "@/components/ui/calendar"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { parseDateKey, toDateKey } from "@/lib/calendar/date-utils"

export function ScheduleDateTime({
  id,
  name,
  label,
  defaultValue = "",
  minimum,
  invalid,
  describedBy,
  onChange,
}: {
  id: string
  name: string
  label: string
  defaultValue?: string
  minimum: string
  invalid: boolean
  describedBy?: string
  onChange: () => void
}) {
  const [date, setDate] = useState(() => defaultValue.slice(0, 10))
  const [time, setTime] = useState(() => defaultValue.slice(11, 16))
  const [open, setOpen] = useState(false)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const selected = parseDateKey(date) ?? undefined
  const value = date && time ? `${date}T${time}` : ""
  const tooEarly = !!value && value < minimum

  return (
    <div className="flex flex-col gap-2">
      <input type="hidden" name={name} value={value} />
      <Button
        ref={triggerRef}
        id={id}
        type="button"
        variant="outline"
        className="w-full justify-start"
        aria-expanded={open}
        aria-controls={`${id}-calendar`}
        aria-label={`${label}: ${selected ? selected.toLocaleDateString("en-US", { timeZone: "Africa/Cairo" }) : "Choose date"}`}
        aria-invalid={invalid}
        aria-describedby={describedBy}
        onClick={() => setOpen(!open)}
      >
        <IconCalendar aria-hidden="true" data-icon="inline-start" />
        {selected
          ? selected.toLocaleDateString("en-US", {
              month: "short",
              day: "numeric",
              year: "numeric",
              timeZone: "Africa/Cairo",
            })
          : "Choose date"}
      </Button>
      {open && (
        <div
          id={`${id}-calendar`}
          role="region"
          aria-label={`${label} calendar`}
          className="flex justify-center rounded-lg border"
        >
          <Calendar
            mode="single"
            selected={selected}
            defaultMonth={selected}
            startMonth={new Date(1900, 0)}
            endMonth={new Date(2100, 11)}
            captionLayout="dropdown"
            disabled={{ before: parseDateKey(minimum.slice(0, 10))! }}
            onSelect={(next) => {
              setDate(next ? toDateKey(next) : "")
              onChange()
              setOpen(false)
              triggerRef.current?.focus()
            }}
          />
        </div>
      )}
      <div className="relative">
        <IconClock
          aria-hidden="true"
          className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
        />
        <Input
          type="time"
          aria-label={`${label} time`}
          value={time}
          required
          step={60}
          min={
            date === minimum.slice(0, 10) ? minimum.slice(11, 16) : undefined
          }
          className="pl-9 tabular-nums"
          aria-invalid={invalid || tooEarly}
          aria-describedby={describedBy}
          onChange={(event) => {
            setTime(event.target.value)
            onChange()
          }}
        />
      </div>
      {tooEarly && (
        <p className="text-sm text-destructive">
          Choose a future date and time.
        </p>
      )}
    </div>
  )
}
