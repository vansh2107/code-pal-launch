import { createSupabaseClient, fetchProfilesWithTimezone } from '../_shared/database.ts';
import { handleCorsOptions, createJsonResponse, createErrorResponse } from '../_shared/cors.ts';
import { getCurrentLocalTime } from '../_shared/timezone.ts';
import { format } from 'npm:date-fns@3.6.0';

/**
 * Task Carry Forward Function
 * 
 * Carries incomplete tasks forward to the next day.
 * - Runs at midnight (via cron)
 * - Only updates task_date (preserves start_time, original_date, etc.)
 * - Increments consecutive_missed_days counter
 * - Does NOT reset last_reminder_sent_at or any other fields
 */

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return handleCorsOptions();
  }

  try {
    console.log('📅 Task carry-forward starting...');
    
    const supabase = createSupabaseClient();
    const profiles = await fetchProfilesWithTimezone(supabase, false);
    
    if (profiles.length === 0) {
      return createJsonResponse({ message: 'No users to process', carried: 0 });
    }

    console.log(`Processing ${profiles.length} users...`);

    let carriedCount = 0;

    for (const profile of profiles) {
      try {
        const nowLocal = getCurrentLocalTime(profile.timezone);
        const todayLocal = format(nowLocal, 'yyyy-MM-dd');

        // Find all pending tasks where task_date is before today
        const { data: tasks, error: tasksError } = await supabase
          .from('tasks')
          .select('id, task_date, consecutive_missed_days, title')
          .eq('user_id', profile.user_id)
          .eq('status', 'pending')
          .lt('task_date', todayLocal);

        if (tasksError) throw tasksError;
        if (!tasks || tasks.length === 0) continue;

        console.log(`Found ${tasks.length} tasks to carry forward for user ${profile.user_id}`);

        for (const task of tasks) {
          try {
            // Increment consecutive missed days
            const newConsecutiveDays = (task.consecutive_missed_days || 0) + 1;

            // Update ONLY task_date and consecutive_missed_days
            // PRESERVE: start_time, original_date, last_reminder_sent_at, etc.
            const { error: updateError } = await supabase
              .from('tasks')
              .update({
                task_date: todayLocal,
                consecutive_missed_days: newConsecutiveDays,
                updated_at: new Date().toISOString(),
              })
              .eq('id', task.id);

            if (updateError) {
              console.error(`Error updating task ${task.id}:`, updateError);
              continue;
            }

            console.log(`✅ Carried forward "${task.title}" (${newConsecutiveDays} day${newConsecutiveDays > 1 ? 's' : ''} overdue)`);
            carriedCount++;
          } catch (taskError) {
            console.error(`Error processing task ${task.id}:`, taskError);
          }
        }
      } catch (userError) {
        console.error(`Error processing user ${profile.user_id}:`, userError);
      }
    }

    console.log(`✅ Carried forward ${carriedCount} tasks`);

    return createJsonResponse({
      success: true,
      carried: carriedCount,
    });
  } catch (error) {
    console.error('Error in task-carry-forward:', error);
    return createErrorResponse(error as Error);
  }
});
