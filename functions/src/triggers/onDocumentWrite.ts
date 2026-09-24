/**
 * onDocumentWrite — Firestore Trigger
 *
 * Fires on every write (create / update / delete) to a user's document.
 *
 * Replaces two Postgres triggers:
 *   1. log_document_changes()     — writes to document_history + audit_logs
 *   2. create_document_reminders() — auto-creates reminders at 30/14/7/3/1
 *      days before expiry when expiryDate is set or changed.
 */

import { firestore } from 'firebase-functions/v2';
import { logger }    from 'firebase-functions/v2';
import { adminDb }   from '../shared/admin';
import { FieldValue } from 'firebase-admin/firestore';

const REMINDER_DAYS_BEFORE = [30, 14, 7, 3, 1];

export const onDocumentWrite = firestore.onDocumentWritten(
  'users/{userId}/documents/{docId}',
  async (event) => {
    const userId = event.params.userId;
    const docId  = event.params.docId;

    const before = event.data?.before?.data() ?? null;
    const after  = event.data?.after?.data()  ?? null;
    const now    = new Date().toISOString();

    // -----------------------------------------------------------------------
    // 1. Audit log
    // -----------------------------------------------------------------------
    let action: string;
    if (!before && after)       action = 'created';
    else if (before && !after)  action = 'deleted';
    else                        action = 'updated';

    await adminDb.collection('audit_logs').add({
      userId,
      documentId: docId,
      entityType: 'document',
      action,
      changes:    action === 'updated'
        ? buildChanges(before!, after!)
        : null,
      ipAddress:  null,
      userAgent:  null,
      createdAt:  now,
    });

    // -----------------------------------------------------------------------
    // 2. Document history (expiry date changes only)
    // -----------------------------------------------------------------------
    const oldExpiry = before?.expiryDate ?? null;
    const newExpiry = after?.expiryDate  ?? null;

    if (oldExpiry !== newExpiry) {
      await adminDb.collection('document_history').add({
        documentId:    docId,
        userId,
        action:        action === 'created' ? 'created' : 'expiry_updated',
        oldExpiryDate: oldExpiry,
        newExpiryDate: newExpiry,
        notes:         null,
        createdAt:     now,
      });
    }

    // -----------------------------------------------------------------------
    // 3. Auto-create reminders when expiryDate is set / changed
    // -----------------------------------------------------------------------
    if (!after) {
      // Document deleted — reminders will be cleaned up separately or
      // can be left to expire naturally (they reference a deleted doc).
      return;
    }

    if (!newExpiry || newExpiry === oldExpiry) return;

    const expiryMs = new Date(newExpiry).getTime();
    if (isNaN(expiryMs)) return;

    const batch = adminDb.batch();

    for (const daysBefore of REMINDER_DAYS_BEFORE) {
      const reminderDate = new Date(expiryMs - daysBefore * 24 * 60 * 60 * 1000);
      if (reminderDate <= new Date()) continue; // skip past dates

      const reminderDateStr = reminderDate.toISOString().slice(0, 10);

      // Check if reminder already exists for this date + document
      const existing = await adminDb
        .collection('users').doc(userId)
        .collection('reminders')
        .where('documentId', '==', docId)
        .where('reminderDate', '==', reminderDateStr)
        .limit(1)
        .get();

      if (!existing.empty) continue;

      const reminderRef = adminDb
        .collection('users').doc(userId)
        .collection('reminders')
        .doc();

      batch.set(reminderRef, {
        id:           reminderRef.id,
        documentId:   docId,
        userId,
        reminderDate: reminderDateStr,
        isSent:       false,
        isCustom:     false,
        createdAt:    now,
      });
    }

    await batch.commit();
    logger.info(`[onDocumentWrite] ${action} doc ${docId} for user ${userId}. Reminders auto-created.`);
  }
);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function buildChanges(
  before: Record<string, unknown>,
  after:  Record<string, unknown>
): Record<string, { before: unknown; after: unknown }> {
  const changes: Record<string, { before: unknown; after: unknown }> = {};
  const allKeys = new Set([...Object.keys(before), ...Object.keys(after)]);

  for (const key of allKeys) {
    if (JSON.stringify(before[key]) !== JSON.stringify(after[key])) {
      changes[key] = { before: before[key] ?? null, after: after[key] ?? null };
    }
  }
  return changes;
}
