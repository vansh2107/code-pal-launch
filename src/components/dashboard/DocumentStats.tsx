import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { FileText, AlertTriangle, CheckCircle, Clock } from "lucide-react";
import { useNavigate } from "react-router-dom";

function MetallicCard({
  children,
  onClick,
  gradient,
  borderColor,
}: {
  children: React.ReactNode;
  onClick: () => void;
  gradient: string;
  borderColor: string;
}) {
  return (
    <div
      className="cursor-pointer rounded-2xl p-[1px] shadow-sm transition-transform duration-200 hover:scale-[1.02]"
      onClick={onClick}
      style={{
        background: borderColor,
      }}
    >
      <div
        className="rounded-[15px] p-0"
        style={{
          background: gradient,
        }}
      >
        {children}
      </div>
    </div>
  );
}

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
      <MetallicCard
        onClick={() => handleCardClick('all')}
        gradient="linear-gradient(145deg, hsl(0 0% 100%), hsl(30 20% 97%), hsl(0 0% 94%))"
        borderColor="linear-gradient(135deg, hsl(0 0% 88%), hsl(0 0% 78%), hsl(0 0% 90%))"
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
      </MetallicCard>

      <MetallicCard
        onClick={() => handleCardClick('valid')}
        gradient="linear-gradient(145deg, hsl(115 50% 96%), hsl(120 40% 93%), hsl(115 30% 90%))"
        borderColor="linear-gradient(135deg, hsl(122 30% 78%), hsl(122 25% 68%), hsl(122 30% 80%))"
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
      </MetallicCard>

      <MetallicCard
        onClick={() => handleCardClick('expiring')}
        gradient="linear-gradient(145deg, hsl(48 80% 95%), hsl(45 70% 91%), hsl(48 50% 87%))"
        borderColor="linear-gradient(135deg, hsl(45 60% 72%), hsl(45 50% 62%), hsl(45 60% 74%))"
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
      </MetallicCard>

      <MetallicCard
        onClick={() => handleCardClick('expired')}
        gradient="linear-gradient(145deg, hsl(0 70% 96%), hsl(0 55% 93%), hsl(0 40% 89%))"
        borderColor="linear-gradient(135deg, hsl(0 45% 76%), hsl(0 40% 66%), hsl(0 45% 78%))"
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
      </MetallicCard>
    </div>
  );
}
