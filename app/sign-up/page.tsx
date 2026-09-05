import { permanentRedirect } from "next/navigation"

export default function SignUpRedirect() {
  permanentRedirect("/register")
}
