import { useEffect } from 'react';
import { Camera } from '@capacitor/camera';
import { PushNotifications } from '@capacitor/push-notifications';
import { toast } from '@/hooks/use-toast';

export const usePermissions = () => {
  useEffect(() => {
    requestAllPermissions();
  }, []);

  const requestCameraPermission = async (): Promise<boolean> => {
    try {
      const permissions = await Camera.checkPermissions();
      
      if (permissions.camera === 'prompt' || permissions.camera === 'prompt-with-rationale') {
        const result = await Camera.requestPermissions({ permissions: ['camera'] });
        return result.camera === 'granted';
      }
      
      return permissions.camera === 'granted';
    } catch (error) {
      console.error('Error requesting camera permission:', error);
      return false;
    }
  };

  const requestNotificationPermission = async (): Promise<boolean> => {
    try {
      const permStatus = await PushNotifications.checkPermissions();
      
      if (permStatus.receive === 'prompt' || permStatus.receive === 'prompt-with-rationale') {
        const result = await PushNotifications.requestPermissions();
        
        if (result.receive === 'denied') {
          toast({
            title: "Notifications Disabled",
            description: "You won't receive important reminders. Enable them in app settings.",
            variant: "destructive",
          });
          return false;
        }
        return result.receive === 'granted';
      } else if (permStatus.receive === 'denied') {
        console.log('Notification permission previously denied');
        return false;
      }
      
      return permStatus.receive === 'granted';
    } catch (error) {
      console.error('Error requesting notification permission:', error);
      return false;
    }
  };

  const requestAllPermissions = async () => {
    await Promise.all([
      requestCameraPermission(),
      requestNotificationPermission(),
    ]);
  };

  return {
    requestCameraPermission,
    requestNotificationPermission,
    requestAllPermissions,
  };
};
