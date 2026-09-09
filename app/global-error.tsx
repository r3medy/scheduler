"use client"

import Link from "next/link"

export default function GlobalError({
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  return (
    <html lang="en">
      <body>
        <main
          style={{
            display: "flex",
            minHeight: "100dvh",
            alignItems: "center",
            justifyContent: "center",
            padding: 24,
          }}
        >
          <div
            style={{
              maxWidth: 448,
              width: "100%",
              border: "1px solid",
              padding: 24,
              textAlign: "center",
            }}
          >
            <h1 style={{ fontSize: 20, fontWeight: 600 }}>
              Something went wrong
            </h1>
            <p style={{ marginTop: 8, fontSize: 14 }}>
              The application could not be loaded. Your data was not changed.
              Try again or return home.
            </p>
            <div
              style={{
                marginTop: 24,
                display: "flex",
                justifyContent: "center",
                gap: 8,
              }}
            >
              <button type="button" onClick={() => reset()}>
                Try again
              </button>
              <Link href="/">Back to Home</Link>
            </div>
          </div>
        </main>
      </body>
    </html>
  )
}
