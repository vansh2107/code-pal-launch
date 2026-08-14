import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center gap-1.5 rounded-badge px-2.5 py-1 text-[12px] leading-[16px] font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 [&_svg]:size-3.5 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        default:
          "bg-primary-soft text-primary border border-primary/15",
        secondary:
          "bg-muted text-secondary-foreground border border-border/50",
        outline:
          "border border-border text-foreground bg-transparent",
        destructive:
          "bg-expired-bg text-expired-foreground border border-expired/25",
        valid:
          "bg-valid-bg text-valid-foreground border border-valid/20",
        expiring:
          "bg-expiring-bg text-expiring-foreground border border-expiring/25",
        expired:
          "bg-expired-bg text-expired-foreground border border-expired/25",
        warning:
          "bg-expiring-bg text-warning-foreground border border-warning/25",
        error:
          "bg-expired-bg text-expired-foreground border border-expired/30",
        success:
          "bg-valid-bg text-valid-foreground border border-valid/20",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  },
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return <div className={cn(badgeVariants({ variant }), className)} {...props} />;
}

export { Badge, badgeVariants };
