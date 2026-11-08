/**
 * SendGrid email helper.
 *
 * Thin wrapper around @sendgrid/mail that handles initialisation from the
 * SENDGRID_API_KEY environment variable or Secret and provides a typed send helper.
 */

import sgMail from '@sendgrid/mail';
import { sendgridApiKey } from './secrets';

let initialised = false;

export function getSendGridApiKey(): string {
  try {
    const secretVal = sendgridApiKey.value();
    if (secretVal && secretVal.trim().length > 0) return secretVal.trim();
  } catch {
    // Secret not bound or running in an environment without params
  }
  return process.env.SENDGRID_API_KEY || '';
}

export function isSendGridConfigured(): boolean {
  return getSendGridApiKey().length > 0;
}

function ensureInitialised(): boolean {
  if (initialised) return true;
  const key = getSendGridApiKey();
  if (!key) {
    return false;
  }
  sgMail.setApiKey(key);
  initialised = true;
  return true;
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
 * Returns true on success; logs and returns false on failure or if not configured,
 * so callers don't need to wrap every send in a try/catch.
 */
export async function sendEmail(msg: EmailMessage): Promise<boolean> {
  try {
    if (!ensureInitialised()) {
      console.warn('[SendGrid] SENDGRID_API_KEY is not configured. Email skipped.');
      return false;
    }
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
