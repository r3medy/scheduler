import { CallbackWorkspaceSkeleton } from "@/components/callbacks/callback-workspace-skeleton"
import { AppShell } from "@/components/app-shell"

export default function Loading() {
  return (
    <AppShell>
      <main
        id="main-content"
        className="min-h-dvh bg-background p-4 sm:p-6 lg:p-8"
      >
        <div className="mx-auto w-full max-w-[1600px]">
          <CallbackWorkspaceSkeleton />
        </div>
      </main>
    </AppShell>
  )
}
