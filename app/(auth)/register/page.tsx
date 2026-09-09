import type { Metadata } from "next"
import { RegisterForm } from "@/components/auth/register-form"
import { redirectAuthenticatedUser } from "@/lib/auth/session"

export const metadata: Metadata = {
  title: "Create account",
  description: "Create your private Scheduler workspace account.",
}

export default async function RegisterPage() {
  await redirectAuthenticatedUser()
  return <RegisterForm />
}
