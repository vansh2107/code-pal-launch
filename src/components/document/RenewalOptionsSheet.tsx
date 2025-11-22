import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useCamera } from "@/hooks/useCamera";
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
  DrawerDescription,
} from "@/components/ui/drawer";
import { Button } from "@/components/ui/button";
import { Trash2, FileUp, FilePlus, X } from "lucide-react";

interface RenewalOptionsSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  documentId: string;
  documentName: string;
  onSuccess?: () => void;
}

const genZMessages = [
  "W bro 😎🔥 renewal god!",
  "No cap, you're actually adulting 💼😂",
  "Sigma move right there 🗿🔥",
  "Your future self just said thanks 🤝",
  "Good job bro… your documents cleaner than your room 💀",
  "You're cooking fr 🧑‍🍳🔥",
  "Huge W, keep grinding ⚡",
  "Okay productivity KING 🤌🔥"
];

const getRandomGenZMessage = () => {
  return genZMessages[Math.floor(Math.random() * genZMessages.length)];
};

export function RenewalOptionsSheet({
  open,
  onOpenChange,
  documentId,
  documentName,
  onSuccess,
}: RenewalOptionsSheetProps) {
  const navigate = useNavigate();
  const { toast } = useToast();
  const { openCamera, openGallery } = useCamera();
  const [loading, setLoading] = useState(false);

  const showGenZToast = () => {
    toast({
      title: getRandomGenZMessage(),
      duration: 3000,
    });
  };

  const handleDelete = async () => {
    setLoading(true);
    try {
      // Get document details first
      const { data: doc, error: fetchError } = await supabase
        .from("documents")
        .select("image_path")
        .eq("id", documentId)
        .single();

      if (fetchError) throw fetchError;

      // Delete image from storage if exists
      if (doc?.image_path) {
        await supabase.storage
          .from("document-images")
          .remove([doc.image_path]);
      }

      // Delete document
      const { error } = await supabase
        .from("documents")
        .delete()
        .eq("id", documentId);

      if (error) throw error;

      onOpenChange(false);
      showGenZToast();
      onSuccess?.();
      
      // Navigate to documents page
      setTimeout(() => {
        navigate("/documents");
      }, 500);
    } catch (error: any) {
      console.error("Error deleting document:", error);
      toast({
        title: "Error",
        description: error.message || "Failed to delete document",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleUpdateDocument = () => {
    onOpenChange(false);
    // Navigate to scan page with replace mode
    navigate(`/scan?mode=replace&docId=${documentId}`);
  };

  const handleAddNewDocument = () => {
    onOpenChange(false);
    showGenZToast();
    // Navigate to scan page normally
    navigate("/scan");
  };

  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent className="px-4 pb-8">
        <DrawerHeader className="text-left px-0">
          <DrawerTitle className="text-xl">Renewal Options</DrawerTitle>
          <DrawerDescription>
            Choose how you want to handle "{documentName}"
          </DrawerDescription>
        </DrawerHeader>
        
        <div className="space-y-3 mt-4">
          {/* Delete Document */}
          <Button
            variant="destructive"
            size="lg"
            className="w-full justify-start gap-3 h-auto py-4"
            onClick={handleDelete}
            disabled={loading}
          >
            <Trash2 className="h-5 w-5" />
            <div className="text-left">
              <div className="font-semibold">Delete Document</div>
              <div className="text-xs opacity-90 font-normal">
                Permanently remove this document
              </div>
            </div>
          </Button>

          {/* Update With New Document */}
          <Button
            variant="default"
            size="lg"
            className="w-full justify-start gap-3 h-auto py-4"
            onClick={handleUpdateDocument}
            disabled={loading}
          >
            <FileUp className="h-5 w-5" />
            <div className="text-left">
              <div className="font-semibold">Update With New Document</div>
              <div className="text-xs opacity-90 font-normal">
                Replace with renewed version
              </div>
            </div>
          </Button>

          {/* Keep Old & Add New */}
          <Button
            variant="secondary"
            size="lg"
            className="w-full justify-start gap-3 h-auto py-4"
            onClick={handleAddNewDocument}
            disabled={loading}
          >
            <FilePlus className="h-5 w-5" />
            <div className="text-left">
              <div className="font-semibold">Keep Old Document & Add New One</div>
              <div className="text-xs opacity-90 font-normal">
                Keep existing and add renewed separately
              </div>
            </div>
          </Button>

          {/* Cancel */}
          <Button
            variant="outline"
            size="lg"
            className="w-full justify-start gap-3 h-auto py-4"
            onClick={() => onOpenChange(false)}
            disabled={loading}
          >
            <X className="h-5 w-5" />
            <div className="text-left">
              <div className="font-semibold">Cancel</div>
              <div className="text-xs opacity-90 font-normal">
                Close this menu
              </div>
            </div>
          </Button>
        </div>
      </DrawerContent>
    </Drawer>
  );
}

