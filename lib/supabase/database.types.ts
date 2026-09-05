export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export interface Database {
  public: {
    Tables: {
      auth_rate_limits: {
        Row: {
          scope: "login-company" | "login-source" | "registration-source"
          rate_key: string
          window_started_at: string
          expires_at: string
          failure_count: number
          locked_until: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          scope: "login-company" | "login-source" | "registration-source"
          rate_key: string
          window_started_at: string
          expires_at: string
          failure_count?: number
          locked_until?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: Partial<
          Database["public"]["Tables"]["auth_rate_limits"]["Insert"]
        >
        Relationships: []
      }
      callbacks: {
        Row: {
          id: string
          user_id: string
          phone_number: string
          account_number: string
          account_holder_name: string
          comments: string | null
          schedule_mode: "exact" | "window"
          scheduled_at: string | null
          window_start_at: string | null
          window_end_at: string | null
          lifecycle_state: "open" | "closed"
          resolution_outcome: "reached" | "voicemail" | "no_answer" | null
          closed_at: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          user_id: string
          phone_number: string
          account_number: string
          account_holder_name: string
          comments?: string | null
          schedule_mode: "exact" | "window"
          scheduled_at?: string | null
          window_start_at?: string | null
          window_end_at?: string | null
          lifecycle_state?: "open" | "closed"
          resolution_outcome?: "reached" | "voicemail" | "no_answer" | null
          closed_at?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: Partial<Database["public"]["Tables"]["callbacks"]["Insert"]>
        Relationships: []
      }
      callback_attempts: {
        Row: {
          id: string
          callback_id: string
          attempted_at: string
          outcome: "voicemail" | "no_answer"
          note: string | null
          caused_rescheduling: boolean
          prior_schedule_mode: "exact" | "window" | null
          prior_scheduled_at: string | null
          prior_window_start_at: string | null
          prior_window_end_at: string | null
          created_at: string
        }
        Insert: {
          id?: string
          callback_id: string
          attempted_at?: string
          outcome: "voicemail" | "no_answer"
          note?: string | null
          caused_rescheduling: boolean
          prior_schedule_mode?: "exact" | "window" | null
          prior_scheduled_at?: string | null
          prior_window_start_at?: string | null
          prior_window_end_at?: string | null
          created_at?: string
        }
        Update: Partial<
          Database["public"]["Tables"]["callback_attempts"]["Insert"]
        >
        Relationships: [
          {
            foreignKeyName: "callback_attempts_callback_id_fkey"
            columns: ["callback_id"]
            isOneToOne: false
            referencedRelation: "callbacks"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: Record<never, never>
    Functions: {
      auth_rate_limit_status: {
        Args: {
          p_scope: string
          p_key: string
          p_window_seconds: number
          p_max_attempts: number
          p_lockout_seconds?: number
        }
        Returns: {
          allowed: boolean
          failure_count: number
          retry_at: string | null
        }[]
      }
      auth_rate_limit_record_failure: {
        Args: {
          p_scope: string
          p_key: string
          p_window_seconds: number
          p_max_attempts: number
          p_lockout_seconds?: number
        }
        Returns: {
          allowed: boolean
          failure_count: number
          retry_at: string | null
        }[]
      }
      auth_rate_limit_reset: {
        Args: {
          p_scope: string
          p_key: string
        }
        Returns: undefined
      }
      record_callback_attempt: {
        Args: {
          p_callback_id: string
          p_outcome: "voicemail" | "no_answer"
          p_note: string | null
          p_action: "close" | "reschedule"
          p_schedule_mode: "exact" | "window" | null
          p_scheduled_at: string | null
          p_window_start_at: string | null
          p_window_end_at: string | null
        }
        Returns: string
      }
    }
    Enums: Record<never, never>
    CompositeTypes: Record<never, never>
  }
}
