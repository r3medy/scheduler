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
          active_attempts: number
          admission_version: number
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
          active_attempts?: number
          admission_version?: number
          created_at?: string
          updated_at?: string
        }
        Update: Partial<
          Database["public"]["Tables"]["auth_rate_limits"]["Insert"]
        >
        Relationships: []
      }
      auth_rate_limit_admissions: {
        Row: {
          scope: "login-company" | "login-source" | "registration-source"
          rate_key: string
          admission_token: number
          created_at: string
        }
        Insert: {
          scope: "login-company" | "login-source" | "registration-source"
          rate_key: string
          admission_token: number
          created_at?: string
        }
        Update: Partial<
          Database["public"]["Tables"]["auth_rate_limit_admissions"]["Insert"]
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
          create_request_key: string | null
          create_request_hash: string | null
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
          create_request_key?: string | null
          create_request_hash?: string | null
        }
        Update: Partial<Database["public"]["Tables"]["callbacks"]["Insert"]>
        Relationships: []
      }
      feedback: {
        Row: {
          id: string
          user_id: string
          rating: number
          feedback: string
          created_at: string
        }
        Insert: {
          id?: string
          user_id: string
          rating: number
          feedback: string
          created_at?: string
        }
        Update: Partial<Database["public"]["Tables"]["feedback"]["Insert"]>
        Relationships: []
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
      auth_rate_limit_admit: {
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
          admission_token: number | null
        }[]
      }
      auth_rate_limit_record_failure: {
        Args: {
          p_scope: string
          p_key: string
          p_window_seconds: number
          p_max_attempts: number
          p_lockout_seconds: number
          p_admission_token: number
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
          p_admission_token: number
        }
        Returns: undefined
      }
      auth_rate_limit_release: {
        Args: {
          p_scope: string
          p_key: string
          p_admission_token: number
        }
        Returns: undefined
      }
      create_callback_idempotent: {
        Args: {
          p_request_key: string | null
          p_phone_number: string
          p_account_number: string
          p_account_holder_name: string
          p_comments: string | null
          p_schedule_mode: string
          p_scheduled_at: string | null
          p_window_start_at: string | null
          p_window_end_at: string | null
        }
        Returns: {
          callback_id: string
          created: boolean
          same_payload: boolean
        }[]
      }
    }
    Enums: Record<never, never>
    CompositeTypes: Record<never, never>
  }
}
