export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      audit_logs: {
        Row: {
          action: string
          changes: Json | null
          created_at: string
          document_id: string | null
          entity_id: string | null
          entity_type: string | null
          id: string
          ip_address: string | null
          user_agent: string | null
          user_id: string | null
        }
        Insert: {
          action: string
          changes?: Json | null
          created_at?: string
          document_id?: string | null
          entity_id?: string | null
          entity_type?: string | null
          id?: string
          ip_address?: string | null
          user_agent?: string | null
          user_id?: string | null
        }
        Update: {
          action?: string
          changes?: Json | null
          created_at?: string
          document_id?: string | null
          entity_id?: string | null
          entity_type?: string | null
          id?: string
          ip_address?: string | null
          user_agent?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      device_capabilities: {
        Row: {
          app_version: string | null
          autostart_enabled: boolean | null
          background_restricted: boolean | null
          battery_optimization_disabled: boolean | null
          created_at: string
          device_id: string
          doze_whitelisted: boolean | null
          id: string
          last_seen_at: string
          notifications_permission_granted: boolean | null
          oem: string | null
          os_version: string | null
          platform: string | null
          user_id: string
        }
        Insert: {
          app_version?: string | null
          autostart_enabled?: boolean | null
          background_restricted?: boolean | null
          battery_optimization_disabled?: boolean | null
          created_at?: string
          device_id: string
          doze_whitelisted?: boolean | null
          id?: string
          last_seen_at?: string
          notifications_permission_granted?: boolean | null
          oem?: string | null
          os_version?: string | null
          platform?: string | null
          user_id: string
        }
        Update: {
          app_version?: string | null
          autostart_enabled?: boolean | null
          background_restricted?: boolean | null
          battery_optimization_disabled?: boolean | null
          created_at?: string
          device_id?: string
          doze_whitelisted?: boolean | null
          id?: string
          last_seen_at?: string
          notifications_permission_granted?: boolean | null
          oem?: string | null
          os_version?: string | null
          platform?: string | null
          user_id?: string
        }
        Relationships: []
      }
      document_history: {
        Row: {
          action: string
          created_at: string
          document_id: string
          id: string
          new_expiry_date: string | null
          notes: string | null
          old_expiry_date: string | null
          user_id: string
        }
        Insert: {
          action: string
          created_at?: string
          document_id: string
          id?: string
          new_expiry_date?: string | null
          notes?: string | null
          old_expiry_date?: string | null
          user_id: string
        }
        Update: {
          action?: string
          created_at?: string
          document_id?: string
          id?: string
          new_expiry_date?: string | null
          notes?: string | null
          old_expiry_date?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "document_history_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "documents"
            referencedColumns: ["id"]
          },
        ]
      }
      documents: {
        Row: {
          access_count: number
          category_detail: string | null
          created_at: string
          document_type: string
          docvault_category_id: string | null
          expiry_date: string | null
          id: string
          image_path: string | null
          issuing_authority: string | null
          last_accessed_at: string | null
          name: string
          notes: string | null
          renewal_period_days: number | null
          updated_at: string
          user_id: string
        }
        Insert: {
          access_count?: number
          category_detail?: string | null
          created_at?: string
          document_type?: string
          docvault_category_id?: string | null
          expiry_date?: string | null
          id?: string
          image_path?: string | null
          issuing_authority?: string | null
          last_accessed_at?: string | null
          name: string
          notes?: string | null
          renewal_period_days?: number | null
          updated_at?: string
          user_id: string
        }
        Update: {
          access_count?: number
          category_detail?: string | null
          created_at?: string
          document_type?: string
          docvault_category_id?: string | null
          expiry_date?: string | null
          id?: string
          image_path?: string | null
          issuing_authority?: string | null
          last_accessed_at?: string | null
          name?: string
          notes?: string | null
          renewal_period_days?: number | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "documents_docvault_category_id_fkey"
            columns: ["docvault_category_id"]
            isOneToOne: false
            referencedRelation: "docvault_categories"
            referencedColumns: ["id"]
          },
        ]
      }
      docvault_categories: {
        Row: {
          created_at: string
          id: string
          name: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      notification_channels: {
        Row: {
          channel_key: string
          created_at: string
          description: string | null
          display_name: string
          group_key: string | null
          id: string
          importance: string
          led_color: string | null
          ongoing: boolean
          sound: string | null
          vibration_pattern: number[] | null
        }
        Insert: {
          channel_key: string
          created_at?: string
          description?: string | null
          display_name: string
          group_key?: string | null
          id?: string
          importance?: string
          led_color?: string | null
          ongoing?: boolean
          sound?: string | null
          vibration_pattern?: number[] | null
        }
        Update: {
          channel_key?: string
          created_at?: string
          description?: string | null
          display_name?: string
          group_key?: string | null
          id?: string
          importance?: string
          led_color?: string | null
          ongoing?: boolean
          sound?: string | null
          vibration_pattern?: number[] | null
        }
        Relationships: []
      }
      notification_delivery_log: {
        Row: {
          created_at: string
          device_info: string | null
          entity_id: string | null
          entity_type: string | null
          error: string | null
          event: string
          id: string
          latency_ms: number | null
          notification_state_id: string | null
          provider:
            | Database["public"]["Enums"]["notification_provider_enum"]
            | null
          user_id: string
        }
        Insert: {
          created_at?: string
          device_info?: string | null
          entity_id?: string | null
          entity_type?: string | null
          error?: string | null
          event: string
          id?: string
          latency_ms?: number | null
          notification_state_id?: string | null
          provider?:
            | Database["public"]["Enums"]["notification_provider_enum"]
            | null
          user_id: string
        }
        Update: {
          created_at?: string
          device_info?: string | null
          entity_id?: string | null
          entity_type?: string | null
          error?: string | null
          event?: string
          id?: string
          latency_ms?: number | null
          notification_state_id?: string | null
          provider?:
            | Database["public"]["Enums"]["notification_provider_enum"]
            | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "notification_delivery_log_notification_state_id_fkey"
            columns: ["notification_state_id"]
            isOneToOne: false
            referencedRelation: "notification_state"
            referencedColumns: ["id"]
          },
        ]
      }
      notification_retry_queue: {
        Row: {
          attempt_count: number
          created_at: string
          id: string
          last_error: string | null
          next_attempt_at: string
          notification_state_id: string | null
          payload: Json
          user_id: string
        }
        Insert: {
          attempt_count?: number
          created_at?: string
          id?: string
          last_error?: string | null
          next_attempt_at?: string
          notification_state_id?: string | null
          payload: Json
          user_id: string
        }
        Update: {
          attempt_count?: number
          created_at?: string
          id?: string
          last_error?: string | null
          next_attempt_at?: string
          notification_state_id?: string | null
          payload?: Json
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "notification_retry_queue_notification_state_id_fkey"
            columns: ["notification_state_id"]
            isOneToOne: false
            referencedRelation: "notification_state"
            referencedColumns: ["id"]
          },
        ]
      }
      notification_state: {
        Row: {
          channel_key: string
          created_at: string
          dispatch_count: number
          entity_id: string
          entity_type: string
          id: string
          last_dispatched_at: string | null
          payload: Json
          restore_after_reboot: boolean
          scheduled_for: string
          snoozed_until: string | null
          state: Database["public"]["Enums"]["notification_state_enum"]
          updated_at: string
          user_id: string
        }
        Insert: {
          channel_key?: string
          created_at?: string
          dispatch_count?: number
          entity_id: string
          entity_type: string
          id?: string
          last_dispatched_at?: string | null
          payload?: Json
          restore_after_reboot?: boolean
          scheduled_for: string
          snoozed_until?: string | null
          state?: Database["public"]["Enums"]["notification_state_enum"]
          updated_at?: string
          user_id: string
        }
        Update: {
          channel_key?: string
          created_at?: string
          dispatch_count?: number
          entity_id?: string
          entity_type?: string
          id?: string
          last_dispatched_at?: string | null
          payload?: Json
          restore_after_reboot?: boolean
          scheduled_for?: string
          snoozed_until?: string | null
          state?: Database["public"]["Enums"]["notification_state_enum"]
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      notification_tokens: {
        Row: {
          created_at: string
          device_info: string | null
          id: string
          provider: Database["public"]["Enums"]["notification_provider_enum"]
          token: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          device_info?: string | null
          id?: string
          provider: Database["public"]["Enums"]["notification_provider_enum"]
          token: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          device_info?: string | null
          id?: string
          provider?: Database["public"]["Enums"]["notification_provider_enum"]
          token?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      onesignal_player_ids: {
        Row: {
          created_at: string
          id: string
          player_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          player_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          player_id?: string
          user_id?: string
        }
        Relationships: []
      }
      organization_members: {
        Row: {
          created_at: string
          id: string
          organization_id: string
          role: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          organization_id: string
          role?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          organization_id?: string
          role?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "organization_members_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      organizations: {
        Row: {
          created_at: string
          id: string
          name: string
          owner_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          owner_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          owner_id?: string
          updated_at?: string
        }
        Relationships: []
      }
      otp_codes: {
        Row: {
          created_at: string
          expires_at: string
          failed_attempts: number
          id: string
          ip_address: string | null
          is_verified: boolean
          last_otp_sent_at: string | null
          locked_until: string | null
          otp_code: string
          phone_number: string
        }
        Insert: {
          created_at?: string
          expires_at: string
          failed_attempts?: number
          id?: string
          ip_address?: string | null
          is_verified?: boolean
          last_otp_sent_at?: string | null
          locked_until?: string | null
          otp_code: string
          phone_number: string
        }
        Update: {
          created_at?: string
          expires_at?: string
          failed_attempts?: number
          id?: string
          ip_address?: string | null
          is_verified?: boolean
          last_otp_sent_at?: string | null
          locked_until?: string | null
          otp_code?: string
          phone_number?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          avatar_url: string | null
          country: string | null
          created_at: string
          display_name: string | null
          email: string | null
          email_notifications_enabled: boolean
          expiry_reminders_enabled: boolean
          id: string
          notification_sounds: Json
          phone_number: string | null
          preferred_notification_time: string
          push_notifications_enabled: boolean
          renewal_reminders_enabled: boolean
          sms_notifications_enabled: boolean
          theme: string | null
          timezone: string
          updated_at: string
          user_id: string
          voice_greeting_enabled: boolean
          weekly_digest_enabled: boolean
        }
        Insert: {
          avatar_url?: string | null
          country?: string | null
          created_at?: string
          display_name?: string | null
          email?: string | null
          email_notifications_enabled?: boolean
          expiry_reminders_enabled?: boolean
          id?: string
          notification_sounds?: Json
          phone_number?: string | null
          preferred_notification_time?: string
          push_notifications_enabled?: boolean
          renewal_reminders_enabled?: boolean
          sms_notifications_enabled?: boolean
          theme?: string | null
          timezone?: string
          updated_at?: string
          user_id: string
          voice_greeting_enabled?: boolean
          weekly_digest_enabled?: boolean
        }
        Update: {
          avatar_url?: string | null
          country?: string | null
          created_at?: string
          display_name?: string | null
          email?: string | null
          email_notifications_enabled?: boolean
          expiry_reminders_enabled?: boolean
          id?: string
          notification_sounds?: Json
          phone_number?: string | null
          preferred_notification_time?: string
          push_notifications_enabled?: boolean
          renewal_reminders_enabled?: boolean
          sms_notifications_enabled?: boolean
          theme?: string | null
          timezone?: string
          updated_at?: string
          user_id?: string
          voice_greeting_enabled?: boolean
          weekly_digest_enabled?: boolean
        }
        Relationships: []
      }
      reminders: {
        Row: {
          created_at: string
          document_id: string
          id: string
          is_custom: boolean
          is_sent: boolean
          reminder_date: string
          stage: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          document_id: string
          id?: string
          is_custom?: boolean
          is_sent?: boolean
          reminder_date: string
          stage?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          document_id?: string
          id?: string
          is_custom?: boolean
          is_sent?: boolean
          reminder_date?: string
          stage?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "reminders_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "documents"
            referencedColumns: ["id"]
          },
        ]
      }
      routine_notification_log: {
        Row: {
          id: string
          notification_key: string
          notified_at: string
          routine_id: string | null
          slot_id: string | null
          user_id: string
        }
        Insert: {
          id?: string
          notification_key: string
          notified_at?: string
          routine_id?: string | null
          slot_id?: string | null
          user_id: string
        }
        Update: {
          id?: string
          notification_key?: string
          notified_at?: string
          routine_id?: string | null
          slot_id?: string | null
          user_id?: string
        }
        Relationships: []
      }
      routine_task_slots: {
        Row: {
          created_at: string
          days_of_week: number[]
          id: string
          task_id: string
          time: string
        }
        Insert: {
          created_at?: string
          days_of_week?: number[]
          id?: string
          task_id: string
          time: string
        }
        Update: {
          created_at?: string
          days_of_week?: number[]
          id?: string
          task_id?: string
          time?: string
        }
        Relationships: [
          {
            foreignKeyName: "routine_task_slots_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "routine_tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      routine_tasks: {
        Row: {
          created_at: string
          id: string
          name: string
          routine_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          routine_id: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          routine_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "routine_tasks_routine_id_fkey"
            columns: ["routine_id"]
            isOneToOne: false
            referencedRelation: "routines"
            referencedColumns: ["id"]
          },
        ]
      }
      routines: {
        Row: {
          created_at: string
          icon: string | null
          id: string
          is_active: boolean
          name: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          icon?: string | null
          id?: string
          is_active?: boolean
          name: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          icon?: string | null
          id?: string
          is_active?: boolean
          name?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      scheduled_notifications: {
        Row: {
          active: boolean
          body: string | null
          channel_key: string
          created_at: string
          device_id: string | null
          fire_at: string
          id: string
          local_alarm_id: number | null
          notification_state_id: string | null
          payload: Json
          title: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          active?: boolean
          body?: string | null
          channel_key?: string
          created_at?: string
          device_id?: string | null
          fire_at: string
          id?: string
          local_alarm_id?: number | null
          notification_state_id?: string | null
          payload?: Json
          title?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          active?: boolean
          body?: string | null
          channel_key?: string
          created_at?: string
          device_id?: string | null
          fire_at?: string
          id?: string
          local_alarm_id?: number | null
          notification_state_id?: string | null
          payload?: Json
          title?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "scheduled_notifications_notification_state_id_fkey"
            columns: ["notification_state_id"]
            isOneToOne: false
            referencedRelation: "notification_state"
            referencedColumns: ["id"]
          },
        ]
      }
      tasks: {
        Row: {
          consecutive_missed_days: number
          created_at: string
          description: string | null
          end_time: string | null
          id: string
          image_path: string | null
          last_overdue_alert_sent: string | null
          last_reminder_sent_at: string | null
          local_date: string
          original_date: string
          reminder_active: boolean
          routine_id: string | null
          start_notified: boolean
          start_time: string
          status: string
          task_date: string
          timezone: string
          title: string
          total_time_minutes: number | null
          updated_at: string
          user_id: string
        }
        Insert: {
          consecutive_missed_days?: number
          created_at?: string
          description?: string | null
          end_time?: string | null
          id?: string
          image_path?: string | null
          last_overdue_alert_sent?: string | null
          last_reminder_sent_at?: string | null
          local_date: string
          original_date: string
          reminder_active?: boolean
          routine_id?: string | null
          start_notified?: boolean
          start_time: string
          status?: string
          task_date: string
          timezone?: string
          title: string
          total_time_minutes?: number | null
          updated_at?: string
          user_id: string
        }
        Update: {
          consecutive_missed_days?: number
          created_at?: string
          description?: string | null
          end_time?: string | null
          id?: string
          image_path?: string | null
          last_overdue_alert_sent?: string | null
          last_reminder_sent_at?: string | null
          local_date?: string
          original_date?: string
          reminder_active?: boolean
          routine_id?: string | null
          start_notified?: boolean
          start_time?: string
          status?: string
          task_date?: string
          timezone?: string
          title?: string
          total_time_minutes?: number | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_org_member: {
        Args: { _org_id: string; _user_id: string }
        Returns: boolean
      }
    }
    Enums: {
      app_role: "admin" | "moderator" | "user"
      notification_provider_enum:
        | "fcm"
        | "onesignal"
        | "capacitor"
        | "local"
        | "web"
      notification_state_enum:
        | "pending"
        | "active"
        | "snoozed"
        | "completed"
        | "expired"
        | "dismissed"
        | "failed"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      app_role: ["admin", "moderator", "user"],
      notification_provider_enum: [
        "fcm",
        "onesignal",
        "capacitor",
        "local",
        "web",
      ],
      notification_state_enum: [
        "pending",
        "active",
        "snoozed",
        "completed",
        "expired",
        "dismissed",
        "failed",
      ],
    },
  },
} as const
