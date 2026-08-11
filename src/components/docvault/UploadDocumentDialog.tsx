import { useState, useEffect, useRef } from "react";
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
import { Upload, FileText, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { usePdfPicker, formatFileSize, MAX_PDF_SIZE } from "@/hooks/usePdfPicker";
import { UploadCategorySelect } from "./UploadCategorySelect";
import type { DocVaultCategory } from "./DocVaultSidebar";

interface UploadDocumentDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  categories: DocVaultCategory[];
  onUpload: (file: File, categoryId: string | null, documentName: string) => Promise<void>;
  onCreateCategory: (name: string) => Promise<string | null>;
  onScanDocument?: (categoryId: string | null) => void;
}

export function UploadDocumentDialog({
  open,
  onOpenChange,
  categories,
  onUpload,
  onCreateCategory,
}: UploadDocumentDialogProps) {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [selectedCategoryId, setSelectedCategoryId] = useState<string | null>(null);
  const [documentName, setDocumentName] = useState("");
  const [isUploading, setIsUploading] = useState(false);
  const pickerLaunchedRef = useRef(false);
  const { pickPdf, isPicking } = usePdfPicker();

  const applyFile = (file: File) => {
    setSelectedFile(file);
    setDocumentName(file.name.replace(/\.[^/.]+$/, ""));
    if (file.type.startsWith("image/")) {
      const reader = new FileReader();
      reader.onloadend = () => setPreviewUrl(reader.result as string);
      reader.readAsDataURL(file);
    } else {
      setPreviewUrl(null);
    }
  };

  const handleChooseFromFiles = async () => {
    const result = await pickPdf();
    if ("file" in result) {
      applyFile(result.file);
      return true;
    }
    switch (result.kind) {
      case "cancelled":
        return false; // graceful, no error
      case "invalid-type":
        toast.error("Please select a PDF file");
        return false;
      case "too-large":
        toast.error(
          `File is ${formatFileSize(result.size)} — limit is ${formatFileSize(MAX_PDF_SIZE)}`
        );
        return false;
      default:
        toast.error(result.message || "Could not open the file picker");
        return false;
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

  const handleClose = () => {
    setSelectedFile(null);
    setPreviewUrl(null);
    setSelectedCategoryId(null);
    setDocumentName("");
    onOpenChange(false);
  };

  // Open the native system file picker directly when the flow starts.
  useEffect(() => {
    if (!open) {
      pickerLaunchedRef.current = false;
      return;
    }
    if (pickerLaunchedRef.current || selectedFile) return;
    pickerLaunchedRef.current = true;
    (async () => {
      const ok = await handleChooseFromFiles();
      if (!ok) handleClose();
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const isPdf = selectedFile?.type === "application/pdf";

  if (open && !selectedFile) {
    // Native picker is in front of the user — keep the UI out of the way.
    return null;
  }

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
                    <span className="text-xs">{formatFileSize(selectedFile.size)}</span>
                  </div>
                ) : null}
              </div>

              <p className="text-xs text-muted-foreground truncate">
                {selectedFile.name} · {formatFileSize(selectedFile.size)}
              </p>

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
                disabled={isPicking}
                onClick={() => {
                  handleChooseFromFiles();
                }}
              >
                {isPicking ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Opening Files…
                  </>
                ) : (
                  "Choose Different File"
                )}
              </Button>
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
