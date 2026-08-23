import { useEffect } from 'react';
import { toast } from '@/hooks/use-toast';

export const useNotificationPermission = () => {
  useEffect(() => {
    requestNotificationPermission();
  }, []);

  const requestNotificationPermission = async () => {
    try {
      if (!('Notification' in window)) {
        return;
      }
      if (Notification.permission === 'default') {
        const permission = await Notification.requestPermission();
        if (permission === 'denied') {
          toast({
            title: "Notifications Disabled",
            description: "You won't receive important reminders. You can enable them in app settings.",
            variant: "destructive",
          });
        }
      }
    } catch (error) {
      console.error('Error requesting notification permission:', error);
    }
  };

  return { requestNotificationPermission };
};
