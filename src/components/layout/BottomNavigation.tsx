import { Home, FileText, Camera, Vault, ClipboardList } from "lucide-react";
import { Link, useLocation } from "react-router-dom";
import { cn } from "@/lib/utils";
import { useIsMobile } from "@/hooks/use-mobile";

interface NavItem {
  name: string;
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  emphasized?: boolean;
}

const navigation: NavItem[] = [
  { name: "Home", href: "/", icon: Home },
  { name: "Documents", href: "/documents", icon: FileText },
  { name: "Scan", href: "/scan", icon: Camera, emphasized: true },
  { name: "Tasks", href: "/tasks", icon: ClipboardList },
  { name: "DocVault", href: "/docvault", icon: Vault },
];

export function BottomNavigation() {
  const location = useLocation();
  const isMobile = useIsMobile();

  // Guard: only mount on mobile-sized viewports
  if (!isMobile) return null;

  return (
    <nav
      className="fixed bottom-0 left-0 right-0 z-50"
      aria-label="Primary navigation"
      style={{
        paddingBottom: "var(--safe-area-bottom, env(safe-area-inset-bottom, 0px))",
        height: "calc(var(--nav-height) + var(--safe-area-bottom, env(safe-area-inset-bottom, 0px)))"
      }}
    >
      {/* Backdrop layer */}
      <div
        className="absolute inset-0 bg-background/85 backdrop-blur-xl border-t border-border/55"
        aria-hidden="true"
        style={{
          paddingBottom:
            "var(--safe-area-bottom, env(safe-area-inset-bottom, 0px))",
        }}
      />

      <div
        className="relative w-full"
        style={{ height: "70px" }}
      >
        <ul
          role="list"
          className="grid grid-cols-5 w-full h-full px-1"
        >
          {navigation.map((item) => {
            const isActive = location.pathname === item.href;
            return (
              <li key={item.name} className="w-full">
                <Link
                  to={item.href}
                  aria-current={isActive ? "page" : undefined}
                  className={cn(
                    "group relative flex flex-col items-center justify-center w-full h-full min-h-[44px]",
                    "outline-none transition-colors duration-200",
                    "focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-0",
                    "focus-visible:rounded-[14px]",
                    "active:scale-[0.97]"
                  )}
                >
                  {/* Active surface — soft pill */}
                  {isActive && (
                    <span
                      aria-hidden="true"
                      className="absolute inset-x-2 inset-y-2 rounded-[14px] bg-primary-soft smooth"
                    />
                  )}

                  <span className="relative z-10 flex flex-col items-center justify-center px-2">
                    <item.icon
                      className={cn(
                        "h-[22px] w-[22px] mb-0.5 transition-all duration-200",
                        isActive
                          ? "text-primary scale-[1.06]"
                          : cn(
                              "text-muted-foreground group-hover:text-foreground/85",
                              item.emphasized && "text-primary/75"
                            )
                      )}
                      aria-hidden="true"
                      {...({ strokeWidth: isActive ? 2.25 : 2 } as any)}
                    />
                    <span
                      className={cn(
                        "text-[10.5px] leading-[14px] tracking-tight transition-colors duration-200",
                        isActive
                          ? "text-primary font-semibold"
                          : cn(
                              "text-muted-foreground font-medium group-hover:text-foreground/80"
                            )
                      )}
                    >
                      {item.name}
                    </span>
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      </div>
    </nav>
  );
}
