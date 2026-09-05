"use client"

import * as React from "react"
import { OTPInput, OTPInputContext } from "input-otp"

import { cn } from "@/lib/utils"

function InputOTP({
  className,
  containerClassName,
  ...props
}: React.ComponentProps<typeof OTPInput>) {
  return (
    <OTPInput
      data-slot="input-otp"
      containerClassName={cn(
        "flex items-center gap-2 has-disabled:opacity-50",
        containerClassName
      )}
      className={cn("disabled:cursor-not-allowed", className)}
      {...props}
    />
  )
}

function InputOTPGroup({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="input-otp-group"
      className={cn("flex items-center", className)}
      {...props}
    />
  )
}

interface InputOTPSlotProps extends React.ComponentProps<"div"> {
  index: number
}

interface InputOTPSlotValue {
  char: string | null
  placeholderChar?: string | null
  isActive: boolean
  hasFakeCaret: boolean
}

interface InputOTPContextValue {
  slots: InputOTPSlotValue[]
}

interface InputOTPSlotProps extends React.ComponentProps<"div"> {
  index: number
  char?: string | null
  placeholderChar?: string | null
  isActive?: boolean
  hasFakeCaret?: boolean
}

function InputOTPSlot({
  index,
  char,
  placeholderChar,
  isActive,
  hasFakeCaret,
  className,
  ...props
}: InputOTPSlotProps) {
  const inputOTPContext = React.useContext(
    OTPInputContext as unknown as React.Context<InputOTPContextValue>
  )
  const contextSlot = inputOTPContext?.slots?.[index]
  const slot = contextSlot ?? {
    char: char ?? null,
    placeholderChar,
    isActive: isActive ?? false,
    hasFakeCaret: hasFakeCaret ?? false,
  }

  return (
    <div
      data-slot="input-otp-slot"
      data-active={slot.isActive}
      className={cn(
        "relative flex size-10 items-center justify-center border-y border-r border-input text-sm font-medium first:rounded-l-md first:border-l last:rounded-r-md",
        "data-[active=true]:z-10 data-[active=true]:border-ring data-[active=true]:ring-[3px] data-[active=true]:ring-ring/50",
        className
      )}
      {...props}
    >
      {slot.char ? "•" : slot.placeholderChar}
      {slot.hasFakeCaret && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <div className="h-5 w-px bg-foreground" />
        </div>
      )}
    </div>
  )
}

function InputOTPSeparator({
  className,
  ...props
}: React.ComponentProps<"hr">) {
  return (
    <hr
      data-slot="input-otp-separator"
      className={cn("border-0", className)}
      {...props}
    />
  )
}

export { InputOTP, InputOTPGroup, InputOTPSeparator, InputOTPSlot }
