import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import { Resend } from "https://esm.sh/resend@4.0.0";

const resend = new Resend(Deno.env.get("RESEND_API_KEY"));
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
    const today = new Date().toISOString().split('T')[0];
    
    // Fetch reminders that are due today and haven't been sent
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
        ),
        profiles!inner (
          email,
          display_name,
          email_notifications_enabled,
          expiry_reminders_enabled
        )
      `)
      .eq('reminder_date', today)
      .eq('is_sent', false);

    if (fetchError) {
      console.error("Error fetching reminders:", fetchError);
      throw fetchError;
    }

    if (!reminders || reminders.length === 0) {
      console.log("No reminders to send today");
      return new Response(
        JSON.stringify({ message: "No reminders to send", count: 0 }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 }
      );
    }

    console.log(`Found ${reminders.length} reminders to process`);

    let sentCount = 0;
    let errorCount = 0;

    for (const reminder of reminders as unknown as ReminderWithDocument[]) {
      // Check if user has email notifications enabled
      if (!reminder.profiles.email_notifications_enabled || 
          !reminder.profiles.expiry_reminders_enabled ||
          !reminder.profiles.email) {
        console.log(`Skipping reminder ${reminder.id} - notifications disabled or no email`);
        continue;
      }

      const document = reminder.documents;
      const profile = reminder.profiles;
      const daysUntilExpiry = Math.ceil(
        (new Date(document.expiry_date).getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24)
      );

      try {
        const emailResponse = await resend.emails.send({
          from: "Document Reminder <remind659@gmail.com>",
          to: [profile.email!],
          subject: `Reminder: ${document.name} expires in ${daysUntilExpiry} days`,
          html: `
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
              <h2 style="color: #1E40AF;">Document Expiry Reminder</h2>
              <p>Hello ${profile.display_name || 'there'},</p>
              <p>This is a friendly reminder that your document is expiring soon:</p>
              
              <div style="background-color: #f3f4f6; padding: 20px; border-radius: 8px; margin: 20px 0;">
                <h3 style="margin-top: 0; color: #374151;">Document Details</h3>
                <p><strong>Name:</strong> ${document.name}</p>
                <p><strong>Type:</strong> ${document.document_type}</p>
                ${document.issuing_authority ? `<p><strong>Issued by:</strong> ${document.issuing_authority}</p>` : ''}
                <p><strong>Expiry Date:</strong> ${new Date(document.expiry_date).toLocaleDateString()}</p>
                <p style="color: #EF4444; font-weight: bold;">Days until expiry: ${daysUntilExpiry}</p>
              </div>

              <p>Please make sure to renew this document before it expires.</p>
              
              <div style="margin-top: 30px;">
                <a href="https://code-pal-launch.vercel.app/document/${document.id}" 
                   style="background-color: #1E40AF; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; display: inline-block;">
                  View Document
                </a>
              </div>

              <p style="margin-top: 30px; font-size: 14px; color: #6b7280;">
                This is an automated reminder from Softly Reminder. You can manage your notification preferences in your profile settings.
              </p>
            </div>
          `,
        });

        if (emailResponse.error) {
          console.error(`Error sending email for reminder ${reminder.id}:`, emailResponse.error);
          errorCount++;
          continue;
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
