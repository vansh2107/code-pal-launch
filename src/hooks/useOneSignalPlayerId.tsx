import { useEffect, useState } from 'react';
import { useAuth } from './useAuth';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/hooks/use-toast';
import despia from 'despia-native';

/**
 * Hook to manage OneSignal Player ID registration using Despia SDK
 * 
 * This hook automatically:
 * 1. Gets the OneSignal Player ID from Despia
 * 2. Registers it in the database for push notifications
 */
export const useOneSignalPlayerId = () => {
  const { user } = useAuth();
  const [isRegistered, setIsRegistered] = useState(false);
  const [playerId, setPlayerId] = useState<string | null>(null);

  useEffect(() => {
    const registerPlayerId = async () => {
      if (!user) return;

      try {
        // Get OneSignal Player ID from Despia SDK
        const playerIdFromDespia = despia.onesignalplayerid;
        
        if (!playerIdFromDespia) {
          console.log('No OneSignal Player ID available yet');
          return;
        }

        setPlayerId(playerIdFromDespia);

        // Check if player ID already exists
        const { data: existingPlayerId } = await supabase
          .from('onesignal_player_ids')
          .select('id')
          .eq('player_id', playerIdFromDespia)
          .single();

        if (existingPlayerId) {
          console.log('OneSignal Player ID already registered');
          setIsRegistered(true);
          return;
        }

        // Insert new player ID
        const { error } = await supabase
          .from('onesignal_player_ids')
          .insert({
            user_id: user.id,
            player_id: playerIdFromDespia,
            device_info: navigator.userAgent,
          });

        if (error) {
          console.error('Error registering OneSignal Player ID:', error);
          return;
        }

        console.log('OneSignal Player ID registered successfully');
        setIsRegistered(true);
        toast({
          title: "Push Notifications Enabled",
          description: "You'll receive push notifications via OneSignal",
        });
      } catch (error) {
        console.error('Exception registering OneSignal Player ID:', error);
      }
    };

    registerPlayerId();
  }, [user]);

  const registerManualPlayerId = async (playerIdInput: string, deviceInfo?: string) => {
    if (!user) {
      console.error('User not authenticated');
      return false;
    }

    try {
      // Check if player ID already exists
      const { data: existingPlayerId } = await supabase
        .from('onesignal_player_ids')
        .select('id')
        .eq('player_id', playerIdInput)
        .single();

      if (existingPlayerId) {
        console.log('OneSignal Player ID already registered');
        return true;
      }

      // Insert new player ID
      const { error } = await supabase
        .from('onesignal_player_ids')
        .insert({
          user_id: user.id,
          player_id: playerIdInput,
          device_info: deviceInfo || navigator.userAgent,
        });

      if (error) {
        console.error('Error registering OneSignal Player ID:', error);
        return false;
      }

      console.log('OneSignal Player ID registered successfully');
      setPlayerId(playerIdInput);
      setIsRegistered(true);
      toast({
        title: "Push Notifications Enabled",
        description: "You'll receive push notifications via OneSignal",
      });
      
      return true;
    } catch (error) {
      console.error('Exception registering OneSignal Player ID:', error);
      return false;
    }
  };

  const unregisterPlayerId = async (playerIdToUnregister: string) => {
    if (!user) return false;

    try {
      const { error } = await supabase
        .from('onesignal_player_ids')
        .delete()
        .eq('player_id', playerIdToUnregister)
        .eq('user_id', user.id);

      if (error) {
        console.error('Error unregistering OneSignal Player ID:', error);
        return false;
      }

      console.log('OneSignal Player ID unregistered successfully');
      setIsRegistered(false);
      setPlayerId(null);
      return true;
    } catch (error) {
      console.error('Exception unregistering OneSignal Player ID:', error);
      return false;
    }
  };

  return {
    isRegistered,
    playerId,
    registerManualPlayerId,
    unregisterPlayerId,
  };
};
