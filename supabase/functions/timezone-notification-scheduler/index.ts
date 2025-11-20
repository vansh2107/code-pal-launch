import { createSupabaseClient, fetchProfilesWithTimezone } from '../_shared/database.ts';
import { getCurrentLocalTimeString } from '../_shared/timezone.ts';
import { sendUnifiedNotification, sendEmailNotification } from '../_shared/notifications.ts';
import { handleCorsOptions, createJsonResponse, createErrorResponse } from '../_shared/cors.ts';
import { getFunnyNotification } from '../_shared/funnyNotifications.ts';
import type { Profile } from '../_shared/types.ts';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return handleCorsOptions();
  }

  try {
    console.log('🕐 Timezone notification scheduler starting...');
    
    const supabase = createSupabaseClient();
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    
    const profiles = await fetchProfilesWithTimezone(supabase, false);
    
    if (profiles.length === 0) {
      return createJsonResponse({ message: 'No profiles to process', processed: 0 });
    }

    console.log(`Processing ${profiles.length} users...`);
    
    const notificationsToSend: Profile[] = [];

    for (const profile of profiles) {
      try {
        const userLocalTimeString = getCurrentLocalTimeString(profile.timezone, 'HH:mm');
        
        if (userLocalTimeString === profile.preferred_notification_time) {
          console.log(`✅ Match found for user ${profile.user_id}!`);
          notificationsToSend.push(profile);
        }
      } catch (error) {
        console.error(`Error processing user ${profile.user_id}:`, error);
      }
    }

    console.log(`Found ${notificationsToSend.length} users to notify`);

    let successCount = 0;
    
    for (const profile of notificationsToSend) {
      try {
        await sendUserNotifications(supabase, supabaseUrl, supabaseKey, profile);
        successCount++;
      } catch (error) {
        console.error(`Error sending notifications to ${profile.user_id}:`, error);
      }
    }

    console.log(`✅ Notifications sent: ${successCount} successful`);

    return createJsonResponse({
      success: true,
      processed: profiles.length,
      matched: notificationsToSend.length,
      sent: successCount,
    });
  } catch (error) {
    console.error('Error in timezone-notification-scheduler:', error);
    return createErrorResponse(error as Error);
  }
});

async function sendUserNotifications(
  supabase: any,
  supabaseUrl: string,
  supabaseKey: string,
  profile: Profile
): Promise<void> {
  // Get upcoming documents
  const { data: documents } = await supabase
    .from('documents')
    .select('name, expiry_date, document_type')
    .eq('user_id', profile.user_id)
    .gte('expiry_date', new Date().toISOString().split('T')[0])
    .lte('expiry_date', new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0])
    .order('expiry_date', { ascending: true })
    .limit(5);

  // Get pending tasks
  const today = new Date().toISOString().split('T')[0];
  const { data: tasks } = await supabase
    .from('tasks')
    .select('title, status, consecutive_missed_days')
    .eq('user_id', profile.user_id)
    .eq('task_date', today)
    .neq('status', 'completed');

  const dailyNotification = getFunnyNotification('daily_summary');

  let message = `${dailyNotification.message}\n\n`;
  message += `Hey${profile.display_name ? ' ' + profile.display_name : ''}! 👋\n\n`;
  
  if (documents && documents.length > 0) {
    message += `📄 Documents expiring soon:\n`;
    documents.forEach((doc: any) => {
      const daysUntil = Math.ceil((new Date(doc.expiry_date).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
      message += `• ${doc.name} - ${daysUntil} day${daysUntil !== 1 ? 's' : ''}\n`;
    });
    message += '\n';
  }

  if (tasks && tasks.length > 0) {
    message += `✅ Tasks for today:\n`;
    tasks.forEach((task: any) => {
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

  // Send push notification
  if (profile.push_notifications_enabled) {
    await sendUnifiedNotification(supabase, {
      userId: profile.user_id,
      title: dailyNotification.title,
      message: message,
      data: { type: 'daily_reminder' },
    });
  }

  // Send email notification
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
        </p>
      </div>
    `;

    await sendEmailNotification(
      supabaseUrl,
      supabaseKey,
      profile.email,
      dailyNotification.title,
      emailHtml
    );
  }
}
