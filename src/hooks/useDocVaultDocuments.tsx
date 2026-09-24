/**
 * src/hooks/useDocVaultDocuments.tsx — Firestore DocVault documents hook
 *
 * Drop-in replacement for the Supabase version.
 * Public API is identical so DocVault pages compile unchanged.
 */

import { useState, useEffect, useMemo, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  collection,
  query,
  where,
  orderBy,
  getDocs,
  doc,
  updateDoc,
  deleteDoc,
} from 'firebase/firestore';
import { firebaseDb } from '@/integrations/firebase/client';
import { deleteStorageFile } from '@/integrations/firebase/storage';
import { getSignedUrls } from '@/utils/signedUrl';
import { toast } from 'sonner';

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

  // ── Fetch ──────────────────────────────────────────────────────────────────
  const { data: documents = [], isLoading: documentsLoading, refetch } = useQuery({
    queryKey: ['docvault-documents', userId],
    queryFn: async () => {
      if (!userId) return [];
      const snap = await getDocs(
        query(
          collection(firebaseDb, `users/${userId}/documents`),
          where('issuingAuthority', '==', 'DocVault'),
          orderBy('createdAt', 'desc'),
        ),
      );
      return snap.docs.map((d) => {
        const data = d.data();
        return {
          id:                   d.id,
          name:                 data.name as string,
          document_type:        data.documentType as string,
          image_path:           (data.imagePath as string | null) ?? null,
          created_at:           data.createdAt as string,
          docvault_category_id: (data.docvaultCategoryId as string | null) ?? null,
          access_count:         (data.accessCount as number) ?? 0,
          last_accessed_at:     (data.lastAccessedAt as string | null) ?? null,
        } as DocVaultDocument;
      });
    },
    enabled: !!userId,
  });

  // ── Signed URLs ────────────────────────────────────────────────────────────
  useEffect(() => {
    const fetchSignedUrls = async () => {
      const imagePaths = documents
        .filter((d) => d.image_path)
        .map((d) => d.image_path as string);
      if (imagePaths.length > 0) {
        const urls = await getSignedUrls('document-images', imagePaths);
        setSignedUrls(urls);
      }
    };
    if (documents.length > 0) fetchSignedUrls();
  }, [documents]);

  // ── Frequently used ────────────────────────────────────────────────────────
  const frequentlyUsedDocuments = useMemo(() => {
    const threeDaysAgo = new Date();
    threeDaysAgo.setDate(threeDaysAgo.getDate() - 3);
    return documents
      .filter((d) => {
        const count       = d.access_count ?? 0;
        const lastAccess  = d.last_accessed_at ? new Date(d.last_accessed_at) : null;
        return count >= 3 && lastAccess && lastAccess >= threeDaysAgo;
      })
      .sort((a, b) => (b.access_count ?? 0) - (a.access_count ?? 0))
      .slice(0, 5);
  }, [documents]);

  // ── Category filters ───────────────────────────────────────────────────────
  const getDocumentsByCategory = useCallback(
    (categoryId: string | null) => {
      if (categoryId === null) return documents;
      if (categoryId === 'frequently-used') return frequentlyUsedDocuments;
      return documents.filter((d) => d.docvault_category_id === categoryId);
    },
    [documents, frequentlyUsedDocuments],
  );

  const getCategoryDocumentCount = useCallback(
    (categoryId: string) =>
      documents.filter((d) => d.docvault_category_id === categoryId).length,
    [documents],
  );

  // ── Move document ──────────────────────────────────────────────────────────
  const moveDocumentMutation = useMutation({
    mutationFn: async ({
      documentId,
      categoryId,
    }: {
      documentId: string;
      categoryId: string | null;
    }) => {
      if (!userId) throw new Error('Not authenticated');
      await updateDoc(doc(firebaseDb, `users/${userId}/documents/${documentId}`), {
        docvaultCategoryId: categoryId,
        updatedAt:          new Date().toISOString(),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['docvault-documents', userId] });
      toast.success('Document moved');
    },
    onError: (error: unknown) => {
      toast.error(error instanceof Error ? error.message : 'Failed to move document');
    },
  });

  // ── Track access ───────────────────────────────────────────────────────────
  const trackDocumentAccess = useCallback(
    async (documentId: string) => {
      if (!userId) return;
      const docData = documents.find((d) => d.id === documentId);
      const newCount = (docData?.access_count ?? 0) + 1;
      await updateDoc(doc(firebaseDb, `users/${userId}/documents/${documentId}`), {
        accessCount:    newCount,
        lastAccessedAt: new Date().toISOString(),
      });
      queryClient.invalidateQueries({ queryKey: ['docvault-documents', userId] });
    },
    [documents, queryClient, userId],
  );

  // ── Delete document ────────────────────────────────────────────────────────
  const deleteDocument = useCallback(
    async (docId: string, imagePath: string | null) => {
      try {
        if (!userId) throw new Error('Not authenticated');

        if (imagePath) {
          try {
            await deleteStorageFile(imagePath);
          } catch (err: unknown) {
            // object-not-found is fine — already gone
            const code = (err as { code?: string })?.code;
            if (code !== 'storage/object-not-found') {
              console.warn('[useDocVaultDocuments] Storage delete warning:', err);
            }
          }
        }

        await deleteDoc(doc(firebaseDb, `users/${userId}/documents/${docId}`));
        toast.success('Document deleted');
        refetch();
      } catch (error: unknown) {
        console.error('[useDocVaultDocuments] Delete error:', error);
        toast.error(error instanceof Error ? error.message : 'Failed to delete document');
        throw error;
      }
    },
    [refetch, userId],
  );

  const moveDocument = useCallback(
    (documentId: string, categoryId: string | null) =>
      moveDocumentMutation.mutate({ documentId, categoryId }),
    [moveDocumentMutation],
  );

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
