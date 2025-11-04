import { useEffect } from 'react';
import { useAuth } from './useAuth';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/hooks/use-toast';

/**
 * Hook to manage FCM (Firebase Cloud Messaging) token registration
 * 
 * To use this in your AppMySite mobile app:
 * 1. Get the FCM token from Firebase in your app
 * 2. Call this hook's registerToken function with that token
 * 3. The token will be stored in the database for push notifications
 */
export const useFCMToken = () => {
  const { user } = useAuth();

  const registerToken = async (fcmToken: string, deviceInfo?: string) => {
    if (!user) {
      console.error('User not authenticated');
      return false;
    }

    try {
      // Check if token already exists
      const { data: existingToken } = await supabase
        .from('fcm_tokens')
        .select('id')
        .eq('token', fcmToken)
        .single();

      if (existingToken) {
        console.log('FCM token already registered');
        return true;
      }

      // Insert new token
      const { error } = await supabase
        .from('fcm_tokens')
        .insert({
          user_id: user.id,
          token: fcmToken,
          device_info: deviceInfo || navigator.userAgent,
        });

      if (error) {
        console.error('Error registering FCM token:', error);
        return false;
      }

      console.log('FCM token registered successfully');
      toast({
        title: "Push Notifications Enabled",
        description: "You'll receive push notifications for document reminders",
      });
      
      return true;
    } catch (error) {
      console.error('Exception registering FCM token:', error);
      return false;
    }
  };

  const unregisterToken = async (fcmToken: string) => {
    if (!user) return false;

    try {
      const { error } = await supabase
        .from('fcm_tokens')
        .delete()
        .eq('token', fcmToken)
        .eq('user_id', user.id);

      if (error) {
        console.error('Error unregistering FCM token:', error);
        return false;
      }

      console.log('FCM token unregistered successfully');
      return true;
    } catch (error) {
      console.error('Exception unregistering FCM token:', error);
      return false;
    }
  };

  return {
    registerToken,
    unregisterToken,
  };
};
