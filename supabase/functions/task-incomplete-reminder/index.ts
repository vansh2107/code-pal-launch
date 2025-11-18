import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { format } from 'npm:date-fns@3.6.0';
import { toZonedTime } from 'npm:date-fns-tz@3.2.0';
import { getFunnyNotification } from '../_shared/funnyNotifications.ts';

const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const supabase = createClient(supabaseUrl, supabaseKey);

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface Profile {
  user_id: string;
  display_name: string | null;
  timezone: string;
  push_notifications_enabled: boolean;
  preferred_notification_time: string | null;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    console.log('🔔 2-hour task reminder starting...');
    
    const now = new Date();
    console.log(`Current UTC time: ${format(now, 'HH:mm')}`);

    // Fetch all users with timezone settings and push notifications enabled
    const { data: profiles, error: profilesError } = await supabase
      .from('profiles')
      .select('user_id, display_name, timezone, push_notifications_enabled, preferred_notification_time')
      .not('timezone', 'is', null)
      .eq('push_notifications_enabled', true);

    if (profilesError) {
      console.error('Error fetching profiles:', profilesError);
      throw profilesError;
    }

    if (!profiles || profiles.length === 0) {
      console.log('No profiles with timezone and push notifications enabled');
      return new Response(
        JSON.stringify({ message: 'No profiles to process' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
      );
    }

    console.log(`Processing ${profiles.length} users...`);
    
    const usersToNotify: Profile[] = [];

    // Check each user's preferred notification time
    for (const profile of profiles as Profile[]) {
      try {
        const userLocalTime = toZonedTime(now, profile.timezone);
        
        // If user has a preferred notification time, check if it matches
        if (profile.preferred_notification_time) {
          const [preferredHour, preferredMinute] = profile.preferred_notification_time.split(':').map(Number);
          const userHour = userLocalTime.getHours();
          const userMinute = userLocalTime.getMinutes();
          
          console.log(`User ${profile.user_id}: Local time ${format(userLocalTime, 'HH:mm')} in ${profile.timezone}, Preferred: ${profile.preferred_notification_time}`);
          
          // Check if current time matches preferred time (within 2-minute window)
          if (userHour === preferredHour && userMinute >= preferredMinute && userMinute < preferredMinute + 2) {
            console.log(`✅ Preferred notification time for user ${profile.user_id}!`);
            usersToNotify.push(profile);
          }
        }
      } catch (error) {
        console.error(`Error processing user ${profile.user_id}:`, error);
      }
    }

    console.log(`Found ${usersToNotify.length} users to notify`);

    // Send notifications to matched users
    const results = await Promise.allSettled(
      usersToNotify.map(async (profile) => {
        return sendTaskReminders(profile);
      })
    );

    const successCount = results.filter(r => r.status === 'fulfilled').length;
    const failureCount = results.filter(r => r.status === 'rejected').length;

    console.log(`✅ Task reminders sent: ${successCount} successful, ${failureCount} failed`);

    return new Response(
      JSON.stringify({
        success: true,
        processed: profiles.length,
        matched: usersToNotify.length,
        sent: successCount,
        failed: failureCount,
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      }
    );
  } catch (error: any) {
    console.error('Error in task-incomplete-reminder:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500,
      }
    );
  }
});

async function sendTaskReminders(profile: Profile): Promise<void> {
  console.log(`📤 Checking incomplete tasks for user ${profile.user_id}`);

  // Convert current time to user's local timezone to get today's date
  const now = new Date();
  const userLocalNow = toZonedTime(now, profile.timezone);
  const todayLocal = format(userLocalNow, 'yyyy-MM-dd');
  
  const { data: incompleteTasks, error: tasksError } = await supabase
    .from('tasks')
    .select('id, title, status, task_date')
    .eq('user_id', profile.user_id)
    .eq('task_date', todayLocal)
    .neq('status', 'completed');

  if (tasksError) {
    console.error(`Error fetching tasks for user ${profile.user_id}:`, tasksError);
    throw tasksError;
  }

  if (!incompleteTasks || incompleteTasks.length === 0) {
    console.log(`No incomplete tasks for user ${profile.user_id}`);
    return;
  }

  console.log(`Found ${incompleteTasks.length} incomplete task(s) for user ${profile.user_id}`);

  // Get funny notification message
  const funnyMessage = getFunnyNotification('task_reminder', {
    taskCount: incompleteTasks.length,
    taskTitle: incompleteTasks.length === 1 ? incompleteTasks[0].title : undefined,
  });

  // Build detailed task list for multi-task notifications
  const taskTitles = incompleteTasks.map(t => `• ${t.title}`).join('\n');
  const detailedMessage = incompleteTasks.length > 1 
    ? `${funnyMessage.message}\n\n${taskTitles}` 
    : funnyMessage.message;

  // Send push notification
  try {
    const { data, error } = await supabase.functions.invoke('send-onesignal-notification', {
      body: {
        userId: profile.user_id,
        title: funnyMessage.title,
        message: detailedMessage,
        data: { 
          type: 'task_reminder',
          task_count: incompleteTasks.length 
        },
      },
    });

    if (error) {
      console.error(`Failed to send notification to user ${profile.user_id}:`, error);
      throw error;
    }

    console.log(`✅ Notification sent to user ${profile.user_id}`);
  } catch (error) {
    console.error(`Error sending notification to user ${profile.user_id}:`, error);
    throw error;
  }
}
