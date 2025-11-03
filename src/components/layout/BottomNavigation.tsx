import { Link, useLocation } from "react-router-dom";
import { cn } from "@/lib/utils";

const navigation = [
  { name: "Home", href: "/", emoji: "🏠" },
  { name: "Documents", href: "/documents", emoji: "📄" },
  { name: "Scan", href: "/scan", emoji: "📸" },
  { name: "DocVault", href: "/docvault", emoji: "🔐" },
  { name: "Profile", href: "/profile", emoji: "👤" },
];

export function BottomNavigation() {
  const location = useLocation();

  return (
    <nav className="fixed bottom-0 left-0 right-0 bg-card/80 backdrop-blur-xl border-t border-border/50 z-50 shadow-2xl">
      <div className="flex justify-around py-3 px-2">
        {navigation.map((item) => {
          const isActive = location.pathname === item.href;
          return (
            <Link
              key={item.name}
              to={item.href}
              className={cn(
                "flex flex-row items-center justify-center gap-2 px-4 py-2 text-sm font-medium rounded-xl smooth relative",
                isActive
                  ? "text-primary"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              {isActive && (
                <div className="absolute inset-0 bg-primary/10 rounded-xl -z-10 animate-scale-in" />
              )}
              <span className={cn("text-xl smooth", isActive && "scale-110")}>{item.emoji}</span>
              <span className="font-medium">{item.name}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}