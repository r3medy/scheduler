"use server"

import { authenticateLogin } from "@/lib/auth/credentials"
import { pinSchema } from "@/lib/auth/schema"
import {
  createSupabaseServerClient,
  getSupabaseConfiguration,
} from "@/lib/supabase/server"
import { createSupabaseAdminClient } from "@/lib/supabase/admin"
import {
  createSupabaseRateLimitStore,
  getAuthRateLimitSecret,
  getRateLimitConfiguration,
  getClientSource,
} from "@/lib/auth/rate-limit"

export type AccountResult =
  { status: "success"; message: string } | { status: "error"; message: string }

/**
 * Session contract (see docs/auth-configuration.md "Session semantics"):
 *
 * - PIN change keeps the current session and leaves other signed-in devices
 *   alone. A Supabase password update does not revoke existing sessions, so
 *   no global logout is implied or promised.
 * - Sign-out uses `scope: "local"` and clears only this device's session.
 * - Account deletion removes the auth user (owned callbacks cascade at the
 *   database layer) and then clears the local session cookie.
 */
const failure = (message: string): AccountResult => ({
  status: "error",
  message,
})
class AccountError extends Error {}

async function verifyCurrentPin(pin: FormDataEntryValue | null) {
  if (!pinSchema.safeParse(pin).success)
    throw new AccountError("Enter your current six-digit PIN.")
  const config = getSupabaseConfiguration()
  const admin = createSupabaseAdminClient()
  if (!config || !admin)
    throw new AccountError(
      "Account settings are unavailable. Please try again."
    )
  const supabase = await createSupabaseServerClient(config)
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser()
  if (error || !user?.email)
    throw new AccountError("Sign in again before changing your account.")
  // Identity comes only from the verified session, never from submitted form data.
  const companyId = user.email.split("@")[0].toUpperCase()
  const result = await authenticateLogin(
    { companyId, pin: String(pin) },
    {
      auth: supabase.auth,
      rateLimits: createSupabaseRateLimitStore(admin),
      rateLimitConfiguration: getRateLimitConfiguration(),
      rateLimitSecret: getAuthRateLimitSecret(),
      clientSource: await getClientSource(),
    }
  )
  if (!("success" in result))
    throw new AccountError(
      result.formError ?? "Could not verify your current PIN."
    )
  return { user, supabase, admin }
}

export async function changePin(data: FormData): Promise<AccountResult> {
  const next = pinSchema.safeParse(data.get("newPin"))
  if (!next.success) return failure("Enter a new six-digit PIN.")
  if (next.data !== data.get("confirmPin"))
    return failure("The new PINs do not match.")
  if (next.data === data.get("currentPin"))
    return failure("Choose a PIN different from your current PIN.")
  try {
    const { supabase } = await verifyCurrentPin(data.get("currentPin"))
    const { error } = await supabase.auth.updateUser({ password: next.data })
    if (error) return failure("Could not change your PIN. Please try again.")
    return { status: "success", message: "Your PIN has been changed." }
  } catch (error) {
    return failure(
      error instanceof AccountError
        ? error.message
        : "Could not verify your account. Please try again."
    )
  }
}

export async function signOutAccount(): Promise<AccountResult> {
  try {
    const config = getSupabaseConfiguration()
    if (!config) return failure("Could not log you out. Please try again.")
    const supabase = await createSupabaseServerClient(config)
    const { error } = await supabase.auth
      .signOut({ scope: "local" })
      .catch(() => ({ error: { message: "sign out failed" } as const }))
    if (error) return failure("Could not log you out. Please try again.")
    return { status: "success", message: "You have been logged out." }
  } catch {
    return failure("Could not log you out. Please try again.")
  }
}

export async function deleteAccount(data: FormData): Promise<AccountResult> {
  if (data.get("confirmation") !== "DELETE")
    return failure("Type DELETE to confirm account deletion.")
  try {
    const { user, supabase, admin } = await verifyCurrentPin(
      data.get("currentPin")
    )
    const { error } = await admin.auth.admin.deleteUser(user.id, false)
    if (error)
      return failure(
        "Could not delete your account. Your account has not been removed. Please try again."
      )
    // Auth deletion cascades to callbacks and sessions. Clear the local cookie too.
    await supabase.auth.signOut({ scope: "local" }).catch(() => undefined)
    return { status: "success", message: "Your account has been deleted." }
  } catch (error) {
    return failure(
      error instanceof AccountError
        ? error.message
        : "Could not verify your account. Please try again."
    )
  }
}
