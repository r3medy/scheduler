import { AppShell } from "@/components/app-shell"
import { Skeleton } from "@/components/ui/skeleton"

export default function LoadingHistory() {
  return (
    <AppShell>
      <main
        id="main-content"
        aria-busy="true"
        aria-label="Loading callback history"
        className="flex flex-col gap-8 p-4 sm:p-6 lg:p-8"
      >
        <Skeleton className="h-8 w-56" />
        <div className="grid grid-cols-2 gap-6 lg:grid-cols-4">
          {Array.from({ length: 4 }, (_, i) => (
            <Skeleton key={i} className="h-24" />
          ))}
        </div>
        <Skeleton className="h-80 w-full" />
      </main>
    </AppShell>
  )
}
