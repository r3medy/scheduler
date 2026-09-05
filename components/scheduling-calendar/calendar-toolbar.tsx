"use client"

import { IconChevronLeft, IconChevronRight } from "@tabler/icons-react"

import { Button } from "@/components/ui/button"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import {
  formatCalendarControlLabel,
  formatMonthBadge,
  parseDateKey,
} from "@/lib/calendar/date-utils"
import type { CalendarView } from "@/lib/calendar/types"

export interface CalendarToolbarProps {
  focusedDate: string
  today: string
  view: CalendarView
  onNavigate: (direction: -1 | 1) => void
  onToday: () => void
  onViewChange: (view: CalendarView) => void
}

export function CalendarToolbar({
  focusedDate,
  today,
  view,
  onNavigate,
  onToday,
  onViewChange,
}: CalendarToolbarProps) {
  const todayDate = parseDateKey(today) ?? new Date()
  const periodName = view === "week" ? "week" : "month"
  const controlLabel = formatCalendarControlLabel(view, focusedDate)

  return (
    <header className="flex flex-col gap-4 border-b p-4 lg:flex-row lg:items-center lg:justify-between">
      <div className="flex min-w-0 items-center gap-3">
        <Tooltip>
          <TooltipTrigger
            render={
              <Button
                type="button"
                variant="outline"
                size="icon-lg"
                onClick={onToday}
                aria-label="Jump to today"
                className="shrink-0 flex-col gap-0 rounded-xl tabular-nums"
              />
            }
          >
            <span
              className="text-[10px] leading-3 font-medium text-muted-foreground uppercase"
              aria-hidden="true"
            >
              {formatMonthBadge(today)}
            </span>
            <span
              className="-mt-0.5 text-sm leading-4 font-semibold"
              aria-hidden="true"
            >
              {todayDate.getDate()}
            </span>
          </TooltipTrigger>
          <TooltipContent>Jump to today</TooltipContent>
        </Tooltip>
        <p className="min-w-0 text-xs text-muted-foreground">
          Select a callback to open its details.
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="flex items-center rounded-full border p-0.5">
          <Tooltip>
            <TooltipTrigger
              render={
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  aria-label={`Previous ${periodName}`}
                  onClick={() => onNavigate(-1)}
                />
              }
            >
              <IconChevronLeft aria-hidden="true" />
            </TooltipTrigger>
            <TooltipContent>Previous {periodName}</TooltipContent>
          </Tooltip>

          <span
            aria-live="polite"
            className="min-w-20 px-2 text-center text-sm font-medium tabular-nums"
          >
            {controlLabel}
          </span>

          <Tooltip>
            <TooltipTrigger
              render={
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  aria-label={`Next ${periodName}`}
                  onClick={() => onNavigate(1)}
                />
              }
            >
              <IconChevronRight aria-hidden="true" />
            </TooltipTrigger>
            <TooltipContent>Next {periodName}</TooltipContent>
          </Tooltip>
        </div>

        <ToggleGroup
          value={[view]}
          onValueChange={(values) => {
            const nextView = values[0]
            if (
              nextView === "month" ||
              nextView === "week" ||
              nextView === "table"
            ) {
              onViewChange(nextView)
            }
          }}
          aria-label="Calendar view"
          className="rounded-full bg-muted/50 p-1"
        >
          <ToggleGroupItem
            value="month"
            size="sm"
            aria-label="Month view"
            className="rounded-full px-3.5 data-[state=on]:bg-background"
          >
            Month
          </ToggleGroupItem>
          <ToggleGroupItem
            value="week"
            size="sm"
            aria-label="Week view"
            className="rounded-full px-3.5 data-[state=on]:bg-background"
          >
            Week
          </ToggleGroupItem>
          <ToggleGroupItem
            value="table"
            size="sm"
            aria-label="Table view"
            className="rounded-full px-3.5 data-[state=on]:bg-background"
          >
            Table
          </ToggleGroupItem>
        </ToggleGroup>
      </div>
    </header>
  )
}
