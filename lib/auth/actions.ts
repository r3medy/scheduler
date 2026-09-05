"use server"

import { randomUUID } from "node:crypto"

import { redirect } from "next/navigation"

import {
  AUTH_SERVICE_UNAVAILABLE_MESSAGE,
  COMPANY_ID_CLAIMED_MESSAGE,
  INVALID_CREDENTIALS_MESSAGE,
  classifyLoginError,
  classifyRegistrationError,
  getRetryMessage,
} from "@/lib/auth/errors"
import {
  companyIdToSyntheticEmail,
  normalizeCompanyId,
} from "@/lib/auth/identity"
import {
  type AuthFormState,
  type LoginFormValues,
  type RegisterFormValues,
  getLoginFormValues,
  getRegisterFormValues,
  loginSchema,
  registerSchema,
  toFieldErrors,
} from "@/lib/auth/schema"
import {
  createRateLimitKey,
  createSupabaseRateLimitStore,
  getClientSource,
  getRateLimitConfiguration,
  type RateLimitBucketConfiguration,
  type RateLimitConfiguration,
  type RateLimitDecision,
  type RateLimitScope,
  type RateLimitStore,
} from "@/lib/auth/rate-limit"
import { getRuntimeConfiguration } from "@/lib/config/runtime"
import { createSupabaseAdminClient } from "@/lib/supabase/admin"
import {
  createSupabaseServerClient,
  getSupabaseConfiguration,
} from "@/lib/supabase/server"

interface AuthAdapter {
  signInWithPassword(credentials: {
    email: string
    password: string
  }): Promise<{
    data: { session: unknown | null }
    error: unknown | null
  }>
  signUp(credentials: {
    email: string
    password: string
    options?: { data?: Record<string, string> }
  }): Promise<{
    data: { user: unknown | null; session: unknown | null }
    error: unknown | null
  }>
}

export interface AuthDependencies {
  auth: AuthAdapter
  rateLimits: RateLimitStore
  rateLimitConfiguration: RateLimitConfiguration
  rateLimitSecret: string
  clientSource: string
}

export interface AuthSuccess {
  success: true
}

function isAuthSuccess(
  value: AuthFormState | AuthSuccess
): value is AuthSuccess {
  return "success" in value && value.success === true
}

function blockedDecision(
  decisions: RateLimitDecision[]
): RateLimitDecision | null {
  return decisions.find((decision) => !decision.allowed) ?? null
}

async function checkBuckets(
  rateLimits: RateLimitStore,
  buckets: Array<{
    scope: RateLimitScope
    key: string
    configuration: RateLimitBucketConfiguration
  }>
): Promise<RateLimitDecision[]> {
  return Promise.all(
    buckets.map(({ scope, key, configuration }) =>
      rateLimits.check(scope, key, configuration)
    )
  )
}

async function recordFailures(
  rateLimits: RateLimitStore,
  buckets: Array<{
    scope: RateLimitScope
    key: string
    configuration: RateLimitBucketConfiguration
  }>
): Promise<RateLimitDecision[]> {
  return Promise.all(
    buckets.map(({ scope, key, configuration }) =>
      rateLimits.recordFailure(scope, key, configuration)
    )
  )
}

async function resetBuckets(
  rateLimits: RateLimitStore,
  buckets: Array<{ scope: RateLimitScope; key: string }>
) {
  await Promise.all(
    buckets.map(({ scope, key }) => rateLimits.reset(scope, key))
  )
}

function serviceUnavailable(): AuthFormState {
  return { formError: AUTH_SERVICE_UNAVAILABLE_MESSAGE }
}

function withResetToken(state: AuthFormState): AuthFormState {
  return { ...state, resetToken: randomUUID() }
}

