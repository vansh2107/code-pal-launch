import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { AlertCircle, AlertTriangle, CheckCircle2, Info } from "lucide-react";

import { cn } from "@/lib/utils";

const alertVariants = cva(
  "relative w-full rounded-card border px-4 py-3.5 text-[14px] leading-[20px] shadow-none [&_svg~*]:pl-8 [&_svg+div]:translate-y-[-3px] [&_svg]:absolute [&_svg]:left-3.5 [&_svg]:top-3.5",
  {
    variants: {
      variant: {
        default:
          "bg-card text-foreground border-border [&_svg]:text-muted-foreground",
        info:
          "bg-primary-soft/40 text-foreground border-primary/15 [&_svg]:text-primary",
        success:
          "bg-valid-bg text-foreground border-valid/20 [&_svg]:text-valid",
        warning:
          "bg-expiring-bg text-foreground border-expiring/20 [&_svg]:text-expiring",
        error:
          "bg-expired-bg text-foreground border-expired/22 [&_svg]:text-expired",
        destructive:
          "bg-expired-bg text-foreground border-expired/28 [&_svg]:text-expired",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  },
);

type AlertVariant = NonNullable<VariantProps<typeof alertVariants>["variant"]>;

const iconFor: Record<AlertVariant, React.ElementType | null> = {
  default: Info,
  info: Info,
  success: CheckCircle2,
  warning: AlertTriangle,
  error: AlertCircle,
  destructive: AlertCircle,
};

const Alert = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement> &
    VariantProps<typeof alertVariants> & { icon?: React.ElementType | null }
>(({ className, variant = "default", icon: Icon, children, ...props }, ref) => {
  const ResolvedIcon = Icon ?? iconFor[variant];
  const hasExplicitIcon = React.Children.toArray(children).some(
    (child) => React.isValidElement(child) && typeof child.type !== "string",
  );
  return (
    <div
      ref={ref}
      role="alert"
      className={cn(alertVariants({ variant }), className)}
      {...props}
    >
      {!hasExplicitIcon && ResolvedIcon && (
        <ResolvedIcon
          className="size-[18px] shrink-0"
          aria-hidden="true"
        />
      )}
      {children}
    </div>
  );
});
Alert.displayName = "Alert";

const AlertTitle = React.forwardRef<HTMLParagraphElement, React.HTMLAttributes<HTMLHeadingElement>>(
  ({ className, ...props }, ref) => (
    <h5
      ref={ref}
      className={cn("mb-1 text-[15px] leading-[20px] font-semibold tracking-tight", className)}
      {...props}
    />
  ),
);
AlertTitle.displayName = "AlertTitle";

const AlertDescription = React.forwardRef<HTMLParagraphElement, React.HTMLAttributes<HTMLParagraphElement>>(
  ({ className, ...props }, ref) => (
    <div ref={ref} className={cn("text-[14px] leading-[20px] text-muted-foreground [&_p]:leading-relaxed", className)} {...props} />
  ),
);
AlertDescription.displayName = "AlertDescription";

export { Alert, AlertTitle, AlertDescription, alertVariants };
