import { useEffect } from 'react';
import { PushNotifications } from '@capacitor/push-notifications';
import { toast } from '@/hooks/use-toast';

export const useNotificationPermission = () => {
  useEffect(() => {
    requestNotificationPermission();
  }, []);

  const requestNotificationPermission = async () => {
    try {
      // Check current permission status
      const permStatus = await PushNotifications.checkPermissions();
      
      if (permStatus.receive === 'prompt' || permStatus.receive === 'prompt-with-rationale') {
        // Request permission
        const result = await PushNotifications.requestPermissions();
        
        if (result.receive === 'denied') {
          toast({
            title: "Notifications Disabled",
            description: "You won't receive important reminders. You can enable them in app settings.",
            variant: "destructive",
          });
        }
      } else if (permStatus.receive === 'denied') {
        console.log('Notification permission previously denied');
      }
    } catch (error) {
      console.error('Error requesting notification permission:', error);
    }
  };

  return { requestNotificationPermission };
};
