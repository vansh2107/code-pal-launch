import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.78.0';
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
  email: string | null;
  timezone: string;
  preferred_notification_time: string;
  push_notifications_enabled: boolean;
  email_notifications_enabled: boolean;
}

Deno.serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    console.log('🕐 Timezone notification scheduler starting...');
    
    // Get current UTC time
    const now = new Date();
    console.log(`Current UTC time: ${format(now, 'HH:mm')}`);

    // Fetch all users with their timezone settings
    const { data: profiles, error: profilesError } = await supabase
      .from('profiles')
      .select('user_id, display_name, email, timezone, preferred_notification_time, push_notifications_enabled, email_notifications_enabled')
      .not('timezone', 'is', null)
      .not('preferred_notification_time', 'is', null);

    if (profilesError) {
      console.error('Error fetching profiles:', profilesError);
      throw profilesError;
    }

    if (!profiles || profiles.length === 0) {
      console.log('No profiles with timezone settings found');
      return new Response(
        JSON.stringify({ message: 'No profiles to process' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
      );
    }

    console.log(`Processing ${profiles.length} users...`);
    
    const notificationsToSend: Profile[] = [];

    // Check each user's local time
    for (const profile of profiles as Profile[]) {
      try {
        // Convert current UTC time to user's timezone
        const userLocalTime = toZonedTime(now, profile.timezone);
        const userLocalTimeString = format(userLocalTime, 'HH:mm');

        console.log(`User ${profile.user_id}: Local time ${userLocalTimeString} in ${profile.timezone}, Preferred: ${profile.preferred_notification_time}`);

        // Compare with user's preferred notification time
        if (userLocalTimeString === profile.preferred_notification_time) {
          console.log(`✅ Match found for user ${profile.user_id}!`);
          notificationsToSend.push(profile);
        }
      } catch (error) {
        console.error(`Error processing user ${profile.user_id}:`, error);
        // Continue with next user
      }
    }

    console.log(`Found ${notificationsToSend.length} users to notify`);

    // Send notifications to matched users
    const results = await Promise.allSettled(
      notificationsToSend.map(async (profile) => {
        return sendUserNotifications(profile);
      })
    );

    const successCount = results.filter(r => r.status === 'fulfilled').length;
    const failureCount = results.filter(r => r.status === 'rejected').length;

    console.log(`✅ Notifications sent: ${successCount} successful, ${failureCount} failed`);

    return new Response(
      JSON.stringify({
        success: true,
        processed: profiles.length,
        matched: notificationsToSend.length,
        sent: successCount,
        failed: failureCount,
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      }
    );
  } catch (error: any) {
    console.error('Error in timezone-notification-scheduler:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500,
      }
    );
  }
});

async function sendUserNotifications(profile: Profile): Promise<void> {
  console.log(`📤 Sending notifications to user ${profile.user_id}`);

  const notifications: Promise<any>[] = [];

  // Get upcoming documents expiring soon
  const { data: documents } = await supabase
    .from('documents')
    .select('name, expiry_date, document_type')
    .eq('user_id', profile.user_id)
    .gte('expiry_date', new Date().toISOString().split('T')[0])
    .lte('expiry_date', new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0])
    .order('expiry_date', { ascending: true })
    .limit(5);

  // Get pending tasks for today
  const today = new Date().toISOString().split('T')[0];
  const { data: tasks } = await supabase
    .from('tasks')
    .select('title, status, consecutive_missed_days')
    .eq('user_id', profile.user_id)
    .eq('task_date', today)
    .neq('status', 'completed');

  // Get funny daily summary notification
  const dailyNotification = getFunnyNotification('daily_summary');

  // Build notification message
  let message = `${dailyNotification.message}\n\n`;
  message += `Hey${profile.display_name ? ' ' + profile.display_name : ''}! 👋\n\n`;
  
  if (documents && documents.length > 0) {
    message += `📄 Documents expiring soon:\n`;
    documents.forEach(doc => {
      const daysUntil = Math.ceil((new Date(doc.expiry_date).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
      message += `• ${doc.name} - ${daysUntil} day${daysUntil !== 1 ? 's' : ''}\n`;
    });
    message += '\n';
  }

  if (tasks && tasks.length > 0) {
    message += `✅ Tasks for today:\n`;
    tasks.forEach(task => {
      const emoji = task.consecutive_missed_days >= 3 ? '🔴' : task.consecutive_missed_days > 0 ? '⚠️' : '📋';
      message += `${emoji} ${task.title}\n`;
    });
    message += '\n';
  }

  if (!documents?.length && !tasks?.length) {
    message += `You're all caught up! No urgent items today. 🎉`;
  } else {
    message += `Let's crush it today! 💪🚀`;
  }

  // Send push notification if enabled
  if (profile.push_notifications_enabled) {
    notifications.push(
      supabase.functions.invoke('send-onesignal-notification', {
        body: {
          user_id: profile.user_id,
          title: dailyNotification.title,
          message: message,
          data: { type: 'daily_reminder' },
        },
      })
    );
  }

  // Send email notification if enabled
  if (profile.email_notifications_enabled && profile.email) {
    const emailHtml = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
        <h2 style="color: #FF9506;">${dailyNotification.title}</h2>
        <div style="white-space: pre-line; line-height: 1.6; color: #333;">
          ${message}
        </div>
        <hr style="margin: 30px 0; border: none; border-top: 1px solid #eee;" />
        <p style="font-size: 12px; color: #999;">
          This is your daily reminder sent at ${profile.preferred_notification_time} ${profile.timezone}.
          <br/>
          You can change your notification settings in your profile.
        </p>
      </div>
    `;

    notifications.push(
      supabase.functions.invoke('send-reminder-emails', {
        body: {
          to: [profile.email],
          subject: dailyNotification.title,
          html: emailHtml,
        },
      })
    );
  }

  await Promise.all(notifications);
  console.log(`✅ Notifications sent to user ${profile.user_id}`);
}
