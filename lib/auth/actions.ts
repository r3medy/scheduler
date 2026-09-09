"use server"

import { randomUUID } from "node:crypto"

import { redirect } from "next/navigation"

import {
  authenticateLogin,
  authenticateRegistration,
  serviceUnavailable,
  type AuthDependencies as CredentialsDependencies,
  type AuthSuccess,
} from "@/lib/auth/credentials"
import {
  type AuthFormState,
  getLoginFormValues,
  getRegisterFormValues,
  loginSchema,
  registerSchema,
  toFieldErrors,
} from "@/lib/auth/schema"
import {
  createSupabaseRateLimitStore,
  getClientSource,
  getRateLimitConfiguration,
} from "@/lib/auth/rate-limit"
import { getRuntimeConfiguration } from "@/lib/config/runtime"
import { createSupabaseAdminClient } from "@/lib/supabase/admin"
import { createSupabaseServerClient } from "@/lib/supabase/server"

function isAuthSuccess(
  value: AuthFormState | AuthSuccess
): value is AuthSuccess {
  return "success" in value && value.success === true
}

function withResetToken(state: AuthFormState): AuthFormState {
  return { ...state, resetToken: randomUUID() }
}

async function getAuthDependencies(): Promise<CredentialsDependencies | null> {
  const runtimeConfiguration = getRuntimeConfiguration()
  if (!runtimeConfiguration) return null

  const configuration = {
    url: runtimeConfiguration.supabaseUrl,
    publishableKey: runtimeConfiguration.supabasePublishableKey,
  }
  const admin = createSupabaseAdminClient({
    url: runtimeConfiguration.supabaseUrl,
    serviceRoleKey: runtimeConfiguration.supabaseServiceRoleKey,
  })
  if (!admin) return null

  const rateLimitConfiguration = getRateLimitConfiguration()
  const [clientSource, supabase] = await Promise.all([
    getClientSource(),
    createSupabaseServerClient(configuration),
  ])

  return {
    auth: {
      signInWithPassword: (credentials) =>
        supabase.auth.signInWithPassword(credentials),
      signUp: (credentials) => supabase.auth.signUp(credentials),
    },
    rateLimits: createSupabaseRateLimitStore(admin),
    rateLimitConfiguration,
    rateLimitSecret: runtimeConfiguration.authRateLimitSecret,
    clientSource,
  }
}

export async function loginAction(
  _previousState: AuthFormState,
  formData: FormData
): Promise<AuthFormState> {
  const parsed = loginSchema.safeParse(getLoginFormValues(formData))
  if (!parsed.success) {
    return withResetToken({ fieldErrors: toFieldErrors(parsed.error) })
  }

  let result: AuthFormState | AuthSuccess
  try {
    const dependencies = await getAuthDependencies()
    result = dependencies
      ? await authenticateLogin(parsed.data, dependencies)
      : serviceUnavailable()
  } catch {
    return withResetToken(serviceUnavailable())
  }

  if (isAuthSuccess(result)) redirect("/")
  return withResetToken(result)
}

export async function registerAction(
  _previousState: AuthFormState,
  formData: FormData
): Promise<AuthFormState> {
  const parsed = registerSchema.safeParse(getRegisterFormValues(formData))
  if (!parsed.success) {
    return withResetToken({ fieldErrors: toFieldErrors(parsed.error) })
  }

  let result: AuthFormState | AuthSuccess
  try {
    const dependencies = await getAuthDependencies()
    result = dependencies
      ? await authenticateRegistration(parsed.data, dependencies)
      : serviceUnavailable()
  } catch {
    return withResetToken(serviceUnavailable())
  }

  if (isAuthSuccess(result)) redirect("/")
  return withResetToken(result)
}
