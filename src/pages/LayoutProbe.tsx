import { AppShell } from "@/components/layout/AppShell";
import { PageHeader } from "@/components/layout/PageHeader";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { User } from "lucide-react";

export default function LayoutProbe() {
  const profileAvatar = (
    <a href="/profile" aria-label="Open profile" className="shrink-0 block">
      <Avatar className="h-10 w-10 ring-1 ring-border md:h-11 md:w-11">
        <AvatarFallback className="bg-primary/10">
          <User className="h-5 w-5 text-primary" />
        </AvatarFallback>
      </Avatar>
    </a>
  );

  return (
    <AppShell>
      <PageHeader
        title="Dashboard"
        description="Welcome back! Here's your document overview."
        trailing={profileAvatar}
        variant="sticky"
      />
      <div className="space-y-6 pb-6">
        <div className="grid grid-cols-2 gap-3" data-probe="cards">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-20 rounded-[14px] bg-muted" />
          ))}
        </div>
      </div>
    </AppShell>
  );
}
