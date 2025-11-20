export interface Profile {
  user_id: string;
  display_name: string | null;
  email: string | null;
  timezone: string;
  preferred_notification_time: string | null;
  push_notifications_enabled: boolean;
  email_notifications_enabled: boolean;
}

export interface Task {
  id: string;
  user_id: string;
  title: string;
  description: string | null;
  status: string;
  start_time: string;
  end_time: string | null;
  task_date: string;
  original_date: string;
  local_date: string;
  timezone: string;
  consecutive_missed_days: number;
  last_reminder_sent_at: string | null;
  reminder_active: boolean;
  start_notified: boolean;
  total_time_minutes: number | null;
  image_path: string | null;
  created_at: string;
  updated_at: string;
}

export interface Document {
  id: string;
  user_id: string;
  name: string;
  document_type: string;
  expiry_date: string;
  issuing_authority: string | null;
  image_path: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface NotificationPayload {
  userId: string;
  title: string;
  message: string;
  data?: Record<string, string>;
}

export interface ApiResponse {
  success: boolean;
  message?: string;
  error?: string;
  data?: unknown;
}
