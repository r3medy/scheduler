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
import { registerAction } from "@/lib/auth/actions"
import {
  INITIAL_AUTH_FORM_STATE,
  companyIdSchema,
  pinSchema,
  type AuthFieldErrors,
  validateRegisterForm,
} from "@/lib/auth/schema"

function firstError(
  errors: AuthFieldErrors | undefined,
  field: keyof AuthFieldErrors
) {
  return errors?.[field]?.[0]
}

function RegisterSubmitButton() {
  const { pending } = useFormStatus()

  return (
    <Button
      type="submit"
      size="lg"
      className="w-full min-w-32"
      disabled={pending}
      aria-busy={pending}
    >
      {pending ? "Creating account…" : "Create account"}
    </Button>
  )
}

export function RegisterForm() {
  const [state, formAction] = useActionState(
    registerAction,
    INITIAL_AUTH_FORM_STATE
  )
  const [clientErrors, setClientErrors] = useState<AuthFieldErrors>({})
  const [companyId, setCompanyId] = useState("")
  const [clientResetKey, setClientResetKey] = useState(0)
  const companyIdRef = useRef<HTMLInputElement>(null)
  const pinRef = useRef<HTMLInputElement>(null)
  const confirmPinRef = useRef<HTMLInputElement>(null)
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
    } else if (state.fieldErrors?.confirmPin) {
      confirmPinRef.current?.focus()
    }
  }, [state])

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    const nextErrors = validateRegisterForm(new FormData(event.currentTarget))
    setClientErrors(nextErrors ?? {})

    if (!nextErrors) return

    event.preventDefault()
    setClientResetKey((key) => key + 1)
    if (nextErrors.companyId) {
      companyIdRef.current?.focus()
    } else if (nextErrors.pin) {
      pinRef.current?.focus()
    } else if (nextErrors.confirmPin) {
      confirmPinRef.current?.focus()
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

  function handleConfirmPinBlur(event: React.FocusEvent<HTMLInputElement>) {
    if (!event.currentTarget.value) return
    const result = pinSchema.safeParse(event.currentTarget.value)
    setClientErrors((current) => ({
      ...current,
      confirmPin: result.success ? undefined : [result.error.issues[0].message],
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
        <p className="text-xs font-medium text-muted-foreground">Register</p>
        <h2 className="text-2xl font-semibold text-balance">
          Create your callback workspace
        </h2>
        <p className="text-sm/6 text-pretty text-muted-foreground">
          Claim a Company ID for your private callback workspace.
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
          id="register-company-id"
          label="Company ID"
          description="Use the format E12345."
          error={firstError(errors, "companyId")}
        >
          <Input
            ref={companyIdRef}
            id="register-company-id"
            name="companyId"
            type="text"
            inputMode="text"
            value={companyId}
            onChange={(event) =>
              setCompanyId(event.currentTarget.value.trim().toUpperCase())
            }
            autoCapitalize="characters"
            autoComplete="username"
            spellCheck={false}
            placeholder="E12345"
            maxLength={20}
            onBlur={handleCompanyBlur}
          />
        </AuthField>

        <AuthField
          id="register-pin"
          label="PIN"
          error={firstError(errors, "pin")}
        >
          <InputOTP
            key={`pin-${state.resetToken ?? "initial"}-${clientResetKey}`}
            ref={pinRef}
            id="register-pin"
            name="pin"
            maxLength={6}
            type="password"
            inputMode="numeric"
            pattern="[0-9]*"
            autoComplete="new-password"
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

        <AuthField
          id="register-confirm-pin"
          label="Confirm PIN"
          error={firstError(errors, "confirmPin")}
        >
          <InputOTP
            key={`confirm-pin-${state.resetToken ?? "initial"}-${clientResetKey}`}
            ref={confirmPinRef}
            id="register-confirm-pin"
            name="confirmPin"
            maxLength={6}
            type="password"
            inputMode="numeric"
            pattern="[0-9]*"
            autoComplete="new-password"
            aria-label="Confirm six-digit PIN"
            render={({ slots }) => (
              <InputOTPGroup>
                {slots.map((slot, index) => (
                  <InputOTPSlot key={index} index={index} {...slot} />
                ))}
              </InputOTPGroup>
            )}
            onBlur={handleConfirmPinBlur}
          />
        </AuthField>
      </div>

      <p className="border-l border-border pl-3 text-sm/6 text-pretty text-muted-foreground">
        Registration claims the Company ID but does not verify employee
        identity.
      </p>

      <div className="flex flex-col gap-5">
        <RegisterSubmitButton />
        <p className="text-center text-sm/6 text-muted-foreground">
          Already registered?{" "}
          <Link
            href="/login"
            className="font-medium text-foreground underline underline-offset-4 outline-none hover:text-primary focus-visible:rounded-sm focus-visible:ring-[3px] focus-visible:ring-ring/50"
          >
            Log in
          </Link>
        </p>
      </div>
    </form>
  )
}
