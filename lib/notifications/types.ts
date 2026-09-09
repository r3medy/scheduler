export interface SchedulableCallback {
  id: string
  schedule_mode: "exact" | "window"
  scheduled_at: string | null
  window_start_at: string | null
  window_end_at: string | null
  lifecycle_state?: string | null
}

export type NotificationKind = "exact" | "window-start"

export interface DueNotice {
  key: string
  callbackId: string
  triggerAt: string
  kind: NotificationKind
  title: string
  body: string
  overdue: boolean
  createdAt: string
}

export interface NativePayload {
  title: string
  body: string
  tag: string
}

export type NotificationPermissionState =
  | "granted"
  | "denied"
  | "default"
  | "unsupported"
