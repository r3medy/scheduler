"use client"

import { useState } from "react"
import { NewCallbackDialog } from "@/components/callbacks/new-callback-dialog"
import type { CalendarView } from "@/lib/calendar/types"

export function CallbacksSection({
  view,
  visibleCount,
}: {
  view: CalendarView
  visibleCount: number
}) {
  const [saved, setSaved] = useState(false)

  return (
    <section
      aria-labelledby="callbacks-heading"
      className="rounded-lg border bg-background p-6"
    >
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex flex-col gap-2">
          <h1 id="callbacks-heading" className="text-lg font-semibold">
            Callbacks
          </h1>
          <p className="text-sm text-muted-foreground">
            {visibleCount === 0
              ? `No callbacks in this ${view}. New callbacks scheduled in this period will appear below.`
              : `${visibleCount} ${visibleCount === 1 ? "callback" : "callbacks"} scheduled in this ${view}.`}
          </p>
        </div>
        <NewCallbackDialog
          onSaved={() => setSaved(true)}
          onOpen={() => setSaved(false)}
        />
      </div>
      <p role="status" className="text-sm text-primary">
        {saved ? "Callback saved." : ""}
      </p>
    </section>
  )
}
