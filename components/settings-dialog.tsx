"use client"

import { useRef, useState, type FormEvent, type RefObject } from "react"
import {
  IconSettings,
  IconX,
  IconArrowLeft,
  IconLogout,
  IconTrash,
} from "@tabler/icons-react"
import {
  changePin,
  deleteAccount,
  signOutAccount,
  type AccountResult,
} from "@/lib/auth/account-actions"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogTrigger,
  DialogContent,
  DialogTitle,
  DialogDescription,
  DialogClose,
} from "@/components/ui/dialog"
import { Field, FieldLabel, FieldGroup } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Separator } from "@/components/ui/separator"

function PinFields({ deleting }: { deleting: boolean }) {
  if (deleting)
    return (
      <Field>
        <FieldLabel htmlFor="settings-confirm">
          Type DELETE to confirm
        </FieldLabel>
        <Input
          id="settings-confirm"
          name="confirmation"
          autoComplete="off"
          pattern="DELETE"
          required
        />
      </Field>
    )
  return (
    <>
      <Field>
        <FieldLabel htmlFor="settings-new">New PIN</FieldLabel>
        <Input
          id="settings-new"
          name="newPin"
          type="password"
          inputMode="numeric"
          pattern="[0-9]{6}"
          minLength={6}
          maxLength={6}
          autoComplete="new-password"
          required
        />
      </Field>
      <Field>
        <FieldLabel htmlFor="settings-repeat">Confirm new PIN</FieldLabel>
        <Input
          id="settings-repeat"
          name="confirmPin"
          type="password"
          inputMode="numeric"
          pattern="[0-9]{6}"
          minLength={6}
          maxLength={6}
          autoComplete="new-password"
          required
        />
      </Field>
    </>
  )
}

function SettingsResult({ result }: { result: AccountResult | null }) {
  if (!result) return null
  return (
    <p
      role={result.status === "error" ? "alert" : "status"}
      className={
        result.status === "error"
          ? "text-sm text-destructive"
          : "text-sm text-primary"
      }
    >
      {result.message}
    </p>
  )
}

function DangerZone({
  disabled,
  signingOut,
  onSignOut,
  onRequestDelete,
}: {
  disabled: boolean
  signingOut: boolean
  onSignOut: () => void
  onRequestDelete: () => void
}) {
  return (
    <>
      <Separator />
      <div className="flex flex-col gap-2">
        <h2 className="font-medium">Log out</h2>
        <p className="text-sm text-muted-foreground">
          Sign out of Scheduler on this device.
        </p>
      </div>
      <Button
        type="button"
        variant="outline"
        className="self-start"
        disabled={disabled}
        onClick={onSignOut}
      >
        <IconLogout data-icon="inline-start" />
        {signingOut ? "Logging out…" : "Log out"}
      </Button>
      <Separator />
      <div className="flex flex-col gap-2">
        <h2 className="font-medium">Delete account</h2>
        <p className="text-sm text-muted-foreground">
          Permanently remove your account and all your callback records.
        </p>
      </div>
      <Button
        type="button"
        variant="destructive"
        className="self-start"
        disabled={disabled}
        onClick={onRequestDelete}
      >
        <IconTrash data-icon="inline-start" />
        Delete account…
      </Button>
    </>
  )
}

function DeleteFooter({
  disabled,
  pending,
  cancelRef,
  onCancel,
}: {
  disabled: boolean
  pending: boolean
  cancelRef: RefObject<HTMLButtonElement | null>
  onCancel: () => void
}) {
  return (
    <div className="flex flex-wrap justify-end gap-2 border-t p-4">
      <Button
        ref={cancelRef}
        type="button"
        variant="outline"
        disabled={disabled}
        onClick={onCancel}
      >
        <IconArrowLeft data-icon="inline-start" />
        Cancel
      </Button>
      <Button
        type="submit"
        variant="destructive"
        disabled={disabled}
      >
        {pending ? "Deleting account…" : "Permanently delete account"}
      </Button>
    </div>
  )
}

