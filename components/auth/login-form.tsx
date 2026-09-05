"use client"

import Link from "next/link"
import * as React from "react"
import { useActionState, useEffect, useRef, useState } from "react"
import { useFormStatus } from "react-dom"

import { AuthField } from "@/components/auth/auth-field"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  InputOTP,
  InputOTPGroup,
  InputOTPSlot,
} from "@/components/ui/input-otp"
import { loginAction } from "@/lib/auth/actions"
import {
  INITIAL_AUTH_FORM_STATE,
  companyIdSchema,
  type AuthFieldErrors,
  pinSchema,
  validateLoginForm,
} from "@/lib/auth/schema"

function firstError(
  errors: AuthFieldErrors | undefined,
  field: keyof AuthFieldErrors
) {
  return errors?.[field]?.[0]
}

function LoginSubmitButton() {
  const { pending } = useFormStatus()

  return (
    <Button
      type="submit"
      size="lg"
      className="w-full min-w-32"
      disabled={pending}
      aria-busy={pending}
    >
      {pending ? "Logging in…" : "Log in"}
    </Button>
  )
}

export function LoginForm() {
  const [state, formAction] = useActionState(
    loginAction,
    INITIAL_AUTH_FORM_STATE
  )
  const [clientErrors, setClientErrors] = useState<AuthFieldErrors>({})
  const [companyId, setCompanyId] = useState("")
  const [clientResetKey, setClientResetKey] = useState(0)
  const companyIdRef = useRef<HTMLInputElement>(null)
  const pinRef = useRef<HTMLInputElement>(null)
  const formErrorRef = useRef<HTMLDivElement>(null)
  const errors = { ...state.fieldErrors, ...clientErrors }

  useEffect(() => {
    if (!state.fieldErrors && !state.formError) return

    if (state.formError) {
      formErrorRef.current?.focus()
    } else if (state.fieldErrors?.companyId) {
      companyIdRef.current?.focus()
    } else if (state.fieldErrors?.pin) {
      pinRef.current?.focus()
    }
  }, [state])

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    const nextErrors = validateLoginForm(new FormData(event.currentTarget))
    setClientErrors(nextErrors ?? {})

    if (!nextErrors) return

    event.preventDefault()
    setClientResetKey((key) => key + 1)
    if (nextErrors.companyId) {
      companyIdRef.current?.focus()
    } else if (nextErrors.pin) {
      pinRef.current?.focus()
    }
  }

  function handleCompanyBlur(event: React.FocusEvent<HTMLInputElement>) {
    const result = companyIdSchema.safeParse(event.currentTarget.value)
    setClientErrors((current) => ({
      ...current,
      companyId: result.success ? undefined : [result.error.issues[0].message],
    }))
  }

  function handlePinBlur(event: React.FocusEvent<HTMLInputElement>) {
    if (!event.currentTarget.value) return
    const result = pinSchema.safeParse(event.currentTarget.value)
    setClientErrors((current) => ({
      ...current,
      pin: result.success ? undefined : [result.error.issues[0].message],
    }))
  }

  return (
    <form
      action={formAction}
      noValidate
      onSubmit={handleSubmit}
      className="flex flex-col gap-8"
    >
      <div className="flex flex-col gap-2">
        <p className="text-xs font-medium text-muted-foreground">Sign in</p>
        <h2 className="text-2xl font-semibold text-balance">
          Return to your callbacks
        </h2>
        <p className="text-sm/6 text-pretty text-muted-foreground">
          Use your Company ID and six-digit PIN to continue.
        </p>
      </div>

      {state.formError && (
        <div
          ref={formErrorRef}
          tabIndex={-1}
          role="alert"
          aria-live="assertive"
          className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2.5 text-sm/6 text-pretty text-destructive outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
        >
          {state.formError}
        </div>
      )}

      <div className="flex flex-col gap-5">
        <AuthField
          id="login-company-id"
          label="Company ID"
          description="Use the format E12345."
          error={firstError(errors, "companyId")}
        >
          <Input
            ref={companyIdRef}
            id="login-company-id"
            name="companyId"
            type="text"
            inputMode="text"
            value={companyId}
            onChange={(event) =>
              setCompanyId(event.currentTarget.value.toUpperCase())
            }
            autoCapitalize="characters"
            autoComplete="username"
            spellCheck={false}
            placeholder="E12345"
            maxLength={6}
            onBlur={handleCompanyBlur}
          />
        </AuthField>

        <AuthField id="login-pin" label="PIN" error={firstError(errors, "pin")}>
          <InputOTP
            key={`${state.resetToken ?? "initial"}-${clientResetKey}`}
            ref={pinRef}
            id="login-pin"
            name="pin"
            maxLength={6}
            type="password"
            inputMode="numeric"
            pattern="[0-9]*"
            autoComplete="current-password"
            aria-label="Six-digit PIN"
            render={({ slots }) => (
              <InputOTPGroup>
                {slots.map((slot, index) => (
                  <InputOTPSlot key={index} index={index} {...slot} />
                ))}
              </InputOTPGroup>
            )}
            onBlur={handlePinBlur}
          />
        </AuthField>
      </div>

      <div className="flex flex-col gap-5">
        <LoginSubmitButton />
        <div className="flex flex-col gap-2 text-center text-sm/6">
          <p className="text-muted-foreground">
            Need an account?{" "}
            <Link
              href="/register"
              className="font-medium text-foreground underline underline-offset-4 outline-none hover:text-primary focus-visible:rounded-sm focus-visible:ring-[3px] focus-visible:ring-ring/50"
            >
              Register
            </Link>
          </p>
          <p className="text-muted-foreground">
            PIN recovery is not currently available.
          </p>
        </div>
      </div>
    </form>
  )
}
