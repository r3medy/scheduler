"use client"

import Image from "next/image"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { Suspense, lazy, useEffect, useState } from "react"

const Dithering = lazy(() =>
  import("@paper-design/shaders-react").then((mod) => ({ default: mod.Dithering }))
)

export interface AuthShellProps {
  children: React.ReactNode
}

const AUTH_COPY = [
  {
    title: "A simple tracker — no extra stuff, no noise.",
    description:
      "All your promises in one place. Add a callback in seconds and know when it's due. Stop relying on your memory.",
  },
  {
    title: "Turn promised calls into something you can rely on.",
    description: "Replace scattered notes with one clear, private place.",
  },
  {
    title: "Callbacks stay where you left them.",
    description:
      "No more hunting through old chats or notes — just open and call.",
  },
  {
    title: "Your callbacks stay in the loop.",
    description:
      "Schedule once, and they come back when they should. Built for the calls you promised.",
  },
] as const

// --primary from app/globals.css (oklch 0.511 0.096 186.391) as sRGB hex.
const TEAL_FRONT = "#00786f"

export function AuthShell({ children }: AuthShellProps) {
  const pathname = usePathname()
  const [copyIndex, setCopyIndex] = useState(0)
  const [isHovered, setIsHovered] = useState(false)

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- pick client-only random copy after mount to avoid hydration mismatch
    setCopyIndex(Math.floor(Math.random() * AUTH_COPY.length))
  }, [pathname])

  const copy = AUTH_COPY[copyIndex]

  return (
    <main
      className="relative min-h-dvh overflow-hidden bg-background px-4 py-8 sm:px-6 sm:py-12 lg:px-8 lg:py-16"
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      <Suspense fallback={<div className="absolute inset-0 bg-muted/20" />}>
        <div className="pointer-events-none absolute inset-0 z-0 opacity-40 mix-blend-multiply dark:opacity-30 dark:mix-blend-screen">
          <Dithering
            colorBack="#00000000"
            colorFront={TEAL_FRONT}
            shape="warp"
            type="4x4"
            speed={isHovered ? 0.6 : 0.2}
            className="size-full"
            minPixelRatio={1}
          />
        </div>
      </Suspense>
      <div className="relative z-10 mx-auto grid min-h-[calc(100dvh-4rem)] w-full max-w-6xl items-center gap-10 lg:min-h-[calc(100dvh-8rem)] lg:grid-cols-[minmax(0,1fr)_minmax(400px,440px)] lg:gap-24">
        <section className="flex max-w-xl flex-col justify-center gap-8">
          <Link
            href="/"
            className="flex w-fit items-center gap-2 text-sm font-semibold tracking-tight text-foreground outline-none focus-visible:rounded-sm focus-visible:ring-[3px] focus-visible:ring-ring/50"
          >
            <Image
              src="/logo.png"
              alt=""
              width={24}
              height={24}
              className="size-7"
              priority
            />
            Scheduler
          </Link>
          <div className="flex flex-col gap-4">
            <h1 className="max-w-lg font-heading text-4xl leading-tight font-semibold text-balance sm:text-5xl">
              {copy.title}
            </h1>
            <p className="max-w-[48ch] text-base/7 text-pretty text-muted-foreground">
              {copy.description}
            </p>
          </div>
        </section>
        <section className="w-full rounded-lg border bg-card p-6 sm:p-8">
          {children}
        </section>
      </div>
    </main>
  )
}
