import { memo } from "react";
import { TaskCard } from "./TaskCard";

interface TaskCardMemoProps {
  task: {
    id: string;
    title: string;
    description: string | null;
    start_time: string;
    end_time: string | null;
    total_time_minutes: number | null;
    status: string;
    image_path: string | null;
    consecutive_missed_days: number;
  };
  statusInfo: {
    bgClass: string;
    textClass: string;
    badgeVariant: "default" | "destructive" | "secondary" | "outline";
    label: string;
  };
  funnyMessage: string | null;
  onRefresh: () => void;
  userTimezone: string;
}

export const TaskCardMemo = memo(TaskCard, (prevProps, nextProps) => {
  return (
    prevProps.task.id === nextProps.task.id &&
    prevProps.task.status === nextProps.task.status &&
    prevProps.task.total_time_minutes === nextProps.task.total_time_minutes &&
    prevProps.task.consecutive_missed_days === nextProps.task.consecutive_missed_days &&
    prevProps.userTimezone === nextProps.userTimezone
  );
});

TaskCardMemo.displayName = "TaskCardMemo";
