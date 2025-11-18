import { createClient } from 'npm:@supabase/supabase-js@2';
import { toZonedTime } from 'npm:date-fns-tz@3.2.0';
import { addHours, format } from 'npm:date-fns@3.6.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

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
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const { data: profiles, error: profilesError } = await supabase
      .from('profiles')
      .select('user_id, timezone, push_notifications_enabled')
      .eq('push_notifications_enabled', true)
      .not('timezone', 'is', null);

    if (profilesError) throw profilesError;
    if (!profiles || profiles.length === 0) {
      return new Response(JSON.stringify({ message: 'No users to process' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    let sentCount = 0;

    for (const profile of profiles) {
      try {
        const { data: tasks, error: tasksError } = await supabase
          .from('tasks')
          .select('id, user_id, title, start_time, status, last_reminder_sent_at, timezone, reminder_active')
          .eq('user_id', profile.user_id)
          .eq('status', 'pending')
          .eq('reminder_active', true);

        if (tasksError) throw tasksError;
        if (!tasks || tasks.length === 0) continue;

        const nowLocal = toZonedTime(new Date(), profile.timezone);

        for (const task of tasks) {
          try {
            // FIRST NOTIFICATION: Only if last_reminder_sent_at is NULL
            if (!task.last_reminder_sent_at) {
              const startLocal = toZonedTime(new Date(task.start_time), task.timezone);
              
              if (nowLocal >= startLocal) {
                const sent = await sendNotification(supabase, task, 'first');
                if (sent) {
                  await updateReminder(supabase, task.id);
                  sentCount++;
                }
              }
            } else {
              // 2-HOUR REMINDERS: Add 2 hours to last_reminder_sent_at
              const lastReminderUtc = new Date(task.last_reminder_sent_at);
              const nextReminderUtc = addHours(lastReminderUtc, 2);
              const nextReminderLocal = toZonedTime(nextReminderUtc, task.timezone);

              if (nowLocal >= nextReminderLocal) {
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

    return new Response(
      JSON.stringify({ success: true, sent: sentCount }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Error in task-two-hour-reminder:', error);
    return new Response(
      JSON.stringify({ success: false, error: (error as Error).message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});

async function sendNotification(supabase: any, task: Task, type: 'first' | 'recurring'): Promise<boolean> {
  try {
    const startLocal = toZonedTime(new Date(task.start_time), task.timezone);
    const formattedTime = format(startLocal, 'h:mm a');
    
    const message = type === 'first'
      ? `Your task "${task.title}" starts now at ${formattedTime}! Let's get it done! 🚀`
      : `Your task "${task.title}" is still pending! You started at ${formattedTime}. Keep going! 💪`;

    const { error } = await supabase.functions.invoke('send-onesignal-notification', {
      body: {
        userId: task.user_id,
        title: '🕒 Task Reminder',
        message,
        data: { type: 'task_reminder', task_id: task.id },
      },
    });

    return !error;
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
