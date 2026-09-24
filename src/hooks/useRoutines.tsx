/**
 * src/hooks/useRoutines.tsx — Firestore routines hook
 *
 * Drop-in replacement for the Supabase version.
 * Public API and exported types are identical so all consumers compile unchanged.
 */

import { useState, useEffect, useCallback } from 'react';
import {
  collection,
  doc,
  addDoc,
  updateDoc,
  deleteDoc,
  getDocs,
  query,
  orderBy,
  writeBatch,
} from 'firebase/firestore';
import { firebaseDb, firebaseAuth } from '@/integrations/firebase/client';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/hooks/use-toast';
import {
  getOfflineRoutines,
  saveRoutinesOffline,
  type OfflineRoutineBundle,
} from '@/utils/offlineStorage';

// ---------------------------------------------------------------------------
// Public types (unchanged)
// ---------------------------------------------------------------------------

export interface RoutineTaskSlot {
  id: string;
  task_id: string;
  time: string;
  days_of_week: number[];
}

export interface RoutineTask {
  id: string;
  routine_id: string;
  name: string;
  created_at: string;
  slots: RoutineTaskSlot[];
}

export interface Routine {
  id: string;
  user_id: string;
  name: string;
  icon: string;
  is_active: boolean;
  created_at: string;
  tasks: RoutineTask[];
}

// ---------------------------------------------------------------------------
// Helpers (unchanged public API)
// ---------------------------------------------------------------------------

