import "server-only"

import { redirect } from "next/navigation"

import {
  createSupabaseServerClient,
  getSupabaseConfiguration,
} from "@/lib/supabase/server"

export type SessionStatus = "ok" | "unauthenticated" | "configuration-error"

/**
 * Single server-side gate for private data routes. Every private route must
 * verify the session server-side before loading owner-scoped data (the same
 * `getUser()` check as `requireAuth()` in `lib/callbacks/require-auth.ts`).
 *
 * Presentation differs by route by design: Home (`app/page.tsx`) is a public
 * shell that renders an inline sign-in prompt for `unauthenticated`, while
 * History (`app/history/page.tsx`) is a private route that redirects to the
 * canonical `/login`. Both deny anonymous data access server-side.
 * `configuration-error` must render the operator-visible missing-configuration
 * warning instead of private content.
 */
export async function getSessionStatus(): Promise<SessionStatus> {
  const configuration = getSupabaseConfiguration()
  if (!configuration) return "configuration-error"

  try {
    const supabase = await createSupabaseServerClient(configuration)
    const {
      data: { user },
      error,
    } = await supabase.auth.getUser()
    if (error || !user) return "unauthenticated"
    return "ok"
  } catch {
    return "unauthenticated"
  }
}

export async function redirectAuthenticatedUser() {
  const configuration = getSupabaseConfiguration()
  if (!configuration) return

  let user
  try {
    const supabase = await createSupabaseServerClient(configuration)
    const result = await supabase.auth.getUser()
    user = result.data.user
  } catch {
    return
  }

  if (user) redirect("/")
}
