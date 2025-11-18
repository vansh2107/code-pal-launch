import { createSupabaseClient, fetchProfilesWithTimezone } from '../_shared/database.ts';
import { getCurrentLocalTime, formatInTimezone } from '../_shared/timezone.ts';
import { sendPushNotification, sendEmailNotification } from '../_shared/notifications.ts';
import { corsHeaders, handleCorsOptions, createJsonResponse, createErrorResponse } from '../_shared/cors.ts';
import { getFunnyNotification } from '../_shared/funnyNotifications.ts';
import { format } from 'npm:date-fns@3.6.0';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return handleCorsOptions();
  }

  try {
    console.log('🔄 Starting task carry-forward job...');
    
    const supabase = createSupabaseClient();
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    
    // Fetch all pending tasks with profiles
    const { data: pendingTasks, error: fetchError } = await supabase
      .from('tasks')
      .select('*, profiles!inner(email, push_notifications_enabled, email_notifications_enabled, timezone)')
      .eq('status', 'pending');

    if (fetchError) {
      throw fetchError;
    }

    let carriedCount = 0;
    let notificationsSent = 0;

    for (const task of pendingTasks || []) {
      try {
        const profile = task.profiles;
        if (!profile || !profile.timezone) continue;

        const userLocalNow = getCurrentLocalTime(profile.timezone);
        const todayLocal = format(userLocalNow, 'yyyy-MM-dd');

        // Skip if not overdue in user's timezone
        if (task.task_date >= todayLocal) {
          continue;
        }

        // Calculate days missed
        const daysMissed = Math.max(
          1,
          Math.floor(
            (new Date(todayLocal).getTime() - new Date(task.task_date).getTime()) /
              (1000 * 60 * 60 * 24)
          )
        );

        const newConsecutiveDays = (task.consecutive_missed_days || 0) + daysMissed;

        // Update task_date only - preserve original start_time
        const { error: updateError } = await supabase
          .from('tasks')
          .update({
            task_date: todayLocal,
            consecutive_missed_days: newConsecutiveDays,
          })
          .eq('id', task.id);

        if (updateError) {
          console.error(`Error updating task ${task.id}:`, updateError);
          continue;
        }

        carriedCount++;

        // Send notifications
        const notificationType = newConsecutiveDays >= 3 ? 'task_lazy_3days' : 'task_incomplete';
        const funnyMessage = getFunnyNotification(notificationType, {
          taskTitle: task.title,
          consecutiveDays: newConsecutiveDays,
        });

        // Send push notification
        if (profile.push_notifications_enabled) {
          await sendPushNotification(supabase, {
            userId: task.user_id,
            title: funnyMessage.title,
            message: funnyMessage.message,
            data: { taskId: task.id, type: 'task_carry_forward' },
          });
          notificationsSent++;
        }

        // Send email notification
        if (profile.email_notifications_enabled && profile.email) {
          await sendEmailNotification(
            supabaseUrl,
            supabaseKey,
            profile.email,
            funnyMessage.title,
            `<h2>${funnyMessage.title}</h2><p>${funnyMessage.message}</p><p>Task: <strong>${task.title}</strong></p>`
          );
        }
      } catch (taskError) {
        console.error(`Error processing task:`, taskError);
      }
    }

    console.log(`✅ Carried forward ${carriedCount} tasks, sent ${notificationsSent} notifications`);

    return createJsonResponse({
      success: true,
      carriedTasks: carriedCount,
      notificationsSent,
    });
  } catch (error) {
    console.error('Error in task-carry-forward:', error);
    return createErrorResponse(error as Error);
  }
});
