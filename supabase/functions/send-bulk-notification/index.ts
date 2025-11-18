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

    // Fetch all users
    const { data: { users }, error: usersError } = await supabase.auth.admin.listUsers();

    if (usersError) {
      console.error('Error fetching users:', usersError);
      throw usersError;
    }

    if (!users || users.length === 0) {
      return createJsonResponse({ message: 'No users to notify', count: 0 });
    }

    // Fetch profiles
    const { data: profiles, error: profilesError } = await supabase
      .from('profiles')
      .select('user_id, email_notifications_enabled, display_name');

    if (profilesError) {
      console.error('Error fetching profiles:', profilesError);
      throw profilesError;
    }

    const userPrefs = new Map(
      profiles?.map(p => [p.user_id, { enabled: p.email_notifications_enabled, name: p.display_name }]) || []
    );

    // Filter users with email notifications enabled
    const usersToNotify = users.filter(user => {
      const prefs = userPrefs.get(user.id);
      const notificationsEnabled = prefs?.enabled !== false;
      return user.email && notificationsEnabled;
    });

    console.log(`Sending to ${usersToNotify.length} users out of ${users.length} total`);

    let sentCount = 0;
    let errorCount = 0;

    for (const user of usersToNotify) {
      if (!user.email) {
        continue;
      }

      try {
        const prefs = userPrefs.get(user.id);
        const displayName = prefs?.name || user.user_metadata?.display_name || user.user_metadata?.full_name || 'there';
        
        const emailHtml = `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <h2 style="color: #1E40AF;">Your Documents Just Sent a Thank You Note! 📄✨</h2>
            <p>Hey ${displayName}! 👋</p>
            <p>We caught your documents gossiping about you... and honestly, they're pretty impressed! 😎</p>
            
            <div style="background-color: #f3f4f6; padding: 20px; border-radius: 8px; margin: 20px 0;">
              <p style="margin: 0; color: #374151; font-size: 18px;">
                <strong>Your passport won't expire unexpectedly</strong><br>
                <strong>Your license won't ghost you</strong><br>
                <strong>Your permits won't pull a disappearing act</strong><br><br>
                Thanks to you (and us 😉), they're all staying fresh and valid!
              </p>
            </div>

            <p>We promise to keep nagging you about renewals so you never have to panic at the last minute. Because let's face it, nobody likes scrambling for expired documents! 🏃‍♂️💨</p>
            
            <div style="margin-top: 30px;">
              <a href="https://code-pal-launch.vercel.app" 
                 style="background-color: #1E40AF; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; display: inline-block;">
                Check Your Documents 📱
              </a>
            </div>

            <p style="margin-top: 30px; font-size: 14px; color: #6b7280;">
              Your friendly neighborhood reminder app 🦸‍♂️<br>
              Team Remonk (We won't let you forget!)
            </p>
          </div>
        `;

        const emailResponse = await fetch(sendGridEndpoint, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${sendGridApiKey}`
          },
          body: JSON.stringify({
            personalizations: [{
              to: [{ email: user.email }]
            }],
            from: { email: 'remind659@gmail.com' },
            subject: 'Your Documents Are Throwing a Party 🎉 (And You\'re Invited!)',
            content: [{
              type: 'text/html',
              value: emailHtml
            }]
          })
        });

        if (!emailResponse.ok) {
          const errorText = await emailResponse.text();
          console.error(`Error sending email to ${user.email}:`, errorText);
          errorCount++;
          continue;
        }

        console.log(`Successfully sent notification to: ${user.email}`);
        sentCount++;

      } catch (error) {
        console.error(`Exception sending email to ${user.email}:`, error);
        errorCount++;
      }
    }

    console.log(`Bulk notification complete. Sent: ${sentCount}, Errors: ${errorCount}`);

    return new Response(
      JSON.stringify({ 
        message: "Bulk notification complete",
        sent: sentCount,
        errors: errorCount,
        total: usersToNotify.length
      }),
      { 
        headers: { ...corsHeaders, "Content-Type": "application/json" }, 
        status: 200 
      }
    );

  } catch (error: any) {
    console.error("Error in send-bulk-notification function:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      {
        status: 500,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      }
    );
  }
};

serve(handler);
