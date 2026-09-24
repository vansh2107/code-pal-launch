/**
 * Notification action button builder.
 *
 * Direct port of supabase/functions/_shared/notificationActions.ts.
 */

export interface NotificationButton {
  id: string;
  text: string;
  icon?: string;
}

export type ReminderKind = 'task' | 'document_reminder' | 'routine_step' | 'bulk' | 'generic';

/**
 * Returns the action buttons array for a given notification kind.
 * Matches the existing OneSignal button IDs so the frontend action handler
 * in src/lib/onesignal.ts continues to work without changes.
 */
export function getReminderButtons(kind: ReminderKind): NotificationButton[] {
  switch (kind) {
    case 'task':
    case 'document_reminder':
    case 'routine_step':
      return [
        { id: 'complete', text: '✓ Done' },
        { id: 'snooze_1h', text: '💤 Snooze 1h' },
        { id: 'more', text: '⏰ More' },
      ];
    case 'bulk':
    case 'generic':
    default:
      return [{ id: 'open_app', text: 'Open' }];
  }
}
