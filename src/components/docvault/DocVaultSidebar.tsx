import { useState } from "react";
import { FolderOpen, Star, Plus, MoreVertical, Pencil, Trash2, Folder } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
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
} from "@/components/ui/alert-dialog";
import { cn } from "@/lib/utils";

export interface DocVaultCategory {
  id: string;
  name: string;
  user_id: string;
  created_at: string;
  documentCount?: number;
}

interface DocVaultSidebarProps {
  categories: DocVaultCategory[];
  selectedCategory: string | null;
  onSelectCategory: (categoryId: string | null) => void;
  onCreateCategory: () => void;
  onRenameCategory: (category: DocVaultCategory) => void;
  onDeleteCategory: (categoryId: string) => void;
  frequentlyUsedCount: number;
  allDocumentsCount: number;
}

export function DocVaultSidebar({
  categories,
  selectedCategory,
  onSelectCategory,
  onCreateCategory,
  onRenameCategory,
  onDeleteCategory,
  frequentlyUsedCount,
  allDocumentsCount,
}: DocVaultSidebarProps) {
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [categoryToDelete, setCategoryToDelete] = useState<DocVaultCategory | null>(null);

  const handleDeleteClick = (category: DocVaultCategory) => {
    setCategoryToDelete(category);
    setDeleteDialogOpen(true);
  };

  const confirmDelete = () => {
    if (categoryToDelete) {
      onDeleteCategory(categoryToDelete.id);
    }
    setDeleteDialogOpen(false);
    setCategoryToDelete(null);
  };

  return (
    <div className="w-full h-full flex flex-col bg-card border-r border-border">
      {/* Header */}
      <div className="p-4 border-b border-border">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">Categories</h2>
          <Button
            variant="ghost"
            size="icon"
            onClick={onCreateCategory}
            className="h-8 w-8"
          >
            <Plus className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Categories List */}
      <ScrollArea className="flex-1">
        <div className="p-2 space-y-1">
          {/* All Documents */}
          <button
            onClick={() => onSelectCategory(null)}
            className={cn(
              "w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-left transition-colors",
              selectedCategory === null
                ? "bg-primary/10 text-primary"
                : "hover:bg-muted"
            )}
          >
            <FolderOpen className="h-4 w-4 shrink-0" />
            <span className="flex-1 truncate font-medium">All Documents</span>
            <span className="text-xs text-muted-foreground">{allDocumentsCount}</span>
          </button>

          {/* Frequently Used */}
          <button
            onClick={() => onSelectCategory("frequently-used")}
            className={cn(
              "w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-left transition-colors",
              selectedCategory === "frequently-used"
                ? "bg-primary/10 text-primary"
                : "hover:bg-muted"
            )}
          >
            <Star className="h-4 w-4 shrink-0 text-amber-500" />
            <span className="flex-1 truncate font-medium">Frequently Used</span>
            <span className="text-xs text-muted-foreground">{frequentlyUsedCount}</span>
          </button>

          {/* Divider */}
          {categories.length > 0 && (
            <div className="my-2 border-t border-border" />
          )}

          {/* User Categories */}
          {categories.map((category) => (
            <div
              key={category.id}
              className={cn(
                "group flex items-center gap-2 rounded-lg transition-colors",
                selectedCategory === category.id
                  ? "bg-primary/10"
                  : "hover:bg-muted"
              )}
            >
              <button
                onClick={() => onSelectCategory(category.id)}
                className="flex-1 flex items-center gap-3 px-3 py-2.5 text-left"
              >
                <Folder className="h-4 w-4 shrink-0 text-primary" />
                <span className={cn(
                  "flex-1 truncate",
                  selectedCategory === category.id && "text-primary font-medium"
                )}>
                  {category.name}
                </span>
                {category.documentCount !== undefined && (
                  <span className="text-xs text-muted-foreground">
                    {category.documentCount}
                  </span>
                )}
              </button>

              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 mr-1 opacity-0 group-hover:opacity-100 transition-opacity"
                  >
                    <MoreVertical className="h-3.5 w-3.5" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onClick={() => onRenameCategory(category)}>
                    <Pencil className="h-4 w-4 mr-2" />
                    Rename
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onClick={() => handleDeleteClick(category)}
                    className="text-destructive focus:text-destructive"
                  >
                    <Trash2 className="h-4 w-4 mr-2" />
                    Delete
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          ))}
        </div>
      </ScrollArea>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Category</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete "{categoryToDelete?.name}"? 
              Documents in this category will be moved to "All Documents".
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
