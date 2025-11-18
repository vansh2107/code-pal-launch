import { createClient } from 'npm:@supabase/supabase-js@2';
import { toZonedTime } from 'npm:date-fns-tz@3.2.0';
import { format } from 'npm:date-fns@3.6.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

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
        const nowLocal = toZonedTime(new Date(), profile.timezone);
        const todayLocal = format(nowLocal, 'yyyy-MM-dd');

        const { data: tasks, error: tasksError } = await supabase
          .from('tasks')
          .select('id, user_id, title, task_date, consecutive_missed_days, status')
          .eq('user_id', profile.user_id)
          .eq('status', 'pending')
          .lt('task_date', todayLocal);

        if (tasksError) throw tasksError;
        if (!tasks || tasks.length === 0) continue;

        const urgentTasks = tasks.filter(t => (t.consecutive_missed_days || 0) >= 3);
        
        if (tasks.length > 0) {
          const title = urgentTasks.length > 0 
            ? '🚨 Urgent: Tasks Overdue 3+ Days!' 
            : '📋 Incomplete Tasks Reminder';
          
          const message = urgentTasks.length > 0
            ? `You have ${urgentTasks.length} task${urgentTasks.length > 1 ? 's' : ''} overdue for 3+ days. Time to tackle them! 💪`
            : `You have ${tasks.length} incomplete task${tasks.length > 1 ? 's' : ''} from previous days. Let's complete them today! 🚀`;

          const { error: notifError } = await supabase.functions.invoke('send-onesignal-notification', {
            body: {
              userId: profile.user_id,
              title,
              message,
              data: { type: 'task_incomplete_reminder' },
            },
          });

          if (!notifError) {
            sentCount++;
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
    console.error('Error in task-incomplete-reminder:', error);
    return new Response(
      JSON.stringify({ success: false, error: (error as Error).message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
