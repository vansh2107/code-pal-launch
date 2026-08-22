import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { handleCorsOptions, createJsonResponse, createErrorResponse } from '../_shared/cors.ts';
import { collectSubscriptionIds } from '../_shared/onesignal.ts';

// Temporary diagnostic: reports which stored OneSignal subscription ids are still valid.
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return handleCorsOptions(req);

  try {
    const { userId, send } = await req.json();
    if (!userId) return createErrorResponse('userId required', 400, req);

    const appId = Deno.env.get('ONESIGNAL_APP_ID');
    const apiKey = Deno.env.get('ONESIGNAL_REST_API_KEY');
    if (!appId || !apiKey) return createErrorResponse('OneSignal credentials missing', 500, req);

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    const ids = await collectSubscriptionIds(supabase, userId);
    const checks = [] as unknown[];

    for (const id of ids) {
      const res = await fetch(`https://api.onesignal.com/players/${id}?app_id=${appId}`, {
        headers: { Authorization: `Key ${apiKey.trim()}` },
      });
      const text = await res.text();
      let body: any = null;
      try { body = JSON.parse(text); } catch { body = { raw: text.slice(0, 300) }; }
      checks.push({
        subscription_id: id,
        http_status: res.status,
        invalid_identifier: body?.invalid_identifier ?? null,
        device_type: body?.device_type ?? null,
        notification_types: body?.notification_types ?? null,
        last_active: body?.last_active ?? null,
        error: body?.errors ?? null,
      });
    }

    let sendResult: unknown = null;
    if (send) {
      const valid = (checks as any[]).filter((c) => c.invalid_identifier === false).map((c) => c.subscription_id);
      const res = await fetch('https://api.onesignal.com/notifications', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Key ${apiKey.trim()}` },
        body: JSON.stringify({
          app_id: appId,
          include_subscription_ids: valid,
          target_channel: 'push',
          headings: { en: 'Remonk test' },
          contents: { en: 'Direct OneSignal API test from Supabase' },
        }),
      });
      const t = await res.text();
      sendResult = { http_status: res.status, body: t, targeted: valid };
    }

    return createJsonResponse({ app_id_prefix: appId.slice(0, 8), stored: ids.length, checks, sendResult }, 200, req);
  } catch (e) {
    return createErrorResponse(e as Error, 500, req);
  }
});
