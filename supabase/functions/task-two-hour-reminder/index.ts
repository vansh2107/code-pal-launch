import { createSupabaseClient, fetchProfilesWithTimezone } from '../_shared/database.ts';
import { sendPushNotification } from '../_shared/notifications.ts';
import { handleCorsOptions, createJsonResponse, createErrorResponse } from '../_shared/cors.ts';

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
            // Convert "now" and task start_time into the user's timezone
            const userNowString = new Date().toLocaleString('en-US', { timeZone: task.timezone });
            const userStartString = new Date(task.start_time).toLocaleString('en-US', { timeZone: task.timezone });

            const userNow = new Date(userNowString);
            const userStart = new Date(userStartString);

            // Window of 1 minute for matching
            const ONE_MINUTE_MS = 60 * 1000;

            if (!task.start_notified) {
              const diffMs = userNow.getTime() - userStart.getTime();

              // Send ONLY once when we first cross the start time within a 1‑minute window
              if (diffMs >= 0 && diffMs <= ONE_MINUTE_MS) {
                const sent = await sendNotification(supabase, task, 'first');
                if (sent) {
                  await updateStartNotified(supabase, task.id);
                  sentCount++;
                }
              }
            } else if (task.last_reminder_sent_at) {
              // Recurring 2‑hour reminders after the first one
              const lastReminderString = new Date(task.last_reminder_sent_at).toLocaleString('en-US', {
                timeZone: task.timezone,
              });
              const lastReminderLocal = new Date(lastReminderString);
              const nextReminderLocal = new Date(lastReminderLocal.getTime() + 2 * 60 * 60 * 1000);

              const diffMs = userNow.getTime() - nextReminderLocal.getTime();

              if (diffMs >= 0 && diffMs <= ONE_MINUTE_MS) {
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
    const startLocalString = new Date(task.start_time).toLocaleString('en-US', {
      timeZone: task.timezone,
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
    });

    const title = type === 'first' ? '🚀 Task Starting Now!' : '⏰ Task Reminder';
    const message = type === 'first'
      ? `Your task "${task.title}" starts now at ${startLocalString}! Time to begin! 💪`
      : `Still working on "${task.title}"? Started at ${startLocalString}. You got this! 🔥`;

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
