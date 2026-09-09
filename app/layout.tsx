import { Figtree, Geist_Mono, Lora } from "next/font/google"
import type { Metadata } from "next"
import { Analytics } from "@vercel/analytics/next"

import "./globals.css"
import { ThemeProvider } from "@/components/theme-provider"
import { MobileGatekeeper } from "@/components/mobile-gatekeeper"
import { NotificationAuthLifecycle } from "@/components/notifications/notification-auth-lifecycle"
import { TooltipProvider } from "@/components/ui/tooltip"
import { reportRuntimeConfiguration } from "@/lib/config/runtime"
import { cn } from "@/lib/utils"

const loraHeading = Lora({
  subsets: ["latin"],
  variable: "--font-heading",
})

const figtree = Figtree({ subsets: ["latin"], variable: "--font-sans" })

const fontMono = Geist_Mono({
  subsets: ["latin"],
  variable: "--font-mono",
})

export const metadata: Metadata = {
  title: {
    default: "Scheduler",
    template: "%s | Scheduler",
  },
  description:
    "Scheduler is a private workspace for scheduling and rescheduling callbacks.",
  icons: {
    icon: [
      { url: "/favicon.ico", sizes: "16x16 32x32 48x48" },
      { url: "/icon.png", type: "image/png", sizes: "512x512" },
    ],
    apple: [{ url: "/apple-icon.png", sizes: "180x180" }],
  },
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  reportRuntimeConfiguration()

  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={cn(
        "font-sans antialiased",
        fontMono.variable,
        figtree.variable,
        loraHeading.variable
      )}
    >
      <body>
        <ThemeProvider>
          <TooltipProvider>
            <NotificationAuthLifecycle />
            {children}
          </TooltipProvider>
        </ThemeProvider>
        <MobileGatekeeper />
        <Analytics />
      </body>
    </html>
  )
}
