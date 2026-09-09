import { readFileSync } from "node:fs"
import { resolve } from "node:path"

import { fireEvent, render, screen, waitFor } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  getUser: vi.fn(),
  from: vi.fn(),
  insert: vi.fn(),
}))

vi.mock("@/lib/supabase/server", () => ({
  getSupabaseConfiguration: () => ({}),
  createSupabaseServerClient: async () => ({
    auth: { getUser: mocks.getUser },
    from: mocks.from,
  }),
}))

import { submitFeedback } from "@/lib/feedback/submit-feedback"
import { FeedbackWidget } from "@/components/feedback/feedback-widget"

beforeEach(() => {
  vi.resetAllMocks()
  mocks.getUser.mockResolvedValue({
    data: { user: { id: "signed-in-owner" } },
    error: null,
  })
  mocks.insert.mockResolvedValue({ error: null })
  mocks.from.mockReturnValue({ insert: mocks.insert })
})

describe("feedback migration", () => {
  const migration = readFileSync(
    resolve(process.cwd(), "supabase/migrations/20260906000000_feedback.sql"),
    "utf8"
  )

  it("stores user id, feedback text, and a 1-4 rating", () => {
    expect(migration).toMatch(/create table public\.feedback/i)
    expect(migration).toMatch(
      /user_id uuid not null references auth\.users \(id\) on delete cascade/i
    )
    expect(migration).toMatch(/rating smallint not null/i)
    expect(migration).toMatch(/check \(rating between 1 and 4\)/i)
    expect(migration).toMatch(/feedback text not null/i)
  })

  it("keeps feedback owner-scoped and append-only", () => {
    expect(migration).toMatch(
      /alter table public\.feedback enable row level security/i
    )
    expect(migration).toMatch(
      /revoke all on table public\.feedback from public, anon, authenticated/i
    )
    expect(migration).toMatch(
      /grant select, insert on table public\.feedback to authenticated/i
    )
    expect(migration).toMatch(/\(select auth\.uid\(\)\) = user_id/i)
    expect(migration).not.toMatch(
      /grant\s+[\w,\s]*\bupdate\b[\w,\s]*on table public\.feedback/i
    )
    expect(migration).not.toMatch(
      /grant\s+[\w,\s]*\bdelete\b[\w,\s]*on table public\.feedback/i
    )
  })
})

describe("submitFeedback", () => {
  it("rejects ratings outside 1-4 before touching the database", async () => {
    for (const rating of [0, 5, 2.5, Number.NaN]) {
      expect(await submitFeedback(rating, "Useful")).toMatchObject({
        status: "error",
        field: "rating",
      })
    }
    expect(mocks.insert).not.toHaveBeenCalled()
  })

  it("rejects empty or oversized feedback", async () => {
    expect(await submitFeedback(3, "   ")).toMatchObject({
      status: "error",
      field: "feedback",
    })
    expect(await submitFeedback(3, "x".repeat(2001))).toMatchObject({
      status: "error",
      field: "feedback",
    })
    expect(mocks.insert).not.toHaveBeenCalled()
  })

  it("stores the trimmed feedback with the signed-in owner and rating", async () => {
    expect(await submitFeedback(4, "  Very helpful  ")).toEqual({
      status: "success",
    })
    expect(mocks.from).toHaveBeenCalledWith("feedback")
    expect(mocks.insert).toHaveBeenCalledWith({
      user_id: "signed-in-owner",
      rating: 4,
      feedback: "Very helpful",
    })
  })

  it("rejects anonymous submissions", async () => {
    mocks.getUser.mockResolvedValue({ data: { user: null }, error: null })
    expect(await submitFeedback(3, "Helpful")).toMatchObject({
      status: "error",
    })
    expect(mocks.insert).not.toHaveBeenCalled()
  })
})

describe("FeedbackWidget", () => {
  it("shows the collapsed bar with four rated icon buttons", () => {
    render(<FeedbackWidget onSubmit={vi.fn()} />)
    expect(screen.getByText(/Do you find/)).toHaveTextContent(
      "Do you find Scheduler helpful?"
    )
    for (const name of [
      "Very unhelpful",
      "Not helpful",
      "Helpful",
      "Very helpful",
    ]) {
      expect(
        screen.getByRole("button", { name })
      ).toBeInTheDocument()
    }
    expect(
      screen.queryByPlaceholderText("Your feedback...")
    ).not.toBeInTheDocument()
  })

  it("expands on icon choice and sends the feedback with its rating", async () => {
    const onSubmit = vi.fn().mockResolvedValue({ status: "success" })
    render(<FeedbackWidget onSubmit={onSubmit} />)

    fireEvent.click(screen.getByRole("button", { name: "Helpful" }))

    expect(
      screen.getByText("Help us improve by leaving a feedback!")
    ).toBeInTheDocument()
    const box = screen.getByPlaceholderText("Your feedback...")
    const send = screen.getByRole("button", { name: "Send feedback" })
    expect(send).toBeDisabled()

    fireEvent.change(box, { target: { value: "Please add keyboard shortcuts" } })
    expect(send).toBeEnabled()
    fireEvent.click(send)

    expect(onSubmit).toHaveBeenCalledWith(3, "Please add keyboard shortcuts")
    expect(await screen.findByRole("status")).toHaveTextContent(
      "your feedback was saved"
    )
  })

  it("clears the selected rating when the container closes", async () => {
    render(<FeedbackWidget onSubmit={vi.fn()} />)

    fireEvent.click(screen.getByRole("button", { name: "Helpful" }))
    expect(screen.getByRole("button", { name: "Helpful" })).toHaveAttribute(
      "aria-pressed",
      "true"
    )

    fireEvent.click(screen.getByRole("button", { name: "Close feedback" }))

    await waitFor(() => {
      expect(
        screen.queryByPlaceholderText("Your feedback...")
      ).not.toBeInTheDocument()
    })
    expect(screen.getByRole("button", { name: "Helpful" })).toHaveAttribute(
      "aria-pressed",
      "false"
    )
  })

  it("animates the expanded panel entrance", () => {
    const { container } = render(<FeedbackWidget onSubmit={vi.fn()} />)

    fireEvent.click(screen.getByRole("button", { name: "Helpful" }))

    const panel = container.querySelector(
      "section[aria-label='Scheduler feedback'] > div"
    )
    expect(panel?.className).toMatch("animate-in")
  })

  it("plays a closing animation before unmounting", () => {
    const { container } = render(<FeedbackWidget onSubmit={vi.fn()} />)

    fireEvent.click(screen.getByRole("button", { name: "Helpful" }))
    fireEvent.click(screen.getByRole("button", { name: "Close feedback" }))

    const panel = container.querySelector(
      "section[aria-label='Scheduler feedback'] > div"
    )
    expect(panel?.className).toMatch("animate-out")
  })
  it("keeps typed feedback visible when sending fails", async () => {
    const onSubmit = vi
      .fn()
      .mockResolvedValue({ status: "error", message: "Try again later." })
    render(<FeedbackWidget onSubmit={onSubmit} />)

    fireEvent.click(screen.getByRole("button", { name: "Very helpful" }))
    fireEvent.change(screen.getByPlaceholderText("Your feedback..."), {
      target: { value: "Great app" },
    })
    fireEvent.click(screen.getByRole("button", { name: "Send feedback" }))

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Try again later"
    )
    expect(screen.getByPlaceholderText("Your feedback...")).toHaveValue(
      "Great app"
    )
  })
})
