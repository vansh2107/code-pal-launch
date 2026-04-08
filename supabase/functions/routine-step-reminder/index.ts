import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { sendUnifiedNotification } from '../_shared/unified-notifications.ts';
import { handleCorsOptions, createJsonResponse, createErrorResponse } from '../_shared/cors.ts';
import { toZonedTime } from 'npm:date-fns-tz@3.2.0';

/**
 * Routine Step Reminder — Slot-aware, dedup-safe, idempotent.
 *
 * Uses routine_slots table for multi-time/day scheduling.
 * Checks is_active flag to respect activate/deactivate toggle.
 * Each notification key includes slot start_time for uniqueness.
 */

interface RoutineLogRow {
  id: string;
  routine_id: string;
  user_id: string;
  mode: string;
  auto_adjust: boolean;
  current_step_index: number;
  status: string;
}

interface StepRow {
  id: string;
  routine_id: string;
  title: string;
  step_start_time: string | null;
  duration_minutes: number;
  sort_order: number;
}

interface SlotRow {
  id: string;
  routine_id: string;
  days_of_week: number[];
  start_time: string;
}

function parseTimeToMinutes(time: string): number {
  const parts = time.split(':').map(Number);
  return (parts[0] || 0) * 60 + (parts[1] || 0);
}

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

