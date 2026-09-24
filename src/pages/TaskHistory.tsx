/**
 * src/pages/TaskHistory.tsx — Firestore task history page
 * Replaces Supabase with Firestore. UI unchanged.
 */

import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Clock, CheckCircle2, Image as ImageIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { format, subDays } from 'date-fns';
import { toZonedTime } from 'date-fns-tz';
import { formatDuration } from '@/utils/taskDuration';
import { Skeleton } from '@/components/ui/skeleton';
import { BottomNavigation } from '@/components/layout/BottomNavigation';
import { collection, query, where, orderBy, getDocs } from 'firebase/firestore';
import { firebaseDb, firebaseAuth } from '@/integrations/firebase/client';
import { getDoc } from 'firebase/firestore';
import { userProfileDoc } from '@/integrations/firebase/firestore';

interface Task {
  id: string;
  title: string;
  description: string | null;
  start_time: string;
  end_time: string | null;
  total_time_minutes: number | null;
  status: string;
  image_path: string | null;
  consecutive_missed_days: number;
  task_date: string;
  original_date: string;
  local_date: string;
}

export default function TaskHistory() {
  const navigate      = useNavigate();
  const { toast }     = useToast();
  const [tasks,       setTasks]       = useState<Task[]>([]);
  const [loading,     setLoading]     = useState(true);
  const [userTimezone, setUserTimezone] = useState('UTC');

  useEffect(() => {
    fetchUserTimezone();
    fetchHistory();
  }, []);

  const fetchUserTimezone = async () => {
    const uid = firebaseAuth.currentUser?.uid;
    if (!uid) return;
    try {
      const snap = await getDoc(userProfileDoc(uid));
      const tz   = snap.data()?.timezone as string | undefined;
      if (tz) setUserTimezone(tz);
    } catch (err) { console.error('[TaskHistory] fetchUserTimezone:', err); }
  };

  const fetchHistory = async () => {
    const uid = firebaseAuth.currentUser?.uid;
    if (!uid) return;
    try {
      const sevenDaysAgo = subDays(new Date(), 7).toISOString();
      const snap = await getDocs(
        query(
          collection(firebaseDb, `users/${uid}/tasks`),
          where('createdAt', '>=', sevenDaysAgo),
          orderBy('createdAt', 'desc'),
        ),
      );
      const mapped: Task[] = snap.docs.map((d) => {
        const data = d.data();
        return {
          id:                      d.id,
          title:                   data.title as string,
          description:             (data.description as string | null) ?? null,
          start_time:              data.startTime as string,
          end_time:                (data.endTime as string | null) ?? null,
          total_time_minutes:      (data.totalTimeMinutes as number | null) ?? null,
          status:                  data.status as string,
          image_path:              (data.imagePath as string | null) ?? null,
          consecutive_missed_days: (data.consecutiveMissedDays as number) ?? 0,
          task_date:               data.taskDate as string,
          original_date:           data.originalDate as string,
          local_date:              (data.localDate as string) ?? (data.taskDate as string),
        };
      });
      setTasks(mapped);
    } catch (err: unknown) {
      toast({ title: 'Error', description: (err as Error).message ?? 'Failed to fetch task history', variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  const getStatusBadge = (task: Task) => {
    if (task.status === 'completed')           return <Badge variant="default">Completed</Badge>;
    if (task.consecutive_missed_days >= 3)     return <Badge variant="destructive">Overdue {task.consecutive_missed_days}d</Badge>;
    if (task.consecutive_missed_days > 0)      return <Badge variant="secondary">Carried {task.consecutive_missed_days}d</Badge>;
    return <Badge variant="outline">Pending</Badge>;
  };

  const groupedTasks = tasks.reduce((acc, task) => {
    const groupDate = task.local_date ?? task.original_date;
    if (!acc[groupDate]) acc[groupDate] = [];
    acc[groupDate].push(task);
    return acc;
  }, {} as Record<string, Task[]>);

  if (loading) {
    return (
      <div className="min-h-screen page-bg pb-20">
        <div className="bg-background/80 backdrop-blur-xl p-6"><Skeleton className="h-8 w-48" /></div>
        <div className="p-4 space-y-4">
          {[1, 2, 3].map((i) => <Skeleton key={i} className="h-32 w-full rounded-[14px]" />)}
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen page-bg px-4" style={{ paddingBottom: 'calc(var(--nav-height) + var(--safe-area-bottom) + var(--fab-gap) + 32px)' }}>
      <div className="bg-background/80 backdrop-blur-xl p-6 -mx-4 sticky top-0 z-10 border-b border-border/50">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => navigate('/tasks')}><ArrowLeft className="h-5 w-5" /></Button>
          <div>
            <h1 className="text-2xl font-bold text-foreground">Task History</h1>
            <p className="text-sm text-muted-foreground">Last 7 days</p>
          </div>
        </div>
      </div>

      <div className="p-4 w-full max-w-full overflow-hidden">
        {Object.keys(groupedTasks).length === 0 ? (
          <Card className="p-8 text-center rounded-xl shadow-sm w-full">
            <p className="text-muted-foreground">No task history yet</p>
          </Card>
        ) : (
          <div className="relative">
            <div className="absolute left-4 top-0 bottom-0 w-0.5 bg-primary/20" />
            {Object.entries(groupedTasks).map(([date, dateTasks]) => (
              <div key={date} className="relative mb-8">
                <div className="flex items-center gap-4 mb-4">
                  <div className="relative z-10 w-8 h-8 rounded-full bg-primary flex items-center justify-center shrink-0">
                    <div className="w-3 h-3 rounded-full bg-white" />
                  </div>
                  <div className="flex-1">
                    <h3 className="font-semibold text-foreground">{format(new Date(date), 'EEEE, MMM d')}</h3>
                    <p className="text-xs text-muted-foreground">{dateTasks.length} task{dateTasks.length !== 1 ? 's' : ''}</p>
                  </div>
                </div>
                <div className="ml-12 space-y-3">
                  {dateTasks.map((task) => (
                    <Card key={task.id} className="p-4 smooth hover:scale-[1.02] cursor-pointer rounded-xl shadow-sm w-full"
                      onClick={() => navigate(`/task/${task.id}`)}>
                      <div className="flex items-start justify-between mb-2">
                        <h4 className="font-semibold text-sm">{task.title}</h4>
                        {getStatusBadge(task)}
                      </div>
                      <div className="flex items-center gap-3 text-xs text-muted-foreground">
                        <div className="flex items-center gap-1">
                          <Clock className="h-3 w-3" />
                          <span>{format(toZonedTime(new Date(task.start_time), userTimezone), 'h:mm a')}</span>
                        </div>
                        {task.total_time_minutes && (
                          <div className="flex items-center gap-1">
                            <CheckCircle2 className="h-3 w-3" />
                            <span>{formatDuration(task.total_time_minutes)}</span>
                          </div>
                        )}
                        {task.image_path && <div className="flex items-center gap-1"><ImageIcon className="h-3 w-3" /></div>}
                      </div>
                      {task.consecutive_missed_days >= 3 && (
                        <p className="text-xs text-destructive-foreground mt-2 font-medium">🤦‍♂️ This one took a while...</p>
                      )}
                    </Card>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
      <BottomNavigation />
    </div>
  );
}
