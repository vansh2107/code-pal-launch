import { useState, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import type { DocVaultCategory } from "@/components/docvault/DocVaultSidebar";

export function useDocVaultCategories(userId: string | undefined) {
  const queryClient = useQueryClient();

  // Fetch categories
  const { data: categories = [], isLoading: categoriesLoading } = useQuery({
    queryKey: ["docvault-categories", userId],
    queryFn: async () => {
      if (!userId) return [];
      
      const { data, error } = await supabase
        .from("docvault_categories")
        .select("*")
        .eq("user_id", userId)
        .order("name", { ascending: true });

      if (error) throw error;
      return data as DocVaultCategory[];
    },
    enabled: !!userId,
  });

  // Create category mutation
  const createCategoryMutation = useMutation({
    mutationFn: async (name: string) => {
      if (!userId) throw new Error("User not authenticated");
      
      const { data, error } = await supabase
        .from("docvault_categories")
        .insert({ user_id: userId, name })
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["docvault-categories", userId] });
      toast.success("Category created");
    },
    onError: (error: any) => {
      toast.error(error?.message || "Failed to create category");
    },
  });

  // Rename category mutation
  const renameCategoryMutation = useMutation({
    mutationFn: async ({ id, name }: { id: string; name: string }) => {
      const { error } = await supabase
        .from("docvault_categories")
        .update({ name })
        .eq("id", id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["docvault-categories", userId] });
      toast.success("Category renamed");
    },
    onError: (error: any) => {
      toast.error(error?.message || "Failed to rename category");
    },
  });

  // Delete category mutation
  const deleteCategoryMutation = useMutation({
    mutationFn: async (categoryId: string) => {
      // First, update all documents in this category to have no category
      const { error: updateError } = await supabase
        .from("documents")
        .update({ docvault_category_id: null })
        .eq("docvault_category_id", categoryId);

      if (updateError) throw updateError;

      // Then delete the category
      const { error: deleteError } = await supabase
        .from("docvault_categories")
        .delete()
        .eq("id", categoryId);

      if (deleteError) throw deleteError;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["docvault-categories", userId] });
      queryClient.invalidateQueries({ queryKey: ["docvault-documents", userId] });
      toast.success("Category deleted");
    },
    onError: (error: any) => {
      toast.error(error?.message || "Failed to delete category");
    },
  });

  const createCategory = useCallback(async (name: string): Promise<string | null> => {
    try {
      const result = await createCategoryMutation.mutateAsync(name);
      return result.id;
    } catch {
      return null;
    }
  }, [createCategoryMutation]);

  const renameCategory = useCallback((id: string, name: string) => {
    renameCategoryMutation.mutate({ id, name });
  }, [renameCategoryMutation]);

  const deleteCategory = useCallback((id: string) => {
    deleteCategoryMutation.mutate(id);
  }, [deleteCategoryMutation]);

  return {
    categories,
    categoriesLoading,
    createCategory,
    renameCategory,
    deleteCategory,
    isCreating: createCategoryMutation.isPending,
    isRenaming: renameCategoryMutation.isPending,
    isDeleting: deleteCategoryMutation.isPending,
  };
}
