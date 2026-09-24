/**
 * SendGrid email helper.
 *
 * Thin wrapper around @sendgrid/mail that handles initialisation from the
 * SENDGRID_API_KEY environment variable and provides a typed send helper.
 */

import sgMail from '@sendgrid/mail';

let initialised = false;

function ensureInitialised(): void {
  if (initialised) return;
  const key = process.env.SENDGRID_API_KEY;
  if (!key) {
    throw new Error('[SendGrid] SENDGRID_API_KEY environment variable is not set');
  }
  sgMail.setApiKey(key);
  initialised = true;
}

export interface EmailMessage {
  to: string | string[];
  subject: string;
  html: string;
  text?: string;
  from?: string;
}

const DEFAULT_SENDER = 'remind659@gmail.com';

/**
 * Send an email via SendGrid.
 * Returns true on success; logs and returns false on failure so callers
 * don't need to wrap every send in a try/catch.
 */
export async function sendEmail(msg: EmailMessage): Promise<boolean> {
  try {
    ensureInitialised();
    await sgMail.send({
      to: msg.to,
      from: msg.from ?? DEFAULT_SENDER,
      subject: msg.subject,
      html: msg.html,
      text: msg.text ?? msg.subject,
    });
    return true;
  } catch (err: unknown) {
    console.error('[SendGrid] Send failed:', err instanceof Error ? err.message : err);
    return false;
  }
}
