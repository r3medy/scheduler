import * as React from "react"

import { Label } from "@/components/ui/label"
import { cn } from "@/lib/utils"

export interface AuthFieldProps {
  id: string
  label: string
  description?: string
  error?: string
  children: React.ReactElement
}

export function AuthField({
  id,
  label,
  description,
  error,
  children,
}: AuthFieldProps) {
  const describedBy = [
    description ? `${id}-description` : null,
    error ? `${id}-error` : null,
  ]
    .filter(Boolean)
    .join(" ")

  return (
    <div
      className="flex flex-col gap-2"
      data-invalid={error ? "true" : undefined}
    >
      <Label htmlFor={id}>{label}</Label>
      {React.cloneElement(
        children as React.ReactElement<Record<string, unknown>>,
        {
          "aria-describedby": describedBy || undefined,
          "aria-invalid": error ? true : undefined,
        }
      )}
      {description && (
        <p
          id={`${id}-description`}
          className="text-sm/6 text-pretty text-muted-foreground"
        >
          {description}
        </p>
      )}
      {error && (
        <p
          id={`${id}-error`}
          role="alert"
          className={cn("text-sm/6 text-pretty text-destructive")}
        >
          {error}
        </p>
      )}
    </div>
  )
}
