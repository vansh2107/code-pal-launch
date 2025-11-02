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
    // Fetch all users with email notifications enabled
    const { data: profiles, error: fetchError } = await supabase
      .from('profiles')
      .select('email, display_name, email_notifications_enabled')
      .eq('email_notifications_enabled', true)
      .not('email', 'is', null);

    if (fetchError) {
      console.error("Error fetching profiles:", fetchError);
      throw fetchError;
    }

    if (!profiles || profiles.length === 0) {
      console.log("No users with email notifications enabled");
      return new Response(
        JSON.stringify({ message: "No users to notify", count: 0 }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 }
      );
    }

    console.log(`Found ${profiles.length} users to notify`);

    let sentCount = 0;
    let errorCount = 0;

    for (const profile of profiles) {
      if (!profile.email) {
        continue;
      }

      try {
        const emailHtml = `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <h2 style="color: #1E40AF;">Thank You for Using Softly Reminder!</h2>
            <p>Hello ${profile.display_name || 'there'},</p>
            <p>We wanted to take a moment to thank you for using Softly Reminder. Your trust in our app means the world to us!</p>
            
            <div style="background-color: #f3f4f6; padding: 20px; border-radius: 8px; margin: 20px 0;">
              <p style="margin: 0; color: #374151;">
                We're constantly working to improve your experience and help you stay on top of your important documents and renewals.
              </p>
            </div>

            <p>If you have any feedback or suggestions, we'd love to hear from you. Your input helps us make Softly Reminder even better!</p>
            
            <div style="margin-top: 30px;">
              <a href="https://code-pal-launch.vercel.app" 
                 style="background-color: #1E40AF; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; display: inline-block;">
                Open Softly Reminder
              </a>
            </div>

            <p style="margin-top: 30px; font-size: 14px; color: #6b7280;">
              Thank you for being part of our community!<br>
              The Softly Reminder Team
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
              to: [{ email: profile.email }]
            }],
            from: { email: 'remind659@gmail.com' },
            subject: 'Thank You for Using Softly Reminder!',
            content: [{
              type: 'text/html',
              value: emailHtml
            }]
          })
        });

        if (!emailResponse.ok) {
          const errorText = await emailResponse.text();
          console.error(`Error sending email to ${profile.email}:`, errorText);
          errorCount++;
          continue;
        }

        console.log(`Successfully sent notification to: ${profile.email}`);
        sentCount++;

      } catch (error) {
        console.error(`Exception sending email to ${profile.email}:`, error);
        errorCount++;
      }
    }

    console.log(`Bulk notification complete. Sent: ${sentCount}, Errors: ${errorCount}`);

    return new Response(
      JSON.stringify({ 
        message: "Bulk notification complete",
        sent: sentCount,
        errors: errorCount,
        total: profiles.length
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
