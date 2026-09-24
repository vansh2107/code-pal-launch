/**
 * src/pages/TaskDetail.tsx — Firestore task detail page
 * Replaces Supabase with Firestore. UI unchanged.
 */

import { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Trash2, Clock, Calendar, Edit } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { format } from 'date-fns';
import { toZonedTime } from 'date-fns-tz';
import { formatDuration } from '@/utils/taskDuration';
import { BottomNavigation } from '@/components/layout/BottomNavigation';
import { getSignedUrl } from '@/utils/signedUrl';
import { getDoc, doc, deleteDoc } from 'firebase/firestore';
import { ref, deleteObject } from 'firebase/storage';
import { firebaseDb, firebaseStorage, firebaseAuth } from '@/integrations/firebase/client';
import { userProfileDoc } from '@/integrations/firebase/firestore';
import { clearTasksCache } from '@/hooks/useTasksData';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader,
  AlertDialogTitle, AlertDialogTrigger,
} from '@/components/ui/alert-dialog';

export default function TaskDetail() {
  const { id }     = useParams<{ id: string }>();
  const navigate   = useNavigate();
  const { toast }  = useToast();
  const [task,     setTask]     = useState<Record<string, unknown> | null>(null);
  const [loading,  setLoading]  = useState(true);
  const [imageUrl, setImageUrl] = useState('');
  const [timezone, setTimezone] = useState('UTC');

  useEffect(() => { if (id) fetchAll(); }, [id]);

  const fetchAll = async () => {
    const uid = firebaseAuth.currentUser?.uid;
    if (!uid) return;
    try {
      const [taskSnap, profileSnap] = await Promise.all([
        getDoc(doc(firebaseDb, `users/${uid}/tasks/${id}`)),
        getDoc(userProfileDoc(uid)),
      ]);

      if (profileSnap.exists()) setTimezone((profileSnap.data().timezone as string) ?? 'UTC');

      if (!taskSnap.exists()) {
        toast({ title: 'Task not found', variant: 'destructive' });
        navigate('/tasks');
        return;
      }
      const data = taskSnap.data();
      // Normalise to snake_case for UI components
      const t: Record<string, unknown> = {
        id:                      taskSnap.id,
        title:                   data.title,
        description:             data.description ?? null,
        start_time:              data.startTime,
        end_time:                data.endTime ?? null,
        total_time_minutes:      data.totalTimeMinutes ?? null,
        status:                  data.status,
        image_path:              data.imagePath ?? null,
        consecutive_missed_days: data.consecutiveMissedDays ?? 0,
        task_date:               data.taskDate,
        original_date:           data.originalDate,
      };
      setTask(t);

      if (t.image_path) {
        getSignedUrl('task-images', t.image_path as string).then((url) => {
          if (url) setImageUrl(url);
        });
      }
    } catch (err: unknown) {
      toast({ title: 'Error', description: (err as Error).message ?? 'Failed to fetch task', variant: 'destructive' });
      navigate('/tasks');
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async () => {
    const uid = firebaseAuth.currentUser?.uid;
    if (!uid || !id) return;
    toast({ title: 'Task deleted', description: 'Your task has been removed.' });
    clearTasksCache();
    navigate('/tasks');
    try {
      if (task?.image_path) {
        try { await deleteObject(ref(firebaseStorage, task.image_path as string)); } catch { /* ok */ }
      }
      await deleteDoc(doc(firebaseDb, `users/${uid}/tasks/${id}`));
    } catch (err) {
      console.error('[TaskDetail] delete error:', err);
    }
  };

  const formatTimeInTimezone = (utcTime: string) =>
    format(toZonedTime(new Date(utcTime), timezone), 'h:mm a');

  if (loading || !task) {
    return (
      <div className="min-h-screen page-bg pb-20 flex items-center justify-center">
        <p className="text-muted-foreground">Loading...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen page-bg px-4" style={{ paddingBottom: 'calc(var(--nav-height) + var(--safe-area-bottom) + var(--fab-gap) + 32px)' }}>
      <div className="bg-background/80 backdrop-blur-xl p-6 -mx-4 sticky top-0 z-10 border-b border-border/50">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="icon" onClick={() => navigate('/tasks')}>
              <ArrowLeft className="h-5 w-5" />
            </Button>
            <h1 className="text-2xl font-bold text-foreground">Task Details</h1>
          </div>
          <div className="flex items-center gap-2">
            {task.status === 'pending' && (
              <Button variant="outline" size="icon" onClick={() => navigate(`/edit-task/${id}`)}>
                <Edit className="h-5 w-5" />
              </Button>
            )}
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="destructive" size="icon"><Trash2 className="h-5 w-5" /></Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Delete Task?</AlertDialogTitle>
                  <AlertDialogDescription>This action cannot be undone.</AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction onClick={handleDelete}>Delete</AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
        </div>
      </div>

      <div className="p-4 space-y-4 w-full max-w-full overflow-hidden">
        <Card className="p-6 space-y-4 rounded-xl shadow-sm w-full">
          <div>
            <h2 className="text-2xl font-bold mb-2">{task.title as string}</h2>
            {task.description && <p className="text-muted-foreground">{task.description as string}</p>}
          </div>
          <div className="flex items-center gap-2">
            <Badge variant={
              task.status === 'completed' ? 'default' :
              (task.consecutive_missed_days as number) >= 3 ? 'destructive' :
              (task.consecutive_missed_days as number) > 0  ? 'secondary' : 'outline'
            }>
              {task.status === 'completed' ? 'Completed' :
               (task.consecutive_missed_days as number) >= 3 ? `Overdue ${task.consecutive_missed_days} days` :
               (task.consecutive_missed_days as number) > 0  ? `Carried ${task.consecutive_missed_days} days` : 'Pending'}
            </Badge>
          </div>
          <div className="space-y-3 pt-4 border-t">
            <div className="flex items-center gap-3">
              <Calendar className="h-5 w-5 text-muted-foreground" />
              <div>
                <p className="text-sm font-medium">Task Date</p>
                <p className="text-sm text-muted-foreground">
                  {format(new Date(task.task_date as string), 'EEEE, MMM d, yyyy')}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <Clock className="h-5 w-5 text-muted-foreground" />
              <div>
                <p className="text-sm font-medium">Start Time</p>
                <p className="text-sm text-muted-foreground">
                  {formatTimeInTimezone(task.start_time as string)} ({timezone})
                </p>
              </div>
            </div>
            {task.end_time && (
              <div className="flex items-center gap-3">
                <Clock className="h-5 w-5 text-muted-foreground" />
                <div>
                  <p className="text-sm font-medium">Completed At</p>
                  <p className="text-sm text-muted-foreground">
                    {formatTimeInTimezone(task.end_time as string)} ({timezone})
                  </p>
                </div>
              </div>
            )}
            {task.total_time_minutes && (
              <div className="flex items-center gap-3">
                <Clock className="h-5 w-5 text-muted-foreground" />
                <div>
                  <p className="text-sm font-medium">Time Taken</p>
                  <p className="text-sm text-muted-foreground">
                    {formatDuration(task.total_time_minutes as number)}
                  </p>
                </div>
              </div>
            )}
          </div>
          {imageUrl && (
            <div className="pt-4 border-t">
              <p className="text-sm font-medium mb-2">Attached Image</p>
              <img src={imageUrl} alt="Task" className="rounded-lg w-full h-auto max-h-96 object-cover" />
            </div>
          )}
        </Card>
      </div>
      <BottomNavigation />
    </div>
  );
}
