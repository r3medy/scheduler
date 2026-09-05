import { CalendarSkeleton } from "@/components/scheduling-calendar/calendar-skeleton"
import { Skeleton } from "@/components/ui/skeleton"

export function CallbackWorkspaceSkeleton() {
  return (
    <div className="flex flex-col gap-6">
      <div
        aria-label="Loading callbacks"
        aria-busy="true"
        className="flex flex-wrap items-center justify-between gap-4 rounded-lg border p-6"
      >
        <div className="flex flex-col gap-2">
          <Skeleton className="h-6 w-28" />
          <Skeleton className="h-5 w-64 max-w-full" />
        </div>
        <Skeleton className="h-9 w-36 rounded-full" />
      </div>
      <CalendarSkeleton />
    </div>
  )
}
