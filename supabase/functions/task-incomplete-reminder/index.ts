import { createSupabaseClient, fetchProfilesWithTimezone, fetchActiveTasksForUser } from '../_shared/database.ts';
import { getCurrentLocalTime } from '../_shared/timezone.ts';
import { sendPushNotification } from '../_shared/notifications.ts';
import { handleCorsOptions, createJsonResponse, createErrorResponse } from '../_shared/cors.ts';
import { getFunnyNotification } from '../_shared/funnyNotifications.ts';
import { format } from 'npm:date-fns@3.6.0';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return handleCorsOptions();
  }

  try {
    console.log('📋 Starting task incomplete reminder job...');
    
    const supabase = createSupabaseClient();
    const profiles = await fetchProfilesWithTimezone(supabase, true);
    
    if (profiles.length === 0) {
      return createJsonResponse({ message: 'No profiles to process', processed: 0 });
    }

    console.log(`Processing ${profiles.length} users...`);
    
    let sentCount = 0;
    
    for (const profile of profiles) {
      try {
        const tasks = await fetchActiveTasksForUser(supabase, profile.user_id, false);
        
        if (tasks.length === 0) continue;

        const userLocalNow = getCurrentLocalTime(profile.timezone);
        const today = format(userLocalNow, 'yyyy-MM-dd');
        
        const incompleteTasks = tasks.filter(task => task.task_date <= today);
        
        if (incompleteTasks.length === 0) continue;

        const urgentTasks = incompleteTasks.filter(t => t.consecutive_missed_days >= 3);
        const overdueTasks = incompleteTasks.filter(t => t.consecutive_missed_days > 0 && t.consecutive_missed_days < 3);
        const todayTasks = incompleteTasks.filter(t => t.consecutive_missed_days === 0);

        let notificationType = 'task_incomplete';
        let taskSummary = '';
        
        if (urgentTasks.length > 0) {
          notificationType = 'task_lazy_3days';
          taskSummary = `${urgentTasks.length} urgent task${urgentTasks.length > 1 ? 's' : ''} (3+ days overdue)`;
        } else if (overdueTasks.length > 0) {
          taskSummary = `${overdueTasks.length} overdue task${overdueTasks.length > 1 ? 's' : ''}`;
        } else {
          taskSummary = `${todayTasks.length} task${todayTasks.length > 1 ? 's' : ''} due today`;
        }

        const funnyMessage = getFunnyNotification(notificationType, {
          taskTitle: incompleteTasks[0].title,
          consecutiveDays: incompleteTasks[0].consecutive_missed_days,
        });

        const sent = await sendPushNotification(supabase, {
          userId: profile.user_id,
          title: funnyMessage.title,
          message: `You have ${taskSummary}. ${funnyMessage.message}`,
          data: { type: 'task_incomplete_reminder' },
        });

        if (sent) {
          sentCount++;
        }
      } catch (userError) {
        console.error(`Error processing user ${profile.user_id}:`, userError);
      }
    }

    console.log(`✅ Sent ${sentCount} incomplete task reminders`);

    return createJsonResponse({
      success: true,
      processed: profiles.length,
      sent: sentCount,
    });
  } catch (error) {
    console.error('Error in task-incomplete-reminder:', error);
    return createErrorResponse(error as Error);
  }
});
