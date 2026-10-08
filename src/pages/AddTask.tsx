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
import { getDoc, setDoc } from 'firebase/firestore';
import { userProfileDoc } from '@/integrations/firebase/firestore';

export default function AddTask() {
  const navigate      = useNavigate();
  const { toast }     = useToast();
  const [loading,     setLoading]     = useState(false);
  const [timezone,    setTimezone]    = useState(() => Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC');
  const [imageFile,   setImageFile]   = useState<File | null>(null);
  const [formData,    setFormData]    = useState(() => {
    const now = new Date();
    const inOneHour = new Date(now.getTime() + 60 * 60 * 1000);
    return {
      title: '',
      description: '',
      startDate: format(now, 'yyyy-MM-dd'),
      startTime: format(now, 'HH:mm'),
      dueDate: format(now, 'yyyy-MM-dd'),
      dueTime: format(inOneHour, 'HH:mm'),
    };
  });

  useEffect(() => { fetchUserTimezone(); }, []);

  const fetchUserTimezone = async () => {
    try {
      const uid = firebaseAuth.currentUser?.uid;
      if (!uid) return;
      const deviceTz = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
      const profileRef = userProfileDoc(uid);
      const snap = await getDoc(profileRef);
      const tz   = snap.data()?.timezone as string | undefined;
      if (tz && tz !== 'UTC') {
        try { Intl.DateTimeFormat(undefined, { timeZone: tz }); setTimezone(tz); }
        catch { setTimezone(deviceTz); }
      } else {
        setTimezone(deviceTz);
        await setDoc(profileRef, { timezone: deviceTz }, { merge: true }).catch(() => {});
      }
    } catch (err) {
      console.error('[AddTask] fetchUserTimezone:', err);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (loading) return;
    setLoading(true);
    try {
      const uid = firebaseAuth.currentUser?.uid;
      if (!uid) throw new Error('Not authenticated');

      if (!formData.startDate || !formData.startTime) throw new Error('Please enter a valid start date and time');
      if (!formData.dueDate || !formData.dueTime) throw new Error('Please enter a valid due date and time');

      const startUtc = fromZonedTime(`${formData.startDate}T${formData.startTime.slice(0, 5)}:00`, timezone);
      const dueUtc   = fromZonedTime(`${formData.dueDate}T${formData.dueTime.slice(0, 5)}:00`, timezone);

      if (isNaN(startUtc.getTime())) throw new Error('Invalid start date/time');
      if (isNaN(dueUtc.getTime())) throw new Error('Invalid due date/time');

      if (dueUtc.getTime() < startUtc.getTime()) {
        throw new Error('Due date and time cannot be earlier than start date and time');
      }

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
        startTime:              startUtc.toISOString(),
        dueDate:                dueUtc.toISOString(),
        endTime:                null,
        totalTimeMinutes:       null,
        timezone,
        imagePath,
        localDate:              formData.startDate,
        taskDate:               formData.startDate,
        originalDate:           formData.startDate,
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
            <Label htmlFor="image">Attach Image (Optional)</Label>
            <div className="flex items-center gap-2 mt-1">
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
