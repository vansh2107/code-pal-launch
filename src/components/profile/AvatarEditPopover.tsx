import { useRef, useState } from "react";
import { Camera, Upload, User } from "lucide-react";
import { useCamera } from "@/hooks/useCamera";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { toast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { Capacitor } from "@capacitor/core";

interface AvatarEditPopoverProps {
  userId: string;
  avatarUrl: string | null;
  onAvatarUpdate: () => void;
}

export function AvatarEditPopover({ userId, avatarUrl, onAvatarUpdate }: AvatarEditPopoverProps) {
  const [uploading, setUploading] = useState(false);
  const [preview, setPreview] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { openCamera, openGallery } = useCamera();

  const validateAndUploadFile = async (file: File | Blob, fileName?: string) => {
    // Validate file type
    const validTypes = ['image/jpeg', 'image/jpg', 'image/png'];
    if (!validTypes.includes(file.type)) {
      toast({
        title: "Invalid file type",
        description: "Please select a JPG or PNG image",
        variant: "destructive",
      });
      return;
    }

    // Validate file size (max 5MB)
    const maxSize = 5 * 1024 * 1024;
    if (file.size > maxSize) {
      toast({
        title: "File too large",
        description: "Please select an image under 5MB",
        variant: "destructive",
      });
      return;
    }

    setUploading(true);
    setOpen(false);

    try {
      // Create preview immediately
      const reader = new FileReader();
      reader.onload = (event) => {
        setPreview(event.target?.result as string);
      };
      reader.readAsDataURL(file);

      // Determine file extension
      const ext = fileName?.split('.').pop()?.toLowerCase() || 
                  file.type.split('/')[1] || 'jpg';
      const storagePath = `avatars/${userId}/profile.${ext}`;

      // Remove old avatar if exists
      await supabase.storage.from('document-images').remove([storagePath]);

      const { error: uploadError } = await supabase.storage
        .from('document-images')
        .upload(storagePath, file, { 
          cacheControl: '3600',
          upsert: true 
        });

      if (uploadError) throw uploadError;

      // Update profile with the file path
      const { error: updateError } = await supabase
        .from('profiles')
        .update({ avatar_url: storagePath })
        .eq('user_id', userId);

      if (updateError) throw updateError;

      toast({
        title: "Profile photo updated",
        description: "Your profile photo has been saved",
      });

      onAvatarUpdate();
    } catch (error: any) {
      console.error('Error uploading avatar:', error);
      setPreview(null);
      toast({
        title: "Upload failed",
        description: error?.message || "Failed to upload profile photo",
        variant: "destructive",
      });
    } finally {
      setUploading(false);
    }
  };

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      await validateAndUploadFile(file, file.name);
    }
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleUploadClick = () => {
    fileInputRef.current?.click();
  };

  const handleCameraClick = async () => {
    setOpen(false);
    
    if (Capacitor.isNativePlatform()) {
      // Use native camera on mobile
      const photo = await openCamera();
      if (photo?.webPath) {
        try {
          const response = await fetch(photo.webPath);
          const blob = await response.blob();
          await validateAndUploadFile(blob, 'camera-photo.jpg');
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
          await validateAndUploadFile(file, file.name);
        }
      };
      input.click();
    }
  };

  const displayUrl = preview || avatarUrl;

  return (
    <div className="relative shrink-0">
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <button
            disabled={uploading}
            className="relative w-14 h-14 rounded-full overflow-hidden bg-primary/10 flex items-center justify-center focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2 transition-all group"
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
              <User className="h-7 w-7 text-primary" />
            )}
            
            {/* Overlay on hover/focus */}
            <div className="absolute inset-0 bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 group-focus:opacity-100 transition-opacity">
              <Camera className="h-5 w-5 text-white" />
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
            onClick={handleUploadClick}
            className="flex items-center gap-3 w-full px-3 py-2.5 text-sm text-foreground hover:bg-accent rounded-md transition-colors"
          >
            <Upload className="h-4 w-4 text-muted-foreground" />
            Upload Photo
          </button>
          <button
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
        accept="image/jpeg,image/jpg,image/png"
        onChange={handleFileSelect}
        className="hidden"
      />
    </div>
  );
}
