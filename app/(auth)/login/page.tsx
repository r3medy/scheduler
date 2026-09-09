import type { Metadata } from "next"
import { LoginForm } from "@/components/auth/login-form"
import { redirectAuthenticatedUser } from "@/lib/auth/session"

export const metadata: Metadata = {
  title: "Sign in",
  description: "Sign in to your private Scheduler workspace.",
}

export default async function LoginPage() {
  await redirectAuthenticatedUser()
  return <LoginForm />
}
