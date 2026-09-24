/**
 * Firebase Cloud Functions — Entry Point
 *
 * All exported symbols from this file become deployed Cloud Functions.
 * Functions are organised in sub-modules under src/ and re-exported here.
 *
 * Deployment regions default to us-central1.  Update the region in each
 * sub-module if a different region is preferred.
 *
 * Function categories:
 *   auth/          — Authentication lifecycle (user creation, deletion)
 *   notifications/ — Push & email notification senders
 *   schedulers/    — Cron-triggered background functions
 *   ai/            — AI document analysis, scanning, chatbot
 *   otp/           — OTP send/verify
 *   storage/       — Signed URL generation
 *   triggers/      — Firestore document triggers
 */

// ---------------------------------------------------------------------------
// Auth
// ---------------------------------------------------------------------------
export { onUserCreate }          from './auth/onUserCreate';
export { deleteUserAccount }     from './auth/deleteUserAccount';

// ---------------------------------------------------------------------------
// Notification callables (user-triggered)
// ---------------------------------------------------------------------------
export { updateNotificationToken }   from './notifications/updateNotificationToken';
export { sendOnesignalNotification } from './notifications/sendOnesignalNotification';
export { testPushNotification }      from './notifications/testPushNotification';
export { notificationAction }        from './notifications/notificationAction';
export { sendImmediateReminder }     from './notifications/sendImmediateReminder';

// ---------------------------------------------------------------------------
// Scheduled (cron) functions
// ---------------------------------------------------------------------------
export { taskCarryForward }               from './schedulers/taskCarryForward';
export { taskTwoHourReminder }            from './schedulers/taskTwoHourReminder';
export { taskIncompleteReminder }         from './schedulers/taskIncompleteReminder';
export { taskOverdueAlert }               from './schedulers/taskOverdueAlert';
export { documentReminder }               from './schedulers/documentReminder';
export { documentReminderScheduler }      from './schedulers/documentReminderScheduler';
export { timezoneNotificationScheduler }  from './schedulers/timezoneNotificationScheduler';
export { routineStepReminder }            from './schedulers/routineStepReminder';
export { sendExpiryReminders }            from './schedulers/sendExpiryReminders';
export { sendReminderEmails }             from './schedulers/sendReminderEmails';
export { sendBulkNotification }           from './schedulers/sendBulkNotification';

// ---------------------------------------------------------------------------
// AI callables
// ---------------------------------------------------------------------------
export { scanDocument }            from './ai/scanDocument';
export { aiDocumentAnalysis }      from './ai/aiDocumentAnalysis';
export { detectDocumentBounds }    from './ai/detectDocumentBounds';
export { documentRenewalAdvisor }  from './ai/documentRenewalAdvisor';
export { taskAiRecommendations }   from './ai/taskAiRecommendations';
export { chatbot }                 from './ai/chatbot';
export { documentAnalyzer }        from './ai/documentAnalyzer';

// ---------------------------------------------------------------------------
// OTP
// ---------------------------------------------------------------------------
export { sendOtpEmail } from './otp/sendOtpEmail';
export { verifyOtp }    from './otp/verifyOtp';

// ---------------------------------------------------------------------------
// Storage
// ---------------------------------------------------------------------------
export { getSignedUrl } from './storage/getSignedUrl';

// ---------------------------------------------------------------------------
// Firestore triggers
// ---------------------------------------------------------------------------
export { onDocumentWrite }    from './triggers/onDocumentWrite';
export { onOrgMemberUpdate }  from './triggers/onOrgMemberUpdate';
