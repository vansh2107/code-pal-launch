import { cn } from "@/lib/utils";

function Skeleton({ className, ...props }: React.HTMLAttributes<HTMLSpanElement>) {
  return (
    <span
      className={cn(
        "block animate-skeleton bg-muted/80 rounded-[inherit]",
        className,
      )}
      aria-hidden="true"
      {...props}
    />
  );
}

export { Skeleton };
