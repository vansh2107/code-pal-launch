import { useState, useRef, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { AppShell } from "@/components/layout/AppShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/hooks/useAuth";
import { Upload, Camera as CameraIcon, Search, Menu, X, FolderOpen } from "lucide-react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DocumentScanPreview } from "@/components/scan/DocumentScanPreview";
import { DocVaultSidebar, type DocVaultCategory } from "@/components/docvault/DocVaultSidebar";
import { CategoryDialog } from "@/components/docvault/CategoryDialog";
import { UploadDocumentDialog } from "@/components/docvault/UploadDocumentDialog";
import { MoveDocumentDialog } from "@/components/docvault/MoveDocumentDialog";
import { DocVaultDocumentCard, type DocVaultDocument } from "@/components/docvault/DocVaultDocumentCard";
import { useDocVaultCategories } from "@/hooks/useDocVaultCategories";
import { useDocVaultDocuments } from "@/hooks/useDocVaultDocuments";
import { cn } from "@/lib/utils";
import { useIsMobile } from "@/hooks/use-mobile";
import { supabase } from "@/integrations/supabase/client";
import { uploadDocumentOriginal } from "@/utils/documentStorage";


export default function DocVault() {
  const isMobile = useIsMobile();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [uploadDialogOpen, setUploadDialogOpen] = useState(false);
  const [showCamera, setShowCamera] = useState(false);
  const [rawCapturedImage, setRawCapturedImage] = useState<string | null>(null);
  const [showScanPreview, setShowScanPreview] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  
  const [categoryDialogOpen, setCategoryDialogOpen] = useState(false);
  const [categoryDialogMode, setCategoryDialogMode] = useState<"create" | "rename">("create");
  const [categoryToEdit, setCategoryToEdit] = useState<DocVaultCategory | null>(null);
  
  const [moveDialogOpen, setMoveDialogOpen] = useState(false);
  const [documentToMove, setDocumentToMove] = useState<DocVaultDocument | null>(null);
  
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const { categories, createCategory, renameCategory, deleteCategory, isCreating, isRenaming } = useDocVaultCategories(user?.id);
  const { documents, signedUrls, frequentlyUsedDocuments, getDocumentsByCategory, moveDocument, deleteDocument, refetch, isMoving } = useDocVaultDocuments(user?.id);

  const displayedDocuments = useMemo(() => {
    const docs = getDocumentsByCategory(selectedCategory);
    return docs.filter((doc) => doc.name.toLowerCase().includes(searchQuery.toLowerCase()));
  }, [documents, selectedCategory, searchQuery, getDocumentsByCategory]);

  const allDocumentsCount = useMemo(() => documents.length, [documents]);
  const frequentlyUsedCount = useMemo(() => frequentlyUsedDocuments.length, [frequentlyUsedDocuments]);

  // Camera logic
  const startCamera = async (_categoryId?: string | null) => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } });
      if (videoRef.current) videoRef.current.srcObject = stream;
      setShowCamera(true);
    } catch (err) {
      toast.error("Could not access camera");
    }
  };

  const stopCamera = () => {
    const stream = videoRef.current?.srcObject as MediaStream;
    stream?.getTracks().forEach((track) => track.stop());
    setShowCamera(false);
  };

  const capturePhoto = () => {
    if (videoRef.current && canvasRef.current) {
      const context = canvasRef.current.getContext("2d");
      if (context) {
        canvasRef.current.width = videoRef.current.videoWidth;
        canvasRef.current.height = videoRef.current.videoHeight;
        context.drawImage(videoRef.current, 0, 0);
        setRawCapturedImage(canvasRef.current.toDataURL("image/jpeg"));
        setShowScanPreview(true);
      }
    }
  };

  const handleFileUpload = async (file: File, categoryId: string | null, documentName: string) => {
    if (!user?.id) {
      toast.error("You must be signed in to upload documents.");
      return;
    }

    if (!file.type.startsWith("image/") && file.type !== "application/pdf") {
      toast.error("Unsupported file type. Please upload an image or PDF.");
      return;
    }

    try {
      setIsUploading(true);
      const storagePath = await uploadDocumentOriginal(file, user.id);

      if (!storagePath) {
        throw new Error("The document upload was not completed.");
      }

      const { error } = await supabase
        .from("documents")
        .insert({
          user_id: user.id,
          name: (documentName || file.name).trim() || file.name,
          document_type: "other",
          image_path: storagePath,
          issuing_authority: "DocVault",
          docvault_category_id: categoryId,
          category_detail: "uploaded",
          updated_at: new Date().toISOString(),
        });

      if (error) {
        throw error;
      }

      toast.success("Document uploaded");
      await refetch();
    } catch (error: any) {
      console.error("DocVault upload failed:", error);
      toast.error(error?.message || "Failed to upload document. Please try again.");
      throw error;
    } finally {
      setIsUploading(false);
    }
  };

  const handleCategorySubmit = async (name: string) => {
    if (categoryDialogMode === "create") {
      const newId = await createCategory(name);
      if (newId) {
        setSelectedCategory(newId);
      }
    } else if (categoryToEdit) {
      await renameCategory(categoryToEdit.id, name);
    }

    setCategoryDialogOpen(false);
    setCategoryToEdit(null);
  };

  const handleDeleteDocument = async (docId: string, imagePath: string | null) => {
    setDeletingId(docId);
    try {
      await deleteDocument(docId, imagePath);
    } finally {
      setDeletingId(null);
    }
  };

  const handleViewDocument = (docId: string) => {
    void trackDocumentAccess(docId);
    navigate(`/documents/${docId}`);
  };

  const handleMoveDocument = (doc: DocVaultDocument) => {
    setDocumentToMove(doc);
    setMoveDialogOpen(true);
  };

  const handleMoveConfirm = async (categoryId: string | null) => {
    if (!documentToMove) {
      return;
    }

    await moveDocument(documentToMove.id, categoryId);
    setMoveDialogOpen(false);
    setDocumentToMove(null);
  };

  return (
    <AppShell contentWidth="full" showMobileNavSpacing={true} contentPadding={false}>
      <div className="flex h-screen flex-col md:flex-row bg-background">
        <div className={cn("hidden md:block w-72 h-full border-r border-border bg-card", isMobile && "hidden")}>
          <DocVaultSidebar 
            categories={categories}
            selectedCategory={selectedCategory}
            onSelectCategory={(cat) => { setSelectedCategory(cat); setIsSidebarOpen(false); }}
            onCreateCategory={() => { setCategoryDialogMode("create"); setCategoryDialogOpen(true); }}
            onRenameCategory={(cat) => { setCategoryToEdit(cat); setCategoryDialogMode("rename"); setCategoryDialogOpen(true); }}
            onDeleteCategory={deleteCategory}
            frequentlyUsedCount={frequentlyUsedCount}
            allDocumentsCount={allDocumentsCount}
          />
        </div>

        {isMobile && isSidebarOpen && (
          <div className="fixed inset-0 z-50 bg-background/80 backdrop-blur-sm">
            <div className="absolute left-0 top-0 h-full w-4/5 max-w-xs bg-card shadow-lg">
              <DocVaultSidebar 
                categories={categories}
                selectedCategory={selectedCategory}
                onSelectCategory={(cat) => { setSelectedCategory(cat); setIsSidebarOpen(false); }}
                onCreateCategory={() => { setCategoryDialogMode("create"); setCategoryDialogOpen(true); }}
                onRenameCategory={(cat) => { setCategoryToEdit(cat); setCategoryDialogMode("rename"); setCategoryDialogOpen(true); }}
                onDeleteCategory={deleteCategory}
                frequentlyUsedCount={frequentlyUsedCount}
                allDocumentsCount={allDocumentsCount}
              />
              <Button variant="ghost" className="absolute top-4 right-4" onClick={() => setIsSidebarOpen(false)}>
                <X className="h-5 w-5" />
              </Button>
            </div>
          </div>
        )}

        <div className="flex-1 flex flex-col h-full overflow-y-auto">
          <header className="sticky top-0 z-10 bg-background/80 backdrop-blur-md border-b border-border p-4 flex items-center justify-between">
            <div className="flex items-center gap-3">
              {isMobile && (
                <Button variant="ghost" size="icon" onClick={() => setIsSidebarOpen(true)}>
                  <Menu className="h-5 w-5" />
                </Button>
              )}
              <h1 className="text-xl font-bold">DocVault</h1>
            </div>
            <div className="flex items-center gap-2">
              <Button onClick={() => setUploadDialogOpen(true)} className="gap-2">
                <Upload className="h-4 w-4" />
                <span className="hidden sm:inline">Upload</span>
              </Button>
              <Button onClick={() => startCamera(selectedCategory)} variant="secondary" className="gap-2">
                <CameraIcon className="h-4 w-4" />
                <span className="hidden sm:inline">Scan</span>
              </Button>
            </div>
          </header>

          <main className="p-4 md:p-6 space-y-6">
            <div className="relative">
              <Search className="absolute left-3 top-3.5 h-4 w-4 text-muted-foreground" />
              <Input 
                placeholder="Search documents..." 
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10 h-11 rounded-xl"
              />
            </div>

            {displayedDocuments.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-20 text-center">
                <FolderOpen className="h-16 w-16 text-muted-foreground mb-4 opacity-50" />
                <h3 className="text-lg font-semibold">No documents found</h3>
                <p className="text-muted-foreground">Try adjusting your search or category</p>
              </div>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
                {displayedDocuments.map((doc) => (
                  <DocVaultDocumentCard
                    key={doc.id}
                    document={doc}
                    signedUrl={(doc.image_path && signedUrls.get(doc.image_path)) || null}
                    onView={handleViewDocument}
                    onDelete={handleDeleteDocument}
                    onMove={handleMoveDocument}
                    isDeleting={deletingId === doc.id}
                    showFrequentBadge={selectedCategory === "frequently-used"}
                  />
                ))}
              </div>
            )}
          </main>
        </div>
      </div>
      
      <UploadDocumentDialog
        open={uploadDialogOpen}
        onOpenChange={setUploadDialogOpen}
        categories={categories}
        onUpload={handleFileUpload}
        onCreateCategory={createCategory}
        onScanDocument={startCamera}
      />
      
      <CategoryDialog
        open={categoryDialogOpen}
        onOpenChange={setCategoryDialogOpen}
        onSubmit={handleCategorySubmit}
        mode={categoryDialogMode}
        initialName={categoryToEdit?.name || ""}
        isLoading={isCreating || isRenaming}
      />
      
      <MoveDocumentDialog
        open={moveDialogOpen}
        onOpenChange={setMoveDialogOpen}
        categories={categories}
        currentCategoryId={documentToMove?.docvault_category_id || null}
        documentName={documentToMove?.name || ""}
        onMove={handleMoveConfirm}
        isLoading={isMoving}
      />
    </AppShell>
  );
}
