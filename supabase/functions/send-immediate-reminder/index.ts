import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const sendGridApiKey = Deno.env.get("SENDGRID_API_KEY");
const sendGridEndpoint = 'https://api.sendgrid.com/v3/mail/send';
const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface ReminderPayload {
  reminder_id: string;
}

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

  console.log("Processing immediate reminder email...");

  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  try {
    const { reminder_id }: ReminderPayload = await req.json();

    if (!reminder_id) {
      throw new Error("reminder_id is required");
    }

    // Fetch the specific reminder with document details
    const { data: reminderData, error: fetchError } = await supabase
      .from('reminders')
      .select(`
        id,
        reminder_date,
        user_id,
        is_sent,
        document_id,
        documents (
          id,
          name,
          document_type,
          expiry_date,
          issuing_authority
        )
      `)
      .eq('id', reminder_id)
      .maybeSingle();

    if (fetchError) {
      console.error("Error fetching reminder:", fetchError);
      throw fetchError;
    }

    if (!reminderData || !reminderData.documents) {
      console.log("Reminder or document not found:", reminder_id);
      return new Response(
        JSON.stringify({ message: "Reminder not found" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 404 }
      );
    }

    const reminder = {
      ...reminderData,
      documents: Array.isArray(reminderData.documents) ? reminderData.documents[0] : reminderData.documents
    };


    // Fetch profile separately
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('email, display_name, email_notifications_enabled, expiry_reminders_enabled')
      .eq('user_id', reminder.user_id)
      .maybeSingle() as { data: ReminderWithDocument['profiles'] | null, error: any };


    if (profileError) {
      console.error("Error fetching profile:", profileError);
      throw profileError;
    }

    if (!profile) {
      console.log("Profile not found for user:", reminder.user_id);
      return new Response(
        JSON.stringify({ message: "Profile not found" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 404 }
      );
    }

    // Check if user has email notifications enabled
    if (!profile.email_notifications_enabled || 
        !profile.expiry_reminders_enabled ||
        !profile.email) {
      console.log(`Skipping reminder ${reminder.id} - notifications disabled or no email`);
      return new Response(
        JSON.stringify({ message: "Notifications disabled for user" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 }
      );
    }

    // Check if reminder is already sent
    if (reminder.is_sent) {
      console.log(`Reminder ${reminder.id} already sent`);
      return new Response(
        JSON.stringify({ message: "Reminder already sent" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 }
      );
    }

    const document = reminder.documents;
    
    const reminderDate = new Date(reminder.reminder_date);
    const expiryDate = new Date(document.expiry_date);
    const daysUntilExpiry = Math.ceil(
      (expiryDate.getTime() - reminderDate.getTime()) / (1000 * 60 * 60 * 24)
    );

    console.log(`Sending reminder email for document: ${document.name}`);

    const emailHtml = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #1E40AF;">Mission Accepted! 🎯 Reminder Locked & Loaded</h2>
        <p>Hey ${profile.display_name || 'there'}! 👋</p>
        <p>Consider this your safety net. We've got your back, and your ${document.name} won't be sneaking up on you! 😎</p>
        
        <div style="background-color: #f3f4f6; padding: 20px; border-radius: 8px; margin: 20px 0;">
          <h3 style="margin-top: 0; color: #374151;">📋 What We're Watching</h3>
          <p><strong>Document:</strong> ${document.name}</p>
          <p><strong>Type:</strong> ${document.document_type}</p>
          ${document.issuing_authority ? `<p><strong>Issued by:</strong> ${document.issuing_authority}</p>` : ''}
          <p><strong>Expiry Date:</strong> ${expiryDate.toLocaleDateString()}</p>
          <p><strong>We'll Remind You:</strong> ${reminderDate.toLocaleDateString()}</p>
          <p style="color: #059669; font-weight: bold; font-size: 16px;">⏰ That's ${daysUntilExpiry} days notice — plenty of time to renew!</p>
        </div>

        <p>Mark your calendar for <strong>${reminderDate.toLocaleDateString()}</strong> — that's when we'll slide into your inbox again. No document drama on our watch! 🦸‍♂️</p>
        
        <div style="margin-top: 30px;">
          <a href="https://code-pal-launch.vercel.app/document/${document.id}" 
             style="background-color: #1E40AF; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; display: inline-block;">
            View Document 📄
          </a>
        </div>

        <p style="margin-top: 30px; font-size: 14px; color: #6b7280;">
          Your friendly neighborhood reminder app 🦸‍♂️<br>
          Team Remonk (Forgetting stuff? Not on our watch!)
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
        subject: `✅ Your ${document.name} is safe with us! (${daysUntilExpiry} days to go)`,
        content: [{
          type: 'text/html',
          value: emailHtml
        }]
      })
    });

    if (!emailResponse.ok) {
      const errorText = await emailResponse.text();
      console.error(`Error sending email for reminder ${reminder.id}:`, errorText);
      throw new Error(`SendGrid API error: ${errorText}`);
    }

    console.log(`Successfully sent confirmation email for document: ${document.name}`);

    return new Response(
      JSON.stringify({ 
        message: "Reminder email sent successfully",
        reminder_id: reminder.id
      }),
      { 
        headers: { ...corsHeaders, "Content-Type": "application/json" }, 
        status: 200 
      }
    );

  } catch (error: any) {
    console.error("Error in send-immediate-reminder function:", error);
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
