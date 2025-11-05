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

interface ReminderWithDocument {
  id: string;
  reminder_date: string;
  user_id: string;
  is_sent: boolean;
  documents: {
    id: string;
    name: string;
    document_type: string;
    expiry_date: string;
    issuing_authority: string | null;
  };
  profiles: {
    email: string | null;
    display_name: string | null;
    email_notifications_enabled: boolean;
    expiry_reminders_enabled: boolean;
  };
}

const handler = async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  // Validate secret token to prevent unauthorized access
  const expectedSecret = Deno.env.get("CRON_SECRET");
  const providedSecret = req.headers.get("x-cron-secret");
  
  if (!expectedSecret || providedSecret !== expectedSecret) {
    console.error("Unauthorized access attempt to send-reminder-emails");
    return new Response(
      JSON.stringify({ error: "Unauthorized" }),
      { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  console.log("Starting reminder email job...");

  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  try {
    const nowUtc = new Date();
    const currentUtcHour = nowUtc.getUTCHours();
    const currentUtcMinute = nowUtc.getUTCMinutes();
    
    console.log(`Current UTC time: ${currentUtcHour}:${currentUtcMinute.toString().padStart(2, '0')}`);
    
    // Fetch all profiles with their timezone and notification preferences
    const { data: profiles, error: profilesError } = await supabase
      .from('profiles')
      .select('user_id, email, display_name, email_notifications_enabled, expiry_reminders_enabled, push_notifications_enabled, timezone, preferred_notification_time');

    if (profilesError) {
      console.error("Error fetching profiles:", profilesError);
      throw profilesError;
    }

    if (!profiles || profiles.length === 0) {
      console.log("No profiles found");
      return new Response(
        JSON.stringify({ message: "No profiles found", count: 0 }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 }
      );
    }

    // Filter users whose local time matches their preferred notification time
    const eligibleUserIds: string[] = [];
    
    for (const profile of profiles) {
      // Skip if notifications are disabled
      if (!profile.email_notifications_enabled || !profile.expiry_reminders_enabled || !profile.email) {
        continue;
      }

      const timezone = profile.timezone || 'UTC';
      const preferredTime = profile.preferred_notification_time || '09:00:00';
      const [preferredHour] = preferredTime.split(':').map(Number);

      // Calculate user's local time
      try {
        const userLocalTime = new Date(nowUtc.toLocaleString('en-US', { timeZone: timezone }));
        const userLocalHour = userLocalTime.getHours();
        
        console.log(`User ${profile.user_id}: timezone=${timezone}, preferred=${preferredHour}:00, current=${userLocalHour}:00`);
        
        // Check if current hour matches preferred hour (with 1 hour window to account for cron frequency)
        if (userLocalHour === preferredHour) {
          eligibleUserIds.push(profile.user_id);
          console.log(`✓ User ${profile.user_id} eligible for notifications`);
        }
      } catch (tzError) {
        console.error(`Error processing timezone ${timezone} for user ${profile.user_id}:`, tzError);
        // Fallback to UTC
        if (currentUtcHour === 9) {
          eligibleUserIds.push(profile.user_id);
        }
      }
    }

    if (eligibleUserIds.length === 0) {
      console.log("No users eligible for notifications at this time");
      return new Response(
        JSON.stringify({ message: "No users eligible at this time", count: 0 }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 }
      );
    }

    console.log(`Found ${eligibleUserIds.length} eligible users`);

    // Fetch reminders for eligible users
    const today = new Date().toISOString().split('T')[0];
    
    const { data: reminders, error: fetchError } = await supabase
      .from('reminders')
      .select(`
        id,
        reminder_date,
        user_id,
        is_sent,
        documents!inner (
          id,
          name,
          document_type,
          expiry_date,
          issuing_authority
        )
      `)
      .eq('reminder_date', today)
      .eq('is_sent', false)
      .in('user_id', eligibleUserIds);

    if (fetchError) {
      console.error("Error fetching reminders:", fetchError);
      throw fetchError;
    }

    if (!reminders || reminders.length === 0) {
      console.log("No reminders to send for eligible users");
      return new Response(
        JSON.stringify({ message: "No reminders to send", count: 0 }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 }
      );
    }

    console.log(`Found ${reminders.length} reminders to process`);

    let sentCount = 0;
    let errorCount = 0;
    
    // Create a map of profiles for quick lookup
    const profileMap = new Map(profiles.map(p => [p.user_id, p]));

    for (const reminder of reminders as any[]) {
      const profile = profileMap.get(reminder.user_id);
      
      if (!profile) {
        console.log(`Skipping reminder ${reminder.id} - no profile found`);
        continue;
      }

      const document = reminder.documents;
      const daysUntilExpiry = Math.ceil(
        (new Date(document.expiry_date).getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24)
      );

      try {
        const emailHtml = `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <h2 style="color: #1E40AF;">🚨 Your ${document.name} Just Sent an SOS!</h2>
            <p>Yo ${profile.display_name || 'there'}! 👋</p>
            <p>Don't panic, but your ${document.document_type} is getting ready to expire. Time to show it some renewal love! 💪</p>
            
            <div style="background-color: #fff3cd; padding: 20px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #F59E0B;">
              <h3 style="margin-top: 0; color: #374151;">⚡ Expiry Alert</h3>
              <p><strong>Document:</strong> ${document.name}</p>
              <p><strong>Type:</strong> ${document.document_type}</p>
              ${document.issuing_authority ? `<p><strong>Issued by:</strong> ${document.issuing_authority}</p>` : ''}
              <p><strong>Expiry Date:</strong> ${new Date(document.expiry_date).toLocaleDateString()}</p>
              <p style="color: #EF4444; font-weight: bold; font-size: 18px;">⏰ Only ${daysUntilExpiry} ${daysUntilExpiry === 1 ? 'day' : 'days'} left!</p>
            </div>

            <p>${daysUntilExpiry <= 3 ? '🏃‍♂️ This is your last-minute warning! Time to renew NOW!' : '⏱️ Still got time, but why wait? Get it done and chill!'}</p>
            
            <div style="margin-top: 30px;">
              <a href="https://code-pal-launch.vercel.app/document/${document.id}" 
                 style="background-color: #1E40AF; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; display: inline-block;">
                Renew Now 🚀
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
              to: [{ email: profile.email! }]
            }],
            from: { email: 'remind659@gmail.com' },
            subject: `${daysUntilExpiry <= 3 ? '🚨 URGENT' : '⏰'} Your ${document.name} won't renew itself! (${daysUntilExpiry} ${daysUntilExpiry === 1 ? 'day' : 'days'} left)`,
            content: [{
              type: 'text/html',
              value: emailHtml
            }]
          })
        });

        if (!emailResponse.ok) {
          const errorText = await emailResponse.text();
          console.error(`Error sending email for reminder ${reminder.id}:`, errorText);
          errorCount++;
          continue;
        }

        // Also send push notification if user has push enabled
        if (profile.push_notifications_enabled) {
          try {
            const pushResponse = await supabase.functions.invoke('send-onesignal-notification', {
              body: {
                userId: reminder.user_id,
                title: `📅 Document Expiring Soon`,
                message: `${document.name} expires in ${daysUntilExpiry} ${daysUntilExpiry === 1 ? 'day' : 'days'}`,
                data: {
                  documentId: document.id,
                  type: 'expiry_reminder',
                  expiryDate: document.expiry_date
                }
              }
            });
            
            if (pushResponse.error) {
              console.error('Error sending OneSignal push notification:', pushResponse.error);
            } else {
              console.log('OneSignal push notification sent successfully');
            }
          } catch (pushError) {
            console.error('Exception sending OneSignal push notification:', pushError);
          }
        }

        // Mark reminder as sent
        const { error: updateError } = await supabase
          .from('reminders')
          .update({ is_sent: true })
          .eq('id', reminder.id);

        if (updateError) {
          console.error(`Error updating reminder ${reminder.id}:`, updateError);
          errorCount++;
        } else {
          console.log(`Successfully sent reminder for document: ${document.name}`);
          sentCount++;
        }

      } catch (error) {
        console.error(`Exception sending email for reminder ${reminder.id}:`, error);
        errorCount++;
      }
    }

    console.log(`Reminder job complete. Sent: ${sentCount}, Errors: ${errorCount}`);

    return new Response(
      JSON.stringify({ 
        message: "Reminder job complete",
        sent: sentCount,
        errors: errorCount,
        total: reminders.length
      }),
      { 
        headers: { ...corsHeaders, "Content-Type": "application/json" }, 
        status: 200 
      }
    );

  } catch (error: any) {
    console.error("Error in send-reminder-emails function:", error);
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
