import { useAuth } from "@/hooks/useAuth";
import { firebaseAuth } from "@/integrations/firebase/client";
import { Navigate } from "react-router-dom";
import { useEffect, useState } from "react";

interface ProtectedRouteProps {
  children: React.ReactNode;
}

export function ProtectedRoute({ children }: ProtectedRouteProps) {
  const { user, loading } = useAuth();
  const [showAnyway, setShowAnyway] = useState(false);

  // Fail-safe: if loading takes >2s, stop blocking
  useEffect(() => {
    if (!loading) return;
    const timer = setTimeout(() => setShowAnyway(true), 2000);
    return () => clearTimeout(timer);
  }, [loading]);

  const activeUser = user || firebaseAuth.currentUser;

  if ((loading || (!user && firebaseAuth.currentUser)) && !showAnyway) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  if (!activeUser) {
    return <Navigate to="/auth" replace />;
  }

  return <>{children}</>;
}