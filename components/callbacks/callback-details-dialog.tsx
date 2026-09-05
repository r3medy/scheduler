"use client"

import { useRef, useState, type ComponentProps, type RefObject } from "react"
import { IconX } from "@tabler/icons-react"
import { useRouter } from "next/navigation"
import { deleteCallback } from "@/lib/callbacks/delete-callback"
import { CallbackStatusSelect } from "@/components/callbacks/callback-status-select"
import {
  getCallback,
  type CallbackDetailResult,
  type CallbackRecord,
} from "@/lib/callbacks/get-callback"
import { NewCallbackDialog } from "@/components/callbacks/new-callback-dialog"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogTrigger,
  DialogContent,
  DialogTitle,
  DialogDescription,
  DialogClose,
} from "@/components/ui/dialog"

function formatCallbackDate(date: string) {
  return new Date(date).toLocaleString("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Africa/Cairo",
  })
}

function DetailsContent({
  result,
  callback,
  onRetry,
  onStatusSaved,
}: {
  result: CallbackDetailResult | null
  callback: CallbackRecord | null
  onRetry: () => void
  onStatusSaved: () => void
}) {
  if (!result) return <p role="status">Loading callback…</p>
  if (result.status === "error")
    return (
      <div className="flex flex-col gap-4">
        <p role="alert">{result.message}</p>
        <Button variant="outline" onClick={onRetry}>
          Try again
        </Button>
      </div>
    )
  if (!callback) return null
  return (
    <>
      <dl className="grid gap-4 text-sm">
        {[
          ["Account-holder name", callback.account_holder_name],
          ["Callback phone number", callback.phone_number],
          ["Account number", callback.account_number],
          [
            "Schedule",
            callback.schedule_mode === "exact"
              ? formatCallbackDate(callback.scheduled_at!)
              : `${formatCallbackDate(callback.window_start_at!)} – ${formatCallbackDate(callback.window_end_at!)}`,
          ],
          [
            "Additional comments",
            callback.comments || "No additional comments.",
          ],
        ].map(([label, value]) => (
          <div key={label} className="flex flex-col gap-1">
            <dt className="text-muted-foreground">{label}</dt>
            <dd className="break-words whitespace-pre-wrap">{value}</dd>
          </div>
        ))}
      </dl>
      <div className="mt-4">
        <CallbackStatusSelect
          key={`${callback.id}-${callback.updated_at}`}
          callback={callback}
          onSaved={onStatusSaved}
        />
      </div>
    </>
  )
}

function DetailsFooter({
  confirmDelete,
  deleting,
  canDelete,
  cancelRef,
  deleteRef,
  onCancelDelete,
  onRequestDelete,
  onConfirmDelete,
}: {
  confirmDelete: boolean
  deleting: boolean
  canDelete: boolean
  cancelRef: RefObject<HTMLButtonElement | null>
  deleteRef: RefObject<HTMLButtonElement | null>
  onCancelDelete: () => void
  onRequestDelete: () => void
  onConfirmDelete: () => void
}) {
  if (confirmDelete)
    return (
      <>
        <Button
          ref={cancelRef}
          variant="outline"
          disabled={deleting}
          onClick={onCancelDelete}
        >
          Cancel
        </Button>
        <Button
          variant="destructive"
          disabled={deleting}
          onClick={onConfirmDelete}
        >
          {deleting ? "Deleting…" : "Delete callback"}
        </Button>
      </>
    )
  return (
    <Button
      ref={deleteRef}
      variant="destructive"
      disabled={!canDelete}
      onClick={onRequestDelete}
    >
      Delete callback
    </Button>
  )
}

export function CallbackDetailsDialog({
  callbackId,
  ...triggerProps
}: ComponentProps<"button"> & { callbackId: string }) {
  const [result, setResult] = useState<CallbackDetailResult | null>(null)
  const [open, setOpen] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [deleteError, setDeleteError] = useState<string | null>(null)
  const cancelRef = useRef<HTMLButtonElement>(null)
  const deleteRef = useRef<HTMLButtonElement>(null)
  const deletingRef = useRef(false)
  const request = useRef(0)
  const router = useRouter()
  async function remove() {
    if (deletingRef.current) return
    deletingRef.current = true
    setDeleting(true)
    setDeleteError(null)
    try {
      const outcome = await deleteCallback(callbackId)
      if (outcome.status === "success") {
        setOpen(false)
        request.current++
        setResult(null)
        router.refresh()
      } else setDeleteError(outcome.message)
    } catch {
      setDeleteError(
        "Could not confirm deletion. Check your connection and reload before trying again."
      )
    } finally {
      deletingRef.current = false
      setDeleting(false)
    }
  }
  async function load() {
    const current = ++request.current
    setResult(null)
    try {
      const next = await getCallback(callbackId)
      if (current === request.current) setResult(next)
    } catch {
      if (current === request.current)
        setResult({
          status: "error",
          message: "Could not load the callback. Please try again.",
        })
    }
  }
  const callback = result?.status === "success" ? result.callback : null
  return (
    <Dialog
      open={open}
      onOpenChange={(open, event) => {
        if (deletingRef.current) {
          event.cancel()
          return
        }
        setOpen(open)
        setConfirmDelete(false)
        setDeleteError(null)
        if (open) void load()
        else {
          request.current++
          setResult(null)
        }
      }}
    >
      <DialogTrigger {...triggerProps} type="button" />
      <DialogContent role={confirmDelete ? "alertdialog" : "dialog"}>
        <div
          className={`flex items-center justify-between gap-4 p-6 ${confirmDelete ? "" : "border-b"}`}
        >
          <div className="flex flex-col gap-2">
            <DialogTitle>
              {confirmDelete ? "Delete callback?" : "Callback details"}
            </DialogTitle>
            <DialogDescription>
              {confirmDelete
                ? "This permanently deletes the callback and any associated attempt history. This cannot be undone."
                : "Customer information and scheduled callback time."}
            </DialogDescription>
          </div>
          <div className="flex shrink-0 items-center gap-1">
            {callback && !confirmDelete && (
              <NewCallbackDialog
                callback={callback}
                onOpen={() => {}}
                onSaved={() => {
                  void load()
                }}
              />
            )}
            <DialogClose
              render={
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  aria-label="Close callback details"
                  title="Close"
                  disabled={deleting}
                />
              }
            >
              <IconX aria-hidden="true" />
            </DialogClose>
          </div>
        </div>
        {confirmDelete ? (
          deleteError && (
            <div className="px-6 pb-6">
              <p role="alert" className="text-sm text-destructive">
                {deleteError}
              </p>
            </div>
          )
        ) : (
          <div className="overflow-y-auto p-6">
            <DetailsContent
              result={result}
              callback={callback}
              onRetry={() => void load()}
              onStatusSaved={() => {
                setOpen(false)
                request.current++
                setResult(null)
                router.refresh()
              }}
            />
            {deleteError && (
              <p role="alert" className="text-sm text-destructive">
                {deleteError}
              </p>
            )}
          </div>
        )}
        <div className="flex justify-end gap-2 border-t p-4">
          <DetailsFooter
            confirmDelete={confirmDelete}
            deleting={deleting}
            canDelete={callback !== null}
            cancelRef={cancelRef}
            deleteRef={deleteRef}
            onCancelDelete={() => {
              setConfirmDelete(false)
              setDeleteError(null)
            }}
            onRequestDelete={() => {
              setConfirmDelete(true)
              requestAnimationFrame(() => cancelRef.current?.focus())
            }}
            onConfirmDelete={() => void remove()}
          />
        </div>
      </DialogContent>
    </Dialog>
  )
}
