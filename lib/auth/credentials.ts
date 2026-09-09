import "server-only"

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
import type {
  AuthFormState,
  LoginFormValues,
  RegisterFormValues,
} from "@/lib/auth/schema"
import {
  createRateLimitKey,
  type RateLimitBucketConfiguration,
  type RateLimitConfiguration,
  type RateLimitDecision,
  type RateLimitScope,
  type RateLimitStore,
} from "@/lib/auth/rate-limit"

/**
 * Server-only authentication core.
 *
 * `authenticateLogin` / `authenticateRegistration` are dependency-injected
 * helpers, NOT remotely callable server actions. They live here — behind
 * `import "server-only"` — so they can never be exposed as action entry
 * points. The thin `"use server"` wrappers in `lib/auth/actions.ts` and
 * `lib/auth/account-actions.ts` are the only remotely reachable boundary;
 * they import from this module but never re-export these helpers.
 */
export interface AuthAdapter {
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

function blockedDecision(
  decisions: RateLimitDecision[]
): RateLimitDecision | null {
  return decisions.find((decision) => !decision.allowed) ?? null
}

type AuthBucket = {
  scope: RateLimitScope
  key: string
  configuration: RateLimitBucketConfiguration
}

type AdmittedBucket = AuthBucket & { admissionToken: number }

async function admitBuckets(
  rateLimits: RateLimitStore,
  buckets: AuthBucket[]
): Promise<{ admitted: AdmittedBucket[]; blocked: RateLimitDecision | null }> {
  const admitted: AdmittedBucket[] = []

  try {
    for (const bucket of buckets) {
      const decision = await rateLimits.admit(
        bucket.scope,
        bucket.key,
        bucket.configuration
      )
      if (!decision.allowed || decision.admissionToken === null) {
        const previouslyAdmitted = admitted.splice(0)
        await releaseBuckets(rateLimits, previouslyAdmitted)
        return { admitted: [], blocked: decision }
      }
      admitted.push({ ...bucket, admissionToken: decision.admissionToken })
    }
  } catch (error) {
    const previouslyAdmitted = admitted.splice(0)
    await releaseBuckets(rateLimits, previouslyAdmitted)
    throw error
  }

  return { admitted, blocked: null }
}

async function recordFailures(
  rateLimits: RateLimitStore,
  buckets: AdmittedBucket[]
): Promise<RateLimitDecision[]> {
  return Promise.all(
    buckets.map(({ scope, key, configuration, admissionToken }) =>
      rateLimits.recordFailure(scope, key, configuration, admissionToken)
    )
  )
}

async function resetBuckets(
  rateLimits: RateLimitStore,
  buckets: AdmittedBucket[]
) {
  await Promise.all(
    buckets.map(({ scope, key, admissionToken }) =>
      rateLimits.reset(scope, key, admissionToken)
    )
  )
}

async function releaseBuckets(
  rateLimits: RateLimitStore,
  buckets: AdmittedBucket[]
) {
  await Promise.all(
    buckets.map(({ scope, key, admissionToken }) =>
      rateLimits.release(scope, key, admissionToken)
    )
  )
}

const AUTH_VERIFICATION_TIMEOUT_MS = 10_000

async function withAuthTimeout<T>(promise: Promise<T>): Promise<T> {
  let timeout: ReturnType<typeof setTimeout> | undefined
  try {
    return await Promise.race([
      promise,
      new Promise<T>((_, reject) => {
        timeout = setTimeout(
          () => reject(new Error("Authentication verification timed out")),
          AUTH_VERIFICATION_TIMEOUT_MS
        )
      }),
    ])
  } finally {
    if (timeout) clearTimeout(timeout)
  }
}

export function serviceUnavailable(): AuthFormState {
  return { formError: AUTH_SERVICE_UNAVAILABLE_MESSAGE }
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
    buckets: [
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
  }
}

function getRegistrationBucket(dependencies: AuthDependencies): {
  buckets: Array<{
    scope: "registration-source"
    key: string
    configuration: RateLimitBucketConfiguration
  }>
} {
  const sourceKey = createRateLimitKey(
    "registration-source",
    dependencies.clientSource,
    dependencies.rateLimitSecret
  )

  return {
    buckets: [
      {
        scope: "registration-source",
        key: sourceKey,
        configuration: dependencies.rateLimitConfiguration.registrationSource,
      },
    ],
  }
}

export async function authenticateLogin(
  values: LoginFormValues,
  dependencies: AuthDependencies
): Promise<AuthFormState | AuthSuccess> {
  const buckets = getLoginBuckets(values, dependencies)
  let admission: Awaited<ReturnType<typeof admitBuckets>>
  try {
    admission = await admitBuckets(dependencies.rateLimits, buckets.buckets)
  } catch {
    // A limiter outage fails closed: never send credentials to Auth without
    // an atomic admission reservation.
    return serviceUnavailable()
  }

  if (admission.blocked) {
    return { formError: getRetryMessage(admission.blocked.retryAt) }
  }

  let result: Awaited<ReturnType<AuthAdapter["signInWithPassword"]>>
  try {
    result = await withAuthTimeout(
      dependencies.auth.signInWithPassword({
        email: companyIdToSyntheticEmail(values.companyId),
        password: values.pin,
      })
    )
  } catch {
    await releaseBuckets(dependencies.rateLimits, admission.admitted).catch(
      () => undefined
    )
    return serviceUnavailable()
  }

  if (result.error || !result.data.session) {
    if (
      !result.error ||
      classifyLoginError(result.error) === "service-unavailable"
    ) {
      await releaseBuckets(dependencies.rateLimits, admission.admitted).catch(
        () => undefined
      )
      return serviceUnavailable()
    }

    let failures: RateLimitDecision[]
    try {
      failures = await recordFailures(
        dependencies.rateLimits,
        admission.admitted
      )
    } catch {
      // A partial completion may have consumed one token while another
      // completion failed. Releasing every token is idempotent in the
      // database and prevents the still-active reservation from lingering
      // until its window expires.
      await releaseBuckets(dependencies.rateLimits, admission.admitted).catch(
        () => undefined
      )
      return serviceUnavailable()
    }
    const newlyBlocked = blockedDecision(failures)

    return newlyBlocked
      ? { formError: getRetryMessage(newlyBlocked.retryAt) }
      : { formError: INVALID_CREDENTIALS_MESSAGE }
  }

  try {
    await resetBuckets(dependencies.rateLimits, admission.admitted)
  } catch {
    await releaseBuckets(dependencies.rateLimits, admission.admitted).catch(
      () => undefined
    )
    return serviceUnavailable()
  }
  return { success: true }
}

export async function authenticateRegistration(
  values: RegisterFormValues,
  dependencies: AuthDependencies
): Promise<AuthFormState | AuthSuccess> {
  const buckets = getRegistrationBucket(dependencies)
  let admission: Awaited<ReturnType<typeof admitBuckets>>
  try {
    admission = await admitBuckets(dependencies.rateLimits, buckets.buckets)
  } catch {
    return serviceUnavailable()
  }

  if (admission.blocked) {
    return { formError: getRetryMessage(admission.blocked.retryAt) }
  }

  let result: Awaited<ReturnType<AuthAdapter["signUp"]>>
  try {
    result = await withAuthTimeout(
      dependencies.auth.signUp({
        email: companyIdToSyntheticEmail(values.companyId),
        password: values.pin,
        options: { data: { company_id: normalizeCompanyId(values.companyId) } },
      })
    )
  } catch {
    await releaseBuckets(dependencies.rateLimits, admission.admitted).catch(
      () => undefined
    )
    return serviceUnavailable()
  }

  if (result.error || !result.data.user || !result.data.session) {
    if (
      !result.error ||
      classifyRegistrationError(result.error) === "service-unavailable"
    ) {
      await releaseBuckets(dependencies.rateLimits, admission.admitted).catch(
        () => undefined
      )
      return serviceUnavailable()
    }

    let failures: RateLimitDecision[]
    try {
      failures = await recordFailures(
        dependencies.rateLimits,
        admission.admitted
      )
    } catch {
      await releaseBuckets(dependencies.rateLimits, admission.admitted).catch(
        () => undefined
      )
      return serviceUnavailable()
    }
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

  try {
    await resetBuckets(dependencies.rateLimits, admission.admitted)
  } catch {
    await releaseBuckets(dependencies.rateLimits, admission.admitted).catch(
      () => undefined
    )
    return serviceUnavailable()
  }
  return { success: true }
}
