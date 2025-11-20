import { createSupabaseClient, fetchProfilesWithTimezone } from '../_shared/database.ts';
import { sendUnifiedNotification } from '../_shared/unified-notifications.ts';
import { handleCorsOptions, createJsonResponse, createErrorResponse } from '../_shared/cors.ts';
import { getCurrentLocalTime, getCurrentLocalTimeString, getFunnyNotification } from '../_shared/timezone.ts';
import { format } from 'npm:date-fns@3.6.0';

/**
 * Task Incomplete Reminder Function
 * 
 * Sends ONE notification per day for incomplete/overdue tasks.
 * - Runs every morning via cron
 * - Sends notification only if task is overdue (task_date < today)
 * - Prevents spam: max 1 notification per task per day
 * - Special "funny red alert" for tasks overdue 3+ days
 */

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return handleCorsOptions();
  }

  try {
    console.log('📋 Task incomplete reminder starting...');
    
    const supabase = createSupabaseClient();
    const profiles = await fetchProfilesWithTimezone(supabase, true);
    
    if (profiles.length === 0) {
      return createJsonResponse({ message: 'No users to process', sent: 0 });
    }

    console.log(`Processing ${profiles.length} users...`);

    let sentCount = 0;

    for (const profile of profiles) {
      try {
        const nowLocal = getCurrentLocalTime(profile.timezone);
        const todayLocal = format(nowLocal, 'yyyy-MM-dd');
        
        // Check if current time matches user's preferred notification time
        const preferredTime = profile.preferred_notification_time || '09:00:00';
        const [preferredHour, preferredMinute] = preferredTime.split(':').map(Number);
        const currentHour = nowLocal.getHours();
        const currentMinute = nowLocal.getMinutes();
        
        // Only send if within a 5-minute window of the preferred time
        const isMatch = currentHour === preferredHour && currentMinute >= 0 && currentMinute < 5;
        
        if (!isMatch) {
          continue;
        }

        // Find all pending tasks where task_date is before today
        const { data: tasks, error: tasksError } = await supabase
          .from('tasks')
          .select('id, user_id, title, task_date, consecutive_missed_days, status')
          .eq('user_id', profile.user_id)
          .eq('status', 'pending')
          .lt('task_date', todayLocal);

        if (tasksError) throw tasksError;
        if (!tasks || tasks.length === 0) continue;

        // Group tasks by urgency
        const urgentTasks = tasks.filter(t => (t.consecutive_missed_days || 0) >= 3);
        const normalOverdue = tasks.filter(t => (t.consecutive_missed_days || 0) < 3);
        
        if (urgentTasks.length > 0) {
          // 3+ day overdue - FUNNY RED ALERT
          const funnyAlert = getFunnyNotification('task_3day_overdue');
          const title = '🚨 URGENT: Tasks REALLY Overdue!';
          const message = `${funnyAlert.message}\n\n` +
            `You have ${urgentTasks.length} task${urgentTasks.length > 1 ? 's' : ''} overdue for 3+ days:\n` +
            urgentTasks.map(t => `• ${t.title} (${t.consecutive_missed_days} day${t.consecutive_missed_days > 1 ? 's' : ''} overdue)`).join('\n');

          const sent = await sendUnifiedNotification(supabase, {
            userId: profile.user_id,
            title,
            message,
            data: { 
              type: 'task_incomplete_urgent',
              task_count: urgentTasks.length.toString(),
            },
          });

          if (sent) {
            console.log(`✅ Sent urgent reminder to user ${profile.user_id}`);
            sentCount++;
          }
        } else if (normalOverdue.length > 0) {
          // Less than 3 days - normal incomplete reminder
          const title = '📋 Incomplete Tasks Reminder';
          const message = `You have ${normalOverdue.length} incomplete task${normalOverdue.length > 1 ? 's' : ''} from previous days. Let's complete them today! 🚀`;

          const sent = await sendUnifiedNotification(supabase, {
            userId: profile.user_id,
            title,
            message,
            data: { 
              type: 'task_incomplete_reminder',
              task_count: normalOverdue.length.toString(),
            },
          });

          if (sent) {
            console.log(`✅ Sent incomplete reminder to user ${profile.user_id}`);
            sentCount++;
          }
        }
      } catch (userError) {
        console.error(`Error processing user ${profile.user_id}:`, userError);
      }
    }

    console.log(`✅ Incomplete reminders sent: ${sentCount} successful`);

    return createJsonResponse({
      success: true,
      sent: sentCount,
    });
  } catch (error) {
    console.error('Error in task-incomplete-reminder:', error);
    return createErrorResponse(error as Error);
  }
});
