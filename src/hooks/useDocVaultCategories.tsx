/**
 * src/hooks/useDocVaultCategories.tsx — Firestore DocVault categories hook
 *
 * Drop-in replacement for the Supabase version.
 * Public API is identical so DocVault pages compile unchanged.
 */

import { useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  collection,
  doc,
  addDoc,
  updateDoc,
  deleteDoc,
  getDocs,
  query,
  orderBy,
  where,
  writeBatch,
} from 'firebase/firestore';
import { firebaseDb, firebaseAuth } from '@/integrations/firebase/client';
import { toast } from 'sonner';
import type { DocVaultCategory } from '@/components/docvault/DocVaultSidebar';

export function useDocVaultCategories(userId: string | undefined) {
  const queryClient = useQueryClient();

  // ── Fetch ──────────────────────────────────────────────────────────────────
  const { data: categories = [], isLoading: categoriesLoading } = useQuery({
    queryKey: ['docvault-categories', userId],
    queryFn: async () => {
      if (!userId) return [];
      const snap = await getDocs(
        query(
          collection(firebaseDb, `users/${userId}/docvault_categories`),
          orderBy('name', 'asc'),
        ),
      );
      return snap.docs.map((d) => ({
        id:   d.id,
        name: (d.data().name as string),
        ...d.data(),
      })) as DocVaultCategory[];
    },
    enabled: !!userId,
  });

  // ── Create ─────────────────────────────────────────────────────────────────
  const createCategoryMutation = useMutation({
    mutationFn: async (name: string) => {
      if (!userId) throw new Error('User not authenticated');
      const now = new Date().toISOString();
      const docRef = await addDoc(
        collection(firebaseDb, `users/${userId}/docvault_categories`),
        { userId, name, createdAt: now, updatedAt: now },
      );
      return { id: docRef.id, userId, name, createdAt: now, updatedAt: now };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['docvault-categories', userId] });
      toast.success('Category created');
    },
    onError: (error: unknown) => {
      toast.error(error instanceof Error ? error.message : 'Failed to create category');
    },
  });

  // ── Rename ─────────────────────────────────────────────────────────────────
  const renameCategoryMutation = useMutation({
    mutationFn: async ({ id, name }: { id: string; name: string }) => {
      if (!userId) throw new Error('User not authenticated');
      await updateDoc(
        doc(firebaseDb, `users/${userId}/docvault_categories/${id}`),
        { name, updatedAt: new Date().toISOString() },
      );
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['docvault-categories', userId] });
      toast.success('Category renamed');
    },
    onError: (error: unknown) => {
      toast.error(error instanceof Error ? error.message : 'Failed to rename category');
    },
  });

  // ── Delete ─────────────────────────────────────────────────────────────────
  const deleteCategoryMutation = useMutation({
    mutationFn: async (categoryId: string) => {
      if (!userId) throw new Error('User not authenticated');

      // Clear category from all documents that reference it
      const docsSnap = await getDocs(
        query(
          collection(firebaseDb, `users/${userId}/documents`),
          where('docvaultCategoryId', '==', categoryId),
        ),
      );
      if (!docsSnap.empty) {
        const batch = writeBatch(firebaseDb);
        docsSnap.docs.forEach((d) =>
          batch.update(d.ref, { docvaultCategoryId: null }),
        );
        await batch.commit();
      }

      // Delete the category document
      await deleteDoc(
        doc(firebaseDb, `users/${userId}/docvault_categories/${categoryId}`),
      );
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['docvault-categories', userId] });
      queryClient.invalidateQueries({ queryKey: ['docvault-documents', userId] });
      toast.success('Category deleted');
    },
    onError: (error: unknown) => {
      toast.error(error instanceof Error ? error.message : 'Failed to delete category');
    },
  });

  const createCategory = useCallback(
    async (name: string): Promise<string | null> => {
      try {
        const result = await createCategoryMutation.mutateAsync(name);
        return result.id;
      } catch {
        return null;
      }
    },
    [createCategoryMutation],
  );

  const renameCategory = useCallback(
    (id: string, name: string) => renameCategoryMutation.mutate({ id, name }),
    [renameCategoryMutation],
  );

  const deleteCategory = useCallback(
    (id: string) => deleteCategoryMutation.mutate(id),
    [deleteCategoryMutation],
  );

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
