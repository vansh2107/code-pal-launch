import { Home, FileText, Camera, User, Vault, ClipboardList } from "lucide-react";
import { Link, useLocation } from "react-router-dom";
import { cn } from "@/lib/utils";

const navigation = [
  { name: "Home", href: "/", icon: Home },
  { name: "Documents", href: "/documents", icon: FileText },
  { name: "Scan", href: "/scan", icon: Camera },
  { name: "Tasks", href: "/tasks", icon: ClipboardList },
  { name: "DocVault", href: "/docvault", icon: Vault },
  { name: "Profile", href: "/profile", icon: User },
];

export function BottomNavigation() {
  const location = useLocation();

  return (
    <nav 
      className="fixed bottom-0 left-0 right-0 bg-background/80 backdrop-blur-xl border-t border-border/50 z-50 pb-[env(safe-area-inset-bottom)]"
      style={{ height: 'calc(70px + env(safe-area-inset-bottom))' }}
    >
      <div className="grid grid-cols-6 w-full h-full py-2 px-1">
        {navigation.map((item) => {
          const isActive = location.pathname === item.href;
          return (
            <Link
              key={item.name}
              to={item.href}
              className={cn(
                "flex flex-col items-center justify-center px-2 py-1.5 text-[11px] font-medium rounded-xl smooth relative",
                isActive
                  ? "text-primary"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              {isActive && (
                <div className="absolute inset-1 bg-primary/8 rounded-xl -z-10 animate-scale-in" />
              )}
              <item.icon className={cn(
                "h-5 w-5 mb-1 smooth",
                isActive && "scale-110"
              )} />
              <span className="font-semibold">{item.name}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}