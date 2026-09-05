import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, expect, it, vi } from "vitest"

vi.mock("@/lib/auth/actions", () => ({
  loginAction: vi.fn(async () => ({})),
  registerAction: vi.fn(async () => ({})),
}))

import { LoginForm } from "@/components/auth/login-form"
import { RegisterForm } from "@/components/auth/register-form"

describe("auth forms", () => {
  it("renders login labels, helper text, and account link", () => {
    render(<LoginForm />)

    expect(
      screen.getByRole("heading", { name: "Return to your callbacks" })
    ).toBeInTheDocument()
    expect(screen.getByLabelText("Company ID")).toBeInTheDocument()
    expect(screen.getByLabelText("Six-digit PIN")).toBeInTheDocument()
    expect(screen.getByText("Use the format E12345.")).toBeInTheDocument()
    expect(screen.getByRole("link", { name: "Register" })).toHaveAttribute(
      "href",
      "/register"
    )
  })

  it("renders registration confirmation and identity disclosure", () => {
    render(<RegisterForm />)

    expect(
      screen.getByRole("heading", { name: "Create your callback workspace" })
    ).toBeInTheDocument()
    expect(screen.getByLabelText("Confirm six-digit PIN")).toBeInTheDocument()
    expect(
      screen.getByText(
        "Registration claims the Company ID but does not verify employee identity."
      )
    ).toBeInTheDocument()
    expect(screen.getByRole("link", { name: "Log in" })).toHaveAttribute(
      "href",
      "/login"
    )
  })

  it("shows accessible client validation without submitting empty credentials", async () => {
    const user = userEvent.setup()
    render(<LoginForm />)

    await user.click(screen.getByRole("button", { name: "Log in" }))

    expect(
      screen.getByText("Enter a Company ID in the format E12345.")
    ).toBeInTheDocument()
    expect(screen.getByText("Enter a six-digit PIN.")).toBeInTheDocument()
    expect(screen.getAllByRole("alert")).toHaveLength(2)
  })
})
