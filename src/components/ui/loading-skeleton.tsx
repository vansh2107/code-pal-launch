import { Skeleton } from "@/components/ui/skeleton";
import { Card } from "@/components/ui/card";

export function TaskListSkeleton() {
  return (
    <div className="space-y-4">
      {[1, 2, 3].map((i) => (
        <Card key={i} className="p-4 space-y-3 animate-fade-in">
          <div className="flex items-start justify-between">
            <div className="flex-1 space-y-2">
              <Skeleton className="h-5 w-3/4" />
              <Skeleton className="h-4 w-full" />
            </div>
            <Skeleton className="h-6 w-20 ml-2" />
          </div>
          <div className="flex items-center gap-4">
            <Skeleton className="h-4 w-20" />
            <Skeleton className="h-4 w-24" />
          </div>
        </Card>
      ))}
    </div>
  );
}

export function DocumentCardSkeleton() {
  return (
    <Card className="p-4 space-y-3 animate-fade-in">
      <div className="flex items-start justify-between">
        <div className="flex-1 space-y-2">
          <Skeleton className="h-5 w-2/3" />
          <Skeleton className="h-4 w-1/2" />
        </div>
        <Skeleton className="h-6 w-16 ml-2" />
      </div>
      <div className="flex items-center gap-2">
        <Skeleton className="h-4 w-32" />
      </div>
    </Card>
  );
}

export function DocumentListSkeleton() {
  return (
    <div className="space-y-4">
      {[1, 2, 3, 4].map((i) => (
        <DocumentCardSkeleton key={i} />
      ))}
    </div>
  );
}

export function DashboardSkeleton() {
  return (
    <div className="space-y-6 animate-fade-in">
      <div className="grid grid-cols-2 gap-4">
        {[1, 2, 3, 4].map((i) => (
          <Card key={i} className="p-4 space-y-2">
            <Skeleton className="h-4 w-20" />
            <Skeleton className="h-8 w-12" />
          </Card>
        ))}
      </div>
      <Card className="p-4 space-y-3">
        <Skeleton className="h-6 w-40" />
        <Skeleton className="h-64 w-full" />
      </Card>
    </div>
  );
}
