import { cn } from "@/lib/utils";

function Skeleton({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        "animate-skeleton bg-muted/80 rounded-[inherit]",
        className,
      )}
      aria-hidden="true"
      {...props}
    />
  );
}

export { Skeleton };
