import { defineSecret } from 'firebase-functions/params';

export const onesignalAppId = defineSecret('ONESIGNAL_APP_ID');
export const onesignalRestApiKey = defineSecret('ONESIGNAL_REST_API_KEY');

export const onesignalSecrets = [onesignalAppId, onesignalRestApiKey];

// AI provider key — must be bound to each AI function so 2nd-gen runtimes receive it.
export const geminiApiKey = defineSecret('GEMINI_API_KEY');
export const aiSecrets = [geminiApiKey];
