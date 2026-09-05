import { RegisterForm } from "@/components/auth/register-form"
import { redirectAuthenticatedUser } from "@/lib/auth/session"

export default async function RegisterPage() {
  await redirectAuthenticatedUser()
  return <RegisterForm />
}
