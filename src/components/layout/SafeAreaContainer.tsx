import { ReactNode } from "react";

interface SafeAreaContainerProps {
  children: ReactNode;
  className?: string;
}

/**
 * SafeAreaContainer - Wraps content with proper safe area insets for:
 * - Punch hole / camera cutout
 * - Notch displays
 * - Curved corners
 * - Tall status bar areas
 * - Tablets and foldables
 * - Gesture navigation bars
 */
export function SafeAreaContainer({ children, className = "" }: SafeAreaContainerProps) {
  return (
    <div
      className={`safe-area-container ${className}`}
      style={{
        paddingTop: "env(safe-area-inset-top, 0px)",
        paddingLeft: "env(safe-area-inset-left, 0px)",
        paddingRight: "env(safe-area-inset-right, 0px)",
        boxSizing: "border-box",
        width: "100%",
        minHeight: "100%",
      }}
    >
      {children}
    </div>
  );
}
