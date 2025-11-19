import { createSupabaseClient } from '../_shared/database.ts';
import { sendPushNotification, sendEmailNotification } from '../_shared/notifications.ts';
import { handleCorsOptions, createJsonResponse, createErrorResponse } from '../_shared/cors.ts';
import { convertUtcToLocal, getCurrentLocalTime } from '../_shared/timezone.ts';

/**
 * Document Reminder Function
 * 
 * Sends notifications for individual document expiry reminders.
 * - Runs every hour via cron
 * - Checks reminders that match current user local time
 * - Sends notification exactly once per reminder
 * - Uses user's local timezone for all comparisons
 */

interface Reminder {
  id: string;
  document_id: string;
  user_id: string;
  reminder_date: string;
  is_sent: boolean;
  document: {
    name: string;
    expiry_date: string;
    document_type: string;
  };
  profile: {
    timezone: string;
    push_notifications_enabled: boolean;
    email_notifications_enabled: boolean;
    email: string | null;
  };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return handleCorsOptions();
  }

  try {
    console.log('📄 Document reminder scheduler starting...');
    
    const supabase = createSupabaseClient();
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    
    // Get today's date in UTC
    const todayUtc = new Date().toISOString().split('T')[0];
    
    // Fetch all unsent reminders for today
    const { data: reminders, error: remindersError } = await supabase
      .from('reminders')
      .select(`
        id,
        document_id,
        user_id,
        reminder_date,
        is_sent,
        documents:document_id (
          name,
          expiry_date,
          document_type
        ),
        profiles:user_id (
          timezone,
          push_notifications_enabled,
          email_notifications_enabled,
          email,
          preferred_notification_time
        )
      `)
      .eq('is_sent', false)
      .eq('reminder_date', todayUtc)
      .not('profiles.timezone', 'is', null);

    if (remindersError) {
      console.error('Error fetching reminders:', remindersError);
      throw remindersError;
    }

    if (!reminders || reminders.length === 0) {
      console.log('No unsent reminders for today');
      return createJsonResponse({ 
        message: 'No reminders to process',
        processed: 0,
        sent: 0
      });
    }

    console.log(`Found ${reminders.length} unsent reminders for today`);
    
    let sentCount = 0;

    for (const reminder of reminders as any[]) {
      try {
        const profile = reminder.profiles;
        const document = reminder.documents;
        
        if (!profile || !document) {
          console.warn(`Missing profile or document for reminder ${reminder.id}`);
          continue;
        }

        // Check if notifications are enabled
        if (!profile.push_notifications_enabled && !profile.email_notifications_enabled) {
          console.log(`Notifications disabled for user ${reminder.user_id}`);
          continue;
        }

        // Get user's preferred notification time from profile
        const preferredTime = profile.preferred_notification_time || '12:00:00';
        const [preferredHour, preferredMinute] = preferredTime.split(':').map(Number);
        
        // Get current time in user's local timezone using toZonedTime
        const nowUtc = new Date();
        const nowLocal = convertUtcToLocal(nowUtc, profile.timezone);
        const currentHour = nowLocal.getHours();
        const currentMinute = nowLocal.getMinutes();
        
        // Send notification only during the user's preferred hour and within a 5-minute window
        const isMatch = currentHour === preferredHour && currentMinute >= 0 && currentMinute < 5;
        
        if (isMatch) {
          console.log(`✅ Sending to user ${reminder.user_id} at their preferred time ${preferredHour}:00 (${profile.timezone})`);
          console.log(`   Current local time: ${currentHour}:${currentMinute.toString().padStart(2, '0')}`);
        } else {
          console.log(`⏭️ Skipping user ${reminder.user_id} - not their preferred hour (current: ${currentHour}, preferred: ${preferredHour})`);
          continue;
        }
        
        if (currentHour >= preferredHour) {
          const daysUntilExpiry = Math.ceil(
            (new Date(document.expiry_date).getTime() - Date.now()) / (1000 * 60 * 60 * 24)
          );

          const title = daysUntilExpiry === 0 
            ? '⚠️ Document Expires Today!' 
            : daysUntilExpiry === 1
            ? '⏰ Document Expires Tomorrow'
            : `📄 Document Expiry Reminder`;

          const message = daysUntilExpiry === 0
            ? `Your "${document.name}" expires TODAY! Please renew it immediately.`
            : daysUntilExpiry === 1
            ? `Your "${document.name}" expires TOMORROW. Time to renew!`
            : `Your "${document.name}" will expire in ${daysUntilExpiry} days (${document.expiry_date}). Plan ahead!`;

          // Send push notification
          if (profile.push_notifications_enabled) {
            await sendPushNotification(supabase, {
              userId: reminder.user_id,
              title,
              message,
              data: {
                type: 'document_reminder',
                document_id: reminder.document_id,
                reminder_id: reminder.id,
              },
            });
          }

          // Send email notification
          if (profile.email_notifications_enabled && profile.email) {
            const emailHtml = `
              <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
                <h2 style="color: #FF9506;">${title}</h2>
                <p style="font-size: 16px;">${message}</p>
                <div style="background: #f5f5f5; padding: 15px; border-radius: 8px; margin: 20px 0;">
                  <p><strong>Document:</strong> ${document.name}</p>
                  <p><strong>Type:</strong> ${document.document_type}</p>
                  <p><strong>Expiry Date:</strong> ${document.expiry_date}</p>
                </div>
                <p style="color: #666;">Don't forget to renew this document to avoid any issues!</p>
              </div>
            `;

            await sendEmailNotification(
              supabaseUrl,
              supabaseKey,
              profile.email,
              title,
              emailHtml
            );
          }

          // Mark reminder as sent
          const { error: updateError } = await supabase
            .from('reminders')
            .update({ is_sent: true })
            .eq('id', reminder.id);

          if (updateError) {
            console.error(`Error marking reminder ${reminder.id} as sent:`, updateError);
          } else {
            console.log(`✅ Sent reminder for document "${document.name}" to user ${reminder.user_id}`);
            sentCount++;
          }
        } else {
          console.log(`Skipping reminder for user ${reminder.user_id} - outside notification hours (${currentHour}:00)`);
        }
      } catch (reminderError) {
        console.error(`Error processing reminder ${reminder.id}:`, reminderError);
      }
    }

    console.log(`✅ Document reminders sent: ${sentCount} successful`);

    return createJsonResponse({
      success: true,
      processed: reminders.length,
      sent: sentCount,
    });
  } catch (error) {
    console.error('Error in document-reminder:', error);
    return createErrorResponse(error as Error);
  }
});
