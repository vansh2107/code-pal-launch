import { CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { FileText, AlertTriangle, CheckCircle, Clock } from "lucide-react";
import { useNavigate } from "react-router-dom";

export function DocumentStats({ total, expiringSoon, expired, valid }: {
  total: number;
  expiringSoon: number;
  expired: number;
  valid: number;
}) {
  const navigate = useNavigate();

  const handleCardClick = (status: string) => {
    navigate(`/documents?status=${status}`);
  };

  return (
    <div className="grid grid-cols-2 gap-3">
      <div
        className="cursor-pointer rounded-2xl shadow-sm transition-transform duration-200 hover:scale-[1.02]"
        onClick={() => handleCardClick('all')}
        style={{ background: "linear-gradient(145deg, hsl(0 0% 100%), hsl(30 20% 97%), hsl(0 0% 95%))" }}
      >
        <CardHeader className="pb-2">
          <CardTitle className="text-base font-semibold flex items-center gap-2">
            <FileText className="h-5 w-5 text-primary" />
            Total Documents
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold text-foreground">{total}</div>
        </CardContent>
      </div>

      <div
        className="cursor-pointer rounded-2xl shadow-sm transition-transform duration-200 hover:scale-[1.02]"
        onClick={() => handleCardClick('valid')}
        style={{ background: "linear-gradient(145deg, hsl(115 50% 96%), hsl(120 40% 94%), hsl(115 35% 91%))" }}
      >
        <CardHeader className="pb-2">
          <CardTitle className="text-base font-semibold flex items-center gap-2">
            <CheckCircle className="h-5 w-5 text-valid-foreground" />
            Valid
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold text-valid-foreground">{valid}</div>
        </CardContent>
      </div>

      <div
        className="cursor-pointer rounded-2xl shadow-sm transition-transform duration-200 hover:scale-[1.02]"
        onClick={() => handleCardClick('expiring')}
        style={{ background: "linear-gradient(145deg, hsl(48 80% 96%), hsl(45 70% 93%), hsl(48 50% 89%))" }}
      >
        <CardHeader className="pb-2">
          <CardTitle className="text-base font-semibold flex items-center gap-2">
            <Clock className="h-5 w-5 text-expiring-foreground" />
            Expiring Soon
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold text-expiring-foreground">{expiringSoon}</div>
        </CardContent>
      </div>

      <div
        className="cursor-pointer rounded-2xl shadow-sm transition-transform duration-200 hover:scale-[1.02]"
        onClick={() => handleCardClick('expired')}
        style={{ background: "linear-gradient(145deg, hsl(0 70% 97%), hsl(0 55% 94%), hsl(0 40% 91%))" }}
      >
        <CardHeader className="pb-2">
          <CardTitle className="text-base font-semibold flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-expired-foreground" />
            Expired
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold text-expired-foreground">{expired}</div>
        </CardContent>
      </div>
    </div>
  );
}
