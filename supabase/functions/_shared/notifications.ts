import { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';
import type { NotificationPayload } from './types.ts';

const ONESIGNAL_TIMEOUT_MS = 10000;

export async function sendPushNotification(
  supabase: SupabaseClient,
  payload: NotificationPayload
): Promise<boolean> {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), ONESIGNAL_TIMEOUT_MS);
    
    const { error } = await supabase.functions.invoke('send-onesignal-notification', {
      body: payload,
    });
    
    clearTimeout(timeoutId);
    
    if (error) {
      console.error('Push notification error:', error);
      return false;
    }
    
    return true;
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      console.error('Push notification timeout');
    } else {
      console.error('Push notification exception:', error);
    }
    return false;
  }
}

// Export unified notification function
export { sendUnifiedNotification } from './unified-notifications.ts';

export async function sendEmailNotification(
  supabaseUrl: string,
  supabaseKey: string,
  to: string,
  subject: string,
  html: string
): Promise<boolean> {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), ONESIGNAL_TIMEOUT_MS);
    
    const response = await fetch(`${supabaseUrl}/functions/v1/send-reminder-emails`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${supabaseKey}`,
      },
      body: JSON.stringify({ to: [to], subject, html }),
      signal: controller.signal,
    });
    
    clearTimeout(timeoutId);
    
    if (!response.ok) {
      console.error('Email notification failed:', response.statusText);
      return false;
    }
    
    return true;
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      console.error('Email notification timeout');
    } else {
      console.error('Email notification exception:', error);
    }
    return false;
  }
}

export async function getOneSignalPlayerIds(
  supabase: SupabaseClient,
  userId: string
): Promise<string[]> {
  try {
    const { data, error } = await supabase
      .from('onesignal_player_ids')
      .select('player_id')
      .eq('user_id', userId);
    
    if (error || !data || data.length === 0) {
      return [];
    }
    
    return data.map(row => row.player_id);
  } catch (error) {
    console.error('Error fetching OneSignal player IDs:', error);
    return [];
  }
}

export function sanitizeInput(input: string | null | undefined): string {
  if (!input) return '';
  return input.trim().substring(0, 1000); // Limit length for security
}

export function validateEmail(email: string): boolean {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
}
