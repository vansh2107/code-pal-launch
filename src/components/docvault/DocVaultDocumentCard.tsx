import { memo } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { MoreVertical, Trash2, FolderInput, Eye, Star } from "lucide-react";
import { PDFPreview } from "@/components/document/PDFPreview";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
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

export interface DocVaultDocument {
  id: string;
  name: string;
  image_path: string | null;
  created_at: string;
  access_count?: number;
  docvault_category_id?: string | null;
}

interface DocVaultDocumentCardProps {
  document: DocVaultDocument;
  signedUrl: string | null;
  onView: (docId: string) => void;
  onDelete: (docId: string, imagePath: string | null) => void;
  onMove: (document: DocVaultDocument) => void;
  isDeleting: boolean;
  showFrequentBadge?: boolean;
}

export const DocVaultDocumentCard = memo(function DocVaultDocumentCard({
  document,
  signedUrl,
  onView,
  onDelete,
  onMove,
  isDeleting,
  showFrequentBadge = false,
}: DocVaultDocumentCardProps) {
  const isPdf = document.image_path?.toLowerCase().endsWith('.pdf');

  return (
    <Card className="w-full rounded-2xl group relative overflow-hidden hover:shadow-lg transition-all">
      <div 
        className="cursor-pointer"
        onClick={() => onView(document.id)}
      >
        {document.image_path && signedUrl && (
          <div className="aspect-video bg-muted relative overflow-hidden flex items-center justify-center">
            {isPdf ? (
              <PDFPreview
                pdfUrl={signedUrl}
                className="w-full h-full"
                width={400}
              />
            ) : (
              <img
                src={signedUrl}
                alt={document.name}
                className="w-full h-full object-cover"
              />
            )}
            {showFrequentBadge && (
              <div className="absolute top-2 left-2 bg-amber-500/90 text-white px-2 py-1 rounded-full text-xs flex items-center gap-1">
                <Star className="h-3 w-3" />
                Frequent
              </div>
            )}
          </div>
        )}
        <div className="p-4 space-y-2">
          <h3 className="font-medium truncate">{document.name}</h3>
          <p className="text-xs text-muted-foreground">
            Added: {new Date(document.created_at).toLocaleDateString()}
          </p>
          {document.access_count !== undefined && document.access_count > 0 && (
            <p className="text-xs text-muted-foreground flex items-center gap-1">
              <Eye className="h-3 w-3" />
              Viewed {document.access_count} times
            </p>
          )}
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
              <DropdownMenuItem onClick={() => onMove(document)}>
                <FolderInput className="h-4 w-4 mr-2" />
                Move to Category
              </DropdownMenuItem>
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
                Are you sure you want to delete "{document.name}"? This action cannot be undone.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction
                onClick={() => onDelete(document.id, document.image_path)}
                disabled={isDeleting}
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              >
                {isDeleting ? "Deleting..." : "Delete"}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </Card>
  );
});
