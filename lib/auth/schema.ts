import { z } from "zod"

export const COMPANY_ID_FORMAT = "E12345"
export const INVALID_COMPANY_ID_MESSAGE =
  "Enter a Company ID in the format E12345."
export const INVALID_PIN_MESSAGE = "Enter a six-digit PIN."
export const PIN_MISMATCH_MESSAGE = "PINs do not match."

export const companyIdSchema = z.preprocess(
  (value) => (typeof value === "string" ? value.trim().toUpperCase() : value),
  z
    .string({ required_error: INVALID_COMPANY_ID_MESSAGE })
    .regex(/^E\d{5}$/, INVALID_COMPANY_ID_MESSAGE)
)

export const pinSchema = z
  .string({ required_error: INVALID_PIN_MESSAGE })
  .regex(/^\d{6}$/, INVALID_PIN_MESSAGE)

export const loginSchema = z.object({
  companyId: companyIdSchema,
  pin: pinSchema,
})

const registerFieldsSchema = loginSchema.extend({
  confirmPin: pinSchema,
})

export const registerSchema = registerFieldsSchema.superRefine(
  ({ pin, confirmPin }, context) => {
    if (pin !== confirmPin) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["confirmPin"],
        message: PIN_MISMATCH_MESSAGE,
      })
    }
  }
)

export type LoginFormValues = z.infer<typeof loginSchema>
export type RegisterFormValues = z.infer<typeof registerSchema>
export type AuthField = keyof RegisterFormValues
export type AuthFieldErrors = Partial<Record<AuthField, string[]>>

export interface AuthFormState {
  fieldErrors?: AuthFieldErrors
  formError?: string
  resetToken?: string
}

export const INITIAL_AUTH_FORM_STATE: AuthFormState = {}

function formString(formData: FormData, name: string): string {
  const value = formData.get(name)
  return typeof value === "string" ? value : ""
}

export function getLoginFormValues(formData: FormData) {
  return {
    companyId: formString(formData, "companyId"),
    pin: formString(formData, "pin"),
  }
}

export function getRegisterFormValues(formData: FormData) {
  return {
    companyId: formString(formData, "companyId"),
    pin: formString(formData, "pin"),
    confirmPin: formString(formData, "confirmPin"),
  }
}

function isAuthField(value: PropertyKey): value is AuthField {
  return value === "companyId" || value === "pin" || value === "confirmPin"
}

export function toFieldErrors(error: z.ZodError): AuthFieldErrors {
  const fieldErrors: AuthFieldErrors = {}

  for (const issue of error.issues) {
    const field = issue.path[0]
    if (!isAuthField(field)) continue

    const messages = fieldErrors[field] ?? []
    if (!messages.includes(issue.message)) messages.push(issue.message)
    fieldErrors[field] = messages
  }

  return fieldErrors
}

export function validateLoginForm(formData: FormData): AuthFieldErrors | null {
  const result = loginSchema.safeParse(getLoginFormValues(formData))
  return result.success ? null : toFieldErrors(result.error)
}

export function validateRegisterForm(
  formData: FormData
): AuthFieldErrors | null {
  const result = registerSchema.safeParse(getRegisterFormValues(formData))
  return result.success ? null : toFieldErrors(result.error)
}
