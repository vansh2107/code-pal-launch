import { useEffect, useRef, useState } from "react";
import { Camera, Upload, User } from "lucide-react";
import { useCamera } from "@/hooks/useCamera";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ProfilePhotoCropperModal } from "@/components/profile/ProfilePhotoCropperModal";
import { toast } from "@/hooks/use-toast";
import { firebaseDb, firebaseStorage } from "@/integrations/firebase/client";
import { ref, uploadBytes } from "firebase/storage";
import { doc, setDoc } from "firebase/firestore";
import { Capacitor } from "@capacitor/core";
import { pauseAppLock } from "@/lib/appLock";

interface AvatarEditPopoverProps {
  userId: string;
  avatarUrl: string | null;
  onAvatarUpdate: () => void;
  size?: "sm" | "lg";
}

export function AvatarEditPopover({ userId, avatarUrl, onAvatarUpdate, size = "sm" }: AvatarEditPopoverProps) {
  const [uploading, setUploading] = useState(false);
  const [preview, setPreview] = useState<string | null>(null);
  const [cropSource, setCropSource] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { openCamera, openGallery } = useCamera();

  useEffect(() => () => {
    if (cropSource?.startsWith("blob:")) URL.revokeObjectURL(cropSource);
  }, [cropSource]);

  const validateAndPrepareFile = (file: File | Blob) => {
    // Validate file type
    const validTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];
    if (file.type && !validTypes.includes(file.type)) {
      toast({
        title: "Invalid file type",
        description: "Please select a JPG, PNG, or WEBP image",
        variant: "destructive",
      });
      return false;
    }

    // Validate file size (max 20MB to match storage rules)
    const maxSize = 20 * 1024 * 1024;
    if (file.size > maxSize) {
      toast({
        title: "File too large",
        description: "Please select an image under 20MB",
        variant: "destructive",
      });
      return false;
    }

    setOpen(false);
    setCropSource(URL.createObjectURL(file));
    return true;
  };

  const handleCroppedPhotoSave = async (croppedFile: Blob) => {
    setUploading(true);
    try {
      const storagePath = `avatars/${userId}/profile.jpg`;
      const storageRef = ref(firebaseStorage, storagePath);
      await uploadBytes(storageRef, croppedFile, { contentType: "image/jpeg" });

      // Update profile in Firestore: users/{userId}/profile/data
      const profileRef = doc(firebaseDb, "users", userId, "profile", "data");
      await setDoc(profileRef, { avatarUrl: storagePath }, { merge: true });

      // Create local preview from cropped image
      const previewUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => typeof reader.result === "string" ? resolve(reader.result) : reject(new Error("Could not preview the saved photo."));
        reader.onerror = () => reject(new Error("Could not preview the saved photo."));
        reader.readAsDataURL(croppedFile);
      });
      setPreview(previewUrl);
      setCropSource(null);

      toast({
        title: "Profile photo updated",
        description: "Your profile photo has been saved",
      });

      onAvatarUpdate();
    } catch (error: any) {
      console.error('Error uploading avatar:', error);
      toast({
        title: "Upload failed",
        description: error?.message || "Failed to upload profile photo",
        variant: "destructive",
      });
      throw error;
    } finally {
      setUploading(false);
    }
  };

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      validateAndPrepareFile(file);
    }
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleUploadClick = async () => {
    setOpen(false);
    pauseAppLock(60000);
    
    if (Capacitor.isNativePlatform()) {
      const photo = await openGallery();
      if (photo?.webPath) {
        try {
          const response = await fetch(photo.webPath);
          const blob = await response.blob();
          validateAndPrepareFile(blob);
        } catch (error) {
          console.error('Error processing gallery photo:', error);
          toast({
            title: "Gallery error",
            description: "Failed to process photo",
            variant: "destructive",
          });
        }
      }
    } else {
      fileInputRef.current?.click();
    }
  };

  const handleCameraClick = async () => {
    setOpen(false);
    pauseAppLock(60000);
    
    if (Capacitor.isNativePlatform()) {
      // Use native camera on mobile
      const photo = await openCamera();
      if (photo?.webPath) {
        try {
          const response = await fetch(photo.webPath);
          const blob = await response.blob();
          validateAndPrepareFile(blob);
        } catch (error) {
          console.error('Error processing camera photo:', error);
          toast({
            title: "Camera error",
            description: "Failed to process photo",
            variant: "destructive",
          });
        }
      }
    } else {
      // On web, also open file picker (camera input)
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = 'image/*';
      input.capture = 'user'; // Front camera for selfie
      input.onchange = async (e) => {
        const file = (e.target as HTMLInputElement).files?.[0];
        if (file) {
          validateAndPrepareFile(file);
        }
      };
      input.click();
    }
  };

  const displayUrl = preview || avatarUrl;
  
  const sizeClasses = size === "lg" 
    ? "w-24 h-24" 
    : "w-14 h-14";
  
  const iconSize = size === "lg" ? "h-10 w-10" : "h-7 w-7";
  const overlayIconSize = size === "lg" ? "h-8 w-8" : "h-5 w-5";

  return (
    <div className="relative shrink-0">
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <button
            type="button"
            disabled={uploading}
            className={`relative ${sizeClasses} rounded-full overflow-hidden bg-primary/10 flex items-center justify-center focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2 transition-all group`}
            aria-label="Edit profile photo"
          >
            {displayUrl ? (
              <img 
                src={displayUrl} 
                alt="Profile" 
                className="w-full h-full object-cover"
                onError={(e) => {
                  (e.target as HTMLImageElement).style.display = 'none';
                }}
              />
            ) : (
              <User className={`${iconSize} text-primary`} />
            )}
            
            {/* Overlay on hover/focus */}
            <div className="absolute inset-0 bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 group-focus:opacity-100 transition-opacity">
              <Camera className={`${overlayIconSize} text-white`} />
            </div>

            {uploading && (
              <div className="absolute inset-0 bg-background/70 flex items-center justify-center">
                <div className="animate-spin rounded-full h-5 w-5 border-2 border-primary border-t-transparent"></div>
              </div>
            )}
          </button>
        </PopoverTrigger>
        
        <PopoverContent 
          className="w-48 p-1" 
          align="start" 
          sideOffset={8}
        >
          <button
            type="button"
            onClick={handleUploadClick}
            className="flex items-center gap-3 w-full px-3 py-2.5 text-sm text-foreground hover:bg-accent rounded-md transition-colors"
          >
            <Upload className="h-4 w-4 text-muted-foreground" />
            Upload Photo
          </button>
          <button
            type="button"
            onClick={handleCameraClick}
            className="flex items-center gap-3 w-full px-3 py-2.5 text-sm text-foreground hover:bg-accent rounded-md transition-colors"
          >
            <Camera className="h-4 w-4 text-muted-foreground" />
            Take Photo
          </button>
        </PopoverContent>
      </Popover>

      {/* Hidden file input */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/jpeg,image/jpg,image/png,image/webp"
        onChange={handleFileSelect}
        className="hidden"
      />
      <ProfilePhotoCropperModal
        source={cropSource}
        onOpenChange={(nextOpen) => {
          if (!nextOpen && !uploading) setCropSource(null);
        }}
        onSave={handleCroppedPhotoSave}
      />
    </div>
  );
}
