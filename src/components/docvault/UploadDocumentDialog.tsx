import { useState, useRef } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Upload, Camera, FileText, Image as ImageIcon } from "lucide-react";
import { UploadCategorySelect } from "./UploadCategorySelect";
import type { DocVaultCategory } from "./DocVaultSidebar";

interface UploadDocumentDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  categories: DocVaultCategory[];
  onUpload: (file: File, categoryId: string | null, documentName: string) => Promise<void>;
  onCreateCategory: (name: string) => Promise<string | null>;
  onScanDocument: (categoryId: string | null) => void;
}

export function UploadDocumentDialog({
  open,
  onOpenChange,
  categories,
  onUpload,
  onCreateCategory,
  onScanDocument,
}: UploadDocumentDialogProps) {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [selectedCategoryId, setSelectedCategoryId] = useState<string | null>(null);
  const [documentName, setDocumentName] = useState("");
  const [isUploading, setIsUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setSelectedFile(file);
      setDocumentName(file.name.replace(/\.[^/.]+$/, "")); // Remove extension
      
      // Create preview for images
      if (file.type.startsWith("image/")) {
        const reader = new FileReader();
        reader.onloadend = () => {
          setPreviewUrl(reader.result as string);
        };
        reader.readAsDataURL(file);
      } else if (file.type === "application/pdf") {
        setPreviewUrl(null); // PDF preview handled separately
      }
    }
  };

  const handleUpload = async () => {
    if (!selectedFile) return;
    
    setIsUploading(true);
    try {
      await onUpload(selectedFile, selectedCategoryId, documentName || selectedFile.name);
      handleClose();
    } finally {
      setIsUploading(false);
    }
  };

  const handleScanClick = () => {
    onScanDocument(selectedCategoryId);
    handleClose();
  };

  const handleClose = () => {
    setSelectedFile(null);
    setPreviewUrl(null);
    setSelectedCategoryId(null);
    setDocumentName("");
    onOpenChange(false);
  };

  const isPdf = selectedFile?.type === "application/pdf";

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Upload className="h-5 w-5 text-primary" />
            Upload Document
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* Upload Options */}
          {!selectedFile && (
            <div className="grid grid-cols-2 gap-3">
              <Button
                variant="outline"
                className="h-24 flex flex-col gap-2"
                onClick={() => fileInputRef.current?.click()}
              >
                <ImageIcon className="h-6 w-6 text-primary" />
                <span className="text-sm">Choose File</span>
              </Button>
              <Button
                variant="outline"
                className="h-24 flex flex-col gap-2"
                onClick={handleScanClick}
              >
                <Camera className="h-6 w-6 text-primary" />
                <span className="text-sm">Scan Document</span>
              </Button>
            </div>
          )}

          <input
            ref={fileInputRef}
            type="file"
            accept="image/*,application/pdf"
            onChange={handleFileChange}
            className="hidden"
          />

          {/* File Preview */}
          {selectedFile && (
            <div className="space-y-4">
              <div className="border rounded-lg overflow-hidden bg-muted">
                {previewUrl ? (
                  <img
                    src={previewUrl}
                    alt="Preview"
                    className="w-full max-h-48 object-contain"
                  />
                ) : isPdf ? (
                  <div className="h-32 flex flex-col items-center justify-center gap-2 text-muted-foreground">
                    <FileText className="h-10 w-10" />
                    <span className="text-sm">{selectedFile.name}</span>
                  </div>
                ) : null}
              </div>

              <div className="space-y-2">
                <Label htmlFor="doc-name">Document Name</Label>
                <Input
                  id="doc-name"
                  value={documentName}
                  onChange={(e) => setDocumentName(e.target.value)}
                  placeholder="Enter document name"
                />
              </div>

              <div className="space-y-2">
                <Label>Category (Optional)</Label>
                <UploadCategorySelect
                  categories={categories}
                  selectedCategoryId={selectedCategoryId}
                  onSelectCategory={setSelectedCategoryId}
                  onCreateCategory={onCreateCategory}
                />
              </div>

              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setSelectedFile(null);
                  setPreviewUrl(null);
                  setDocumentName("");
                }}
              >
                Choose Different File
              </Button>
            </div>
          )}

          {/* Category Selection (when no file selected yet) */}
          {!selectedFile && (
            <div className="space-y-2">
              <Label>Category (Optional)</Label>
              <UploadCategorySelect
                categories={categories}
                selectedCategoryId={selectedCategoryId}
                onSelectCategory={setSelectedCategoryId}
                onCreateCategory={onCreateCategory}
              />
              <p className="text-xs text-muted-foreground">
                Select a category before uploading or scanning
              </p>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={handleClose} disabled={isUploading}>
            Cancel
          </Button>
          {selectedFile && (
            <Button onClick={handleUpload} disabled={isUploading}>
              {isUploading ? "Uploading..." : "Upload"}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
