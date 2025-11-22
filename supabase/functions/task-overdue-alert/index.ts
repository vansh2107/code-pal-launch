import { createSupabaseClient, fetchProfilesWithTimezone } from '../_shared/database.ts';
import { sendUnifiedNotification } from '../_shared/unified-notifications.ts';
import { handleCorsOptions, createJsonResponse, createErrorResponse } from '../_shared/cors.ts';
import { getCurrentLocalTime, getDateInTimezone } from '../_shared/timezone.ts';
import { format, differenceInDays } from 'npm:date-fns@3.6.0';

/**
 * Task Overdue Alert Function
 * 
 * Sends funny alerts for tasks overdue by 3+ days.
 * - Checks all users' pending tasks
 * - Only sends once per day per task
 * - Uses user's local timezone for calculations
 */

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return handleCorsOptions();
  }

  try {
    console.log('🚨 Task overdue alert starting...');
    
    const supabase = createSupabaseClient();
    const profiles = await fetchProfilesWithTimezone(supabase, true);
    
    if (profiles.length === 0) {
      return createJsonResponse({ message: 'No users to process', alerts: 0 });
    }

    console.log(`Processing ${profiles.length} users...`);

    let alertCount = 0;

    for (const profile of profiles) {
      try {
        const nowLocal = getCurrentLocalTime(profile.timezone);
        const todayLocal = getDateInTimezone(profile.timezone);

        // Find tasks overdue by 3+ days
        const { data: tasks, error: tasksError } = await supabase
          .from('tasks')
          .select('id, title, original_date, consecutive_missed_days, last_overdue_alert_sent')
          .eq('user_id', profile.user_id)
          .eq('status', 'pending')
          .gte('consecutive_missed_days', 3);

        if (tasksError) throw tasksError;
        if (!tasks || tasks.length === 0) continue;

        for (const task of tasks) {
          try {
            // Check if we already sent an alert today
            if (task.last_overdue_alert_sent) {
              const lastAlertDate = format(new Date(task.last_overdue_alert_sent), 'yyyy-MM-dd');
              if (lastAlertDate === todayLocal) {
                // Already sent today, skip
                continue;
              }
            }

            // Send funny alert
            const funnyMessages = [
              `⚠️ Your task "${task.title}" has been crying for ${task.consecutive_missed_days} days straight. Bro finish it 💀🔥😂`,
              `🚨 Day ${task.consecutive_missed_days} of ignoring "${task.title}". It's getting awkward... 😅`,
              `💀 "${task.title}" is ${task.consecutive_missed_days} days overdue. Even your alarm gave up on you! 😭`,
              `🔥 ${task.consecutive_missed_days} days and counting... "${task.title}" is officially haunting you now 👻`,
            ];
            
            const message = funnyMessages[Math.floor(Math.random() * funnyMessages.length)];

            const sent = await sendUnifiedNotification(supabase, {
              userId: profile.user_id,
              title: '⚠️ Task Overdue Alert',
              message: message,
              data: { 
                type: 'task_overdue', 
                task_id: task.id,
                days_overdue: task.consecutive_missed_days.toString()
              },
            });

            if (sent) {
              // Update last alert sent timestamp
              await supabase
                .from('tasks')
                .update({ last_overdue_alert_sent: new Date().toISOString() })
                .eq('id', task.id);

              console.log(`✅ Sent overdue alert for task ${task.id} (${task.consecutive_missed_days} days)`);
              alertCount++;
            }
          } catch (taskError) {
            console.error(`Error processing task ${task.id}:`, taskError);
          }
        }
      } catch (userError) {
        console.error(`Error processing user ${profile.user_id}:`, userError);
      }
    }

    console.log(`✅ Overdue alerts sent: ${alertCount} successful`);

    return createJsonResponse({
      success: true,
      alerts: alertCount,
    });
  } catch (error) {
    console.error('Error in task-overdue-alert:', error);
    return createErrorResponse(error as Error);
  }
});
