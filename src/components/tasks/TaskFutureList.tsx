import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Clock, Calendar } from "lucide-react";
import { format } from "date-fns";
import { toZonedTime } from "date-fns-tz";
import { useNavigate } from "react-router-dom";

interface Task {
  id: string;
  title: string;
  description: string | null;
  start_time: string;
  task_date: string;
  original_date: string;
  status: string;
  image_path: string | null;
}

interface TaskFutureListProps {
  tasks: Task[];
  userTimezone: string;
}

export function TaskFutureList({ tasks, userTimezone }: TaskFutureListProps) {
  const navigate = useNavigate();

  if (tasks.length === 0) {
    return null;
  }

  // Group tasks by date
  const groupedTasks = tasks.reduce((acc, task) => {
    const date = task.task_date;
    if (!acc[date]) acc[date] = [];
    acc[date].push(task);
    return acc;
  }, {} as Record<string, Task[]>);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold text-foreground">Future Tasks</h2>
        <Badge variant="secondary">{tasks.length}</Badge>
      </div>

      {Object.entries(groupedTasks).map(([date, dateTasks]) => (
        <div key={date} className="space-y-2">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Calendar className="h-4 w-4" />
            <span className="font-medium">
              {format(new Date(date), "EEEE, MMM d")}
            </span>
          </div>

          <div className="space-y-2">
            {dateTasks.map((task) => {
              const startTimeLocal = toZonedTime(new Date(task.start_time), userTimezone);
              const displayStartTime = format(startTimeLocal, "h:mm a");

              return (
                <Card
                  key={task.id}
                  className="p-4 cursor-pointer hover:scale-[1.02] smooth border-primary/20 rounded-xl shadow-sm w-full max-w-full"
                  onClick={() => navigate(`/task/${task.id}`)}
                >
                  <div className="flex items-start justify-between mb-2">
                    <h3 className="font-semibold text-base text-foreground">
                      {task.title}
                    </h3>
                    <Badge variant="outline" className="ml-2 shrink-0">
                      Scheduled
                    </Badge>
                  </div>

                  {task.description && (
                    <p className="text-sm text-muted-foreground line-clamp-2 mb-2">
                      {task.description}
                    </p>
                  )}

                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Clock className="h-4 w-4" />
                    <span>{displayStartTime}</span>
                  </div>
                </Card>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
