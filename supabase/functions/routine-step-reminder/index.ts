import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { sendUnifiedNotification } from '../_shared/unified-notifications.ts';
import { handleCorsOptions, createJsonResponse, createErrorResponse } from '../_shared/cors.ts';
import { toZonedTime } from 'npm:date-fns-tz@3.2.0';

/**
 * Routine Step Reminder Function
 * 
 * Runs every 5 minutes via cron. For each user with active routines today:
 * 1. Finds in-progress routine logs
 * 2. Determines the current/upcoming step based on step_start_time
 * 3. Sends smart reminders:
 *    - "Step starting now" when a step's time arrives
 *    - "Nudge" if strict mode and step is overdue by >5 min
 *    - "Next step preview" 5 min before next step
 */

interface RoutineLogRow {
  id: string;
  routine_id: string;
  user_id: string;
  mode: string;
  auto_adjust: boolean;
  current_step_index: number;
  status: string;
  last_notified_step_id: string | null;
  last_notified_at: string | null;
}

interface StepRow {
  id: string;
  routine_id: string;
  title: string;
  step_start_time: string | null;
  duration_minutes: number;
  sort_order: number;
}

interface StepLogRow {
  step_id: string;
}

function parseTimeToMinutes(time: string): number {
  const parts = time.split(':').map(Number);
  return (parts[0] || 0) * 60 + (parts[1] || 0);
}

function formatTime12(time24: string): string {
  const [h, m] = time24.split(':').map(Number);
  const ampm = h >= 12 ? 'PM' : 'AM';
  const h12 = h % 12 || 12;
  return `${h12}:${String(m).padStart(2, '0')} ${ampm}`;
}

// Playful routine notification messages
const stepStartMessages = [
  { title: '🎯 Time for:', message: 'STEP is up! Let\'s go! 💪' },
  { title: '⏰ Routine step!', message: 'It\'s STEP time. You got this! 🚀' },
  { title: '📋 Next up:', message: 'STEP — knock it out! 🔥' },
  { title: '✨ Step alert:', message: 'STEP starts now. Show up! 💫' },
  { title: '🏃 Go go go!', message: 'Time for STEP. Move it! 🎯' },
];

const nudgeMessages = [
  { title: '😤 Hey!', message: 'You\'re late on STEP! Catch up NOW 🏃' },
  { title: '⚠️ Falling behind!', message: 'STEP was supposed to start already! 😬' },
  { title: '🔥 Strict mode!', message: 'STEP is overdue. Don\'t break your streak! 💪' },
  { title: '👀 Still waiting...', message: 'STEP needs you. Don\'t ghost your routine! 👻' },
];

const previewMessages = [
  { title: '🔮 Coming up:', message: 'STEP starts in ~5 min. Get ready! 🎯' },
  { title: '⏳ Heads up!', message: 'STEP is almost here. Wrap up and prep! 🧠' },
];

