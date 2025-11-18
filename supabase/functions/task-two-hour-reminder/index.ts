import { createSupabaseClient, fetchProfilesWithTimezone } from '../_shared/database.ts';
import { sendPushNotification } from '../_shared/notifications.ts';
import { handleCorsOptions, createJsonResponse, createErrorResponse } from '../_shared/cors.ts';
import { toZonedTime } from 'npm:date-fns-tz@3.2.0';
import { addHours, format } from 'npm:date-fns@3.6.0';

/**
 * Task Two-Hour Reminder Function
 * 
 * Sends notifications for tasks at start time and every 2 hours after.
 * - First notification: exactly at start time (user local)
 * - Recurring: every 2 hours from last notification
 * - Stops when: task completed OR day changes
 * - Uses user's local timezone for all comparisons
 */

interface Task {
  id: string;
  user_id: string;
  title: string;
  start_time: string;
  status: string;
  last_reminder_sent_at: string | null;
  timezone: string;
  reminder_active: boolean;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return handleCorsOptions();
  }

  try {
    console.log('⏰ Task two-hour reminder starting...');
    
    const supabase = createSupabaseClient();
    const profiles = await fetchProfilesWithTimezone(supabase, true);
    
    if (profiles.length === 0) {
      return createJsonResponse({ message: 'No users to process', processed: 0 });
    }

    console.log(`Processing ${profiles.length} users...`);

    let sentCount = 0;

    for (const profile of profiles) {
      try {
        const nowLocal = toZonedTime(new Date(), profile.timezone);
        const todayLocal = format(nowLocal, 'yyyy-MM-dd');

        const { data: tasks, error: tasksError } = await supabase
          .from('tasks')
          .select('id, user_id, title, start_time, status, last_reminder_sent_at, timezone, reminder_active, local_date')
          .eq('user_id', profile.user_id)
          .eq('status', 'pending')
          .eq('reminder_active', true)
          .eq('local_date', todayLocal); // Only process today's tasks

        if (tasksError) throw tasksError;
        if (!tasks || tasks.length === 0) continue;

        for (const task of tasks) {
          try {
            // FIRST NOTIFICATION: Only if last_reminder_sent_at is NULL
            if (!task.last_reminder_sent_at) {
              const startLocal = toZonedTime(new Date(task.start_time), task.timezone);
              
              // Check if current time >= start time
              if (nowLocal >= startLocal) {
                const sent = await sendNotification(supabase, task, 'first');
                if (sent) {
                  await updateReminder(supabase, task.id);
                  sentCount++;
                }
              }
            } else {
              // 2-HOUR RECURRING REMINDERS
              // Add 2 hours to last_reminder_sent_at (in UTC)
              const lastReminderUtc = new Date(task.last_reminder_sent_at);
              const nextReminderUtc = addHours(lastReminderUtc, 2);
              const nowUtc = new Date();

              // Only send if 2 hours have passed
              if (nowUtc >= nextReminderUtc) {
                const sent = await sendNotification(supabase, task, 'recurring');
                if (sent) {
                  await updateReminder(supabase, task.id);
                  sentCount++;
                }
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

    console.log(`✅ Task reminders sent: ${sentCount} successful`);

    return createJsonResponse({
      success: true,
      sent: sentCount,
    });
  } catch (error) {
    console.error('Error in task-two-hour-reminder:', error);
    return createErrorResponse(error as Error);
  }
});

async function sendNotification(supabase: any, task: Task, type: 'first' | 'recurring'): Promise<boolean> {
  try {
    const startLocal = toZonedTime(new Date(task.start_time), task.timezone);
    const formattedTime = format(startLocal, 'h:mm a');
    
    const title = type === 'first' ? '🚀 Task Starting Now!' : '⏰ Task Reminder';
    const message = type === 'first'
      ? `Your task "${task.title}" starts now at ${formattedTime}! Time to begin! 💪`
      : `Still working on "${task.title}"? Started at ${formattedTime}. You got this! 🔥`;

    return await sendPushNotification(supabase, {
      userId: task.user_id,
      title,
      message,
      data: { 
        type: 'task_reminder', 
        task_id: task.id,
        notification_type: type
      },
    });
  } catch (error) {
    console.error('Error sending notification:', error);
    return false;
  }
}

async function updateReminder(supabase: any, taskId: string): Promise<void> {
  const { error } = await supabase
    .from('tasks')
    .update({ last_reminder_sent_at: new Date().toISOString() })
    .eq('id', taskId);

  if (error) {
    console.error(`Error updating reminder timestamp for task ${taskId}:`, error);
  }
}
