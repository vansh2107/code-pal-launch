import { CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { FileText, AlertTriangle, CheckCircle, Clock } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { cn } from "@/lib/utils";

function GlowBorderCard({
  children,
  className,
  onClick,
  borderColor,
  glowColor,
}: {
  children: React.ReactNode;
  className?: string;
  onClick?: () => void;
  borderColor: string;
  glowColor: string;
}) {
  return (
    <div
      className={cn(
        "relative cursor-pointer rounded-2xl border-2 bg-card text-card-foreground shadow-sm smooth card-hover w-full animate-border-glow",
        className
      )}
      onClick={onClick}
      style={{
        borderColor,
        "--glow-color": glowColor,
      } as React.CSSProperties}
    >
      {children}
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
      <GradientBorderCard
        gradientColors={["hsl(35,100%,51%)", "hsl(35,100%,60%)"]}
        onClick={() => handleCardClick('all')}
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
      </GradientBorderCard>

      <GradientBorderCard
        className="bg-valid-bg"
        gradientColors={["hsl(122,46%,34%)", "hsl(122,70%,55%)"]}
        onClick={() => handleCardClick('valid')}
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
      </GradientBorderCard>

      <GradientBorderCard
        className="bg-expiring-bg"
        gradientColors={["hsl(45,100%,33%)", "hsl(45,100%,55%)"]}
        onClick={() => handleCardClick('expiring')}
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
      </GradientBorderCard>

      <GradientBorderCard
        className="bg-expired-bg"
        gradientColors={["hsl(0,65%,56%)", "hsl(0,80%,70%)"]}
        onClick={() => handleCardClick('expired')}
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
      </GradientBorderCard>
    </div>
  );
}
