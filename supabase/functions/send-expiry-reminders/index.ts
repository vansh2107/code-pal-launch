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

  console.log("Starting expiry reminders check...");

  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  try {
    const today = new Date().toISOString().split('T')[0];
    
    // Fetch all reminders due today that haven't been sent
    const { data: reminders, error: remindersError } = await supabase
      .from('reminders')
      .select(`
        id,
        reminder_date,
        is_custom,
        user_id,
        document_id,
        documents (
          name,
          document_type,
          expiry_date,
          issuing_authority,
          category_detail
        )
      `)
      .eq('reminder_date', today)
      .eq('is_sent', false);

    if (remindersError) {
      console.error("Error fetching reminders:", remindersError);
      throw remindersError;
    }

    if (!reminders || reminders.length === 0) {
      console.log("No reminders due today");
      return new Response(
        JSON.stringify({ message: "No reminders due today", count: 0 }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 }
      );
    }

    console.log(`Found ${reminders.length} reminders due today`);

    // Get user emails from auth
    const { data: { users }, error: usersError } = await supabase.auth.admin.listUsers();
    
    if (usersError) {
      console.error("Error fetching users:", usersError);
      throw usersError;
    }

    const userEmailMap = new Map(users?.map(u => [u.id, u.email]) || []);

    // Get user preferences
    const { data: profiles } = await supabase
      .from('profiles')
      .select('user_id, email_notifications_enabled, expiry_reminders_enabled, display_name');

    const userPrefsMap = new Map(
      profiles?.map(p => [p.user_id, p]) || []
    );

    let sentCount = 0;
    let errorCount = 0;
    const processedReminders: string[] = [];

    for (const reminder of reminders) {
      const userEmail = userEmailMap.get(reminder.user_id);
      const userPrefs = userPrefsMap.get(reminder.user_id);

      // Skip if user has disabled email or expiry notifications
      if (!userEmail || userPrefs?.email_notifications_enabled === false || userPrefs?.expiry_reminders_enabled === false) {
        console.log(`Skipping reminder ${reminder.id} - user notifications disabled`);
        continue;
      }

      try {
        const document = reminder.documents as any;
        const displayName = userPrefs?.display_name || 'there';
        const expiryDate = new Date(document.expiry_date).toLocaleDateString('en-US', { 
          year: 'numeric', 
          month: 'long', 
          day: 'numeric' 
        });

        // Calculate days until expiry
        const daysUntilExpiry = Math.ceil(
          (new Date(document.expiry_date).getTime() - new Date(today).getTime()) / (1000 * 60 * 60 * 24)
        );

        const reminderType = reminder.is_custom ? 'Custom' : 'Automatic';
        
        const emailHtml = `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <h2 style="color: #DC2626;">Document Expiry Reminder</h2>
            <p>Hello ${displayName},</p>
            
            <div style="background-color: #FEF2F2; padding: 20px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #DC2626;">
              <h3 style="margin-top: 0; color: #991B1B;">⚠️ Document Expiring Soon</h3>
              <p style="margin: 10px 0;"><strong>Document:</strong> ${document.name}</p>
              <p style="margin: 10px 0;"><strong>Type:</strong> ${document.document_type}</p>
              ${document.issuing_authority ? `<p style="margin: 10px 0;"><strong>Issuing Authority:</strong> ${document.issuing_authority}</p>` : ''}
              <p style="margin: 10px 0;"><strong>Expiry Date:</strong> ${expiryDate}</p>
              <p style="margin: 10px 0;"><strong>Days Until Expiry:</strong> ${daysUntilExpiry} days</p>
              <p style="margin: 10px 0; font-size: 12px; color: #6B7280;"><em>Reminder Type: ${reminderType}</em></p>
            </div>

            <div style="background-color: #F3F4F6; padding: 20px; border-radius: 8px; margin: 20px 0;">
              <p style="margin: 0; color: #374151;">
                Don't forget to renew your document before it expires. Taking action now will help you avoid any inconvenience.
              </p>
            </div>

            <div style="margin-top: 30px;">
              <a href="https://code-pal-launch.vercel.app/documents" 
                 style="background-color: #1E40AF; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; display: inline-block;">
                View Document
              </a>
            </div>

            <p style="margin-top: 30px; font-size: 14px; color: #6B7280;">
              Stay organized with Remonk Reminder!<br>
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
              to: [{ email: userEmail }]
            }],
            from: { email: 'remind659@gmail.com' },
            subject: `⚠️ Reminder: ${document.name} expires in ${daysUntilExpiry} days`,
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

        console.log(`Successfully sent reminder email to: ${userEmail} for document: ${document.name}`);
        processedReminders.push(reminder.id);
        sentCount++;

      } catch (error) {
        console.error(`Exception processing reminder ${reminder.id}:`, error);
        errorCount++;
      }
    }

    // Mark processed reminders as sent
    if (processedReminders.length > 0) {
      const { error: updateError } = await supabase
        .from('reminders')
        .update({ is_sent: true })
        .in('id', processedReminders);

      if (updateError) {
        console.error("Error marking reminders as sent:", updateError);
      } else {
        console.log(`Marked ${processedReminders.length} reminders as sent`);
      }
    }

    console.log(`Expiry reminders complete. Sent: ${sentCount}, Errors: ${errorCount}`);

    return new Response(
      JSON.stringify({ 
        message: "Expiry reminders complete",
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
    console.error("Error in send-expiry-reminders function:", error);
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
