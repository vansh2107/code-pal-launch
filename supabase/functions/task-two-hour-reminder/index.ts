import { createSupabaseClient, fetchProfilesWithTimezone } from '../_shared/database.ts';
import { sendUnifiedNotification } from '../_shared/unified-notifications.ts';
import { handleCorsOptions, createJsonResponse, createErrorResponse } from '../_shared/cors.ts';
import { toZonedTime, fromZonedTime } from 'npm:date-fns-tz@3.2.0';
import { getFunnyNotification } from '../_shared/funnyNotifications.ts';

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
  start_notified: boolean;
  local_date: string;
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
        // Get today's date in user's local timezone (YYYY-MM-DD)
        const todayFormatter = new Intl.DateTimeFormat('en-CA', {
          timeZone: profile.timezone,
          year: 'numeric',
          month: '2-digit',
          day: '2-digit',
        });
        const todayLocal = todayFormatter.format(new Date());

        const { data: tasks, error: tasksError } = await supabase
          .from('tasks')
          .select('id, user_id, title, start_time, status, last_reminder_sent_at, timezone, reminder_active, start_notified, local_date')
          .eq('user_id', profile.user_id)
          .eq('status', 'pending')
          .eq('reminder_active', true)
          .eq('local_date', todayLocal);

        if (tasksError) throw tasksError;
        if (!tasks || tasks.length === 0) continue;

        for (const task of tasks) {
          try {
            // Convert UTC times to user's local timezone
            const nowUtc = new Date();
            const startTimeUtc = new Date(task.start_time);

            const userNow = toZonedTime(nowUtc, task.timezone);
            const startTimeLocal = toZonedTime(startTimeUtc, task.timezone);

            console.log(`Task ${task.id}: start=${startTimeUtc.toISOString()} localStart=${startTimeLocal.toISOString()} nowLocal=${userNow.toISOString()} lastReminder=${task.last_reminder_sent_at}`);

            // Compute next reminder time in UTC
            const nextReminderUtc = task.last_reminder_sent_at
              ? new Date(new Date(task.last_reminder_sent_at).getTime() + 2 * 60 * 60 * 1000)
              : fromZonedTime(startTimeLocal, task.timezone);

            const nextReminderLocal = toZonedTime(nextReminderUtc, task.timezone);

            console.log(`Task ${task.id}: nextReminderLocal=${nextReminderLocal.toISOString()}`);

            // If we've reached or passed the next reminder time in user's local time
            if (userNow >= nextReminderLocal) {
              const type: 'first' | 'recurring' = task.last_reminder_sent_at ? 'recurring' : 'first';
              console.log(`Task ${task.id}: sending ${type} reminder`);

              const sent = await sendNotification(supabase, task, type);
              if (sent) {
                // For first notification, also mark start_notified
                if (!task.last_reminder_sent_at) {
                  await updateStartNotified(supabase, task.id);
                } else {
                  await updateReminder(supabase, task.id);
                }
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
    const startTimeUtc = new Date(task.start_time);
    const startTimeLocal = toZonedTime(startTimeUtc, task.timezone);
    
    const startLocalString = startTimeLocal.toLocaleString('en-US', {
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
    });

    // Get random funny notification message
    const funnyMsg = getFunnyNotification('task_reminder', {
      taskTitle: task.title,
    });

    // Add time context to the message
    const timeContext = type === 'first'
      ? `Starts now at ${startLocalString}!`
      : `Started at ${startLocalString}. Keep going!`;

    return await sendUnifiedNotification(supabase, {
      userId: task.user_id,
      title: funnyMsg.title,
      message: `${funnyMsg.message} (${timeContext})`,
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

async function updateStartNotified(supabase: any, taskId: string): Promise<void> {
  const { error } = await supabase
    .from('tasks')
    .update({ 
      start_notified: true,
      last_reminder_sent_at: new Date().toISOString()
    })
    .eq('id', taskId);

  if (error) {
    console.error(`Error updating start notification for task ${taskId}:`, error);
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
