import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { format } from 'npm:date-fns@3.6.0';
import { toZonedTime } from 'npm:date-fns-tz@3.2.0';

const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const supabase = createClient(supabaseUrl, supabaseKey);

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface Task {
  id: string;
  user_id: string;
  title: string;
  start_time: string;
  timezone: string;
  last_reminder_sent_at: string | null;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    console.log('🔔 Starting 2-hour task reminder job...');
    
    const now = new Date();
    console.log(`Current UTC time: ${format(now, 'yyyy-MM-dd HH:mm:ss')}`);

    // Fetch all active pending tasks
    const { data: tasks, error: tasksError } = await supabase
      .from('tasks')
      .select('id, user_id, title, start_time, timezone, last_reminder_sent_at')
      .eq('reminder_active', true)
      .neq('status', 'completed');

    if (tasksError) {
      console.error('Error fetching tasks:', tasksError);
      throw tasksError;
    }

    if (!tasks || tasks.length === 0) {
      console.log('No active tasks found');
      return new Response(
        JSON.stringify({ message: 'No active tasks to process' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
      );
    }

    console.log(`Processing ${tasks.length} active tasks...`);
    
    const remindersToSend: Task[] = [];

    // Check each task to see if a reminder is due
    for (const task of tasks as Task[]) {
      try {
        // Convert UTC start time to user's local timezone
        const startTimeUtc = new Date(task.start_time);
        const startTimeLocal = toZonedTime(startTimeUtc, task.timezone);
        const userLocalNow = toZonedTime(now, task.timezone);
        
        let nextReminderLocal: Date;
        
        if (!task.last_reminder_sent_at) {
          // First reminder: send exactly at start time
          nextReminderLocal = startTimeLocal;
          console.log(`Task ${task.id}: First reminder due at ${format(nextReminderLocal, 'yyyy-MM-dd HH:mm')} (${task.timezone})`);
        } else {
          // Subsequent reminders: add 2 hours to last reminder (in UTC), then convert to local
          const lastReminderUtc = new Date(task.last_reminder_sent_at);
          const nextReminderUtc = new Date(lastReminderUtc.getTime() + 2 * 60 * 60 * 1000);
          nextReminderLocal = toZonedTime(nextReminderUtc, task.timezone);
          console.log(`Task ${task.id}: Next reminder due at ${format(nextReminderLocal, 'yyyy-MM-dd HH:mm')} (${task.timezone})`);
        }
        
        console.log(`Task ${task.id}: Current time ${format(userLocalNow, 'yyyy-MM-dd HH:mm')} (${task.timezone})`);
        
        // Check if current time has passed the next reminder time
        if (userLocalNow >= nextReminderLocal) {
          console.log(`✅ Reminder due for task ${task.id}!`);
          remindersToSend.push(task);
        }
      } catch (error) {
        console.error(`Error processing task ${task.id}:`, error);
      }
    }

    console.log(`Found ${remindersToSend.length} tasks requiring reminders`);

    // Send reminders for matched tasks
    const results = await Promise.allSettled(
      remindersToSend.map(async (task) => {
        return sendTaskReminder(task);
      })
    );

    const successCount = results.filter(r => r.status === 'fulfilled').length;
    const failureCount = results.filter(r => r.status === 'rejected').length;

    console.log(`✅ Reminders sent: ${successCount} successful, ${failureCount} failed`);

    return new Response(
      JSON.stringify({
        success: true,
        processed: tasks.length,
        matched: remindersToSend.length,
        sent: successCount,
        failed: failureCount,
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      }
    );
  } catch (error: any) {
    console.error('Error in task-two-hour-reminder:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500,
      }
    );
  }
});

async function sendTaskReminder(task: Task): Promise<void> {
  console.log(`📤 Sending reminder for task ${task.id} to user ${task.user_id}`);

  const startTimeInUserTz = toZonedTime(new Date(task.start_time), task.timezone);
  const formattedStartTime = format(startTimeInUserTz, 'h:mm a');

  // Get OneSignal player IDs for this user
  const { data: playerIds } = await supabase
    .from('onesignal_player_ids')
    .select('player_id')
    .eq('user_id', task.user_id);

  if (playerIds && playerIds.length > 0) {
    // Send push notification via OneSignal
    await supabase.functions.invoke('send-onesignal-notification', {
      body: {
        user_id: task.user_id,
        title: '🕒 Task Reminder',
        message: `Your task "${task.title}" is still pending! You planned this at ${formattedStartTime}. Let's finish it! 💪`,
        data: { 
          type: 'task_reminder',
          task_id: task.id,
        },
      },
    });
  }

  // Update last_reminder_sent_at to current time
  await supabase
    .from('tasks')
    .update({ last_reminder_sent_at: new Date().toISOString() })
    .eq('id', task.id);

  console.log(`✅ Reminder sent for task ${task.id}`);
}
