import { defineSecret } from 'firebase-functions/params';

export const onesignalAppId = defineSecret('ONESIGNAL_APP_ID');
export const onesignalRestApiKey = defineSecret('ONESIGNAL_REST_API_KEY');

export const onesignalSecrets = [onesignalAppId, onesignalRestApiKey];
