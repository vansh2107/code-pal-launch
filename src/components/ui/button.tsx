import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap font-semibold ring-offset-background transition-all duration-200 ease-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0 active:scale-[0.98] active:transition-transform",
  {
    variants: {
      variant: {
        default:
          "bg-primary text-primary-foreground shadow-1 hover:bg-primary-dark hover:shadow-[0_4px_14px_hsl(var(--primary)/0.22)]",
        destructive:
          "bg-destructive text-destructive-foreground shadow-1 hover:bg-destructive/90 hover:shadow-[0_4px_14px_hsl(var(--destructive)/0.22)]",
        outline:
          "border border-border bg-background text-foreground hover:bg-muted",
        secondary:
          "bg-muted text-foreground border border-border/40 hover:bg-muted/80 hover:border-border/70",
        ghost: "text-foreground hover:bg-muted active:scale-100",
        link: "text-primary underline-offset-4 hover:underline p-0 h-auto shadow-none active:scale-100",
      },
      size: {
        default:
          "h-[44px] px-5 rounded-button text-button [&_svg:not([class*='size-'])]:size-5",
        sm: "h-9 px-4 rounded-sm-control text-[13px] leading-[18px] [&_svg:not([class*='size-'])]:size-4",
        lg: "h-[52px] px-6 rounded-button text-[15px] leading-[22px] [&_svg:not([class*='size-'])]:size-[22px]",
        icon: "h-10 w-10 rounded-button p-0 [&_svg:not([class*='size-'])]:size-5",
        "icon-sm":
          "h-8 w-8 rounded-sm-control p-0 [&_svg:not([class*='size-'])]:size-4",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button";
    return (
      <Comp
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        {...props}
      />
    );
  },
);
Button.displayName = "Button";

export { Button, buttonVariants };
