import { ReactNode } from "react";
import { SafeAreaContainer } from "./SafeAreaContainer";
import { BottomNavigation } from "./BottomNavigation";
import { SidebarNav } from "./SidebarNav";
import { useIsMobile } from "@/hooks/use-mobile";

interface AppShellProps {
  children: ReactNode;
  className?: string;
  /**
   * Override default max-width strategy.
   * Defaults to a readable centered container.
   * Use "full" for pages that need the full width (e.g., DocVault with sidebar).
   */
  contentWidth?: "default" | "narrow" | "full";
  /**
   * Whether to include horizontal padding inside the main content.
   * Defaults to true (16px mobile, comfortable margins desktop).
   */
  contentPadding?: boolean;
  /**
   * Whether to render bottom navigation spacing on mobile.
   * Defaults to true. Disable only for pages that bring their own navigation.
   */
  showMobileNavSpacing?: boolean;
}

export function AppShell({
  children,
  className = "",
  contentWidth = "default",
  contentPadding = true,
  showMobileNavSpacing = true,
}: AppShellProps) {
  const isMobile = useIsMobile();

  const maxWidthClass =
    contentWidth === "full"
      ? "max-w-none"
      : contentWidth === "narrow"
      ? "max-w-2xl"
      : "max-w-5xl";

  const paddingClass = contentPadding
    ? "px-4 md:px-6"
    : "";

  const bottomSpacing = showMobileNavSpacing && isMobile
    ? "pb-[calc(70px+var(--safe-area-bottom,0px)+16px)]"
    : showMobileNavSpacing
    ? "md:pb-6"
    : "";

  return (
    <SafeAreaContainer>
      <div className={`min-h-screen page-bg flex w-full overflow-x-hidden ${className}`}>
        {/* Desktop Sidebar — hidden on mobile */}
        <SidebarNav />

        {/* Main Column */}
        <div className="flex-1 flex flex-col min-w-0 w-full">
          <main
            className={`flex-1 w-full ${paddingClass} ${bottomSpacing} ${maxWidthClass} ${
              contentWidth !== "full" ? "mx-auto" : ""
            }`}
          >
            {children}
          </main>
        </div>

        {/* Mobile Bottom Navigation — mounted via dedicated component at fixed position */}
        {isMobile && <BottomNavigation />}
      </div>
    </SafeAreaContainer>
  );
}
