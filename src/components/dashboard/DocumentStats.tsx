import { CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { FileText, AlertTriangle, CheckCircle, Clock } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { cn } from "@/lib/utils";

const BORDER_WIDTH = 2.5;
const BORDER_RADIUS = 16;

function RotatingBorderCard({
  children,
  className,
  onClick,
  gradientColors,
}: {
  children: React.ReactNode;
  className?: string;
  onClick?: () => void;
  gradientColors: [string, string];
}) {
  return (
    <div
      className="relative cursor-pointer overflow-hidden"
      onClick={onClick}
      style={{ borderRadius: BORDER_RADIUS, padding: BORDER_WIDTH }}
    >
      {/* Scale wrapper (no animation) */}
      <div className="absolute inset-[-50%] w-[200%] h-[200%]">
        {/* Rotation child */}
        <div
          className="w-full h-full animate-spin-slow"
          style={{
            background: `conic-gradient(from 0deg, ${gradientColors[0]}, ${gradientColors[1]}, ${gradientColors[0]})`,
          }}
        />
      </div>
      {/* Inner card — z-10 + isolate to guarantee it covers the gradient fully */}
      <div
        className={cn(
          "relative z-10 bg-card text-card-foreground shadow-sm smooth card-hover w-full",
          className
        )}
        style={{ borderRadius: BORDER_RADIUS - BORDER_WIDTH }}
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
      <RotatingBorderCard
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
      </RotatingBorderCard>

      <RotatingBorderCard
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
      </RotatingBorderCard>

      <RotatingBorderCard
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
      </RotatingBorderCard>

      <RotatingBorderCard
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
      </RotatingBorderCard>
    </div>
  );
}
