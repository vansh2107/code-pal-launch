import { createClient } from 'npm:@supabase/supabase-js@2';
import { format } from 'npm:date-fns@3.6.0';
import { toZonedTime } from 'npm:date-fns-tz@3.2.0';

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
      .select('user_id, timezone')
      .not('timezone', 'is', null);

    if (profilesError) throw profilesError;
    if (!profiles || profiles.length === 0) {
      return new Response(JSON.stringify({ message: 'No users to process' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    let carriedCount = 0;

    for (const profile of profiles) {
      try {
        const nowLocal = toZonedTime(new Date(), profile.timezone);
        const todayLocal = format(nowLocal, 'yyyy-MM-dd');

        const { data: tasks, error: tasksError } = await supabase
          .from('tasks')
          .select('id, task_date, consecutive_missed_days')
          .eq('user_id', profile.user_id)
          .eq('status', 'pending')
          .lt('task_date', todayLocal);

        if (tasksError) throw tasksError;
        if (!tasks || tasks.length === 0) continue;

        for (const task of tasks) {
          try {
            // CARRY FORWARD: Only shift task_date, preserve everything else
            const newConsecutiveDays = (task.consecutive_missed_days || 0) + 1;

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

            carriedCount++;
          } catch (taskError) {
            console.error(`Error processing task ${task.id}:`, taskError);
          }
        }
      } catch (userError) {
        console.error(`Error processing user ${profile.user_id}:`, userError);
      }
    }

    return new Response(
      JSON.stringify({ success: true, carried: carriedCount }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Error in task-carry-forward:', error);
    return new Response(
      JSON.stringify({ success: false, error: (error as Error).message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
