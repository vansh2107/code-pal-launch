import { createSupabaseClient, fetchActiveTasksForUser, fetchProfilesWithTimezone, updateTaskReminderTimestamp } from '../_shared/database.ts';
import { getCurrentLocalTime, getNextReminderTime, formatInTimezone } from '../_shared/timezone.ts';
import { sendPushNotification } from '../_shared/notifications.ts';
import { corsHeaders, handleCorsOptions, createJsonResponse, createErrorResponse } from '../_shared/cors.ts';
import type { Task, Profile } from '../_shared/types.ts';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return handleCorsOptions();
  }

  try {
    console.log('🔔 Starting 2-hour task reminder job...');
    
    const supabase = createSupabaseClient();
    const profiles = await fetchProfilesWithTimezone(supabase, true);
    
    if (profiles.length === 0) {
      return createJsonResponse({ message: 'No profiles to process', processed: 0 });
    }

    console.log(`Processing ${profiles.length} users with push notifications enabled...`);
    
    let processedCount = 0;
    let sentCount = 0;
    
    for (const profile of profiles) {
      try {
        const tasks = await fetchActiveTasksForUser(supabase, profile.user_id, false);
        if (tasks.length === 0) continue;
        
        processedCount++;
        const userLocalNow = getCurrentLocalTime(profile.timezone);
        
        for (const task of tasks) {
          try {
            const nextReminderLocal = getNextReminderTime(
              task.last_reminder_sent_at,
              task.start_time,
              task.timezone
            );
            
            // Check if current time >= next reminder time
            if (userLocalNow >= nextReminderLocal) {
              const formattedTime = formatInTimezone(task.start_time, task.timezone, 'h:mm a');
              
              const sent = await sendPushNotification(supabase, {
                userId: task.user_id,
                title: '🕒 Task Reminder',
                message: `Your task "${task.title}" is still pending! You planned this at ${formattedTime}. Let's finish it! 💪`,
                data: { 
                  type: 'task_reminder',
                  task_id: task.id,
                },
              });
              
              if (sent) {
                await updateTaskReminderTimestamp(supabase, task.id);
                sentCount++;
              }
            }
          } catch (taskError) {
            console.error(`Error processing task ${task.id}:`, taskError);
          }
        }
      } catch (userError) {
        console.error(`Error processing user ${profile.user_id}:`, userError);
      }
    }

    console.log(`✅ Processed ${processedCount} users, sent ${sentCount} reminders`);

    return createJsonResponse({
      success: true,
      processed: processedCount,
      sent: sentCount,
    });
  } catch (error) {
    console.error('Error in task-two-hour-reminder:', error);
    return createErrorResponse(error as Error);
  }
});
