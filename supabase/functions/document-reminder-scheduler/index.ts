import { createSupabaseClient, fetchProfilesWithTimezone } from '../_shared/database.ts';
import { getCurrentLocalTimeString, getDateInTimezone } from '../_shared/timezone.ts';
import { sendPushNotification, sendEmailNotification } from '../_shared/notifications.ts';
import { handleCorsOptions, createJsonResponse, createErrorResponse } from '../_shared/cors.ts';
import type { Profile } from '../_shared/types.ts';

/**
 * Document Reminder Scheduler
 * 
 * Sends document expiry reminders at user's preferred notification time.
 * - Checks all users and their preferred notification times
 * - Sends reminders for documents expiring today (based on reminder_date)
 * - Respects user's timezone and preferred notification time
 */

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return handleCorsOptions();
  }

  try {
    console.log('📄 Document reminder scheduler starting...');
    
    const supabase = createSupabaseClient();
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    
    const profiles = await fetchProfilesWithTimezone(supabase, false);
    
    if (profiles.length === 0) {
      return createJsonResponse({ message: 'No profiles to process', processed: 0 });
    }

    console.log(`Processing ${profiles.length} users...`);
    
    const notificationsToSend: { profile: Profile; reminders: any[] }[] = [];

    for (const profile of profiles) {
      try {
        const userLocalTimeString = getCurrentLocalTimeString(profile.timezone, 'HH:mm');
        
        // Check if current time matches user's preferred notification time
        if (userLocalTimeString === profile.preferred_notification_time) {
          const todayLocal = getDateInTimezone(profile.timezone);
          
          // Fetch reminders for today that haven't been sent
          const { data: reminders, error } = await supabase
            .from('reminders')
            .select(`
              id,
              reminder_date,
              document_id,
              is_custom,
              documents (
                name,
                document_type,
                expiry_date
              )
            `)
            .eq('user_id', profile.user_id)
            .eq('is_sent', false)
            .eq('reminder_date', todayLocal);

          if (error) {
            console.error(`Error fetching reminders for user ${profile.user_id}:`, error);
            continue;
          }

          if (reminders && reminders.length > 0) {
            console.log(`✅ Found ${reminders.length} reminders for user ${profile.user_id}`);
            notificationsToSend.push({ profile, reminders });
          }
        }
      } catch (error) {
        console.error(`Error processing user ${profile.user_id}:`, error);
      }
    }

    console.log(`Found ${notificationsToSend.length} users with reminders to send`);

    let successCount = 0;
    
    for (const { profile, reminders } of notificationsToSend) {
      try {
        await sendDocumentReminders(supabase, supabaseUrl, supabaseKey, profile, reminders);
        successCount++;
      } catch (error) {
        console.error(`Error sending reminders to ${profile.user_id}:`, error);
      }
    }

    console.log(`✅ Document reminders sent: ${successCount} successful`);

    return createJsonResponse({
      success: true,
      processed: profiles.length,
      matched: notificationsToSend.length,
      sent: successCount,
    });
  } catch (error) {
    console.error('Error in document-reminder-scheduler:', error);
    return createErrorResponse(error as Error);
  }
});

async function sendDocumentReminders(
  supabase: any,
  supabaseUrl: string,
  supabaseKey: string,
  profile: Profile,
  reminders: any[]
): Promise<void> {
  for (const reminder of reminders) {
    try {
      const doc = reminder.documents;
      const expiryDate = new Date(doc.expiry_date);
      const reminderDate = new Date(reminder.reminder_date);
      const daysUntil = Math.ceil((expiryDate.getTime() - reminderDate.getTime()) / (1000 * 60 * 60 * 24));
      
      let title = '📄 Document Expiry Reminder';
      let message = '';
      
      if (daysUntil === 0) {
        title = '🚨 Document Expiring TODAY!';
        message = `Your ${doc.document_type} "${doc.name}" expires today!`;
      } else if (daysUntil === 1) {
        title = '⚠️ Document Expiring Tomorrow!';
        message = `Your ${doc.document_type} "${doc.name}" expires tomorrow (${expiryDate.toLocaleDateString()})`;
      } else if (daysUntil <= 3) {
        title = '⚠️ Document Expiring Soon!';
        message = `Your ${doc.document_type} "${doc.name}" expires in ${daysUntil} days (${expiryDate.toLocaleDateString()})`;
      } else {
        title = '📄 Document Expiry Reminder';
        message = `Your ${doc.document_type} "${doc.name}" will expire in ${daysUntil} days (${expiryDate.toLocaleDateString()})`;
      }

      // Send push notification
      if (profile.push_notifications_enabled) {
        await sendPushNotification(supabase, {
          userId: profile.user_id,
          title: title,
          message: message,
          data: { 
            type: 'document_reminder',
            document_id: reminder.document_id,
            reminder_id: reminder.id
          },
        });
      }

      // Send email notification
      if (profile.email_notifications_enabled && profile.email) {
        const emailHtml = `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
            <h2 style="color: #FF9506;">${title}</h2>
            <p style="font-size: 16px; color: #333;">
              ${message}
            </p>
            <div style="margin: 30px 0; padding: 20px; background-color: #f5f5f5; border-radius: 8px;">
              <p style="margin: 0; font-weight: bold;">Document: ${doc.name}</p>
              <p style="margin: 5px 0 0 0;">Type: ${doc.document_type}</p>
              <p style="margin: 5px 0 0 0;">Expiry Date: ${expiryDate.toLocaleDateString()}</p>
            </div>
            <hr style="margin: 30px 0; border: none; border-top: 1px solid #eee;" />
            <p style="font-size: 12px; color: #999;">
              This reminder was sent at ${profile.preferred_notification_time} ${profile.timezone}.
            </p>
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
        .update({ 
          is_sent: true,
          sent_at: new Date().toISOString()
        })
        .eq('id', reminder.id);

      if (updateError) {
        console.error(`Error marking reminder ${reminder.id} as sent:`, updateError);
      } else {
        console.log(`✅ Sent reminder for document "${doc.name}" to user ${profile.user_id}`);
      }
    } catch (error) {
      console.error(`Error sending reminder ${reminder.id}:`, error);
    }
  }
}
