import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const sendGridApiKey = Deno.env.get("SENDGRID_API_KEY");
const sendGridEndpoint = 'https://api.sendgrid.com/v3/mail/send';
const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const handler = async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  console.log("Starting bulk notification send...");

  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  try {
    // Fetch all users from auth.users using admin API
    const { data: { users }, error: usersError } = await supabase.auth.admin.listUsers();

    if (usersError) {
      console.error("Error fetching users:", usersError);
      throw usersError;
    }

    if (!users || users.length === 0) {
      console.log("No users found");
      return new Response(
        JSON.stringify({ message: "No users to notify", count: 0 }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 }
      );
    }

    // Fetch profiles to check email notification preferences
    const { data: profiles, error: profilesError } = await supabase
      .from('profiles')
      .select('user_id, email_notifications_enabled, display_name');

    if (profilesError) {
      console.error("Error fetching profiles:", profilesError);
      throw profilesError;
    }

    // Create a map of user preferences
    const userPrefs = new Map(
      profiles?.map(p => [p.user_id, { enabled: p.email_notifications_enabled, name: p.display_name }]) || []
    );

    // Filter users who have email notifications enabled (default to true if not set)
    const usersToNotify = users.filter(user => {
      const prefs = userPrefs.get(user.id);
      const notificationsEnabled = prefs?.enabled !== false; // Default to true
      return user.email && notificationsEnabled;
    });

    console.log(`Found ${usersToNotify.length} users to notify out of ${users.length} total users`);

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
            <h2 style="color: #1E40AF;">Thank You for Using Remonk Reminder!</h2>
            <p>Hello ${displayName},</p>
            <p>We wanted to take a moment to thank you for using Remonk Reminder. Your trust in our app means the world to us!</p>
            
            <div style="background-color: #f3f4f6; padding: 20px; border-radius: 8px; margin: 20px 0;">
              <p style="margin: 0; color: #374151;">
                We're constantly working to improve your experience and help you stay on top of your important documents and renewals.
              </p>
            </div>

            <p>If you have any feedback or suggestions, we'd love to hear from you. Your input helps us make Remonk Reminder even better!</p>
            
            <div style="margin-top: 30px;">
              <a href="https://code-pal-launch.vercel.app" 
                 style="background-color: #1E40AF; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; display: inline-block;">
                Open Remonk Reminder
              </a>
            </div>

            <p style="margin-top: 30px; font-size: 14px; color: #6b7280;">
              Thank you for being part of our community!<br>
              The Remonk Reminder Team
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
            subject: 'Thank You for Using Remonk Reminder!',
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