function getLoginBuckets(
  values: LoginFormValues,
  dependencies: AuthDependencies
) {
  const companyIdKey = createRateLimitKey(
    "login-company",
    values.companyId,
    dependencies.rateLimitSecret
  )
  const sourceKey = createRateLimitKey(
    "login-source",
    dependencies.clientSource,
    dependencies.rateLimitSecret
  )

  return {
    checked: [
      {
        scope: "login-company" as const,
        key: companyIdKey,
        configuration: dependencies.rateLimitConfiguration.loginAccount,
      },
      {
        scope: "login-source" as const,
        key: sourceKey,
        configuration: dependencies.rateLimitConfiguration.loginSource,
      },
    ],
    reset: [
      { scope: "login-company" as const, key: companyIdKey },
      { scope: "login-source" as const, key: sourceKey },
    ],
  }
}

function getRegistrationBucket(dependencies: AuthDependencies): {
  checked: Array<{
    scope: "registration-source"
    key: string
    configuration: RateLimitBucketConfiguration
  }>
  reset: Array<{ scope: "registration-source"; key: string }>
} {
  const sourceKey = createRateLimitKey(
    "registration-source",
    dependencies.clientSource,
    dependencies.rateLimitSecret
  )

  return {
    checked: [
      {
        scope: "registration-source",
        key: sourceKey,
        configuration: dependencies.rateLimitConfiguration.registrationSource,
      },
    ],
    reset: [{ scope: "registration-source", key: sourceKey }],
  }
}

export async function authenticateLogin(
  values: LoginFormValues,
  dependencies: AuthDependencies
): Promise<AuthFormState | AuthSuccess> {
  const buckets = getLoginBuckets(values, dependencies)
  const currentLimits = await checkBuckets(
    dependencies.rateLimits,
    buckets.checked
  )
  const currentBlock = blockedDecision(currentLimits)

  if (currentBlock) {
    return { formError: getRetryMessage(currentBlock.retryAt) }
  }

  const result = await dependencies.auth.signInWithPassword({
    email: companyIdToSyntheticEmail(values.companyId),
    password: values.pin,
  })

  if (result.error || !result.data.session) {
    if (
      !result.error ||
      classifyLoginError(result.error) === "service-unavailable"
    ) {
      return serviceUnavailable()
    }

    const failures = await recordFailures(
      dependencies.rateLimits,
      buckets.checked
    )
    const newlyBlocked = blockedDecision(failures)

    return newlyBlocked
      ? { formError: getRetryMessage(newlyBlocked.retryAt) }
      : { formError: INVALID_CREDENTIALS_MESSAGE }
  }

  await resetBuckets(dependencies.rateLimits, buckets.reset)
  return { success: true }
}

export async function authenticateRegistration(
  values: RegisterFormValues,
  dependencies: AuthDependencies
): Promise<AuthFormState | AuthSuccess> {
  const buckets = getRegistrationBucket(dependencies)
  const currentLimits = await checkBuckets(
    dependencies.rateLimits,
    buckets.checked
  )
  const currentBlock = blockedDecision(currentLimits)

  if (currentBlock) {
    return { formError: getRetryMessage(currentBlock.retryAt) }
  }

  const result = await dependencies.auth.signUp({
    email: companyIdToSyntheticEmail(values.companyId),
    password: values.pin,
    options: { data: { company_id: normalizeCompanyId(values.companyId) } },
  })

  if (result.error || !result.data.user || !result.data.session) {
    const failures = await recordFailures(
      dependencies.rateLimits,
      buckets.checked
    )
    const newlyBlocked = blockedDecision(failures)

    if (newlyBlocked) {
      return { formError: getRetryMessage(newlyBlocked.retryAt) }
    }

    if (
      result.error &&
      classifyRegistrationError(result.error) === "already-claimed"
    ) {
      return { formError: COMPANY_ID_CLAIMED_MESSAGE }
    }

    return serviceUnavailable()
  }

  await resetBuckets(dependencies.rateLimits, buckets.reset)
  return { success: true }
}

async function getAuthDependencies(): Promise<AuthDependencies | null> {
  const runtimeConfiguration = getRuntimeConfiguration()
  const configuration = getSupabaseConfiguration()
  const admin = createSupabaseAdminClient()
  if (!runtimeConfiguration || !configuration || !admin) return null

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