export function SettingsDialog() {
  const [open, setOpen] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [pending, setPending] = useState(false)
  const [signingOut, setSigningOut] = useState(false)
  const [result, setResult] = useState<AccountResult | null>(null)
  const busy = useRef(false)
  const cancelRef = useRef<HTMLButtonElement>(null)
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (busy.current) return
    const form = event.currentTarget
    const data = new FormData(form)
    busy.current = true
    setPending(true)
    setResult(null)
    try {
      const next = await (deleting ? deleteAccount(data) : changePin(data))
      setResult(next)
      if (next.status === "success") {
        form.reset()
        if (deleting) window.location.replace("/login")
      }
    } catch {
      setResult({
        status: "error",
        message:
          "Could not confirm the change. Check your connection and sign in again before retrying.",
      })
    } finally {
      busy.current = false
      setPending(false)
    }
  }
  async function handleSignOut() {
    if (busy.current || signingOut) return
    busy.current = true
    setSigningOut(true)
    setResult(null)
    try {
      const next = await signOutAccount()
      if (next.status === "success") {
        window.location.replace("/login")
        return
      }
      setResult(next)
    } catch {
      setResult({
        status: "error",
        message: "Could not log you out. Please try again.",
      })
    } finally {
      busy.current = false
      setSigningOut(false)
    }
  }
  const disabled = pending || signingOut
  return (
    <Dialog
      open={open}
      onOpenChange={(next, event) => {
        if (busy.current) {
          event.cancel()
          return
        }
        setOpen(next)
        setDeleting(false)
        setResult(null)
      }}
    >
      <DialogTrigger
        className="rail-item"
        aria-label="Settings"
        title="Settings"
      >
        <span className="rail-icon">
          <IconSettings aria-hidden="true" />
        </span>
        <span>Settings</span>
      </DialogTrigger>
      <DialogContent role={deleting ? "alertdialog" : "dialog"}>
        <div className="flex items-start justify-between gap-4 border-b p-6">
          <div className="flex flex-col gap-2">
            <DialogTitle>
              {deleting ? "Delete your account?" : "Settings"}
            </DialogTitle>
            <DialogDescription>
              {deleting
                ? "Your account and all your callbacks will be permanently removed. This cannot be undone."
                : "Manage the six-digit PIN you use to sign in."}
            </DialogDescription>
          </div>
          <DialogClose
            render={
              <Button
                variant="ghost"
                size="icon"
                aria-label="Close settings"
                disabled={disabled}
              />
            }
          >
            <IconX />
          </DialogClose>
        </div>
        <form
          key={String(deleting)}
          onSubmit={submit}
          className="flex min-h-0 flex-col"
          aria-busy={disabled}
        >
          <fieldset disabled={disabled} className="overflow-y-auto p-6">
            <FieldGroup>
              {!deleting && <h2 className="font-medium">Change PIN</h2>}
              <Field>
                <FieldLabel htmlFor="settings-current">Current PIN</FieldLabel>
                <Input
                  id="settings-current"
                  name="currentPin"
                  type="password"
                  inputMode="numeric"
                  pattern="[0-9]{6}"
                  minLength={6}
                  maxLength={6}
                  autoComplete="current-password"
                  required
                />
              </Field>
              <PinFields deleting={deleting} />
              <SettingsResult result={result} />
              {!deleting && (
                <Button
                  type="submit"
                  disabled={disabled}
                  className="self-start"
                >
                  {pending ? "Updating PIN…" : "Update PIN"}
                </Button>
              )}
              {!deleting && (
                <DangerZone
                  disabled={disabled}
                  signingOut={signingOut}
                  onSignOut={() => void handleSignOut()}
                  onRequestDelete={() => {
                    setDeleting(true)
                    setResult(null)
                    requestAnimationFrame(() => cancelRef.current?.focus())
                  }}
                />
              )}
            </FieldGroup>
          </fieldset>
          {deleting && (
            <DeleteFooter
              disabled={disabled}
              pending={pending}
              cancelRef={cancelRef}
              onCancel={() => {
                setDeleting(false)
                setResult(null)
              }}
            />
          )}
        </form>
      </DialogContent>
    </Dialog>
  )
}
