/**
 * src/pages/EditTask.tsx — Firestore task edit page
 * Replaces Supabase with Firestore. UI unchanged.
 */

import { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Upload, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card } from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';
import { formatInTimeZone } from 'date-fns-tz';
import { parseLocalInputToUtc } from '@/utils/dateUtils';
import { deleteOfflineTask } from '@/utils/offlineStorage';
import { BottomNavigation } from '@/components/layout/BottomNavigation';
import { clearTasksCache } from '@/hooks/useTasksData';
import { getDoc, doc, updateDoc, deleteDoc } from 'firebase/firestore';
import { ref, uploadBytes, deleteObject } from 'firebase/storage';
import { firebaseDb, firebaseStorage, firebaseAuth } from '@/integrations/firebase/client';
import { userProfileDoc } from '@/integrations/firebase/firestore';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader,
  AlertDialogTitle, AlertDialogTrigger,
} from '@/components/ui/alert-dialog';

export default function EditTask() {
  const { id }      = useParams<{ id: string }>();
  const navigate    = useNavigate();
  const { toast }   = useToast();
  const [loading,   setLoading]   = useState(false);
  const [deleting,  setDeleting]  = useState(false);
  const [timezone,  setTimezone]  = useState(() => Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC');
  const [taskTz,    setTaskTz]    = useState(() => Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC');
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [existingImagePath, setExistingImagePath] = useState<string | null>(null);
  const [formData,  setFormData]  = useState({
    title: '',
    description: '',
    startDate: '',
    startTime: '',
    dueDate: '',
    dueTime: '',
  });

  useEffect(() => {
    fetchUserTimezone();
    if (id) fetchTask();
  }, [id]);

  const fetchUserTimezone = async () => {
    const uid = firebaseAuth.currentUser?.uid;
    if (!uid) return;
    try {
      const deviceTz = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
      const snap = await getDoc(userProfileDoc(uid));
      const tz = snap.data()?.timezone as string | undefined;
      if (tz && tz !== 'UTC') {
        setTimezone(tz);
      } else {
        setTimezone(deviceTz);
      }
    } catch (err) { console.error('[EditTask] fetchUserTimezone:', err); }
  };

  const fetchTask = async () => {
    const uid = firebaseAuth.currentUser?.uid;
    if (!uid || !id) return;
    try {
      const snap = await getDoc(doc(firebaseDb, `users/${uid}/tasks/${id}`));
      if (!snap.exists()) {
        toast({ title: 'Task not found', variant: 'destructive' });
        navigate('/tasks');
        return;
      }
      const data = snap.data();
      const tz   = (data.timezone as string | undefined) ?? timezone;
      setTaskTz(tz);

      const startUtc = new Date((data.startTime as string) || Date.now());
      const dueUtc   = data.dueDate ? new Date(data.dueDate as string) : startUtc;

      setFormData({
        title:       data.title as string,
        description: (data.description as string) ?? '',
        startDate:   formatInTimeZone(startUtc, tz || 'UTC', 'yyyy-MM-dd'),
        startTime:   formatInTimeZone(startUtc, tz || 'UTC', 'HH:mm'),
        dueDate:     formatInTimeZone(dueUtc,   tz || 'UTC', 'yyyy-MM-dd'),
        dueTime:     formatInTimeZone(dueUtc,   tz || 'UTC', 'HH:mm'),
      });
      setExistingImagePath((data.imagePath as string | null) ?? null);
    } catch (err: unknown) {
      toast({ title: 'Error', description: (err as Error).message ?? 'Failed to fetch task', variant: 'destructive' });
      navigate('/tasks');
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    const uid = firebaseAuth.currentUser?.uid;
    if (!uid || !id) { setLoading(false); return; }
    try {
      if (!formData.startDate || !formData.startTime) throw new Error('Please enter a valid start date and time');
      if (!formData.dueDate || !formData.dueTime) throw new Error('Please enter a valid due date and time');

      const startUtc = parseLocalInputToUtc(`${formData.startDate}T${formData.startTime.slice(0, 5)}`, timezone);
      const dueUtc   = parseLocalInputToUtc(`${formData.dueDate}T${formData.dueTime.slice(0, 5)}`, timezone);

      if (isNaN(startUtc.getTime())) throw new Error('Invalid start date/time');
      if (isNaN(dueUtc.getTime())) throw new Error('Invalid due date/time');

      if (dueUtc.getTime() < startUtc.getTime()) {
        throw new Error('Due date and time cannot be earlier than start date and time');
      }

      const taskRef  = doc(firebaseDb, `users/${uid}/tasks/${id}`);
      const taskSnap = await getDoc(taskRef);
      const current  = taskSnap.data();

      const localDate          = formData.startDate;
      const startTimeChanged   = current && current.startTime !== startUtc.toISOString();
      const newTimeInFuture    = startUtc.getTime() > Date.now();
      const shouldResetNotifs  = startTimeChanged && newTimeInFuture;

      let imagePath = existingImagePath;
      if (imageFile) {
        if (imageFile.size > 20 * 1024 * 1024) throw new Error('File size exceeds 20 MB limit');
        const fileExt     = imageFile.name.split('.').pop();
        const storagePath = `tasks/${uid}/${Date.now()}.${fileExt}`;
        await uploadBytes(ref(firebaseStorage, storagePath), imageFile, { contentType: imageFile.type });
        if (existingImagePath) {
          try { await deleteObject(ref(firebaseStorage, existingImagePath)); } catch { /* ok */ }
        }
        imagePath = storagePath;
      }

      const updateData: Record<string, unknown> = {
        title:          formData.title,
        description:    formData.description || null,
        startTime:      startUtc.toISOString(),
        dueDate:        dueUtc.toISOString(),
        timezone,
        localDate,
        taskDate:       localDate,
        originalDate:   localDate,
        imagePath,
        reminderActive: true,
        updatedAt:      new Date().toISOString(),
      };
      if (shouldResetNotifs) {
        updateData.lastReminderSentAt = null;
        updateData.startNotified      = false;
      }

      await updateDoc(taskRef, updateData);
      clearTasksCache();
      toast({ title: 'Task updated!', description: shouldResetNotifs ? "You'll receive a notification at the new start time." : 'Updated successfully.' });
      navigate(`/task/${id}`);
    } catch (err: unknown) {
      toast({ title: 'Error', description: (err as Error).message, variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async () => {
    setDeleting(true);
    const uid = firebaseAuth.currentUser?.uid;
    if (!uid || !id) { setDeleting(false); return; }
    try {
      if (existingImagePath) {
        try { await deleteObject(ref(firebaseStorage, existingImagePath)); } catch { /* ok */ }
      }
      await deleteDoc(doc(firebaseDb, `users/${uid}/tasks/${id}`));
      await deleteOfflineTask(id);
      clearTasksCache();
      toast({ title: 'Task deleted', description: 'Your task has been removed.' });
      navigate('/tasks');
    } catch (err: unknown) {
      toast({ title: 'Error', description: (err as Error).message, variant: 'destructive' });
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="min-h-screen page-bg px-4" style={{ paddingBottom: 'calc(var(--nav-height) + var(--safe-area-bottom) + var(--fab-gap) + 32px)' }}>
      <div className="bg-background/80 backdrop-blur-xl p-6 -mx-4 sticky top-0 z-10 border-b border-border/50 pt-[calc(1.5rem+env(safe-area-inset-top,0px))]">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="icon" onClick={() => navigate(`/task/${id}`)}>
              <ArrowLeft className="h-5 w-5" />
            </Button>
            <div>
              <h1 className="text-2xl font-bold text-foreground">Edit Task</h1>
              <p className="text-sm text-muted-foreground">Update task details</p>
            </div>
          </div>
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="destructive" size="icon"><Trash2 className="h-5 w-5" /></Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Delete Task?</AlertDialogTitle>
                <AlertDialogDescription>This action cannot be undone. This will permanently delete your task.</AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction onClick={handleDelete} disabled={deleting}>
                  {deleting ? 'Deleting...' : 'Delete'}
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      </div>
      <form onSubmit={handleSubmit} className="p-4 space-y-4 w-full max-w-full">
        <Card className="p-4 space-y-4 rounded-xl shadow-sm w-full">
          <div>
            <Label htmlFor="title">Task Title *</Label>
            <Input id="title" value={formData.title}
              onChange={(e) => setFormData({ ...formData, title: e.target.value })}
              placeholder="e.g., Morning workout" required />
          </div>
          <div>
            <Label htmlFor="description">Description (Optional)</Label>
            <Textarea id="description" value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              rows={3} placeholder="Add details..." />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <Label htmlFor="start-date">Start Date *</Label>
              <Input id="start-date" type="date" value={formData.startDate}
                onChange={(e) => setFormData({ ...formData, startDate: e.target.value })} required />
            </div>
            <div>
              <Label htmlFor="start-time">Start Time *</Label>
              <Input id="start-time" type="time" value={formData.startTime}
                onChange={(e) => setFormData({ ...formData, startTime: e.target.value })} required />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <Label htmlFor="due-date">Due Date *</Label>
              <Input id="due-date" type="date" value={formData.dueDate}
                onChange={(e) => setFormData({ ...formData, dueDate: e.target.value })} required />
            </div>
            <div>
              <Label htmlFor="due-time">Due Time *</Label>
              <Input id="due-time" type="time" value={formData.dueTime}
                onChange={(e) => setFormData({ ...formData, dueTime: e.target.value })} required />
            </div>
          </div>
          <p className="text-xs text-muted-foreground">Timezone: {timezone}</p>

          <div>
            <Label htmlFor="image">Update Image (Optional)</Label>
            <div className="flex items-center gap-2 mt-1">
              <Input id="image" type="file" accept="image/*"
                onChange={(e) => setImageFile(e.target.files?.[0] ?? null)} />
              {(imageFile || existingImagePath) && <Upload className="h-5 w-5 text-primary" />}
            </div>
            {existingImagePath && !imageFile && <p className="text-xs text-muted-foreground mt-1">Current image will be kept</p>}
          </div>
        </Card>
        <Button type="submit" disabled={loading} className="w-full" size="lg">
          {loading ? 'Updating...' : 'Update Task'}
        </Button>
      </form>
      <BottomNavigation />
    </div>
  );
}
