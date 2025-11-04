import { useEffect, useState } from 'react';
import { getToken } from 'firebase/messaging';
import { initializeFirebase } from '@/config/firebase';
import { useFCMToken } from './useFCMToken';
import { useAuth } from './useAuth';
import { toast } from './use-toast';

export const useWebFCM = () => {
  const { user } = useAuth();
  const { registerToken } = useFCMToken();
  const [fcmToken, setFcmToken] = useState<string | null>(null);
  const [permissionStatus, setPermissionStatus] = useState<NotificationPermission>('default');

  useEffect(() => {
    if (!user) return;

    const initializeFCM = async () => {
      try {
        // Check if notifications are supported
        if (!('Notification' in window)) {
          console.log('This browser does not support notifications');
          return;
        }

        // Initialize Firebase
        const { messaging } = await initializeFirebase();
        if (!messaging) {
          console.log('Firebase Messaging not supported in this browser');
          return;
        }

        // Request permission
        const permission = await Notification.requestPermission();
        setPermissionStatus(permission);

        if (permission !== 'granted') {
          toast({
            title: "Notification Permission Denied",
            description: "You won't receive push notifications",
            variant: "destructive",
          });
          return;
        }

        // Get FCM token
        const vapidKey = import.meta.env.VITE_FIREBASE_VAPID_KEY;
        if (!vapidKey) {
          console.error('VAPID key not configured');
          return;
        }

        const token = await getToken(messaging, { vapidKey });
        
        if (token) {
          console.log('FCM Token:', token);
          setFcmToken(token);
          
          // Show alert with token for testing
          alert(`Your FCM Token: ${token.substring(0, 50)}...`);
          
          // Save token to Supabase
          const success = await registerToken(token, 'Web Browser - ' + navigator.userAgent.substring(0, 50));
          
          if (success) {
            toast({
              title: "Push Notifications Enabled",
              description: "You'll receive notifications for document reminders",
            });
          }
        } else {
          console.warn('No FCM token received');
        }
      } catch (error) {
        console.error('FCM initialization error:', error);
        toast({
          title: "Notification Setup Failed",
          description: "Could not enable push notifications",
          variant: "destructive",
        });
      }
    };

    initializeFCM();
  }, [user, registerToken]);

  return {
    fcmToken,
    permissionStatus,
  };
};
