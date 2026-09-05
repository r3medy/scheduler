import { Skeleton } from "@/components/ui/skeleton"
import { getMonthDayCount } from "@/lib/calendar/date-utils"
import { cn } from "@/lib/utils"

export interface CalendarSkeletonProps {
  className?: string
  focusedDate?: string
}

export function CalendarSkeleton({
  className,
  focusedDate,
}: CalendarSkeletonProps) {
  const dayCount = focusedDate ? getMonthDayCount(focusedDate) : 42
  return (
    <div
      className={cn(
        "overflow-hidden rounded-lg border bg-background",
        className
      )}
      aria-label="Loading calendar"
      aria-busy="true"
    >
      <div className="flex items-center justify-between gap-4 border-b p-4">
        <div className="flex items-center gap-3">
          <Skeleton className="size-10 rounded-xl" />
          <div className="flex flex-col gap-2">
            <Skeleton className="h-4 w-36" />
          </div>
        </div>
        <div className="flex gap-2">
          <Skeleton className="h-8 w-32 rounded-full" />
          <Skeleton className="h-8 w-28 rounded-full" />
        </div>
      </div>
      <div className="grid min-w-[840px] grid-cols-7">
        {Array.from({ length: dayCount }, (_, index) => (
          <div
            key={index}
            className="min-h-28 border-r border-b p-2 last:border-r-0"
          >
            <Skeleton className="size-7 rounded-full" />
          </div>
        ))}
      </div>
    </div>
  )
}
