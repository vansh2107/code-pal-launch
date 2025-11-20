import { createClient, SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';
import type { Profile, Task } from './types.ts';

export function createSupabaseClient(): SupabaseClient {
  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  
  if (!supabaseUrl || !supabaseKey) {
    throw new Error('Missing Supabase credentials');
  }
  
  return createClient(supabaseUrl, supabaseKey);
}

export async function fetchUserProfile(supabase: SupabaseClient, userId: string): Promise<Profile | null> {
  try {
    const { data, error } = await supabase
      .from('profiles')
      .select('user_id, display_name, email, timezone, preferred_notification_time, push_notifications_enabled, email_notifications_enabled')
      .eq('user_id', userId)
      .single();
    
    if (error) {
      console.error('Error fetching user profile:', error);
      return null;
    }
    
    return data as Profile;
  } catch (error) {
    console.error('Exception fetching user profile:', error);
    return null;
  }
}

export async function fetchActiveTasksForUser(
  supabase: SupabaseClient, 
  userId: string,
  includeCompleted = false
): Promise<Task[]> {
  try {
    let query = supabase
      .from('tasks')
      .select('*')
      .eq('user_id', userId)
      .eq('reminder_active', true)
      .order('start_time', { ascending: true });
    
    if (!includeCompleted) {
      query = query.neq('status', 'completed');
    }
    
    const { data, error } = await query;
    
    if (error) {
      console.error('Error fetching tasks:', error);
      return [];
    }
    
    return (data as Task[]) || [];
  } catch (error) {
    console.error('Exception fetching tasks:', error);
    return [];
  }
}

export async function updateTaskReminderTimestamp(
  supabase: SupabaseClient,
  taskId: string
): Promise<boolean> {
  try {
    const { error } = await supabase
      .from('tasks')
      .update({ last_reminder_sent_at: new Date().toISOString() })
      .eq('id', taskId);
    
    if (error) {
      console.error('Error updating task reminder timestamp:', error);
      return false;
    }
    
    return true;
  } catch (error) {
    console.error('Exception updating task reminder timestamp:', error);
    return false;
  }
}

export async function fetchProfilesWithTimezone(
  supabase: SupabaseClient,
  pushNotificationsOnly = false
): Promise<Profile[]> {
  try {
    let query = supabase
      .from('profiles')
      .select('user_id, display_name, email, timezone, preferred_notification_time, push_notifications_enabled, email_notifications_enabled')
      .not('timezone', 'is', null)
      .not('preferred_notification_time', 'is', null);
    
    if (pushNotificationsOnly) {
      query = query.eq('push_notifications_enabled', true);
    }
    
    const { data, error } = await query;
    
    if (error) {
      console.error('Error fetching profiles:', error);
      return [];
    }
    
    return (data as Profile[]) || [];
  } catch (error) {
    console.error('Exception fetching profiles:', error);
    return [];
  }
}
