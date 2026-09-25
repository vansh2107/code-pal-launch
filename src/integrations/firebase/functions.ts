/**
 * Firebase Cloud Functions callable references.
 *
 * Provides typed callable wrappers for every Cloud Function that the
 * frontend needs to invoke.  Each wrapper replaces a corresponding
 * `supabase.functions.invoke(...)` call.
 *
 * Functions are defined in the `functions/` directory and deployed to
 * Firebase Cloud Functions (2nd gen, Node.js).
 *
 * Usage:
 *   import { callUpdateNotificationToken } from '@/integrations/firebase/functions';
 *   const result = await callUpdateNotificationToken({ token, provider, deviceInfo });
 */

import { httpsCallable } from 'firebase/functions';
import { firebaseFunctions } from './client';

// ---------------------------------------------------------------------------
// Helper — typed callable factory
// ---------------------------------------------------------------------------
function callable<TReq = unknown, TRes = unknown>(name: string) {
  return (data: TReq): Promise<TRes> =>
    httpsCallable<TReq, TRes>(firebaseFunctions, name)(data).then((r) => r.data);
}

// ---------------------------------------------------------------------------
// Notification functions
// ---------------------------------------------------------------------------

export interface UpdateNotificationTokenRequest {
  token: string;
  provider: 'onesignal' | 'fcm';
  deviceInfo?: string;
}
export interface UpdateNotificationTokenResponse {
  success: boolean;
}
export const callUpdateNotificationToken =
  callable<UpdateNotificationTokenRequest, UpdateNotificationTokenResponse>(
    'updateNotificationToken'
  );

// ---------------------------------------------------------------------------

export interface NotificationActionRequest {
  entity_type: 'task' | 'document_reminder' | 'routine_step';
  entity_id: string;
  action: 'complete' | 'snooze';
  snooze?: number | 'tonight' | 'tomorrow';
}
export interface NotificationActionResponse {
  success: boolean;
  message?: string;
}
export const callNotificationAction =
  callable<NotificationActionRequest, NotificationActionResponse>('notificationAction');

// ---------------------------------------------------------------------------

export interface SendOnesignalNotificationRequest {
  userId: string;
  title: string;
  message: string;
  data?: Record<string, string>;
  buttons?: { id: string; text: string }[];
}
export interface SendOnesignalNotificationResponse {
  success: boolean;
  reason?: string;
  notificationId?: string;
}
export const callSendOnesignalNotification =
  callable<SendOnesignalNotificationRequest, SendOnesignalNotificationResponse>(
    'sendOnesignalNotification'
  );

// ---------------------------------------------------------------------------

export interface TestPushNotificationRequest {
  userId?: string;
}
export interface TestPushNotificationResponse {
  success: boolean;
  message?: string;
}
export const callTestPushNotification =
  callable<TestPushNotificationRequest, TestPushNotificationResponse>('testPushNotification');

// ---------------------------------------------------------------------------

export interface SendImmediateReminderRequest {
  reminderId: string;
}
export interface SendImmediateReminderResponse {
  success: boolean;
  message?: string;
}
export const callSendImmediateReminder =
  callable<SendImmediateReminderRequest, SendImmediateReminderResponse>('sendImmediateReminder');

// ---------------------------------------------------------------------------

export interface SendReminderEmailsRequest {
  // No required body — admin-only cron trigger, but keep callable for test page
}
export interface SendReminderEmailsResponse {
  success: boolean;
  sent?: number;
}
export const callSendReminderEmails =
  callable<SendReminderEmailsRequest, SendReminderEmailsResponse>('sendReminderEmails');

// ---------------------------------------------------------------------------
// Account management
// ---------------------------------------------------------------------------

export interface DeleteUserAccountRequest {
  // No body — user identity is taken from the auth token
}
export interface DeleteUserAccountResponse {
  success: boolean;
}
export const callDeleteUserAccount =
  callable<DeleteUserAccountRequest, DeleteUserAccountResponse>('deleteUserAccount');

