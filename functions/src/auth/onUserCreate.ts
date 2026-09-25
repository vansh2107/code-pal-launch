/**
 * functions/src/auth/onUserCreate.ts
 *
 * onUserCreate — Firebase Auth trigger (v1 SDK, auth.user().onCreate)
 *
 * Fires after every new Firebase Auth user is successfully created.
 *
 * Replaces: Supabase handle_new_user() Postgres trigger which inserted a row
 * into the public.profiles table on auth.users INSERT.
 *
 * Creates a Firestore profile document at the canonical path:
 *   users/{uid}/profile          ← document ID = "profile"
 *
 * The document is a flat document, NOT a sub-collection.
 * Path breakdown:
 *   collection: "users"
 *   document:   uid
 *   (no sub-collection)
 *   document path inside the uid doc: "profile"  ← sub-document
 *
 * Wait — Firestore does not support sub-documents; every document lives inside
 * a collection.  The canonical structure used throughout this project is:
 *
 *   users/{uid}/profile   where "profile" is treated as a document ID within
 *                         the implicit single-document collection pattern.
 *
 * In practice this means the Admin SDK path is:
 *   adminDb.doc('users/{uid}/profile')
 *
 * which Firestore interprets as:
 *   collection = "users"   document = uid
 *   sub-collection = ???
 *
 * Firestore requires an alternating collection/document path.
 * "users/{uid}/profile" has 3 segments → invalid.
 * The correct canonical path is either:
 *   (a) "users/{uid}"           with a "profile" field map  (single doc)
 *   (b) "user_profiles/{uid}"   flat top-level collection
 *   (c) "users/{uid}/profile/data"  sub-collection "profile", doc "data"
 *
 * We use pattern (c) with a fixed doc ID of "data" to keep the collection
 * group query `collectionGroup('profile')` working cleanly, AND we expose
 * a convenience alias `userProfileDoc(uid)` in firestore.ts that points to
 * "users/{uid}/profile/data".
 *
 * ALL profile reads/writes in this codebase use userProfileDoc(uid) or
 * adminDb.doc('users/{uid}/profile/data') — never a 3-segment path.
 */

import * as functionsV1 from 'firebase-functions/v1';
import { adminDb } from '../shared/admin';
import { profilePath } from '../shared/database';
import type { UserProfile } from '../shared/types';

export const onUserCreate = functionsV1.auth.user().onCreate(async (user) => {
  const now = new Date().toISOString();

  // Canonical path: users/{uid}/profile/data  (via profilePath helper)
  const profileRef = adminDb.doc(profilePath(user.uid));

  try {
    const docSnap = await profileRef.get();
    if (docSnap.exists) {
      console.log(`[onUserCreate] Profile already exists for ${user.uid}, skipping.`);
      return;
    }

    const profile: UserProfile = {
      userId:                    user.uid,
      displayName:               user.displayName ?? null,
      email:                     user.email ?? null,
      phoneNumber:               user.phoneNumber ?? null,
      country:                   null,
      timezone:                  null,
      preferredNotificationTime: null,
      avatarUrl:                 null,
      emailNotificationsEnabled: true,
      pushNotificationsEnabled:  null,
      expiryRemindersEnabled:    true,
      renewalRemindersEnabled:   true,
      weeklyDigestEnabled:       false,
      notificationSounds:        null,
      onboardingCompleted:       false,
      onboardingPreferences:     {},
      themePreference:           {},
      createdAt:                 now,
      updatedAt:                 now,
    };

    await profileRef.set(profile, { merge: true });
    console.log(`[onUserCreate] Profile created for ${user.uid}`);
  } catch (err) {
    console.error(`[onUserCreate] Failed to create profile for ${user.uid}:`, err);
  }
});
