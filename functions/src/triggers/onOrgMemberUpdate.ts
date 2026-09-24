/**
 * onOrgMemberUpdate — Firestore Trigger
 *
 * Fires when an organization member document is updated.
 * Logs role changes to the audit_logs collection.
 *
 * Replaces: log_role_changes() Postgres trigger on organization_members UPDATE.
 */

import { firestore } from 'firebase-functions/v2';
import { logger }    from 'firebase-functions/v2';
import { adminDb }   from '../shared/admin';

export const onOrgMemberUpdate = firestore.onDocumentUpdated(
  'organizations/{orgId}/members/{memberId}',
  async (event) => {
    const orgId    = event.params.orgId;
    const memberId = event.params.memberId;

    const before = event.data?.before?.data();
    const after  = event.data?.after?.data();

    if (!before || !after) return;

    // Only log if role actually changed
    if (before.role === after.role) return;

    const now = new Date().toISOString();

    await adminDb.collection('audit_logs').add({
      userId:     after.userId ?? memberId,
      documentId: null,
      entityType: 'organization_member',
      action:     'role_change',
      changes: {
        organizationId: orgId,
        targetUserId:   after.userId ?? memberId,
        oldRole:        before.role,
        newRole:        after.role,
      },
      ipAddress: null,
      userAgent: null,
      createdAt: now,
    });

    logger.info(
      `[onOrgMemberUpdate] Role changed for member ${memberId} in org ${orgId}: ` +
      `${before.role} → ${after.role}`
    );
  }
);
