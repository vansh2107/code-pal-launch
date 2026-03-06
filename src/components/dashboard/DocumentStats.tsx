import { CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { FileText, AlertTriangle, CheckCircle, Clock } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { cn } from "@/lib/utils";

interface DocumentStatsProps {
  total: number;
  expiringSoon: number;
  expired: number;
  valid: number;
}

function GradientBorderCard({
  children,
  className,
  onClick,
  gradientStyle,
}: {
  children: React.ReactNode;
  className?: string;
  onClick?: () => void;
  gradientStyle?: React.CSSProperties;
}) {
  return (
    <div
      className="relative rounded-2xl p-[2px] cursor-pointer overflow-hidden"
      onClick={onClick}
    >
      <div
        className="absolute animate-gradient-rotate rounded-2xl"
        style={gradientStyle}
      />
      <div
        className={cn(
          "relative rounded-2xl border-0 bg-card text-card-foreground shadow-sm smooth card-hover w-full",
          className
        )}
      >
        {children}
      </div>
    </div>
  );
}

export function DocumentStats({ total, expiringSoon, expired, valid }: DocumentStatsProps) {
  const navigate = useNavigate();

  const handleCardClick = (status: string) => {
    navigate(`/documents?status=${status}`);
  };

  return (
    <div className="grid grid-cols-2 gap-3">
      <GradientBorderCard
        gradientStyle={{ background: 'conic-gradient(hsl(var(--primary)), hsl(var(--accent)), hsl(var(--primary)), hsl(var(--accent)), hsl(var(--primary)))' }}
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
        gradientStyle={{ background: 'conic-gradient(hsl(var(--valid)), hsl(122, 70%, 55%), hsl(var(--valid)), hsl(122, 70%, 55%), hsl(var(--valid)))' }}
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
        gradientStyle={{ background: 'conic-gradient(hsl(var(--expiring)), hsl(45, 100%, 55%), hsl(var(--expiring)), hsl(45, 100%, 55%), hsl(var(--expiring)))' }}
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
        gradientStyle={{ background: 'conic-gradient(hsl(var(--expired)), hsl(0, 80%, 70%), hsl(var(--expired)), hsl(0, 80%, 70%), hsl(var(--expired)))' }}
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
