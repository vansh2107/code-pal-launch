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
  innerBg = "hsl(0 0% 100%)",
}: {
  children: React.ReactNode;
  className?: string;
  onClick?: () => void;
  gradientColors: [string, string];
  innerBg?: string;
}) {
  return (
    <div
      className="relative cursor-pointer"
      onClick={onClick}
      style={{
        borderRadius: BORDER_RADIUS,
        padding: BORDER_WIDTH,
        isolation: "isolate",
      }}
    >
      {/* Rotating gradient layer */}
      <div
        className="absolute inset-0 overflow-hidden"
        style={{ borderRadius: BORDER_RADIUS, zIndex: 0 }}
      >
        <div className="absolute inset-[-50%] w-[200%] h-[200%]">
          <div
            className="w-full h-full animate-spin-slow"
            style={{
              background: `conic-gradient(from 0deg, ${gradientColors[0]}, ${gradientColors[1]}, transparent, ${gradientColors[0]})`,
              willChange: "transform",
              backfaceVisibility: "hidden",
            }}
          />
        </div>
      </div>
      {/* Inner card - explicit opaque bg via inline style */}
      <div
        className={cn(
          "relative text-card-foreground shadow-sm smooth card-hover w-full",
          className
        )}
        style={{
          borderRadius: BORDER_RADIUS - BORDER_WIDTH,
          zIndex: 1,
          backgroundColor: innerBg,
          backfaceVisibility: "hidden",
          transform: "translateZ(0)",
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
      <RotatingBorderCard
        gradientColors={["hsl(35,100%,51%)", "hsl(35,100%,60%)"]}
        onClick={() => handleCardClick('all')}
        innerBg="hsl(0 0% 100%)"
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
        gradientColors={["hsl(122,46%,34%)", "hsl(122,70%,55%)"]}
        onClick={() => handleCardClick('valid')}
        innerBg="hsl(115 68% 94%)"
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
        gradientColors={["hsl(45,100%,33%)", "hsl(45,100%,55%)"]}
        onClick={() => handleCardClick('expiring')}
        innerBg="hsl(48 100% 90%)"
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
        gradientColors={["hsl(0,65%,56%)", "hsl(0,80%,70%)"]}
        onClick={() => handleCardClick('expired')}
        innerBg="hsl(0 100% 95%)"
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
