import { createServerClient } from "@supabase/ssr"
import { type NextRequest, NextResponse } from "next/server"

import {
  getPublicSupabaseConfiguration,
  reportRuntimeConfiguration,
} from "@/lib/config/runtime"
import type { Database } from "@/lib/supabase/database.types"

let reportedMissingConfiguration = false

export async function proxy(request: NextRequest) {
  const configuration = getPublicSupabaseConfiguration()

  if (!configuration) {
    // Intentional pass-through: public routes and the configuration-error UI
    // must still render when Supabase settings are missing. Report through
    // the shared startup validation so operators notice a broken release
    // instead of silently serving an unauthenticated shell.
    reportRuntimeConfiguration()
    if (!reportedMissingConfiguration) {
      reportedMissingConfiguration = true
      console.warn(
        "[proxy] Supabase configuration missing; continuing without session refresh."
      )
    }
    return NextResponse.next({ request })
  }

  let response = NextResponse.next({ request })
  const supabase = createServerClient<Database>(
    configuration.url,
    configuration.publishableKey,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          for (const { name, value } of cookiesToSet) {
            request.cookies.set(name, value)
          }

          response = NextResponse.next({ request })

          for (const { name, value, options } of cookiesToSet) {
            response.cookies.set(name, value, options)
          }
        },
      },
    }
  )

  await supabase.auth.getClaims()

  return response
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
}
