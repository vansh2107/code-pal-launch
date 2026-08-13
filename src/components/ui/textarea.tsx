import * as React from "react";

import { cn } from "@/lib/utils";

export interface TextareaProps
  extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {}

const Textarea = React.forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ className, ...props }, ref) => {
    return (
      <textarea
        className={cn(
          "flex min-h-[96px] w-full rounded-input border border-input bg-background px-4 py-2.5 text-[15px] leading-[24px] text-foreground ring-offset-background placeholder:text-placeholder focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:border-ring/40 aria-[invalid=true]:border-destructive aria-[invalid=true]:ring-destructive/30 aria-[invalid=true]:ring-2 aria-[invalid=true]:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-55 disabled:bg-muted/50 transition-colors duration-200",
          className,
        )}
        ref={ref}
        {...props}
      />
    );
  },
);
Textarea.displayName = "Textarea";

export { Textarea };
