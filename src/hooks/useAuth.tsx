/**
 * useAuth.tsx — Firebase Auth provider
 *
 * Replaces the Supabase Auth implementation.
 * Public API is identical so all consumers compile without changes:
 *   { user, session, loading, signOut, deleteAccount }
 *
 * Key differences from Supabase version:
 *   - `user` is firebase/auth User (not @supabase/supabase-js User)
 *   - `session` is the Firebase ID token string (not a Supabase Session object)
 *   - deleteAccount pre-deletes Firestore sub-collections then calls the
 *     deleteUserAccount Cloud Function, same pattern as before
 *   - OneSignal registration is unchanged (still deferred 3 s on native)
 */

import React, { createContext, useContext, useEffect, useState } from 'react';
import type { User as FirebaseUser } from 'firebase/auth';

/** Firebase user with a Supabase-style `id` alias for `uid`. */
export type User = FirebaseUser & { id: string };
import {
  collection,
  writeBatch,
  getDocs,
  doc,
} from 'firebase/firestore';
import { firebaseAuth, firebaseDb, firebaseFunctions } from '@/integrations/firebase/client';
import { onAuthChange, signOut as fbSignOut, getIdToken } from '@/integrations/firebase/auth';
import { httpsCallable } from 'firebase/functions';
import { Capacitor } from '@capacitor/core';
import { ensurePushRegistration, setUserEmail, logoutOneSignal } from '@/lib/onesignal';
import { resetLockState } from '@/lib/appLock';

// ---------------------------------------------------------------------------
// Types — keep the same shape as the Supabase version so pages don't break
// ---------------------------------------------------------------------------

interface AuthContextType {
  user:    User | null;
  /** Firebase ID token string — replaces Supabase Session object */
  session: string | null;
  loading: boolean;
  signOut:       () => Promise<void>;
  deleteAccount: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

// ---------------------------------------------------------------------------
// Provider
// ---------------------------------------------------------------------------

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user,    setUser]    = useState<User | null>(null);
  const [session, setSession] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const loadingRef = React.useRef(true);
  loadingRef.current = loading;

  useEffect(() => {
    // Fail-safe: never stay loading longer than 3 s
    const failSafe = setTimeout(() => {
      if (loadingRef.current) {
        console.warn('⚠️ Auth fail-safe triggered after 3s');
        setLoading(false);
      }
    }, 3000);

    const unsubscribe = onAuthChange(async (fbUser) => {
      let firebaseUser: User | null = null;
      if (fbUser) {
        if (!('id' in fbUser)) {
          Object.defineProperty(fbUser, 'id', { get() { return (this as FirebaseUser).uid; }, configurable: true });
        }
        firebaseUser = fbUser as User;
      }
      setUser(firebaseUser);
      setLoading(false);
      clearTimeout(failSafe);

      if (firebaseUser) {
        // Get and cache the ID token as the "session"
        const token = await getIdToken();
        setSession(token);

        // Register OneSignal on native platforms (deferred, non-blocking)
        if (Capacitor.isNativePlatform()) {
          setTimeout(() => {
            ensurePushRegistration(firebaseUser.uid, { silent: true });
            if (firebaseUser.email) {
              setUserEmail(firebaseUser.email);
            }
          }, 3000);
        }
      } else {
        setSession(null);
      }
    });

    return () => {
      clearTimeout(failSafe);
      unsubscribe();
    };
  }, []);

  // ── Sign out ──────────────────────────────────────────────────────────────
  const signOut = async () => {
    resetLockState();
    await logoutOneSignal();
    await fbSignOut();
  };

  // ── Delete account ────────────────────────────────────────────────────────
  const deleteAccount = async () => {
    if (!user) throw new Error('No user logged in');

    // 1. Delete all Firestore data for the user before deleting the Auth account.
    //    Firestore Security Rules prevent writes after auth is gone, so order matters.
    const userDocRef = doc(firebaseDb, 'users', user.uid);

    // Sub-collections to delete (one batch per collection for large sets)
    const subCollections = [
      'tasks', 'documents', 'reminders', 'routines',
      'docvault_categories', 'notification_tokens', 'onesignal_player_ids',
      'snooze_usage', 'snooze_sync_queue',
    ];

    for (const colName of subCollections) {
      const colRef = collection(userDocRef, colName);
      const snap   = await getDocs(colRef);
      if (snap.empty) continue;

      // Delete in batches of 500 (Firestore limit)
      const docs = snap.docs;
      for (let i = 0; i < docs.length; i += 500) {
        const batch = writeBatch(firebaseDb);
        docs.slice(i, i + 500).forEach((d) => batch.delete(d.ref));
        await batch.commit();
      }
    }

    // Delete the profile document
    try {
      const batch = writeBatch(firebaseDb);
      const profileSnap = await getDocs(collection(userDocRef, 'profile'));
      profileSnap.forEach((d) => batch.delete(d.ref));
      await batch.commit();
    } catch { /* ignore */ }

    // 2. Call the Cloud Function to delete the Firebase Auth user
    const token = await getIdToken(true);
    if (!token) throw new Error('No valid session found');

    const deleteFn = httpsCallable<Record<string, never>, { success: boolean }>(
      firebaseFunctions,
      'deleteUserAccount',
    );
    const result = await deleteFn({});
    if (!result.data.success) {
      throw new Error('Account deletion failed on server');
    }

    // 3. Sign out locally
    setUser(null);
    setSession(null);
    await fbSignOut();
  };

  const value: AuthContextType = { user, session, loading, signOut, deleteAccount };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
