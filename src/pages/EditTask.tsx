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
import { format } from 'date-fns';
import { toZonedTime, fromZonedTime } from 'date-fns-tz';
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
  const [timezone,  setTimezone]  = useState('UTC');
  const [taskTz,    setTaskTz]    = useState('UTC');
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [existingImagePath, setExistingImagePath] = useState<string | null>(null);
  const [formData,  setFormData]  = useState({ title: '', description: '', startTime: '' });

  useEffect(() => {
    fetchUserTimezone();
    if (id) fetchTask();
  }, [id]);

  const fetchUserTimezone = async () => {
    const uid = firebaseAuth.currentUser?.uid;
    if (!uid) return;
    try {
      const snap = await getDoc(userProfileDoc(uid));
      const tz = snap.data()?.timezone as string | undefined;
      if (tz) setTimezone(tz);
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
      const tz   = (data.timezone as string | undefined) ?? 'UTC';
      setTaskTz(tz);
      const local    = toZonedTime(new Date(data.startTime as string), tz);
      const formatted = format(local, "yyyy-MM-dd'T'HH:mm");
      setFormData({ title: data.title as string, description: (data.description as string) ?? '', startTime: formatted });
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
      const taskRef  = doc(firebaseDb, `users/${uid}/tasks/${id}`);
      const taskSnap = await getDoc(taskRef);
      const current  = taskSnap.data();

      const [dateStr, timeStr] = formData.startTime.split('T');
      const [hours, minutes]   = timeStr.split(':');
      const [year, month, day] = dateStr.split('-').map(Number);
      const localDateTime      = new Date(year, month - 1, day, parseInt(hours), parseInt(minutes));
      const utcTime            = fromZonedTime(localDateTime, timezone);
      const localDate          = dateStr;

      const startTimeChanged   = current && current.startTime !== utcTime.toISOString();
      const newTimeInFuture    = utcTime.getTime() > Date.now();
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
        title:         formData.title,
        description:   formData.description || null,
        imagePath,
        reminderActive: true,
        updatedAt:     new Date().toISOString(),
      };
      if (startTimeChanged) {
        updateData.startTime    = utcTime.toISOString();
        updateData.timezone     = timezone;
        updateData.localDate    = localDate;
        updateData.taskDate     = localDate;
        updateData.originalDate = localDate;
      }
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
      <div className="bg-background/80 backdrop-blur-xl p-6 -mx-4 sticky top-0 z-10 border-b border-border/50">
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
          <div>
            <Label htmlFor="start-time">Start Time *</Label>
            <Input id="start-time" type="datetime-local" value={formData.startTime}
              onChange={(e) => setFormData({ ...formData, startTime: e.target.value })} required />
            <p className="text-xs text-muted-foreground mt-1">Your timezone: {timezone}</p>
          </div>
          <div>
            <Label htmlFor="image">Update Image (Optional)</Label>
            <div className="flex items-center gap-2">
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
