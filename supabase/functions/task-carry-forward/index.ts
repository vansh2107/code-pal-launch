import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getFunnyNotification } from '../_shared/funnyNotifications.ts';

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Fetch all pending tasks; we will filter per-user using their timezone
    const { data: pendingTasks, error: fetchError } = await supabase
      .from("tasks")
      .select("*, profiles!inner(email, push_notifications_enabled, email_notifications_enabled, timezone)")
      .eq("status", "pending");

    if (fetchError) throw fetchError;

    const carriedTasks = [];
    const notificationsSent = [];

    for (const task of pendingTasks || []) {
      const profile = task.profiles;
      if (!profile || !profile.timezone) continue;

      // Compute user's local "today" in yyyy-MM-dd using Intl.DateTimeFormat
      const now = new Date();
      const formatter = new Intl.DateTimeFormat("en-CA", {
        timeZone: profile.timezone,
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      });

      const parts = formatter.formatToParts(now);
      const y = parts.find((p) => p.type === "year")?.value;
      const m = parts.find((p) => p.type === "month")?.value;
      const d = parts.find((p) => p.type === "day")?.value;

      const todayLocal = `${y}-${m}-${d}`;

      // Skip if not actually overdue in user's timezone
      if (task.task_date >= todayLocal) {
        continue;
      }

      // Count how many days missed
      const daysMissed = Math.max(
        1,
        Math.floor(
          (new Date(todayLocal).getTime() - new Date(task.task_date).getTime()) /
            (1000 * 60 * 60 * 24)
        )
      );

      const newConsecutiveDays =
        (task.consecutive_missed_days || 0) + daysMissed;

      // Update the task's date to the user's local today
      const { error: updateError } = await supabase
        .from("tasks")
        .update({
          task_date: todayLocal,
          consecutive_missed_days: newConsecutiveDays,
        })
        .eq("id", task.id);

      if (updateError) continue;

      carriedTasks.push(task.id);

      // Send notifications
      
      const notificationType = newConsecutiveDays >= 3 ? "task_lazy_3days" : "task_incomplete";
      const funnyMessage = getFunnyNotification(notificationType, {
        taskTitle: task.title,
        consecutiveDays: newConsecutiveDays,
      });

      // Send push notification
      if (profile.push_notifications_enabled) {
        try {
          await supabase.functions.invoke("send-onesignal-notification", {
            body: {
              userId: task.user_id,
              title: funnyMessage.title,
              message: funnyMessage.message,
              data: { taskId: task.id, type: "task_carry_forward" },
            },
          });
        } catch (err) {
          console.error("Push notification error:", err);
        }
      }

      // Send email notification
      if (profile.email_notifications_enabled && profile.email) {
        try {
          await fetch(
            `${supabaseUrl}/functions/v1/send-task-notification-email`,
            {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${supabaseKey}`,
              },
              body: JSON.stringify({
                email: profile.email,
                taskTitle: task.title,
                message: funnyMessage.message,
                consecutiveDays: newConsecutiveDays,
              }),
            }
          );
        } catch (err) {
          console.error("Email notification error:", err);
        }
      }

      notificationsSent.push(task.id);
    }

    console.log(`Carried forward ${carriedTasks.length} tasks, sent ${notificationsSent.length} notifications`);

    return new Response(
      JSON.stringify({
        success: true,
        carriedTasks: carriedTasks.length,
        notificationsSent: notificationsSent.length,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: any) {
    console.error("Error in task-carry-forward:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
