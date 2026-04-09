import { useAuth } from "@/hooks/useAuth";
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

  if (loading && !showAnyway) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/auth" replace />;
  }

  return <>{children}</>;
}