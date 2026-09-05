import {
  createSupabaseServerClient,
  getSupabaseConfiguration,
} from "@/lib/supabase/server"

type ServerSupabaseClient = Awaited<
  ReturnType<typeof createSupabaseServerClient>
>
type SessionUser = NonNullable<
  Awaited<ReturnType<ServerSupabaseClient["auth"]["getUser"]>>["data"]["user"]
>

export type AuthenticatedGate = {
  status: "ok"
  supabase: ServerSupabaseClient
  user: SessionUser
}

export type AuthGateResult =
  | AuthenticatedGate
  | { status: "unavailable" }
  | { status: "unauthenticated" }

/**
 * Verify the caller's session before any callback mutation.
 * Every exported callback action calls this and bails on failure,
 * so anonymous callers can never reach privileged database work.
 */
export async function requireAuth(): Promise<AuthGateResult> {
  const configuration = getSupabaseConfiguration()
  if (!configuration) return { status: "unavailable" }
  const supabase = await createSupabaseServerClient(configuration)
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser()
  if (error || !user) return { status: "unauthenticated" }
  return { status: "ok", supabase, user }
}
