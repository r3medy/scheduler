import { createServerClient } from "@supabase/ssr"
import { type NextRequest, NextResponse } from "next/server"

import { getPublicSupabaseConfiguration } from "@/lib/config/runtime"
import type { Database } from "@/lib/supabase/database.types"

export async function proxy(request: NextRequest) {
  const configuration = getPublicSupabaseConfiguration()

  if (!configuration) {
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
