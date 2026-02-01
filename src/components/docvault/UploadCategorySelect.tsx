import { useState } from "react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Plus, Check, X } from "lucide-react";
import type { DocVaultCategory } from "./DocVaultSidebar";

interface UploadCategorySelectProps {
  categories: DocVaultCategory[];
  selectedCategoryId: string | null;
  onSelectCategory: (categoryId: string | null) => void;
  onCreateCategory: (name: string) => Promise<string | null>;
}

export function UploadCategorySelect({
  categories,
  selectedCategoryId,
  onSelectCategory,
  onCreateCategory,
}: UploadCategorySelectProps) {
  const [showNewCategory, setShowNewCategory] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState("");
  const [isCreating, setIsCreating] = useState(false);

  const handleCreateCategory = async () => {
    if (!newCategoryName.trim()) return;
    
    setIsCreating(true);
    try {
      const newCategoryId = await onCreateCategory(newCategoryName.trim());
      if (newCategoryId) {
        onSelectCategory(newCategoryId);
        setNewCategoryName("");
        setShowNewCategory(false);
      }
    } finally {
      setIsCreating(false);
    }
  };

  const handleCancelCreate = () => {
    setNewCategoryName("");
    setShowNewCategory(false);
  };

  if (showNewCategory) {
    return (
      <div className="space-y-2">
        <div className="flex gap-2">
          <Input
            value={newCategoryName}
            onChange={(e) => setNewCategoryName(e.target.value)}
            placeholder="New category name"
            autoFocus
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                handleCreateCategory();
              } else if (e.key === "Escape") {
                handleCancelCreate();
              }
            }}
          />
          <Button
            type="button"
            size="icon"
            variant="ghost"
            onClick={handleCreateCategory}
            disabled={!newCategoryName.trim() || isCreating}
          >
            <Check className="h-4 w-4 text-green-600" />
          </Button>
          <Button
            type="button"
            size="icon"
            variant="ghost"
            onClick={handleCancelCreate}
            disabled={isCreating}
          >
            <X className="h-4 w-4 text-destructive" />
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex gap-2">
      <Select
        value={selectedCategoryId || "none"}
        onValueChange={(value) => onSelectCategory(value === "none" ? null : value)}
      >
        <SelectTrigger className="flex-1">
          <SelectValue placeholder="Select category (optional)" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="none">No Category</SelectItem>
          {categories.map((category) => (
            <SelectItem key={category.id} value={category.id}>
              {category.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Button
        type="button"
        variant="outline"
        size="icon"
        onClick={() => setShowNewCategory(true)}
        title="Create new category"
      >
        <Plus className="h-4 w-4" />
      </Button>
    </div>
  );
}
