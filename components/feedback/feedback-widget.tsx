"use client"

import { useEffect, useRef, useState, type FormEvent } from "react"
import {
  IconMoodCry,
  IconMoodSad,
  IconMoodSmile,
  IconMoodSmileBeam,
  IconX,
} from "@tabler/icons-react"

import { Button } from "@/components/ui/button"
import { Separator } from "@/components/ui/separator"
import { Textarea } from "@/components/ui/textarea"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import {
  submitFeedback,
  type SubmitFeedbackResult,
} from "@/lib/feedback/submit-feedback"
import { cn } from "@/lib/utils"

const RATING_OPTIONS = [
  { value: 1, label: "Very unhelpful", Icon: IconMoodCry },
  { value: 2, label: "Not helpful", Icon: IconMoodSad },
  { value: 3, label: "Helpful", Icon: IconMoodSmile },
  { value: 4, label: "Very helpful", Icon: IconMoodSmileBeam },
] as const

type SubmitFn = typeof submitFeedback

const EXIT_DURATION_MS = 150

function RatingButtons({
  selected,
  onSelect,
}: {
  selected: number | null
  onSelect: (value: number) => void
}) {
  return (
    <div role="group" aria-label="Helpfulness rating" className="flex items-center gap-2">
      {RATING_OPTIONS.map(({ value, label, Icon }) => (
        <Tooltip key={value}>
          <TooltipTrigger
            render={
              <Button
                type="button"
                variant={selected === value ? "default" : "ghost"}
                size="icon-sm"
                aria-label={label}
                aria-pressed={selected === value}
                onClick={() => onSelect(value)}
              />
            }
          >
            <Icon size={16} aria-hidden="true" />
          </TooltipTrigger>
          <TooltipContent>{label}</TooltipContent>
        </Tooltip>
      ))}
    </div>
  )
}

export function FeedbackWidget({
  onSubmit = submitFeedback as SubmitFn,
}: {
  onSubmit?: SubmitFn
} = {}) {
  const [expanded, setExpanded] = useState(false)
  const [rating, setRating] = useState<number | null>(null)
  const [message, setMessage] = useState("")
  const [pending, setPending] = useState(false)
  const [result, setResult] = useState<SubmitFeedbackResult | null>(null)
  const [sent, setSent] = useState(false)
  const [closing, setClosing] = useState(false)
  const [hidden, setHidden] = useState(false)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const closeTimer = useRef<number | null>(null)

  useEffect(() => {
    if (expanded) textareaRef.current?.focus()
  }, [expanded])

  useEffect(() => {
    return () => {
      if (closeTimer.current !== null) {
        window.clearTimeout(closeTimer.current)
      }
    }
  }, [])

  function selectRating(value: number) {
    if (closing) return
    setRating(value)
    setResult(null)
    setExpanded(true)
  }

  function finishClose() {
    closeTimer.current = null
    setClosing(false)
    setExpanded(false)
    setRating(null)
    setMessage("")
    setResult(null)
    setSent(false)
  }

  function requestClose() {
    if (closing) return
    setClosing(true)
    closeTimer.current = window.setTimeout(finishClose, EXIT_DURATION_MS)
  }

  function dismiss() {
    requestClose()
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (rating === null || pending) return
    setPending(true)
    setResult(null)
    try {
      const next = await (onSubmit as SubmitFn)(rating, message)
      setResult(next)
      if (next.status === "success") {
        setSent(true)
        setMessage("")
      }
    } catch {
      setResult({
        status: "error",
        message: "Could not send your feedback. Please try again.",
      })
    } finally {
      setPending(false)
    }
  }

  if (hidden) return null

  return (
    <section
      aria-label="Scheduler feedback"
      className="fixed right-4 bottom-4 z-40 w-max max-w-[calc(100vw-2rem)]"
      onKeyDown={(event) => {
        if (event.key === "Escape" && expanded) requestClose()
      }}
    >
      {expanded ? (
        <div
          className={cn(
            "flex w-[320px] max-w-[calc(100vw-2rem)] flex-col gap-4 rounded-xl border bg-popover p-4 text-popover-foreground shadow-sm duration-150 motion-reduce:animate-none dark:shadow-none",
            closing
              ? "animate-out fade-out-0 slide-out-to-bottom-2"
              : "animate-in fade-in-0 slide-in-from-bottom-2"
          )}
        >
          <div className="flex items-start justify-between gap-2">
            <p className="text-sm font-medium">
              Do you find <strong>Scheduler</strong> helpful?
            </p>
            <Tooltip>
              <TooltipTrigger
                render={
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-xs"
                    aria-label="Close feedback"
                    onClick={requestClose}
                  />
                }
              >
                <IconX size={16} aria-hidden="true" />
              </TooltipTrigger>
              <TooltipContent>Close feedback</TooltipContent>
            </Tooltip>
          </div>
          <RatingButtons selected={rating} onSelect={selectRating} />
          {sent ? (
            <div className="flex flex-col gap-4">
              <p role="status" className="text-sm text-primary">
                Thanks — your feedback was saved.
              </p>
              <Button
                type="button"
                variant="outline"
                className="self-start"
                onClick={dismiss}
              >
                Dismiss
              </Button>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="flex flex-col gap-4">
              <div className="flex flex-col gap-2">
                <label
                  htmlFor="scheduler-feedback-text"
                  className="text-sm font-medium"
                >
                  Feedback
                </label>
                <p
                  id="scheduler-feedback-note"
                  className="text-sm text-muted-foreground"
                >
                  Help us improve by leaving a feedback!
                </p>
                <Textarea
                  ref={textareaRef}
                  id="scheduler-feedback-text"
                  name="feedback"
                  rows={4}
                  maxLength={2000}
                  placeholder="Your feedback..."
                  value={message}
                  aria-describedby="scheduler-feedback-note"
                  onChange={(event) => {
                    setMessage(event.target.value)
                    setResult(null)
                  }}
                />
              </div>
              {result && result.status === "error" ? (
                <p role="alert" className="text-sm text-destructive">
                  {result.message}
                </p>
              ) : null}
              <Button
                type="submit"
                className="self-start"
                disabled={pending || message.trim().length === 0}
              >
                {pending ? "Sending…" : "Send feedback"}
              </Button>
            </form>
          )}
        </div>
      ) : (
        <div className="flex max-w-[calc(100vw-2rem)] flex-wrap items-center gap-2 rounded-xl border bg-popover px-4 py-3 text-popover-foreground shadow-sm dark:shadow-none">
          <p className="text-sm font-medium">
            Do you find <strong>Scheduler</strong> helpful?
          </p>
          <RatingButtons selected={rating} onSelect={selectRating} />
          <Separator orientation="vertical" className="mx-1 h-5 data-vertical:self-center" />
          <Tooltip>
            <TooltipTrigger
              render={
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-xs"
                  aria-label="Hide feedback"
                  onClick={() => setHidden(true)}
                />
              }
            >
              <IconX size={16} aria-hidden="true" />
            </TooltipTrigger>
            <TooltipContent>Hide feedback</TooltipContent>
          </Tooltip>
        </div>
      )}
    </section>
  )
}
