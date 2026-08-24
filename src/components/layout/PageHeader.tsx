import { ReactNode, ButtonHTMLAttributes } from "react";
import { ArrowLeft } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

type PageHeaderVariant = "sticky" | "static";

interface PageHeaderProps {
  title: ReactNode;
  description?: ReactNode;
  /** Optional leading icon shown alongside the title */
  icon?: React.ComponentType<{ className?: string }>;
  /** Show a back button. Pass a string to override the destination URL. */
  back?: boolean | string;
  /** Primary action (e.g. Add Document). Usually a <Button>. */
  action?: ReactNode;
  /** Secondary action shown next to or below the primary depending on space. */
  secondaryAction?: ReactNode;
  /** Optional contextual slot for breadcrumbs or context chips. */
  context?: ReactNode;
  /**
   * sticky: header pins to top on scroll with a soft backdrop-blur (main content scrolls under).
   * static: default — header sits in the document flow.
   */
  variant?: PageHeaderVariant;
  className?: string;
  /** Accessible label for the back button. Defaults to "Go back". */
  backLabel?: string;
  /** Extras placed in the trailing area alongside actions. */
  trailing?: ReactNode;
}

/**
 * PageHeader — reusable page-level header.
 *
 * Typography:
 * - Desktop title: 30px / 36px / 700 / -0.025em
 * - Mobile title:  24px / 30px / 700 / -0.025em
 * - Description:  14px / 21px / 400 — muted
 */
export function PageHeader({
  title,
  description,
  icon: Icon,
  back = false,
  action,
  secondaryAction,
  context,
  variant = "static",
  className = "",
  backLabel = "Go back",
  trailing,
}: PageHeaderProps) {
  const navigate = useNavigate();

  const handleBack = () => {
    if (typeof back === "string") {
      navigate(back);
    } else {
      navigate(-1);
    }
  };

  const hasBack = !!back;
  const hasActions = !!(action || secondaryAction || trailing);

  const wrapperClasses = cn(
    // NOTE: no `w-full` here — for the sticky variant the negative side margins
    // must be able to expand the header to the full width of the parent's
    // padding box. `width:100%` would pin the width and leave the content
    // inset by the padding, pushing trailing actions away from the right edge.
    variant === "sticky" && [
      "sticky top-0 z-30",
      "bg-background/75 backdrop-blur-xl backdrop-saturate-150",
      "border-b border-border/55",
      "md:-mx-6 md:px-6 -mx-4 px-4 py-3 md:py-4",
    ],
    variant === "static" && [
      "w-full",
      "pt-5 md:pt-6 pb-4 md:pb-5",
    ],
    className
  );


  const titleClasses = cn(
    "font-bold tracking-tight text-foreground",
    "text-[24px] leading-[30px] md:text-[30px] md:leading-[36px]",
    // letter spacing via inline style to respect the design tokens
  );

  const titleStyle: React.CSSProperties = {
    letterSpacing: "-0.025em",
  };

  const descriptionClasses = cn(
    "text-[14px] leading-[21px] font-normal text-muted-foreground"
  );

  return (
    <header className={wrapperClasses}>
      {/* Context row (e.g. breadcrumbs) */}
      {context && (
        <div className="mb-2 md:mb-3 text-[12px] leading-[18px] text-muted-foreground">
          {context}
        </div>
      )}

      <div
        className={cn(
          "flex items-start justify-between gap-4 md:gap-6"
        )}
      >
        {/* Left column: back (optional) + icon/title/description */}
        <div className="flex items-start gap-3 min-w-0 flex-1">
          {hasBack && (
            <BackButton onClick={handleBack} ariaLabel={backLabel} />
          )}

          <div className="min-w-0 flex-1">
            <div className="flex items-start gap-2.5 min-w-0">
              {Icon && (
                <div
                  className="shrink-0 mt-0.5 flex items-center justify-center w-9 h-9 rounded-[10px] bg-primary/10 text-primary"
                  aria-hidden="true"
                >
                  <Icon className="h-5 w-5" />
                </div>
              )}
              <h1 className={titleClasses} style={titleStyle}>
                {title}
              </h1>
            </div>
            {description && (
              <div
                className={cn(
                  descriptionClasses,
                  "mt-1.5 md:mt-2"
                )}
              >
                {description}
              </div>
            )}
          </div>
        </div>

        {/* Right column: actions + trailing extras */}
        {hasActions && (
          <div
            className={cn(
              "flex items-center gap-2",
              "flex-none ml-auto",
              "justify-end",
              "w-auto"
            )}
          >

            {trailing}
            {secondaryAction}
            {action}
          </div>
        )}
      </div>
    </header>
  );
}

interface BackButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  onClick: () => void;
  ariaLabel?: string;
}

function BackButton({ onClick, ariaLabel = "Go back", className, ...rest }: BackButtonProps) {
  return (
    <Button
      variant="ghost"
      size="icon"
      onClick={onClick}
      aria-label={ariaLabel}
      title={ariaLabel}
      className={cn(
        "h-10 w-10 shrink-0 rounded-[12px]",
        "text-muted-foreground hover:text-foreground hover:bg-muted",
        "focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
        className
      )}
      {...rest}
    >
      <ArrowLeft className="h-5 w-5" aria-hidden="true" />
    </Button>
  );
}
