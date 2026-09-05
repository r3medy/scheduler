import { LoginForm } from "@/components/auth/login-form"
import { redirectAuthenticatedUser } from "@/lib/auth/session"

export default async function LoginPage() {
  await redirectAuthenticatedUser()
  return <LoginForm />
}
