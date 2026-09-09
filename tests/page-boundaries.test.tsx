import { render, screen } from "@testing-library/react"
import { expect, it, vi } from "vitest"

vi.mock("server-only", () => ({}))
vi.mock("next/navigation", () => ({
  usePathname: () => "/",
  useRouter: () => ({ refresh: vi.fn() }),
}))
vi.mock("next/link", () => ({
  default: ({
    href,
    children,
    ...props
  }: {
    href: string
    children: React.ReactNode
  }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}))

import { AuxiliaryDataWarnings } from "@/app/page"

it("renders an explicit retry state when the independent overdue query fails", () => {
  render(
    <AuxiliaryDataWarnings
      overdueUnavailable
      retryHref="/?view=week&date=2026-09-05"
    />
  )

  expect(screen.getByRole("status")).toHaveTextContent(
    "Overdue callbacks could not be loaded"
  )
  expect(screen.getByRole("link", { name: "Try again" })).toHaveAttribute(
    "href",
    "/?view=week&date=2026-09-05"
  )
})

it("does not add a warning for a complete overdue query", () => {
  const { container } = render(
    <AuxiliaryDataWarnings
      overdueUnavailable={false}
      retryHref="/?view=week&date=2026-09-05"
    />
  )

  expect(container).toBeEmptyDOMElement()
})
