import { createSupabaseClient } from '../_shared/database.ts';
import { handleCorsOptions, createJsonResponse, createErrorResponse } from '../_shared/cors.ts';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return handleCorsOptions();
  }

  try {
    console.log('📧 Starting bulk notification send...');

    const supabase = createSupabaseClient();
    const sendGridApiKey = Deno.env.get('SENDGRID_API_KEY');

    if (!sendGridApiKey) {
      throw new Error('SendGrid API key not configured');
    }

    const { data: { users }, error: usersError } = await supabase.auth.admin.listUsers();

    if (usersError) throw usersError;
    if (!users || users.length === 0) {
      return createJsonResponse({ message: 'No users to notify', count: 0 });
    }

    const { data: profiles } = await supabase
      .from('profiles')
      .select('user_id, email_notifications_enabled, display_name');

    const userPrefs = new Map(
      profiles?.map(p => [p.user_id, { enabled: p.email_notifications_enabled, name: p.display_name }]) || []
    );

    const usersToNotify = users.filter(user => {
      const prefs = userPrefs.get(user.id);
      return user.email && prefs?.enabled !== false;
    });

    let sentCount = 0;

    for (const user of usersToNotify) {
      try {
        if (!user.email) continue;

        const prefs = userPrefs.get(user.id);
        const displayName = prefs?.name || 'there';
        
        const emailHtml = `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
            <h2 style="color: #FF9506;">Your Documents Just Sent a Thank You Note! 📄✨</h2>
            <p>Hey ${displayName}! 👋</p>
            <p>We caught your documents gossiping about you... and honestly, they're pretty impressed! 😎</p>
            <div style="background-color: #FFF7F0; padding: 20px; border-radius: 14px; margin: 20px 0;">
              <p style="margin: 0; color: #374151;">
                <strong>Your documents are all staying fresh and valid!</strong>
              </p>
            </div>
            <div style="margin-top: 30px;">
              <a href="https://code-pal-launch.vercel.app" 
                 style="background-color: #FF9506; color: white; padding: 12px 24px; text-decoration: none; border-radius: 12px; display: inline-block;">
                Check Your Documents 📱
              </a>
            </div>
          </div>
        `;

        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 10000);

        const response = await fetch('https://api.sendgrid.com/v3/mail/send', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${sendGridApiKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            personalizations: [{ to: [{ email: user.email }] }],
            from: { email: 'notifications@softlyreminder.app', name: 'Softly Reminder' },
            subject: 'Your Documents Are Grateful! 📄✨',
            content: [{ type: 'text/html', value: emailHtml }],
          }),
          signal: controller.signal,
        });

        clearTimeout(timeoutId);
        if (response.ok) sentCount++;
      } catch (emailError) {
        console.error(`Error sending email:`, emailError);
      }
    }

    return createJsonResponse({
      success: true,
      message: `Sent ${sentCount} emails`,
      totalUsers: users.length,
      notifiedUsers: sentCount,
    });
  } catch (error) {
    console.error('Error in send-bulk-notification:', error);
    return createErrorResponse(error as Error);
  }
});