const DAYS_LABELS = ['', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

export function formatTime12(time24: string): string {
  const [h, m] = time24.split(':').map(Number);
  const ampm = h >= 12 ? 'PM' : 'AM';
  const h12  = h % 12 || 12;
  return `${h12}:${String(m).padStart(2, '0')} ${ampm}`;
}

export function formatDaysShort(days: number[]): string {
  if (!days || days.length === 0) return '';
  if (days.length === 7) return 'Daily';
  if (arraysEqual(days, [1, 2, 3, 4, 5])) return 'Mon–Fri';
  if (arraysEqual(days, [6, 7])) return 'Sat–Sun';
  return days.map((d) => DAYS_LABELS[d]).join(', ');
}

function arraysEqual(a: number[], b: number[]): boolean {
  const sa = [...a].sort();
  const sb = [...b].sort();
  return sa.length === sb.length && sa.every((v, i) => v === sb[i]);
}

// ---------------------------------------------------------------------------
// Firestore field mappers
// ---------------------------------------------------------------------------

function docToSlot(id: string, data: Record<string, unknown>): RoutineTaskSlot {
  return {
    id,
    task_id:      data.taskId as string,
    time:         data.time   as string,
    days_of_week: (data.daysOfWeek as number[]) ?? [],
  };
}

function docToTask(
  id: string,
  data: Record<string, unknown>,
  slots: RoutineTaskSlot[],
): RoutineTask {
  return {
    id,
    routine_id: data.routineId as string,
    name:       data.name      as string,
    created_at: data.createdAt as string,
    slots,
  };
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useRoutines() {
  const { user }  = useAuth();
  const { toast } = useToast();
  const [routines, setRoutines] = useState<Routine[]>([]);
  const [loading,  setLoading]  = useState(true);

  const fetchRoutines = useCallback(async () => {
    const uid = firebaseAuth.currentUser?.uid ?? user?.uid;
    if (!uid) return;

    try {
      const routinesSnap = await getDocs(
        query(collection(firebaseDb, `users/${uid}/routines`), orderBy('createdAt', 'desc')),
      );

      if (routinesSnap.empty) {
        setRoutines([]);
        setLoading(false);
        saveRoutinesOffline([]).catch(() => {});
        return;
      }

      const result: Routine[] = [];

      for (const routineDoc of routinesSnap.docs) {
        const r          = routineDoc.data();
        const tasksSnap  = await getDocs(
          query(collection(firebaseDb, `users/${uid}/routines/${routineDoc.id}/tasks`), orderBy('createdAt', 'asc')),
        );

        const tasks: RoutineTask[] = [];
        for (const taskDoc of tasksSnap.docs) {
          const t         = taskDoc.data();
          const slotsSnap = await getDocs(
            collection(firebaseDb, `users/${uid}/routines/${routineDoc.id}/tasks/${taskDoc.id}/slots`),
          );
          const slots = slotsSnap.docs.map((s) => docToSlot(s.id, s.data() as Record<string, unknown>));
          tasks.push(docToTask(taskDoc.id, t as Record<string, unknown>, slots));
        }

        result.push({
          id:         routineDoc.id,
          user_id:    uid,
          name:       r.name   as string,
          icon:       (r.icon  as string) ?? '☀️',
          is_active:  (r.isActive as boolean) !== false,
          created_at: r.createdAt as string,
          tasks,
        });
      }

      setRoutines(result);
      saveRoutinesOffline(result as unknown as OfflineRoutineBundle[]).catch(() => {});
    } catch (error) {
      console.error('[useRoutines] Fetch error:', error);
      // Offline fallback
      try {
        const uid2   = user?.uid;
        const cached = await getOfflineRoutines(uid2);
        if (cached.length > 0) setRoutines(cached as unknown as Routine[]);
      } catch { /* noop */ }
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => { fetchRoutines(); }, [fetchRoutines]);

  // ── Create routine ─────────────────────────────────────────────────────────
  const createRoutine = async (name: string, icon: string): Promise<string | null> => {
    const uid = firebaseAuth.currentUser?.uid ?? user?.uid;
    if (!uid) return null;
    try {
      const now    = new Date().toISOString();
      const docRef = await addDoc(collection(firebaseDb, `users/${uid}/routines`), {
        userId:    uid,
        name,
        icon,
        isActive:  true,
        createdAt: now,
        updatedAt: now,
      });
      toast({ title: 'Routine created! 🎯' });
      await fetchRoutines();
      return docRef.id;
    } catch (error) {
      console.error('[useRoutines] createRoutine error:', error);
      toast({ title: 'Failed to create routine', variant: 'destructive' });
      return null;
    }
  };

  // ── Delete routine ─────────────────────────────────────────────────────────
  const deleteRoutine = async (id: string) => {
    const uid = firebaseAuth.currentUser?.uid ?? user?.uid;
    if (!uid) return;
    try {
      // Firestore doesn't cascade-delete sub-collections automatically —
      // delete tasks + slots first.
      const tasksSnap = await getDocs(collection(firebaseDb, `users/${uid}/routines/${id}/tasks`));
      const batch     = writeBatch(firebaseDb);
      for (const taskDoc of tasksSnap.docs) {
        const slotsSnap = await getDocs(collection(firebaseDb, `users/${uid}/routines/${id}/tasks/${taskDoc.id}/slots`));
        slotsSnap.docs.forEach((s) => batch.delete(s.ref));
        batch.delete(taskDoc.ref);
      }
      batch.delete(doc(firebaseDb, `users/${uid}/routines/${id}`));
      await batch.commit();
      toast({ title: 'Routine deleted' });
      await fetchRoutines();
    } catch (error) {
      console.error('[useRoutines] deleteRoutine error:', error);
      toast({ title: 'Failed to delete routine', variant: 'destructive' });
    }
  };

  // ── Toggle active ──────────────────────────────────────────────────────────
  const toggleRoutineActive = async (id: string, isActive: boolean) => {
    const uid = firebaseAuth.currentUser?.uid ?? user?.uid;
    if (!uid) return;
    try {
      await updateDoc(doc(firebaseDb, `users/${uid}/routines/${id}`), {
        isActive,
        updatedAt: new Date().toISOString(),
      });
      setRoutines((prev) => prev.map((r) => (r.id === id ? { ...r, is_active: isActive } : r)));
      toast({ title: isActive ? 'Routine activated ✅' : 'Routine paused ⏸️' });
    } catch (error) {
      console.error('[useRoutines] toggleRoutineActive error:', error);
      toast({ title: 'Failed to update routine', variant: 'destructive' });
    }
  };

  // ── Add task ───────────────────────────────────────────────────────────────
  const addTask = async (
    routineId: string,
    name: string,
    slots: { time: string; days_of_week: number[] }[],
  ): Promise<string | null> => {
    const uid = firebaseAuth.currentUser?.uid ?? user?.uid;
    if (!uid) return null;
    try {
      const now     = new Date().toISOString();
      const taskRef = await addDoc(
        collection(firebaseDb, `users/${uid}/routines/${routineId}/tasks`),
        { routineId, name, createdAt: now },
      );
      if (slots.length > 0) {
        const batch = writeBatch(firebaseDb);
        slots.forEach((s) => {
          const slotRef = doc(collection(firebaseDb, `users/${uid}/routines/${routineId}/tasks/${taskRef.id}/slots`));
          batch.set(slotRef, {
            taskId:     taskRef.id,
            time:       s.time,
            daysOfWeek: s.days_of_week,
            createdAt:  now,
          });
        });
        await batch.commit();
      }
      toast({ title: 'Task added! ✅' });
      await fetchRoutines();
      return taskRef.id;
    } catch (error) {
      console.error('[useRoutines] addTask error:', error);
      toast({ title: 'Failed to add task', variant: 'destructive' });
      return null;
    }
  };

  // ── Delete task ────────────────────────────────────────────────────────────
  const deleteTask = async (taskId: string) => {
    const uid = firebaseAuth.currentUser?.uid ?? user?.uid;
    if (!uid) return;
    // Find the routine containing this task
    const routine = routines.find((r) => r.tasks.some((t) => t.id === taskId));
    if (!routine) return;
    try {
      const slotsSnap = await getDocs(
        collection(firebaseDb, `users/${uid}/routines/${routine.id}/tasks/${taskId}/slots`),
      );
      const batch = writeBatch(firebaseDb);
      slotsSnap.docs.forEach((s) => batch.delete(s.ref));
      batch.delete(doc(firebaseDb, `users/${uid}/routines/${routine.id}/tasks/${taskId}`));
      await batch.commit();
      toast({ title: 'Task removed' });
      await fetchRoutines();
    } catch (error) {
      console.error('[useRoutines] deleteTask error:', error);
      toast({ title: 'Failed to delete task', variant: 'destructive' });
    }
  };

  // ── Update task ────────────────────────────────────────────────────────────
  const updateTask = async (
    taskId: string,
    name: string,
    slots: { id?: string; time: string; days_of_week: number[] }[],
  ) => {
    const uid = firebaseAuth.currentUser?.uid ?? user?.uid;
    if (!uid) return;
    const routine = routines.find((r) => r.tasks.some((t) => t.id === taskId));
    if (!routine) return;
    try {
      const now = new Date().toISOString();
      // Update task name
      await updateDoc(doc(firebaseDb, `users/${uid}/routines/${routine.id}/tasks/${taskId}`), { name });

      // Replace all slots
      const slotsSnap = await getDocs(
        collection(firebaseDb, `users/${uid}/routines/${routine.id}/tasks/${taskId}/slots`),
      );
      const batch = writeBatch(firebaseDb);
      slotsSnap.docs.forEach((s) => batch.delete(s.ref));
      slots.forEach((s) => {
        const slotRef = doc(collection(firebaseDb, `users/${uid}/routines/${routine.id}/tasks/${taskId}/slots`));
        batch.set(slotRef, {
          taskId,
          time:       s.time,
          daysOfWeek: s.days_of_week,
          createdAt:  now,
        });
      });
      await batch.commit();
      toast({ title: 'Task updated! ✅' });
      await fetchRoutines();
    } catch (error) {
      console.error('[useRoutines] updateTask error:', error);
      toast({ title: 'Failed to update task', variant: 'destructive' });
    }
  };

  return {
    routines,
    loading,
    createRoutine,
    deleteRoutine,
    toggleRoutineActive,
    addTask,
    deleteTask,
    updateTask,
    refetch: fetchRoutines,
  };
}
