import { useState, useEffect, useMemo, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { getSignedUrls } from "@/utils/signedUrl";

interface DocVaultDocument {
  id: string;
  name: string;
  document_type: string;
  image_path: string | null;
  created_at: string;
  docvault_category_id: string | null;
  access_count: number;
  last_accessed_at: string | null;
}

export function useDocVaultDocuments(userId: string | undefined) {
  const queryClient = useQueryClient();
  const [signedUrls, setSignedUrls] = useState<Map<string, string>>(new Map());

  // Fetch all DocVault documents
  const { data: documents = [], isLoading: documentsLoading, refetch } = useQuery({
    queryKey: ["docvault-documents", userId],
    queryFn: async () => {
      if (!userId) return [];
      
      const { data, error } = await supabase
        .from("documents")
        .select("id, name, document_type, image_path, created_at, docvault_category_id, access_count, last_accessed_at")
        .eq("user_id", userId)
        .eq("issuing_authority", "DocVault")
        .order("created_at", { ascending: false });

      if (error) throw error;
      return (data || []) as DocVaultDocument[];
    },
    enabled: !!userId,
  });

  // Fetch signed URLs when documents change
  useEffect(() => {
    const fetchSignedUrls = async () => {
      const imagePaths = documents
        .filter((doc) => doc.image_path)
        .map((doc) => doc.image_path as string);

      if (imagePaths.length > 0) {
        const urls = await getSignedUrls("document-images", imagePaths);
        setSignedUrls(urls);
      }
    };

    if (documents.length > 0) {
      fetchSignedUrls();
    }
  }, [documents]);

  // Frequently used documents (top 5 by access count)
  const frequentlyUsedDocuments = useMemo(() => {
    return documents
      .filter((doc) => (doc.access_count || 0) > 0)
      .sort((a, b) => (b.access_count || 0) - (a.access_count || 0))
      .slice(0, 5);
  }, [documents]);

  // Get documents by category
  const getDocumentsByCategory = useCallback((categoryId: string | null) => {
    if (categoryId === null) {
      return documents; // All documents
    }
    if (categoryId === "frequently-used") {
      return frequentlyUsedDocuments;
    }
    return documents.filter((doc) => doc.docvault_category_id === categoryId);
  }, [documents, frequentlyUsedDocuments]);

  // Count documents per category
  const getCategoryDocumentCount = useCallback((categoryId: string) => {
    return documents.filter((doc) => doc.docvault_category_id === categoryId).length;
  }, [documents]);

  // Move document mutation
  const moveDocumentMutation = useMutation({
    mutationFn: async ({ documentId, categoryId }: { documentId: string; categoryId: string | null }) => {
      const { error } = await supabase
        .from("documents")
        .update({ docvault_category_id: categoryId })
        .eq("id", documentId);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["docvault-documents", userId] });
      toast.success("Document moved");
    },
    onError: (error: any) => {
      toast.error(error?.message || "Failed to move document");
    },
  });

  // Track document access
  const trackDocumentAccess = useCallback(async (documentId: string) => {
    const { error } = await supabase
      .from("documents")
      .update({
        access_count: documents.find((d) => d.id === documentId)?.access_count 
          ? documents.find((d) => d.id === documentId)!.access_count + 1 
          : 1,
        last_accessed_at: new Date().toISOString(),
      })
      .eq("id", documentId);

    if (!error) {
      queryClient.invalidateQueries({ queryKey: ["docvault-documents", userId] });
    }
  }, [documents, queryClient, userId]);

  // Delete document
  const deleteDocument = useCallback(async (docId: string, imagePath: string | null) => {
    try {
      if (imagePath) {
        await supabase.storage.from("document-images").remove([imagePath]);
      }

      const { error } = await supabase
        .from("documents")
        .delete()
        .eq("id", docId);

      if (error) throw error;

      toast.success("Document deleted");
      refetch();
    } catch (error: any) {
      console.error("Error deleting document:", error);
      toast.error(error?.message || "Failed to delete document");
    }
  }, [refetch]);

  const moveDocument = useCallback((documentId: string, categoryId: string | null) => {
    moveDocumentMutation.mutate({ documentId, categoryId });
  }, [moveDocumentMutation]);

  return {
    documents,
    documentsLoading,
    signedUrls,
    frequentlyUsedDocuments,
    getDocumentsByCategory,
    getCategoryDocumentCount,
    moveDocument,
    deleteDocument,
    trackDocumentAccess,
    refetch,
    isMoving: moveDocumentMutation.isPending,
  };
}
