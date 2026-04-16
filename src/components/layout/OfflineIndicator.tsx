import { useOfflineSync } from "@/hooks/useOfflineSync";
import { Wifi, WifiOff, RefreshCw, CloudOff } from "lucide-react";
import { Button } from "@/components/ui/button";

export function OfflineIndicator() {
  const { isOnline, syncStatus, pendingCount, manualSync } = useOfflineSync();

  // Don't show anything when online and fully synced
  if (isOnline && pendingCount === 0 && syncStatus !== "syncing") {
    return null;
  }

  return (
    <div className="fixed top-0 left-0 right-0 z-[60] pointer-events-none">
      <div className="mx-auto max-w-md pointer-events-auto">
        {/* Offline banner */}
        {!isOnline && (
          <div className="bg-destructive/90 backdrop-blur-sm text-destructive-foreground px-4 py-2 flex items-center justify-center gap-2 text-sm font-medium">
            <WifiOff className="h-4 w-4" />
            <span>Offline Mode</span>
            {pendingCount > 0 && (
              <span className="bg-background/20 rounded-full px-2 py-0.5 text-xs">
                {pendingCount} pending
              </span>
            )}
          </div>
        )}

        {/* Syncing banner */}
        {isOnline && syncStatus === "syncing" && (
          <div className="bg-primary/90 backdrop-blur-sm text-primary-foreground px-4 py-2 flex items-center justify-center gap-2 text-sm font-medium">
            <RefreshCw className="h-4 w-4 animate-spin" />
            <span>Syncing...</span>
          </div>
        )}

        {/* Pending changes when online */}
        {isOnline && pendingCount > 0 && syncStatus !== "syncing" && (
          <div className="bg-amber-500/90 backdrop-blur-sm text-white px-4 py-2 flex items-center justify-between text-sm font-medium">
            <div className="flex items-center gap-2">
              <CloudOff className="h-4 w-4" />
              <span>{pendingCount} change{pendingCount > 1 ? "s" : ""} to sync</span>
            </div>
            <Button
              size="sm"
              variant="ghost"
              className="h-7 text-white hover:bg-white/20"
              onClick={manualSync}
            >
              Sync Now
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
