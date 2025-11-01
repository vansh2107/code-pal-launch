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

    // Fetch the specific reminder with document and profile details
    const { data: reminder, error: fetchError } = await supabase
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
      .eq('id', reminder_id)
      .maybeSingle() as { data: ReminderWithDocument | null, error: any };

    if (fetchError) {
      console.error("Error fetching reminder:", fetchError);
      throw fetchError;
    }

    if (!reminder) {
      console.log("Reminder not found:", reminder_id);
      return new Response(
        JSON.stringify({ message: "Reminder not found" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 404 }
      );
    }

    // Check if user has email notifications enabled
    if (!reminder.profiles.email_notifications_enabled || 
        !reminder.profiles.expiry_reminders_enabled ||
        !reminder.profiles.email) {
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
    const profile = reminder.profiles;
    
    const reminderDate = new Date(reminder.reminder_date);
    const expiryDate = new Date(document.expiry_date);
    const daysUntilExpiry = Math.ceil(
      (expiryDate.getTime() - reminderDate.getTime()) / (1000 * 60 * 60 * 24)
    );

    console.log(`Sending reminder email for document: ${document.name}`);

    const emailResponse = await resend.emails.send({
      from: "Document Reminder <remind659@gmail.com>",
      to: [profile.email!],
      subject: `Reminder Set: ${document.name} expires in ${daysUntilExpiry} days`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #1E40AF;">Reminder Confirmation</h2>
          <p>Hello ${profile.display_name || 'there'},</p>
          <p>Your reminder has been successfully set for the following document:</p>
          
          <div style="background-color: #f3f4f6; padding: 20px; border-radius: 8px; margin: 20px 0;">
            <h3 style="margin-top: 0; color: #374151;">Document Details</h3>
            <p><strong>Name:</strong> ${document.name}</p>
            <p><strong>Type:</strong> ${document.document_type}</p>
            ${document.issuing_authority ? `<p><strong>Issued by:</strong> ${document.issuing_authority}</p>` : ''}
            <p><strong>Expiry Date:</strong> ${expiryDate.toLocaleDateString()}</p>
            <p><strong>Reminder Date:</strong> ${reminderDate.toLocaleDateString()}</p>
            <p style="color: #059669; font-weight: bold;">You'll be reminded ${daysUntilExpiry} days before expiry</p>
          </div>

          <p>We'll send you another reminder on <strong>${reminderDate.toLocaleDateString()}</strong> to ensure you don't miss the renewal deadline.</p>
          
          <div style="margin-top: 30px;">
            <a href="https://code-pal-launch.vercel.app/document/${document.id}" 
               style="background-color: #1E40AF; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; display: inline-block;">
              View Document
            </a>
          </div>

          <p style="margin-top: 30px; font-size: 14px; color: #6b7280;">
            This is a confirmation from Softly Reminder. You can manage your notification preferences in your profile settings.
          </p>
        </div>
      `,
    });

    if (emailResponse.error) {
      console.error(`Error sending email for reminder ${reminder.id}:`, emailResponse.error);
      throw emailResponse.error;
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
