import { Camera, CameraResultType, CameraSource, Photo } from '@capacitor/camera';
import { toast } from '@/hooks/use-toast';

export const useCamera = () => {
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

  const openCamera = async (): Promise<Photo | null> => {
    try {
      const hasPermission = await requestCameraPermission();
      
      if (!hasPermission) {
        toast({
          title: "Camera Permission Denied",
          description: "Please enable camera access in your device settings to take photos.",
          variant: "destructive",
        });
        return null;
      }

      const photo = await Camera.getPhoto({
        quality: 90,
        allowEditing: false,
        resultType: CameraResultType.Uri,
        source: CameraSource.Camera,
      });

      return photo;
    } catch (error) {
      console.error('Error opening camera:', error);
      toast({
        title: "Camera Error",
        description: "Failed to open camera. Please try again.",
        variant: "destructive",
      });
      return null;
    }
  };

  const openGallery = async (): Promise<Photo | null> => {
    try {
      const permissions = await Camera.checkPermissions();
      
      if (permissions.photos === 'prompt' || permissions.photos === 'prompt-with-rationale') {
        const result = await Camera.requestPermissions({ permissions: ['photos'] });
        
        if (result.photos === 'denied') {
          toast({
            title: "Gallery Permission Denied",
            description: "Please enable photo access in your device settings to select images.",
            variant: "destructive",
          });
          return null;
        }
      }

      const photo = await Camera.getPhoto({
        quality: 90,
        allowEditing: false,
        resultType: CameraResultType.Uri,
        source: CameraSource.Photos,
      });

      return photo;
    } catch (error) {
      console.error('Error opening gallery:', error);
      toast({
        title: "Gallery Error",
        description: "Failed to open gallery. Please try again.",
        variant: "destructive",
      });
      return null;
    }
  };

  return {
    requestCameraPermission,
    openCamera,
    openGallery,
  };
};
