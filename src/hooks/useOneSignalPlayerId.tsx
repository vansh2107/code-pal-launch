/**
 * src/hooks/useOneSignalPlayerId.tsx — Firestore-backed OneSignal player ID hook
 *
 * Replaces Supabase table writes with Firestore equivalents.
 * Public API is identical so all consumers compile unchanged.
 *
 * Firestore paths:
 *   users/{uid}/onesignal_player_ids/{playerId}
 */

import { useEffect, useState } from 'react';
import { useAuth } from './useAuth';
import { toast } from '@/hooks/use-toast';
import { getPlayerId } from '@/lib/onesignal';
import {
  doc,
  getDoc,
  setDoc,
  deleteDoc,
} from 'firebase/firestore';
import { firebaseDb } from '@/integrations/firebase/client';

export const useOneSignalPlayerId = () => {
  const { user }                          = useAuth();
  const [isRegistered, setIsRegistered]   = useState(false);
  const [playerId,     setPlayerId]       = useState<string | null>(null);

  useEffect(() => {
    const registerPlayerId = async () => {
      if (!user) return;

      try {
        const playerIdFromSDK = await getPlayerId();
        if (!playerIdFromSDK) {
          console.log('[useOneSignalPlayerId] No subscription ID available yet');
          return;
        }

        setPlayerId(playerIdFromSDK);

        const playerRef = doc(
          firebaseDb,
          `users/${user.uid}/onesignal_player_ids/${playerIdFromSDK}`,
        );
        const existing = await getDoc(playerRef);

        if (existing.exists()) {
          console.log('[useOneSignalPlayerId] Already registered');
          setIsRegistered(true);
          return;
        }

        const now = new Date().toISOString();
        await setDoc(playerRef, {
          id:         playerIdFromSDK,
          userId:     user.uid,
          playerId:   playerIdFromSDK,
          deviceInfo: navigator.userAgent,
          createdAt:  now,
          updatedAt:  now,
        });

        console.log('[useOneSignalPlayerId] Registered successfully');
        setIsRegistered(true);
        toast({
          title:       'Push Notifications Enabled',
          description: "You'll receive push notifications via OneSignal",
        });
      } catch (error) {
        console.error('[useOneSignalPlayerId] Registration exception:', error);
      }
    };

    registerPlayerId();
  }, [user]);

  const registerManualPlayerId = async (
    playerIdInput: string,
    deviceInfo?: string,
  ): Promise<boolean> => {
    if (!user) {
      console.error('[useOneSignalPlayerId] User not authenticated');
      return false;
    }

    try {
      const playerRef = doc(
        firebaseDb,
        `users/${user.uid}/onesignal_player_ids/${playerIdInput}`,
      );
      const existing = await getDoc(playerRef);

      if (existing.exists()) {
        console.log('[useOneSignalPlayerId] Already registered');
        setPlayerId(playerIdInput);
        setIsRegistered(true);
        return true;
      }

      const now = new Date().toISOString();
      await setDoc(playerRef, {
        id:         playerIdInput,
        userId:     user.uid,
        playerId:   playerIdInput,
        deviceInfo: deviceInfo ?? navigator.userAgent,
        createdAt:  now,
        updatedAt:  now,
      });

      console.log('[useOneSignalPlayerId] Manual registration successful');
      setPlayerId(playerIdInput);
      setIsRegistered(true);
      toast({
        title:       'Push Notifications Enabled',
        description: "You'll receive push notifications via OneSignal",
      });
      return true;
    } catch (error) {
      console.error('[useOneSignalPlayerId] Manual registration exception:', error);
      return false;
    }
  };

  const unregisterPlayerId = async (playerIdToUnregister: string): Promise<boolean> => {
    if (!user) return false;

    try {
      await deleteDoc(
        doc(firebaseDb, `users/${user.uid}/onesignal_player_ids/${playerIdToUnregister}`),
      );
      console.log('[useOneSignalPlayerId] Unregistered successfully');
      setIsRegistered(false);
      setPlayerId(null);
      return true;
    } catch (error) {
      console.error('[useOneSignalPlayerId] Unregister exception:', error);
      return false;
    }
  };

  return { isRegistered, playerId, registerManualPlayerId, unregisterPlayerId };
};
