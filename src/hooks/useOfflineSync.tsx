import { useEffect, useState, useCallback } from "react";
import { useToast } from "@/hooks/use-toast";
import { fullSync, onSyncStatus, registerAutoSync } from "@/utils/syncEngine";
import { getPendingSyncCount } from "@/utils/offlineStorage";

export const useOfflineSync = () => {
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [syncStatus, setSyncStatus] = useState<"idle" | "syncing" | "error" | "success">("idle");
  const [pendingCount, setPendingCount] = useState(0);
  const { toast } = useToast();

  // Register auto-sync once
  useEffect(() => {
    registerAutoSync();
  }, []);

  // Track online/offline
  useEffect(() => {
    const handleOnline = () => {
      setIsOnline(true);
      toast({
        title: "Back Online",
        description: "Syncing your data...",
      });
    };

    const handleOffline = () => {
      setIsOnline(false);
      toast({
        title: "You're Offline",
        description: "Changes will sync when you're back online.",
        variant: "destructive",
      });
    };

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);

    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, [toast]);

  // Listen to sync status
  useEffect(() => {
    const unsub = onSyncStatus((status, message) => {
      setSyncStatus(status);
      if (status === "success" && message) {
        toast({ title: "Sync Complete", description: message });
      }
      if (status === "error" && message) {
        toast({ title: "Sync Error", description: message, variant: "destructive" });
      }
      // Refresh pending count
      getPendingSyncCount().then(setPendingCount);
    });
    return unsub;
  }, [toast]);

  // Refresh pending count periodically
  useEffect(() => {
    getPendingSyncCount().then(setPendingCount);
    const interval = setInterval(() => {
      getPendingSyncCount().then(setPendingCount);
    }, 10000);
    return () => clearInterval(interval);
  }, []);

  const manualSync = useCallback(async () => {
    await fullSync();
  }, []);

  return {
    isOnline,
    syncStatus,
    pendingCount,
    manualSync,
  };
};