// ---------------------------------------------------------------------------
// OTP
// ---------------------------------------------------------------------------

export interface SendOtpRequest {
  phoneNumber: string;
  email: string;
}
export interface SendOtpResponse {
  success: boolean;
  message?: string;
}
export const callSendOtp = callable<SendOtpRequest, SendOtpResponse>('sendOtpEmail');

// ---------------------------------------------------------------------------

export interface VerifyOtpRequest {
  phoneNumber: string;
  otpCode: string;
}
export interface VerifyOtpResponse {
  success: boolean;
  message?: string;
}
export const callVerifyOtp = callable<VerifyOtpRequest, VerifyOtpResponse>('verifyOtp');

// ---------------------------------------------------------------------------
// Storage — signed URL (Phase 2 Cloud Function; typed here for future use)
// ---------------------------------------------------------------------------

export interface GetSignedUrlRequest {
  storagePath: string;
  expiresInSeconds?: number;
}
export interface GetSignedUrlResponse {
  signedUrl: string;
  expiresAt: string;
}
export const callGetSignedUrl =
  callable<GetSignedUrlRequest, GetSignedUrlResponse>('getSignedUrl');

// ---------------------------------------------------------------------------
// AI functions
// ---------------------------------------------------------------------------

export interface ScanDocumentRequest {
  images: string[];   // base64-encoded
  country?: string;
}
export interface ScanDocumentResponse {
  success: boolean;
  data?: Record<string, unknown>;
}
export const callScanDocument = callable<ScanDocumentRequest, ScanDocumentResponse>('scanDocument');

// ---------------------------------------------------------------------------

export interface AiDocumentAnalysisRequest {
  documentId: string;
  analysisType:
    | 'classify'
    | 'renewal_prediction'
    | 'cost_estimate'
    | 'priority_scoring'
    | 'full_analysis'
    | 'renewal_suggestions'
    | 'renewal_requirements'
    | 'compliance_check';
}
export interface AiDocumentAnalysisResponse {
  success: boolean;
  result?: Record<string, unknown>;
}
export const callAiDocumentAnalysis =
  callable<AiDocumentAnalysisRequest, AiDocumentAnalysisResponse>('aiDocumentAnalysis');

// ---------------------------------------------------------------------------

export interface DetectDocumentBoundsRequest {
  image: string;     // base64
  width: number;
  height: number;
}
export interface DetectDocumentBoundsResponse {
  found: boolean;
  topLeft?: { x: number; y: number };
  topRight?: { x: number; y: number };
  bottomLeft?: { x: number; y: number };
  bottomRight?: { x: number; y: number };
}
export const callDetectDocumentBounds =
  callable<DetectDocumentBoundsRequest, DetectDocumentBoundsResponse>('detectDocumentBounds');

// ---------------------------------------------------------------------------

export interface DocumentRenewalAdvisorRequest {
  documentId?: string;
  question: string;
}
export interface DocumentRenewalAdvisorResponse {
  success: boolean;
  advice?: string;
}
export const callDocumentRenewalAdvisor =
  callable<DocumentRenewalAdvisorRequest, DocumentRenewalAdvisorResponse>(
    'documentRenewalAdvisor'
  );

// ---------------------------------------------------------------------------

export interface TaskAiRecommendationsRequest {
  taskId: string;
  taskTitle: string;
  taskDescription?: string;
}
export interface TaskAiRecommendationsResponse {
  success: boolean;
  tip?: string;
}
export const callTaskAiRecommendations =
  callable<TaskAiRecommendationsRequest, TaskAiRecommendationsResponse>('taskAiRecommendations');

// ---------------------------------------------------------------------------
// Note: The `chatbot` function uses Server-Sent Events (streaming) and
// cannot be invoked via httpsCallable.  It will be called with a raw
// fetch() using the function's HTTP URL.  That URL constant lives here
// so there is a single place to update it when the region/project changes.
// ---------------------------------------------------------------------------
export const CHATBOT_FUNCTION_URL =
  import.meta.env.VITE_FIREBASE_CHATBOT_URL as string | undefined;
