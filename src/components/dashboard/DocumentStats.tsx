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
            background: `conic-gradient(from 0deg, ${gradientColors[0]}, ${gradientColors[1]}, transparent, ${gradientColors[0]})`,
          }}
        />
      </div>
      {/* Inner card */}
      <div
        className={cn(
          "relative bg-card text-card-foreground shadow-sm smooth card-hover w-full",
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
      <GlowBorderCard
        borderColor="hsl(35,100%,51%)"
        glowColor="hsl(35,100%,51%)"
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
      </GlowBorderCard>

      <GlowBorderCard
        className="bg-valid-bg"
        borderColor="hsl(122,46%,34%)"
        glowColor="hsl(122,50%,45%)"
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
      </GlowBorderCard>

      <GlowBorderCard
        className="bg-expiring-bg"
        borderColor="hsl(45,100%,33%)"
        glowColor="hsl(45,100%,45%)"
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
      </GlowBorderCard>

      <GlowBorderCard
        className="bg-expired-bg"
        borderColor="hsl(0,65%,56%)"
        glowColor="hsl(0,65%,56%)"
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
      </GlowBorderCard>
    </div>
  );
}
