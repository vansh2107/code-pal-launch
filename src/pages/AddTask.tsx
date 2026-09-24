/**
 * src/pages/AddTask.tsx — Firestore task creation
 * Replaces Supabase with Firestore. UI and validation unchanged.
 */

import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Upload } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card } from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';
import { format } from 'date-fns';
import { fromZonedTime } from 'date-fns-tz';
import { AppShell, PageHeader } from '@/components/layout/';
import { clearTasksCache } from '@/hooks/useTasksData';
import { collection, addDoc } from 'firebase/firestore';
import { ref, uploadBytes } from 'firebase/storage';
import { firebaseDb, firebaseStorage, firebaseAuth } from '@/integrations/firebase/client';
import { getDoc } from 'firebase/firestore';
import { userProfileDoc } from '@/integrations/firebase/firestore';

export default function AddTask() {
  const navigate      = useNavigate();
  const { toast }     = useToast();
  const [loading,     setLoading]     = useState(false);
  const [timezone,    setTimezone]    = useState('UTC');
  const [imageFile,   setImageFile]   = useState<File | null>(null);
  const [formData,    setFormData]    = useState(() => {
    const now = new Date();
    return { title: '', description: '', startTime: format(now, "yyyy-MM-dd'T'HH:mm") };
  });

  useEffect(() => { fetchUserTimezone(); }, []);

  const fetchUserTimezone = async () => {
    try {
      const uid = firebaseAuth.currentUser?.uid;
      if (!uid) return;
      const snap = await getDoc(userProfileDoc(uid));
      const tz   = snap.data()?.timezone as string | undefined;
      if (tz) setTimezone(tz);
    } catch (err) {
      console.error('[AddTask] fetchUserTimezone:', err);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const uid = firebaseAuth.currentUser?.uid;
      if (!uid) throw new Error('Not authenticated');

      const [dateStr, timeStr] = formData.startTime.split('T');
      const [hours, minutes]   = timeStr.split(':');
      const [year, month, day] = dateStr.split('-').map(Number);
      const localDateTime      = new Date(year, month - 1, day, parseInt(hours), parseInt(minutes));
      const utcTime            = fromZonedTime(localDateTime, timezone);
      const localDate          = dateStr;

      let imagePath: string | null = null;
      if (imageFile) {
        if (imageFile.size > 20 * 1024 * 1024) throw new Error('File size exceeds 20 MB limit');
        const fileExt    = imageFile.name.split('.').pop();
        const storagePath = `tasks/${uid}/${Date.now()}.${fileExt}`;
        await uploadBytes(ref(firebaseStorage, storagePath), imageFile, { contentType: imageFile.type });
        imagePath = storagePath;
      }

      const now = new Date().toISOString();
      await addDoc(collection(firebaseDb, `users/${uid}/tasks`), {
        userId:                 uid,
        title:                  formData.title,
        description:            formData.description || null,
        startTime:              utcTime.toISOString(),
        endTime:                null,
        totalTimeMinutes:       null,
        timezone,
        imagePath,
        localDate,
        taskDate:               localDate,
        originalDate:           localDate,
        status:                 'pending',
        consecutiveMissedDays:  0,
        reminderActive:         true,
        startNotified:          false,
        lastReminderSentAt:     null,
        lastOverdueAlertSent:   null,
        createdAt:              now,
        updatedAt:              now,
      });

      clearTasksCache();
      toast({ title: 'Task created!', description: 'Your task has been added successfully.' });
      navigate('/tasks');
    } catch (error: unknown) {
      toast({ title: 'Error', description: (error as Error).message, variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  return (
    <AppShell contentWidth="narrow">
      <PageHeader back="/tasks" title="New Task" description="Create a daily task"
        action={<Button type="submit" form="add-task-form" disabled={loading} size="lg">
          {loading ? 'Creating...' : 'Create Task'}
        </Button>} />
      <form id="add-task-form" onSubmit={handleSubmit} className="space-y-4">
        <Card className="p-4 space-y-4 rounded-xl shadow-sm">
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
              placeholder="Add details about your task..." rows={3} />
          </div>
          <div>
            <Label htmlFor="start-time">Start Time *</Label>
            <Input id="start-time" type="datetime-local" value={formData.startTime}
              onChange={(e) => setFormData({ ...formData, startTime: e.target.value })} required />
            <p className="text-xs text-muted-foreground mt-1">Your timezone: {timezone}</p>
          </div>
          <div>
            <Label htmlFor="image">Attach Image (Optional)</Label>
            <div className="flex items-center gap-2">
              <Input id="image" type="file" accept="image/*"
                onChange={(e) => setImageFile(e.target.files?.[0] ?? null)} />
              {imageFile && <Upload className="h-5 w-5 text-primary" />}
            </div>
          </div>
        </Card>
      </form>
    </AppShell>
  );
}
