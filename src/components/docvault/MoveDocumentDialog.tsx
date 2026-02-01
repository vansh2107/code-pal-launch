import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { FolderInput } from "lucide-react";
import type { DocVaultCategory } from "./DocVaultSidebar";

interface MoveDocumentDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  categories: DocVaultCategory[];
  currentCategoryId: string | null;
  documentName: string;
  onMove: (categoryId: string | null) => void;
  isLoading?: boolean;
}

export function MoveDocumentDialog({
  open,
  onOpenChange,
  categories,
  currentCategoryId,
  documentName,
  onMove,
  isLoading = false,
}: MoveDocumentDialogProps) {
  const handleMove = (value: string) => {
    onMove(value === "none" ? null : value);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FolderInput className="h-5 w-5 text-primary" />
            Move Document
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-4">
          <p className="text-sm text-muted-foreground">
            Move "<span className="font-medium text-foreground">{documentName}</span>" to:
          </p>
          <div className="space-y-2">
            <Label>Select Category</Label>
            <Select
              defaultValue={currentCategoryId || "none"}
              onValueChange={handleMove}
              disabled={isLoading}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select category" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">No Category (All Documents)</SelectItem>
                {categories
                  .filter((cat) => cat.id !== currentCategoryId)
                  .map((category) => (
                    <SelectItem key={category.id} value={category.id}>
                      {category.name}
                    </SelectItem>
                  ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={isLoading}
          >
            Cancel
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
