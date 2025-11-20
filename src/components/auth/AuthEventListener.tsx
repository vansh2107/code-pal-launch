import { useEffect } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";

export default function AuthEventListener() {
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    // If the URL already indicates a recovery flow, ensure we land on the reset screen
    const url = new URL(window.location.href);
    const hasCode = url.searchParams.get("code");
    const isRecoveryHash = window.location.hash.includes("type=recovery");

    const goToReset = () => {
      if (location.pathname !== "/reset-password") {
        navigate("/reset-password", { replace: true });
      }
    };

    if (hasCode) {
      // Exchange code and go to reset
      supabase.auth.exchangeCodeForSession(url.href).finally(() => {
        goToReset();
      });
    } else if (isRecoveryHash) {
      // Hash-based recovery links
      goToReset();
    }

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === "PASSWORD_RECOVERY") {
        goToReset();
      }
    });

    return () => subscription.unsubscribe();
  }, [location.pathname, navigate]);

  return null;
}