function getRandomItem<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function buildMessage(templates: { title: string; message: string }[], stepTitle: string, routineName: string) {
  const tmpl = getRandomItem(templates);
  return {
    title: tmpl.title.replace('STEP', stepTitle),
    message: tmpl.message.replace('STEP', `"${stepTitle}"`) + ` (${routineName})`,
  };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return handleCorsOptions();
  }

  try {
    console.log('🔔 Routine step reminder starting...');

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const today = new Date().toISOString().split('T')[0];

    // 1. Get all in-progress routine logs for today
    const { data: logs, error: logsErr } = await supabase
      .from('routine_logs')
      .select('id, routine_id, user_id, mode, auto_adjust, current_step_index, status')
      .eq('status', 'in_progress')
      .eq('execution_date', today);

    if (logsErr) throw logsErr;
    if (!logs || logs.length === 0) {
      return createJsonResponse({ message: 'No active routines', sent: 0 });
    }

    console.log(`Found ${logs.length} active routine logs`);

    // 2. Collect routine IDs and user IDs
    const routineIds = [...new Set((logs as RoutineLogRow[]).map(l => l.routine_id))];
    const userIds = [...new Set((logs as RoutineLogRow[]).map(l => l.user_id))];

    // 3. Fetch all steps for these routines
    const { data: allSteps } = await supabase
      .from('routine_steps')
      .select('id, routine_id, title, step_start_time, duration_minutes, sort_order')
      .in('routine_id', routineIds)
      .order('sort_order', { ascending: true });

    const stepsMap: Record<string, StepRow[]> = {};
    for (const s of (allSteps || []) as StepRow[]) {
      if (!stepsMap[s.routine_id]) stepsMap[s.routine_id] = [];
      stepsMap[s.routine_id].push(s);
    }

    // 4. Fetch routines for names and notification settings
    const { data: routinesData } = await supabase
      .from('routines')
      .select('id, name, notifications_enabled, repeat_days')
      .in('id', routineIds);

    const routineNameMap: Record<string, string> = {};
    const routineNotifMap: Record<string, boolean> = {};
    const routineRepeatMap: Record<string, number[]> = {};
    for (const r of (routinesData || []) as { id: string; name: string; notifications_enabled: boolean; repeat_days: number[] }[]) {
      routineNameMap[r.id] = r.name;
      routineNotifMap[r.id] = r.notifications_enabled ?? true;
      routineRepeatMap[r.id] = r.repeat_days || [1, 2, 3, 4, 5, 6, 7];
    }

    // 5. Fetch user profiles for timezone
    const { data: profiles } = await supabase
      .from('profiles')
      .select('user_id, timezone, push_notifications_enabled')
      .in('user_id', userIds);

    const tzMap: Record<string, string> = {};
    const pushEnabledMap: Record<string, boolean> = {};
    for (const p of (profiles || []) as { user_id: string; timezone: string; push_notifications_enabled: boolean }[]) {
      tzMap[p.user_id] = p.timezone || 'UTC';
      pushEnabledMap[p.user_id] = p.push_notifications_enabled ?? false;
    }

    // 6. Fetch completed step IDs for each log
    const logIds = (logs as RoutineLogRow[]).map(l => l.id);
    const { data: stepLogs } = await supabase
      .from('routine_step_logs')
      .select('routine_log_id, step_id')
      .in('routine_log_id', logIds);

    const completedMap: Record<string, Set<string>> = {};
    for (const sl of (stepLogs || []) as { routine_log_id: string; step_id: string }[]) {
      if (!completedMap[sl.routine_log_id]) completedMap[sl.routine_log_id] = new Set();
      completedMap[sl.routine_log_id].add(sl.step_id);
    }

    // 7. Process each log
    let sentCount = 0;

    for (const log of logs as RoutineLogRow[]) {
      try {
        if (!pushEnabledMap[log.user_id]) continue;
        if (!routineNotifMap[log.routine_id]) continue;

        const tz = tzMap[log.user_id] || 'UTC';

        // Check if today is a repeat day for this routine
        const userNowFull = toZonedTime(new Date(), tz);
        const dayOfWeek = userNowFull.getDay() === 0 ? 7 : userNowFull.getDay(); // 1=Mon, 7=Sun
        const allowedDays = routineRepeatMap[log.routine_id] || [1, 2, 3, 4, 5, 6, 7];
        if (!allowedDays.includes(dayOfWeek)) continue;

        const steps = (stepsMap[log.routine_id] || []).filter(s => s.step_start_time);
        if (steps.length === 0) continue;

        const completedIds = completedMap[log.id] || new Set();
        const routineName = routineNameMap[log.routine_id] || 'Routine';

        // Get user's current time in minutes
        const nowUtc = new Date();
        const userNow = toZonedTime(nowUtc, tz);
        const nowMin = userNow.getHours() * 60 + userNow.getMinutes();

        for (let i = 0; i < steps.length; i++) {
          const step = steps[i];
          if (completedIds.has(step.id)) continue;
          if (!step.step_start_time) continue;

          const stepMin = parseTimeToMinutes(step.step_start_time);

          // A. Step is starting now (within 2-minute window)
          if (nowMin >= stepMin && nowMin <= stepMin + 2) {
            const msg = buildMessage(stepStartMessages, step.title, routineName);
            const sent = await sendUnifiedNotification(supabase, {
              userId: log.user_id,
              title: msg.title,
              message: msg.message,
              data: { type: 'routine_step', routine_id: log.routine_id, step_id: step.id },
            });
            if (sent) sentCount++;
            break; // one notification per routine per cycle
          }

          // B. Strict mode nudge: step is 5+ min overdue
          if (log.mode === 'strict' && nowMin >= stepMin + 5) {
            // Only nudge every 10 minutes (check modulo)
            const overdueMin = nowMin - stepMin;
            if (overdueMin % 10 < 5) {
              const msg = buildMessage(nudgeMessages, step.title, routineName);
              const sent = await sendUnifiedNotification(supabase, {
                userId: log.user_id,
                title: msg.title,
                message: msg.message,
                data: { type: 'routine_nudge', routine_id: log.routine_id, step_id: step.id },
              });
              if (sent) sentCount++;
              break;
            }
          }

          // C. Preview: next step starts in ~5 min (window: 3-5 min before)
          if (nowMin >= stepMin - 5 && nowMin <= stepMin - 3) {
            const msg = buildMessage(previewMessages, step.title, routineName);
            const sent = await sendUnifiedNotification(supabase, {
              userId: log.user_id,
              title: msg.title,
              message: msg.message,
              data: { type: 'routine_preview', routine_id: log.routine_id, step_id: step.id },
            });
            if (sent) sentCount++;
            break;
          }
        }
      } catch (logError) {
        console.error(`Error processing routine log ${log.id}:`, logError);
      }
    }

    console.log(`✅ Routine reminders sent: ${sentCount}`);
    return createJsonResponse({ success: true, sent: sentCount, logsProcessed: logs.length });
  } catch (error) {
    console.error('Error in routine-step-reminder:', error);
    return createErrorResponse(error as Error);
  }
});
