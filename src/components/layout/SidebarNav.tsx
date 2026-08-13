import { Home, FileText, Camera, Vault, ClipboardList, Settings, User } from "lucide-react";
import { Link, useLocation } from "react-router-dom";
import { cn } from "@/lib/utils";
import { useIsMobile } from "@/hooks/use-mobile";
import { useAuth } from "@/hooks/useAuth";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";

interface NavItem {
  name: string;
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  /** Whether this destination uses special emphasis (e.g. Scan) */
  emphasized?: boolean;
}

const primaryNav: NavItem[] = [
  { name: "Dashboard", href: "/", icon: Home },
  { name: "Documents", href: "/documents", icon: FileText },
  { name: "Scan", href: "/scan", icon: Camera, emphasized: true },
  { name: "Tasks", href: "/tasks", icon: ClipboardList },
  { name: "DocVault", href: "/docvault", icon: Vault },
];

const secondaryNav: NavItem[] = [
  { name: "Settings", href: "/settings", icon: Settings },
  { name: "Profile", href: "/profile", icon: User },
];

export function SidebarNav() {
  const isMobile = useIsMobile();
  const location = useLocation();
  const { user } = useAuth();

  // Never render sidebar on mobile
  if (isMobile) return null;

  const isActive = (href: string) => {
    if (href === "/") return location.pathname === "/";
    return (
      location.pathname === href ||
      location.pathname.startsWith(href + "/")
    );
  };

  return (
    <aside
      className="hidden md:flex md:flex-col md:w-64 md:shrink-0 md:h-screen md:sticky md:top-0 border-r border-border/60 bg-card/60 backdrop-blur-sm"
      aria-label="Primary navigation"
    >
      {/* Brand */}
      <div className="flex items-center gap-2 px-5 py-5 border-b border-border/50">
        <div className="flex items-center justify-center w-9 h-9 rounded-xl bg-primary/12 text-primary shrink-0">
          <Vault className="h-5 w-5" strokeWidth={2.25} />
        </div>
        <div className="flex flex-col min-w-0">
          <span className="font-bold text-foreground text-[17px] tracking-tight leading-tight">
            Remonk
          </span>
          <span className="text-[11px] text-muted-foreground leading-tight">
            Document Reminder
          </span>
        </div>
      </div>

      {/* Primary Nav */}
      <nav
        className="flex-1 px-3 py-4 space-y-1 overflow-y-auto"
        aria-label="Main destinations"
      >
        <ul className="space-y-1" role="list">
          {primaryNav.map((item) => {
            const active = isActive(item.href);
            return (
              <li key={item.name}>
                <Link
                  to={item.href}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "group relative flex items-center gap-3 px-3 py-2.5 rounded-[12px] text-sm font-medium transition-all duration-200 outline-none",
                    "focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
                    active
                      ? cn(
                          "text-primary bg-primary-soft",
                          "shadow-[0_1px_0_rgba(0,0,0,0.02)]"
                        )
                      : cn(
                          "text-muted-foreground hover:text-foreground hover:bg-muted/70",
                          item.emphasized &&
                            "hover:bg-primary-soft/50 hover:text-primary"
                        )
                  )}
                >
                  <item.icon
                    className={cn(
                      "h-5 w-5 shrink-0 transition-transform duration-200",
                      active
                        ? "text-primary scale-[1.03]"
                        : "group-hover:scale-[1.03]",
                      item.emphasized && !active && "text-primary/70"
                    )}
                    aria-hidden="true"
                  />
                  <span
                    className={cn(
                      "truncate",
                      active && "font-semibold tracking-tight"
                    )}
                  >
                    {item.name}
                  </span>
                  {item.emphasized && !active && (
                    <span
                      className="ml-auto inline-flex items-center px-1.5 py-0.5 rounded-full text-[10px] font-semibold bg-primary/10 text-primary"
                      aria-hidden="true"
                    >
                      NEW
                    </span>
                  )}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      {/* Secondary Nav + User */}
      <div className="px-3 py-3 border-t border-border/50 space-y-1">
        <ul className="space-y-1" role="list">
          {secondaryNav.map((item) => {
            const active = isActive(item.href);
            return (
              <li key={item.name}>
                <Link
                  to={item.href}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "group flex items-center gap-3 px-3 py-2 rounded-[12px] text-sm font-medium transition-all duration-200 outline-none",
                    "focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
                    active
                      ? "text-primary bg-primary-soft"
                      : "text-muted-foreground hover:text-foreground hover:bg-muted/70"
                  )}
                >
                  <item.icon
                    className={cn(
                      "h-4 w-4 shrink-0",
                      active && "text-primary"
                    )}
                    aria-hidden="true"
                  />
                  <span className={cn(active && "font-semibold")}>
                    {item.name}
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>

        {/* Mini profile strip */}
        <Link
          to="/profile"
          className={cn(
            "flex items-center gap-3 mt-2 px-3 py-2.5 rounded-[12px] transition-colors outline-none",
            "hover:bg-muted/70",
            "focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
          )}
          aria-label="Open profile"
        >
          <Avatar className="h-8 w-8 shrink-0 ring-1 ring-border/60">
            <AvatarFallback className="bg-primary/10 text-primary text-xs font-semibold">
              {user?.email?.charAt(0).toUpperCase() ?? "U"}
            </AvatarFallback>
          </Avatar>
          <div className="flex flex-col min-w-0">
            <span className="text-sm font-medium text-foreground truncate leading-tight">
              {user?.email?.split("@")[0] ?? "Account"}
            </span>
            <span className="text-[11px] text-muted-foreground truncate leading-tight">
              {user?.email ?? ""}
            </span>
          </div>
        </Link>
      </div>
    </aside>
  );
}
