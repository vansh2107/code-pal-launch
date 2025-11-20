import { ChevronRight } from "lucide-react";
import { Link } from "react-router-dom";
import { cn } from "@/lib/utils";

interface ProfileMenuItemProps {
  label: string;
  onClick?: () => void;
  href?: string;
  className?: string;
}

export function ProfileMenuItem({ label, onClick, href, className }: ProfileMenuItemProps) {
  const content = (
    <div className={cn(
      "flex items-center justify-between py-4 px-4 smooth hover:bg-primary/5 cursor-pointer group",
      className
    )}>
      <span className="text-foreground font-medium">{label}</span>
      <ChevronRight className="h-5 w-5 text-muted-foreground transition-all group-hover:translate-x-0.5" />
    </div>
  );

  if (href) {
    return (
      <Link to={href} className="block">
        {content}
      </Link>
    );
  }

  return (
    <div onClick={onClick}>
      {content}
    </div>
  );
}
