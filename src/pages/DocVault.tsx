import { useState, useRef } from "react";
import { BottomNavigation } from "@/components/layout/BottomNavigation";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { useQuery } from "@tanstack/react-query";
import { Upload, Camera, FileText, Search, X, Trash2, MoreVertical } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { format } from "date-fns";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export default function DocVault() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [searchQuery, setSearchQuery] = useState("");
  const [isUploading, setIsUploading] = useState(false);
  const [showCamera, setShowCamera] = useState(false);
  const [capturedImage, setCapturedImage] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Fetch only DocVault documents
  const { data: documents = [], refetch } = useQuery({
    queryKey: ["docvault-documents", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("documents")
        .select("*")
        .eq("user_id", user?.id)
        .eq("issuing_authority", "DocVault")
        .order("created_at", { ascending: false });

      if (error) throw error;
      return data || [];
    },
    enabled: !!user?.id,
  });

  // Filter documents based on search
  const filteredDocuments = documents.filter((doc) =>
    doc.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    doc.document_type?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const startCamera = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "environment" },
      });
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
      setShowCamera(true);
    } catch (error) {
      console.error("Camera error:", error);
      toast.error("Failed to access camera");
    }
  };

  const stopCamera = () => {
    if (videoRef.current?.srcObject) {
      const stream = videoRef.current.srcObject as MediaStream;
      stream.getTracks().forEach((track) => track.stop());
    }
    setShowCamera(false);
    setCapturedImage(null);
  };

  const capturePhoto = () => {
    if (videoRef.current && canvasRef.current) {
      const video = videoRef.current;
      const canvas = canvasRef.current;
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      const ctx = canvas.getContext("2d");
      if (ctx) {
        ctx.drawImage(video, 0, 0);
        const imageData = canvas.toDataURL("image/jpeg");
        setCapturedImage(imageData);
      }
    }
  };

  const handleDelete = async (docId: string, imagePath: string | null) => {
    setDeletingId(docId);
    try {
      // Delete document image from storage if exists
      if (imagePath) {
        await supabase.storage
          .from('document-images')
          .remove([imagePath]);
      }

      const { error } = await supabase
        .from('documents')
        .delete()
        .eq('id', docId);

      if (error) throw error;

      toast.success("Document deleted successfully");
      refetch();
    } catch (error: any) {
      console.error('Error deleting document:', error);
      toast.error(error?.message || "Failed to delete document");
    } finally {
      setDeletingId(null);
    }
  };

  const uploadCapturedImage = async () => {
    if (!capturedImage || !user) return;

    setIsUploading(true);
    try {
      const blob = await (await fetch(capturedImage)).blob();
      
      // Validate file size (max 20MB)
      const maxSize = 20 * 1024 * 1024; // 20MB in bytes
      if (blob.size > maxSize) {
        throw new Error("File size exceeds 20MB limit");
      }
      
      const fileName = `${user.id}/${Date.now()}.jpg`;

      const { error: uploadError } = await supabase.storage
        .from("document-images")
        .upload(fileName, blob);

      if (uploadError) throw uploadError;

      const { error: insertError } = await supabase
        .from("documents")
        .insert({
          user_id: user.id,
          name: `Scanned Document ${format(new Date(), "MMM dd, yyyy HH:mm")}`,
          document_type: "other",
          image_path: fileName,
          issuing_authority: "DocVault",
          expiry_date: "9999-12-31", // Far future date for vault documents (no expiry)
          renewal_period_days: 0,
        });

      if (insertError) throw insertError;

      toast.success("Document saved successfully");
      stopCamera();
      refetch();
    } catch (error) {
      console.error("Upload error:", error);
      toast.error("Failed to save document");
    } finally {
      setIsUploading(false);
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !user) return;

    // Validate file size (max 20MB)
    const maxSize = 20 * 1024 * 1024; // 20MB in bytes
    if (file.size > maxSize) {
      toast.error("File size exceeds 20MB limit");
      return;
    }

    setIsUploading(true);
    try {
      const fileExt = file.name.split(".").pop();
      const fileName = `${user.id}/${Date.now()}.${fileExt}`;

      const { error: uploadError } = await supabase.storage
        .from("document-images")
        .upload(fileName, file);

      if (uploadError) throw uploadError;

      const { error: insertError } = await supabase
        .from("documents")
        .insert({
          user_id: user.id,
          name: file.name,
          document_type: "other",
          image_path: fileName,
          issuing_authority: "DocVault",
          expiry_date: "9999-12-31", // Far future date for vault documents (no expiry)
          renewal_period_days: 0,
        });

      if (insertError) throw insertError;

      toast.success("Document uploaded successfully");
      refetch();
    } catch (error) {
      console.error("Upload error:", error);
      toast.error("Failed to upload document");
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    }
  };

  return (
    <div className="min-h-screen bg-background pb-24 overflow-x-hidden">
      {/* Header */}
      <div className="sticky top-0 z-40 bg-gradient-to-b from-primary/10 to-background backdrop-blur-xl border-b border-border/50">
        <div className="container py-6 px-4">
          <h1 className="text-3xl font-bold mb-2">DocVault</h1>
          <p className="text-muted-foreground">Your secure document storage</p>
        </div>
      </div>

      <div className="container py-6 px-4 space-y-6 max-w-7xl mx-auto">
        {/* Search and Actions */}
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search documents..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10"
            />
          </div>
          <div className="flex gap-2">
            <Button
              onClick={startCamera}
              variant="outline"
              className="gap-2"
            >
              <Camera className="h-4 w-4" />
              Scan
            </Button>
            <Button
              onClick={() => fileInputRef.current?.click()}
              variant="default"
              className="gap-2"
              disabled={isUploading}
            >
              <Upload className="h-4 w-4" />
              Upload
            </Button>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*,application/pdf"
              onChange={handleFileUpload}
              className="hidden"
            />
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 gap-4">
          <Card className="p-4">
            <div className="text-2xl font-bold">{documents.length}</div>
            <div className="text-xs text-muted-foreground">Total Documents</div>
          </Card>
          <Card className="p-4">
            <div className="text-2xl font-bold">
              {new Set(documents.map((d) => d.document_type)).size}
            </div>
            <div className="text-xs text-muted-foreground">Types</div>
          </Card>
        </div>

        {/* Documents Grid */}
        {filteredDocuments.length === 0 ? (
          <Card className="p-8 text-center">
            <FileText className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
            <h3 className="text-lg font-medium mb-2">No documents yet</h3>
            <p className="text-muted-foreground mb-4 text-sm">
              Start by uploading or scanning your first document
            </p>
            <div className="flex flex-col sm:flex-row gap-2 justify-center max-w-sm mx-auto">
              <Button onClick={startCamera} variant="outline" className="w-full sm:w-auto">
                <Camera className="h-4 w-4 mr-2" />
                Scan
              </Button>
              <Button onClick={() => fileInputRef.current?.click()} variant="default" className="w-full sm:w-auto">
                <Upload className="h-4 w-4 mr-2" />
                Upload
              </Button>
            </div>
          </Card>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredDocuments.map((doc) => (
              <Card
                key={doc.id}
                className="group relative overflow-hidden hover:shadow-lg transition-all"
              >
                <div 
                  className="cursor-pointer"
                  onClick={() => navigate(`/documents/${doc.id}`)}
                >
                  {doc.image_path && (
                    <div className="aspect-video bg-muted relative overflow-hidden flex items-center justify-center">
                      {doc.image_path.toLowerCase().endsWith('.pdf') ? (
                        <div className="flex flex-col items-center justify-center p-4">
                          <FileText className="h-16 w-16 text-primary mb-2" />
                          <span className="text-xs text-muted-foreground text-center">PDF Document</span>
                        </div>
                      ) : (
                        <img
                          src={supabase.storage.from("document-images").getPublicUrl(doc.image_path).data.publicUrl}
                          alt={doc.name}
                          className="w-full h-full object-cover"
                        />
                      )}
                    </div>
                  )}
                  <div className="p-4 space-y-2">
                    <h3 className="font-medium truncate">{doc.name}</h3>
                    <p className="text-xs text-muted-foreground">
                      Added: {format(new Date(doc.created_at), "MMM dd, yyyy")}
                    </p>
                  </div>
                </div>
                
                {/* Action Menu */}
                <div className="absolute top-2 right-2" onClick={(e) => e.stopPropagation()}>
                  <AlertDialog>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button
                          variant="secondary"
                          size="icon"
                          className="h-8 w-8 opacity-0 group-hover:opacity-100 transition-opacity bg-background/80 backdrop-blur-sm"
                        >
                          <MoreVertical className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <AlertDialogTrigger asChild>
                          <DropdownMenuItem className="text-destructive focus:text-destructive">
                            <Trash2 className="h-4 w-4 mr-2" />
                            Delete
                          </DropdownMenuItem>
                        </AlertDialogTrigger>
                      </DropdownMenuContent>
                    </DropdownMenu>
                    
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>Delete Document</AlertDialogTitle>
                        <AlertDialogDescription>
                          Are you sure you want to delete "{doc.name}"? This action cannot be undone.
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction
                          onClick={() => handleDelete(doc.id, doc.image_path)}
                          disabled={deletingId === doc.id}
                          className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                        >
                          {deletingId === doc.id ? "Deleting..." : "Delete"}
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                </div>
              </Card>
            ))}
          </div>
        )}
      </div>

      {/* Camera Dialog */}
      <Dialog open={showCamera} onOpenChange={stopCamera}>
        <DialogContent className="max-w-4xl">
          <DialogHeader>
            <DialogTitle>Scan Document</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            {!capturedImage ? (
              <>
                <video
                  ref={videoRef}
                  autoPlay
                  playsInline
                  muted
                  className="w-full rounded-lg bg-black"
                />
                <div className="flex gap-2 justify-center">
                  <Button onClick={capturePhoto} size="lg">
                    <Camera className="h-5 w-5 mr-2" />
                    Capture
                  </Button>
                  <Button onClick={stopCamera} variant="outline" size="lg">
                    <X className="h-5 w-5 mr-2" />
                    Cancel
                  </Button>
                </div>
              </>
            ) : (
              <>
                <img
                  src={capturedImage}
                  alt="Captured"
                  className="w-full rounded-lg"
                />
                <div className="flex gap-2 justify-center">
                  <Button
                    onClick={uploadCapturedImage}
                    disabled={isUploading}
                    size="lg"
                  >
                    <Upload className="h-5 w-5 mr-2" />
                    {isUploading ? "Saving..." : "Save Document"}
                  </Button>
                  <Button
                    onClick={() => setCapturedImage(null)}
                    variant="outline"
                    size="lg"
                    disabled={isUploading}
                  >
                    Retake
                  </Button>
                </div>
              </>
            )}
          </div>
          <canvas ref={canvasRef} className="hidden" />
        </DialogContent>
      </Dialog>

      <BottomNavigation />
    </div>
  );
}
