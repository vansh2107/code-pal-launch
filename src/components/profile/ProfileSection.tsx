import { ReactNode } from "react";

interface ProfileSectionProps {
  title: string;
  children: ReactNode;
}

export function ProfileSection({ title, children }: ProfileSectionProps) {
  return (
    <div className="space-y-3">
      <h2 className="text-lg font-bold text-foreground px-2">{title}</h2>
      <div className="bg-card border border-border/80 rounded-[14px] overflow-hidden divide-y divide-border/50 shadow-[0_3px_10px_rgba(0,0,0,0.06)]">
        {children}
      </div>
    </div>
  );
}
