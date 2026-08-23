import { useEffect } from 'react';
import { Camera } from '@capacitor/camera';

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

  const requestAllPermissions = async () => {
    await requestCameraPermission();
  };

  return {
    requestCameraPermission,
    requestAllPermissions,
  };
};