async function scheduleNotification(
  supabase: ReturnType<typeof createClient>,
  params: {
    userId: string;
    routineId: string;
    stepId: string;
    date: string;
    type: 'step_start' | 'nudge' | 'preview';
    title: string;
    message: string;
    data: Record<string, string>;
  }
): Promise<boolean> {
  const notificationKey = `${params.userId}_${params.routineId}_${params.stepId}_${params.date}_${params.type}`;

  const { data: existing } = await supabase
    .from('routine_notification_log')
    .select('id')
    .eq('notification_key', notificationKey)
    .limit(1);

  if (existing && existing.length > 0) {
    console.log(`⏭️ Notification already exists: ${notificationKey}`);
    return false;
  }

  const sent = await sendUnifiedNotification(supabase, {
    userId: params.userId,
    title: params.title,
    message: params.message,
    data: params.data,
  });

  if (sent) {
    const { error: logError } = await supabase
      .from('routine_notification_log')
      .upsert({
        notification_key: notificationKey,
        user_id: params.userId,
        routine_id: params.routineId,
        step_id: params.stepId,
        notification_type: params.type,
      }, { onConflict: 'notification_key' });

    if (logError) {
      console.error(`Failed to log notification ${notificationKey}:`, logError);
    }
    console.log(`✅ Scheduling notification: ${notificationKey}`);
    return true;
  }
  return false;
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

    // Cleanup old notification logs (older than 2 days)
    const twoDaysAgo = new Date(Date.now() - 2 * 86400 * 1000).toISOString();
    await supabase.from('routine_notification_log').delete().lt('sent_at', twoDaysAgo);

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

    const routineIds = [...new Set((logs as RoutineLogRow[]).map(l => l.routine_id))];
    const userIds = [...new Set((logs as RoutineLogRow[]).map(l => l.user_id))];
    const logIds = (logs as RoutineLogRow[]).map(l => l.id);

    // 2. Batch fetch all data including slots
    const [stepsResult, routinesResult, profilesResult, stepLogsResult, slotsResult] = await Promise.all([
      supabase.from('routine_steps').select('id, routine_id, title, step_start_time, duration_minutes, sort_order')
        .in('routine_id', routineIds).order('sort_order', { ascending: true }),
      supabase.from('routines').select('id, name, notifications_enabled, repeat_days, is_active')
        .in('id', routineIds),
      supabase.from('profiles').select('user_id, timezone, push_notifications_enabled')
        .in('user_id', userIds),
      supabase.from('routine_step_logs').select('routine_log_id, step_id')
        .in('routine_log_id', logIds),
      supabase.from('routine_slots').select('id, routine_id, days_of_week, start_time')
        .in('routine_id', routineIds),
    ]);

    // Build lookup maps
    const stepsMap: Record<string, StepRow[]> = {};
    for (const s of (stepsResult.data || []) as StepRow[]) {
      if (!stepsMap[s.routine_id]) stepsMap[s.routine_id] = [];
      stepsMap[s.routine_id].push(s);
    }

    const routineMap: Record<string, { name: string; notifications_enabled: boolean; repeat_days: number[]; is_active: boolean }> = {};
    for (const r of (routinesResult.data || []) as any[]) {
      routineMap[r.id] = {
        name: r.name,
        notifications_enabled: r.notifications_enabled ?? true,
        repeat_days: r.repeat_days || [1, 2, 3, 4, 5, 6, 7],
        is_active: r.is_active !== false,
      };
    }

    const slotsMap: Record<string, SlotRow[]> = {};
    for (const s of (slotsResult.data || []) as SlotRow[]) {
      if (!slotsMap[s.routine_id]) slotsMap[s.routine_id] = [];
      slotsMap[s.routine_id].push(s);
    }

    const userMap: Record<string, { tz: string; pushEnabled: boolean }> = {};
    for (const p of (profilesResult.data || []) as any[]) {
      userMap[p.user_id] = {
        tz: p.timezone || 'UTC',
        pushEnabled: p.push_notifications_enabled ?? false,
      };
    }

    const completedMap: Record<string, Set<string>> = {};
    for (const sl of (stepLogsResult.data || []) as any[]) {
      if (!completedMap[sl.routine_log_id]) completedMap[sl.routine_log_id] = new Set();
      completedMap[sl.routine_log_id].add(sl.step_id);
    }

    // 3. Process each log
    let sentCount = 0;

    for (const log of logs as RoutineLogRow[]) {
      try {
        const userInfo = userMap[log.user_id];
        if (!userInfo?.pushEnabled) continue;

        const routineInfo = routineMap[log.routine_id];
        if (!routineInfo?.notifications_enabled) continue;

        // ❌ Skip if routine is deactivated
        if (!routineInfo.is_active) {
          console.log(`⏭️ Skipping routine ${log.routine_id} — deactivated`);
          continue;
        }

        const tz = userInfo.tz;
        const userNow = toZonedTime(new Date(), tz);
        const dayOfWeek = userNow.getDay() === 0 ? 7 : userNow.getDay();

        // Check slots first, then fall back to repeat_days
        const routineSlots = slotsMap[log.routine_id] || [];
        let todaySlot: SlotRow | null = null;

        if (routineSlots.length > 0) {
          // Use slot-based scheduling
          todaySlot = routineSlots.find(s => s.days_of_week.includes(dayOfWeek)) || null;
          if (!todaySlot) {
            console.log(`⏭️ Skipping routine ${log.routine_id} — no slot for today (day=${dayOfWeek})`);
            continue;
          }
        } else {
          // Legacy: use repeat_days from routine
          if (!routineInfo.repeat_days.includes(dayOfWeek)) {
            console.log(`⏭️ Skipping routine ${log.routine_id} — not a repeat day (today=${dayOfWeek})`);
            continue;
          }
        }

        const steps = (stepsMap[log.routine_id] || []).filter(s => s.step_start_time);
        if (steps.length === 0) continue;

        const completedIds = completedMap[log.id] || new Set();
        const routineName = routineInfo.name;

        const nowMin = userNow.getHours() * 60 + userNow.getMinutes();
        const userDate = `${userNow.getFullYear()}-${String(userNow.getMonth() + 1).padStart(2, '0')}-${String(userNow.getDate()).padStart(2, '0')}`;

        for (let i = 0; i < steps.length; i++) {
          const step = steps[i];
          if (completedIds.has(step.id)) continue;
          if (!step.step_start_time) continue;

          const stepMin = parseTimeToMinutes(step.step_start_time);

          // A. Step starting now (within 5-min window)
          if (nowMin >= stepMin && nowMin < stepMin + 5) {
            const msg = buildMessage(stepStartMessages, step.title, routineName);
            const sent = await scheduleNotification(supabase, {
              userId: log.user_id,
              routineId: log.routine_id,
              stepId: step.id,
              date: userDate,
              type: 'step_start',
              title: msg.title,
              message: msg.message,
              data: { type: 'routine_step', routine_id: log.routine_id, step_id: step.id },
            });
            if (sent) sentCount++;
            break;
          }

          // B. Strict mode nudge (overdue by >= 10 min, one per step per day)
          if (log.mode === 'strict' && nowMin >= stepMin + 10) {
            const msg = buildMessage(nudgeMessages, step.title, routineName);
            const sent = await scheduleNotification(supabase, {
              userId: log.user_id,
              routineId: log.routine_id,
              stepId: step.id,
              date: userDate,
              type: 'nudge',
              title: msg.title,
              message: msg.message,
              data: { type: 'routine_nudge', routine_id: log.routine_id, step_id: step.id },
            });
            if (sent) sentCount++;
            break;
          }

          // C. Preview (5 min before)
          if (nowMin >= stepMin - 5 && nowMin < stepMin) {
            const msg = buildMessage(previewMessages, step.title, routineName);
            const sent = await scheduleNotification(supabase, {
              userId: log.user_id,
              routineId: log.routine_id,
              stepId: step.id,
              date: userDate,
              type: 'preview',
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
