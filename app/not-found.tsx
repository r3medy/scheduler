import Link from "next/link"

export default function NotFound() {
  return (
    <main className="flex min-h-dvh items-center justify-center bg-background p-6">
      <div className="w-full max-w-md border bg-card p-6 text-center">
        <h1 className="text-xl font-semibold">Page not found</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          This page does not exist or was moved. Your data was not changed.
        </p>
        <div className="mt-6 flex justify-center gap-2">
          <Link
            href="/"
            className="inline-flex h-9 items-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground"
          >
            Back to Home
          </Link>
          <Link
            href="/history"
            className="inline-flex h-9 items-center rounded-md border px-4 text-sm font-medium"
          >
            View history
          </Link>
        </div>
      </div>
    </main>
  )
}
