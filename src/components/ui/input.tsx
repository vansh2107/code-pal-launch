import * as React from "react";

import { cn } from "@/lib/utils";

const Input = React.forwardRef<HTMLInputElement, React.ComponentProps<"input">>(
  ({ className, type, ...props }, ref) => {
    return (
      <input
        type={type}
        className={cn(
          "flex h-[44px] w-full rounded-input border border-input bg-background px-4 py-2 text-[15px] leading-[24px] text-foreground ring-offset-background file:border-0 file:bg-transparent file:text-button file:font-semibold file:text-foreground placeholder:text-placeholder focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:border-ring/40 aria-[invalid=true]:border-destructive aria-[invalid=true]:ring-destructive/30 aria-[invalid=true]:ring-2 aria-[invalid=true]:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-55 disabled:bg-muted/50 transition-colors duration-200",
          className,
        )}
        ref={ref}
        {...props}
      />
    );
  },
);
Input.displayName = "Input";

export { Input };
