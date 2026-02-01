import { useState, useRef, useCallback } from "react";
import { BottomNavigation } from "@/components/layout/BottomNavigation";
import { SafeAreaContainer } from "@/components/layout/SafeAreaContainer";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { Upload, Camera as CameraIcon, FileText, Search, X, Menu, FolderOpen, Star } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { formatInTimeZone } from "date-fns-tz";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { DocumentScanPreview } from "@/components/scan/DocumentScanPreview";
import { DocVaultSidebar, type DocVaultCategory } from "@/components/docvault/DocVaultSidebar";
import { CategoryDialog } from "@/components/docvault/CategoryDialog";
import { UploadDocumentDialog } from "@/components/docvault/UploadDocumentDialog";
import { MoveDocumentDialog } from "@/components/docvault/MoveDocumentDialog";
import { DocVaultDocumentCard, type DocVaultDocument } from "@/components/docvault/DocVaultDocumentCard";
import { useDocVaultCategories } from "@/hooks/useDocVaultCategories";
import { useDocVaultDocuments } from "@/hooks/useDocVaultDocuments";

export default function DocVault() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [showCamera, setShowCamera] = useState(false);
  const [rawCapturedImage, setRawCapturedImage] = useState<string | null>(null);
  const [showScanPreview, setShowScanPreview] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const [uploadDialogOpen, setUploadDialogOpen] = useState(false);
  const [uploadCategoryId, setUploadCategoryId] = useState<string | null>(null);
  
  // Category dialog state
  const [categoryDialogOpen, setCategoryDialogOpen] = useState(false);
  const [categoryDialogMode, setCategoryDialogMode] = useState<"create" | "rename">("create");
  const [categoryToEdit, setCategoryToEdit] = useState<DocVaultCategory | null>(null);
  
  // Move document dialog state
  const [moveDialogOpen, setMoveDialogOpen] = useState(false);
  const [documentToMove, setDocumentToMove] = useState<DocVaultDocument | null>(null);
  
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // Hooks
  const {
    categories,
    createCategory,
    renameCategory,
    deleteCategory,
    isCreating,
    isRenaming,
  } = useDocVaultCategories(user?.id);

  const {
    documents,
    signedUrls,
    frequentlyUsedDocuments,
    getDocumentsByCategory,
    getCategoryDocumentCount,
    moveDocument,
    deleteDocument,
    trackDocumentAccess,
    refetch,
    isMoving,
  } = useDocVaultDocuments(user?.id);

  // Enrich categories with document counts
  const categoriesWithCounts = categories.map((cat) => ({
    ...cat,
    documentCount: getCategoryDocumentCount(cat.id),
  }));

  // Filter documents based on selected category and search
  const displayedDocuments = getDocumentsByCategory(selectedCategory).filter((doc) =>
    doc.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    doc.document_type?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  // Get category name for header
  const getCategoryTitle = () => {
    if (selectedCategory === null) return "All Documents";
    if (selectedCategory === "frequently-used") return "Frequently Used";
    return categories.find((c) => c.id === selectedCategory)?.name || "Documents";
  };

  // Camera functions
  const startCamera = async () => {
    try {
      setShowCamera(true);
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "environment" },
      });
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        try {
          await videoRef.current.play();
        } catch (playErr) {
          console.warn("DocVault video play failed:", playErr);
        }
      }
    } catch (error) {
      console.error("Camera error:", error);
      toast.error("Failed to access camera");
      setShowCamera(false);
    }
  };

  const stopCamera = () => {
    if (videoRef.current?.srcObject) {
      const stream = videoRef.current.srcObject as MediaStream;
      stream.getTracks().forEach((track) => track.stop());
    }
    setShowCamera(false);
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
        const imageData = canvas.toDataURL("image/jpeg", 1.0);
        setRawCapturedImage(imageData);
        setShowScanPreview(true);
        if (videoRef.current?.srcObject) {
          const stream = videoRef.current.srcObject as MediaStream;
          stream.getTracks().forEach((track) => track.stop());
        }
      }
    }
  };

  const handleScanConfirm = async (scannedImage: string) => {
    setShowScanPreview(false);
    await uploadScannedImage(scannedImage, uploadCategoryId);
  };

  const handleScanRetake = () => {
    setRawCapturedImage(null);
    setShowScanPreview(false);
    startCamera();
  };

  const uploadScannedImage = async (imageData: string, categoryId: string | null) => {
    if (!user) return;

    setIsUploading(true);
    try {
      const blob = await (await fetch(imageData)).blob();
      
      const maxSize = 20 * 1024 * 1024;
      if (blob.size > maxSize) {
        throw new Error("File size exceeds 20MB limit");
      }
      
      const { data: profile } = await supabase
        .from("profiles")
        .select("timezone")
        .eq("user_id", user.id)
        .single();
      
      const timezone = profile?.timezone || "UTC";
      const now = Date.now();
      const fileName = `${user.id}/${now}.jpg`;

      const { error: uploadError } = await supabase.storage
        .from("document-images")
        .upload(fileName, blob);

      if (uploadError) throw uploadError;

      const { error: insertError } = await supabase
        .from("documents")
        .insert({
          user_id: user.id,
          name: `Scanned Document ${formatInTimeZone(now, timezone, "MMM dd, yyyy HH:mm")}`,
          document_type: "other",
          image_path: fileName,
          issuing_authority: "DocVault",
          expiry_date: "9999-12-31",
          renewal_period_days: 0,
          docvault_category_id: categoryId,
        });

      if (insertError) throw insertError;

      toast.success("Document saved successfully");
      stopCamera();
      setRawCapturedImage(null);
      setUploadCategoryId(null);
      refetch();
    } catch (error: any) {
      console.error("Upload error:", error);
      toast.error(error?.message || "Failed to save document");
    } finally {
      setIsUploading(false);
    }
  };

  const handleFileUpload = async (file: File, categoryId: string | null, documentName: string) => {
    if (!user) return;

    const maxSize = 20 * 1024 * 1024;
    if (file.size > maxSize) {
      toast.error("File size exceeds 20MB limit");
      return;
    }

    if (file.type === "application/pdf") {
      setIsUploading(true);
      try {
        const docUuid = crypto.randomUUID();
        const filePath = `documents/${user.id}/${docUuid}/document.pdf`;

        const { error: uploadError } = await supabase.storage
          .from("document-images")
          .upload(filePath, file, {
            cacheControl: "3600",
            upsert: false,
            contentType: file.type,
          });

        if (uploadError) throw uploadError;

        const { error: insertError } = await supabase
          .from("documents")
          .insert({
            user_id: user.id,
            name: documentName,
            document_type: "other",
            image_path: filePath,
            issuing_authority: "DocVault",
            expiry_date: "9999-12-31",
            renewal_period_days: 0,
            docvault_category_id: categoryId,
          });

        if (insertError) throw insertError;

        toast.success("Document uploaded successfully");
        refetch();
      } catch (error: any) {
        console.error("Upload error:", error);
        toast.error(error?.message || "Failed to upload document");
      } finally {
        setIsUploading(false);
      }
    } else {
      // For images, show scan preview
      const reader = new FileReader();
      reader.onloadend = () => {
        const result = reader.result as string;
        setRawCapturedImage(result);
        setUploadCategoryId(categoryId);
        setShowScanPreview(true);
      };
      reader.readAsDataURL(file);
    }
  };

  // Category handlers
  const handleCreateCategory = () => {
    setCategoryDialogMode("create");
    setCategoryToEdit(null);
    setCategoryDialogOpen(true);
  };

  const handleRenameCategory = (category: DocVaultCategory) => {
    setCategoryDialogMode("rename");
    setCategoryToEdit(category);
    setCategoryDialogOpen(true);
  };

  const handleCategorySubmit = async (name: string) => {
    if (categoryDialogMode === "create") {
      await createCategory(name);
    } else if (categoryToEdit) {
      renameCategory(categoryToEdit.id, name);
    }
    setCategoryDialogOpen(false);
    setCategoryToEdit(null);
  };

  const handleDeleteCategory = (categoryId: string) => {
    if (selectedCategory === categoryId) {
      setSelectedCategory(null);
    }
    deleteCategory(categoryId);
  };

  // Move document handlers
  const handleMoveDocument = (document: DocVaultDocument) => {
    setDocumentToMove(document);
    setMoveDialogOpen(true);
  };

  const handleMoveConfirm = (categoryId: string | null) => {
    if (documentToMove) {
      moveDocument(documentToMove.id, categoryId);
    }
    setMoveDialogOpen(false);
    setDocumentToMove(null);
  };

  // View document with tracking
  const handleViewDocument = useCallback((docId: string) => {
    trackDocumentAccess(docId);
    navigate(`/documents/${docId}`);
  }, [navigate, trackDocumentAccess]);

  // Delete document
  const handleDeleteDocument = async (docId: string, imagePath: string | null) => {
    setDeletingId(docId);
    await deleteDocument(docId, imagePath);
    setDeletingId(null);
  };

  // Scan document handler from upload dialog
  const handleScanFromDialog = (categoryId: string | null) => {
    setUploadCategoryId(categoryId);
    setUploadDialogOpen(false);
    startCamera();
  };

  // Sidebar content
  const sidebarContent = (
    <DocVaultSidebar
      categories={categoriesWithCounts}
      selectedCategory={selectedCategory}
      onSelectCategory={(cat) => {
        setSelectedCategory(cat);
        setMobileSidebarOpen(false);
      }}
      onCreateCategory={handleCreateCategory}
      onRenameCategory={handleRenameCategory}
      onDeleteCategory={handleDeleteCategory}
      frequentlyUsedCount={frequentlyUsedDocuments.length}
      allDocumentsCount={documents.length}
    />
  );

  return (
    <SafeAreaContainer>
      <div 
        className="min-h-screen bg-background flex w-full overflow-x-hidden" 
        style={{ paddingBottom: "calc(5rem + env(safe-area-inset-bottom))" }}
      >
        {/* Desktop Sidebar */}
        <div className="hidden md:block w-64 shrink-0 h-screen sticky top-0">
          {sidebarContent}
        </div>

        {/* Main Content */}
        <div className="flex-1 flex flex-col min-w-0">
          {/* Header */}
          <div className="sticky top-0 z-40 bg-gradient-to-b from-primary/10 to-background backdrop-blur-xl border-b border-border/50">
            <div className="w-full py-4 px-4">
              <div className="flex items-center gap-3 mb-2">
                {/* Mobile menu toggle */}
                <Sheet open={mobileSidebarOpen} onOpenChange={setMobileSidebarOpen}>
                  <SheetTrigger asChild>
                    <Button variant="ghost" size="icon" className="md:hidden">
                      <Menu className="h-5 w-5" />
                    </Button>
                  </SheetTrigger>
                  <SheetContent side="left" className="p-0 w-72">
                    {sidebarContent}
                  </SheetContent>
                </Sheet>
                
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    {selectedCategory === "frequently-used" ? (
                      <Star className="h-5 w-5 text-amber-500" />
                    ) : (
                      <FolderOpen className="h-5 w-5 text-primary" />
                    )}
                    <h1 className="text-2xl font-semibold">{getCategoryTitle()}</h1>
                  </div>
                  <p className="text-sm text-muted-foreground mt-1">
                    {displayedDocuments.length} document{displayedDocuments.length !== 1 ? "s" : ""}
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* Content */}
          <div className="flex-1 py-6 px-4 space-y-6">
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
                  onClick={() => {
                    setUploadCategoryId(selectedCategory === "frequently-used" ? null : selectedCategory);
                    startCamera();
                  }}
                  variant="outline"
                  className="gap-2"
                >
                  <CameraIcon className="h-4 w-4" />
                  Scan
                </Button>
                <Button
                  onClick={() => setUploadDialogOpen(true)}
                  variant="default"
                  className="gap-2"
                  disabled={isUploading}
                >
                  <Upload className="h-4 w-4" />
                  Upload
                </Button>
              </div>
            </div>

            {/* Stats */}
            <div className="grid grid-cols-2 gap-3">
              <Card className="w-full rounded-2xl p-4 shadow-sm">
                <div className="text-2xl font-semibold">{documents.length}</div>
                <div className="text-sm text-muted-foreground">Total Documents</div>
              </Card>
              <Card className="w-full rounded-2xl p-4 shadow-sm">
                <div className="text-2xl font-semibold">{categories.length}</div>
                <div className="text-sm text-muted-foreground">Categories</div>
              </Card>
            </div>

            {/* Documents Grid */}
            {displayedDocuments.length === 0 ? (
              <Card className="w-full rounded-2xl p-8 text-center shadow-sm">
                <FileText className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
                <h3 className="text-lg font-semibold mb-2">
                  {selectedCategory === "frequently-used"
                    ? "No frequently used documents yet"
                    : searchQuery
                    ? "No documents found"
                    : "No documents yet"}
                </h3>
                <p className="text-muted-foreground mb-4 text-sm">
                  {selectedCategory === "frequently-used"
                    ? "Documents you view often will appear here automatically"
                    : "Start by uploading or scanning your first document"}
                </p>
                {selectedCategory !== "frequently-used" && !searchQuery && (
                  <div className="flex flex-col sm:flex-row gap-2 justify-center max-w-sm mx-auto">
                    <Button 
                      variant="outline" 
                      className="w-full sm:w-auto"
                      onClick={() => {
                        setUploadCategoryId(selectedCategory);
                        startCamera();
                      }}
                    >
                      <CameraIcon className="h-4 w-4 mr-2" />
                      Scan
                    </Button>
                    <Button 
                      onClick={() => setUploadDialogOpen(true)} 
                      variant="default" 
                      className="w-full sm:w-auto"
                    >
                      <Upload className="h-4 w-4 mr-2" />
                      Upload
                    </Button>
                  </div>
                )}
              </Card>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {displayedDocuments.map((doc) => (
                  <DocVaultDocumentCard
                    key={doc.id}
                    document={doc}
                    signedUrl={signedUrls.get(doc.image_path || "") || null}
                    onView={handleViewDocument}
                    onDelete={handleDeleteDocument}
                    onMove={handleMoveDocument}
                    isDeleting={deletingId === doc.id}
                    showFrequentBadge={
                      selectedCategory !== "frequently-used" &&
                      frequentlyUsedDocuments.some((f) => f.id === doc.id)
                    }
                  />
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Camera Dialog */}
        <Dialog open={showCamera && !showScanPreview} onOpenChange={(open) => {
          if (!open) stopCamera();
        }}>
          <DialogContent className="max-w-4xl">
            <DialogHeader>
              <DialogTitle>Scan Document</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <video
                ref={videoRef}
                autoPlay
                playsInline
                muted
                className="w-full rounded-lg bg-black"
              />
              <div className="flex gap-2 justify-center">
                <Button onClick={capturePhoto} size="lg">
                  <CameraIcon className="h-5 w-5 mr-2" />
                  Capture
                </Button>
                <Button onClick={stopCamera} variant="outline" size="lg">
                  <X className="h-5 w-5 mr-2" />
                  Cancel
                </Button>
              </div>
            </div>
            <canvas ref={canvasRef} className="hidden" />
          </DialogContent>
        </Dialog>

        {/* Scan Preview Dialog */}
        <Dialog open={showScanPreview} onOpenChange={(open) => {
          if (!open) {
            setRawCapturedImage(null);
            setShowScanPreview(false);
          }
        }}>
          <DialogContent className="max-w-4xl">
            <DialogHeader>
              <DialogTitle>Review Scanned Document</DialogTitle>
            </DialogHeader>
            {rawCapturedImage && (
              <DocumentScanPreview
                imageSource={rawCapturedImage}
                onConfirm={handleScanConfirm}
                onRetake={handleScanRetake}
              />
            )}
          </DialogContent>
        </Dialog>

        {/* Upload Dialog */}
        <UploadDocumentDialog
          open={uploadDialogOpen}
          onOpenChange={setUploadDialogOpen}
          categories={categories}
          onUpload={handleFileUpload}
          onCreateCategory={createCategory}
          onScanDocument={handleScanFromDialog}
        />

        {/* Category Dialog */}
        <CategoryDialog
          open={categoryDialogOpen}
          onOpenChange={setCategoryDialogOpen}
          onSubmit={handleCategorySubmit}
          mode={categoryDialogMode}
          initialName={categoryToEdit?.name || ""}
          isLoading={isCreating || isRenaming}
        />

        {/* Move Document Dialog */}
        <MoveDocumentDialog
          open={moveDialogOpen}
          onOpenChange={setMoveDialogOpen}
          categories={categories}
          currentCategoryId={documentToMove?.docvault_category_id || null}
          documentName={documentToMove?.name || ""}
          onMove={handleMoveConfirm}
          isLoading={isMoving}
        />

        <BottomNavigation />
      </div>
    </SafeAreaContainer>
  );
}
