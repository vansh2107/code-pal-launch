import { useState } from 'react';
import { useCamera } from '@/hooks/useCamera';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Camera, Image } from 'lucide-react';

export const CameraGalleryExample = () => {
  const { openCamera, openGallery } = useCamera();
  const [imageUri, setImageUri] = useState<string | null>(null);

  const handleCamera = async () => {
    const photo = await openCamera();
    if (photo?.webPath) {
      setImageUri(photo.webPath);
    }
  };

  const handleGallery = async () => {
    const photo = await openGallery();
    if (photo?.webPath) {
      setImageUri(photo.webPath);
    }
  };

  return (
    <Card className="p-6 space-y-4">
      <h3 className="text-lg font-semibold">Camera & Gallery Example</h3>
      
      <div className="flex gap-3">
        <Button onClick={handleCamera} className="flex items-center gap-2">
          <Camera className="w-4 h-4" />
          Take Photo
        </Button>
        
        <Button onClick={handleGallery} variant="outline" className="flex items-center gap-2">
          <Image className="w-4 h-4" />
          Choose from Gallery
        </Button>
      </div>

      {imageUri && (
        <div className="mt-4">
          <img 
            src={imageUri} 
            alt="Selected" 
            className="w-full max-h-64 object-contain rounded-lg border"
          />
        </div>
      )}
    </Card>
  );
};
