import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { sendUnifiedNotification } from '../_shared/unified-notifications.ts';
import { handleCorsOptions, createJsonResponse, createErrorResponse } from '../_shared/cors.ts';
import { toZonedTime } from 'npm:date-fns-tz@3.2.0';

/**
 * Routine Task Slot Reminder — simplified model.
 *
 * Routines contain tasks. Each task has time slots with days_of_week.
 * For each active routine, find slots matching today + current time window.
 * Send one notification per slot per day (dedup via routine_notification_log).
 */

function parseTimeToMinutes(time: string): number {
  const parts = time.split(':').map(Number);
  return (parts[0] || 0) * 60 + (parts[1] || 0);
}

const startMessages = [
  { title: '🎯 Time for:', message: 'TASK is up! Let\'s go! 💪' },
  { title: '⏰ Routine reminder!', message: 'It\'s TASK time. You got this! 🚀' },
  { title: '📋 Scheduled:', message: 'TASK — knock it out! 🔥' },
];

const previewMessages = [
  { title: '🔮 Coming up:', message: 'TASK starts in ~5 min. Get ready! 🎯' },
  { title: '⏳ Heads up!', message: 'TASK is almost here. Wrap up and prep! 🧠' },
];

function getRandomItem<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function buildMessage(templates: { title: string; message: string }[], taskName: string, routineName: string) {
  const tmpl = getRandomItem(templates);
  return {
    title: tmpl.title.replace('TASK', taskName),
    message: tmpl.message.replace('TASK', `"${taskName}"`) + ` (${routineName})`,
  };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return handleCorsOptions();

  try {
    console.log('🔔 Routine task slot reminder starting...');

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Cleanup old notification logs (older than 2 days)
    const twoDaysAgo = new Date(Date.now() - 2 * 86400 * 1000).toISOString();
    await supabase.from('routine_notification_log').delete().lt('sent_at', twoDaysAgo);

    // 1. Get all active routines
    const { data: routines, error: routinesErr } = await supabase
      .from('routines')
      .select('id, user_id, name, is_active')
      .eq('is_active', true);

    if (routinesErr) throw routinesErr;
    if (!routines || routines.length === 0) {
      return createJsonResponse({ message: 'No active routines', sent: 0 });
    }

    const routineIds = routines.map((r: any) => r.id);
    const userIds = [...new Set(routines.map((r: any) => r.user_id))];

    // 2. Batch fetch tasks, slots, profiles
    const [tasksResult, profilesResult] = await Promise.all([
      supabase.from('routine_tasks').select('id, routine_id, name').in('routine_id', routineIds),
      supabase.from('profiles').select('user_id, timezone, push_notifications_enabled').in('user_id', userIds),
    ]);

    const tasks = (tasksResult.data || []) as any[];
    if (tasks.length === 0) {
      return createJsonResponse({ message: 'No tasks found', sent: 0 });
    }

    const taskIds = tasks.map((t: any) => t.id);
    const { data: slotsData } = await supabase
      .from('routine_task_slots')
      .select('id, task_id, time, days_of_week')
      .in('task_id', taskIds);
    const slots = (slotsData || []) as any[];

    // Build maps
    const routineMap: Record<string, any> = {};
    for (const r of routines as any[]) routineMap[r.id] = r;

    const userMap: Record<string, { tz: string; pushEnabled: boolean }> = {};
    for (const p of (profilesResult.data || []) as any[]) {
      userMap[p.user_id] = { tz: p.timezone || 'UTC', pushEnabled: p.push_notifications_enabled ?? false };
    }

    const taskMap: Record<string, any> = {};
    for (const t of tasks) taskMap[t.id] = t;

    // Build slot lookup: task_id -> slots
    const slotsByTask: Record<string, any[]> = {};
    for (const s of slots) {
      if (!slotsByTask[s.task_id]) slotsByTask[s.task_id] = [];
      slotsByTask[s.task_id].push(s);
    }

    // 3. Process each routine
    let sentCount = 0;

    for (const routine of routines as any[]) {
      const userInfo = userMap[routine.user_id];
      if (!userInfo?.pushEnabled) continue;

      const tz = userInfo.tz;
      const userNow = toZonedTime(new Date(), tz);
      const dayOfWeek = userNow.getDay() === 0 ? 7 : userNow.getDay();
      const nowMin = userNow.getHours() * 60 + userNow.getMinutes();
      const userDate = `${userNow.getFullYear()}-${String(userNow.getMonth() + 1).padStart(2, '0')}-${String(userNow.getDate()).padStart(2, '0')}`;

      // Get tasks for this routine
      const routineTasks = tasks.filter((t: any) => t.routine_id === routine.id);

      for (const task of routineTasks) {
        const taskSlots = slotsByTask[task.id] || [];

        for (const slot of taskSlots) {
          // Check if today is a matching day
          if (!slot.days_of_week.includes(dayOfWeek)) continue;

          const slotMin = parseTimeToMinutes(slot.time);

          let notifType: string | null = null;
          let templates = startMessages;

          // Exact time window (0-5 min after)
          if (nowMin >= slotMin && nowMin < slotMin + 5) {
            notifType = 'slot_start';
            templates = startMessages;
          }
          // Preview (5 min before)
          else if (nowMin >= slotMin - 5 && nowMin < slotMin) {
            notifType = 'slot_preview';
            templates = previewMessages;
          }

          if (!notifType) continue;

          const notificationKey = `${routine.user_id}_${slot.id}_${userDate}_${notifType}`;

          // Dedup check
          const { data: existing } = await supabase
            .from('routine_notification_log')
            .select('id')
            .eq('notification_key', notificationKey)
            .limit(1);

          if (existing && existing.length > 0) continue;

          const msg = buildMessage(templates, task.name, routine.name);

          const sent = await sendUnifiedNotification(supabase, {
            userId: routine.user_id,
            title: msg.title,
            message: msg.message,
            data: { type: 'routine_task', routine_id: routine.id, task_id: task.id, slot_id: slot.id },
          });

          if (sent) {
            await supabase.from('routine_notification_log').upsert({
              notification_key: notificationKey,
              user_id: routine.user_id,
              routine_id: routine.id,
              step_id: slot.id,
              notification_type: notifType,
            }, { onConflict: 'notification_key' });
            sentCount++;
            console.log(`✅ Sent ${notifType} for "${task.name}" in "${routine.name}"`);
          }
        }
      }
    }

    console.log(`✅ Routine reminders sent: ${sentCount}`);
    return createJsonResponse({ success: true, sent: sentCount });
  } catch (error) {
    console.error('Error in routine-step-reminder:', error);
    return createErrorResponse(error as Error);
  }
});
