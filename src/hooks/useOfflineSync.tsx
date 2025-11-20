import { useEffect, useState } from "react";
import { useToast } from "@/hooks/use-toast";

export const useOfflineSync = () => {
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const { toast } = useToast();

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

  return { isOnline };
};
