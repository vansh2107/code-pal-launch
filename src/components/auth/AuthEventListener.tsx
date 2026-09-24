import { useEffect } from "react";
import { useLocation, useNavigate } from "react-router-dom";

export default function AuthEventListener() {
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    const url = new URL(window.location.href);
    const mode = url.searchParams.get("mode");
    const oobCode = url.searchParams.get("oobCode");

    if (mode === "resetPassword" || (oobCode && location.pathname !== "/reset-password")) {
      if (location.pathname !== "/reset-password") {
        navigate("/reset-password", { replace: true });
      }
    }
  }, [location.pathname, navigate]);

  return null;
}
