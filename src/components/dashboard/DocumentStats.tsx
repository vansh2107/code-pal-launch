import { CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { FileText, AlertTriangle, CheckCircle, Clock } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { cn } from "@/lib/utils";
import { useEffect, useRef, useState } from "react";

interface DocumentStatsProps {
  total: number;
  expiringSoon: number;
  expired: number;
  valid: number;
}

/**
 * SVG-based rotating gradient border that works reliably on Android WebView.
 * Uses SVG animateTransform (hardware-accelerated) instead of CSS background tricks.
 */
function RotatingBorderSVG({ colors, id }: { colors: [string, string]; id: string }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });

  useEffect(() => {
    const el = containerRef.current?.parentElement;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect;
      setSize({ w: Math.ceil(width), h: Math.ceil(height) });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const { w, h } = size;
  if (w === 0 || h === 0) return <div ref={containerRef} className="absolute inset-0" />;

  const borderWidth = 4;
  const radius = 16; // matches rounded-2xl
  // Diagonal = hypotenuse of the card, used to size the rotating gradient circle
  const diagonal = Math.sqrt(w * w + h * h);

  return (
    <div ref={containerRef} className="absolute inset-0 pointer-events-none" aria-hidden="true">
      <svg
        width={w}
        height={h}
        viewBox={`0 0 ${w} ${h}`}
        className="absolute inset-0"
        style={{ overflow: "visible" }}
      >
        <defs>
          {/* Rotating gradient defined as a radial split — two semicircles */}
          <linearGradient id={`grad-${id}`} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor={colors[0]} />
            <stop offset="50%" stopColor={colors[1]} />
            <stop offset="100%" stopColor={colors[0]} />
          </linearGradient>

          {/* Clip to the border ring shape (outer rect minus inner rect) */}
          <mask id={`mask-${id}`}>
            <rect x="0" y="0" width={w} height={h} rx={radius} ry={radius} fill="white" />
            <rect
              x={borderWidth}
              y={borderWidth}
              width={w - borderWidth * 2}
              height={h - borderWidth * 2}
              rx={radius - borderWidth}
              ry={radius - borderWidth}
              fill="black"
            />
          </mask>
        </defs>

        {/* Rotating gradient rectangle, masked to only show the border ring */}
        <g mask={`url(#mask-${id})`}>
          <rect
            x={w / 2 - diagonal / 2}
            y={h / 2 - diagonal / 2}
            width={diagonal}
            height={diagonal}
            fill={`url(#grad-${id})`}
            style={{ transformOrigin: `${w / 2}px ${h / 2}px` }}
          >
            <animateTransform
              attributeName="transform"
              type="rotate"
              from={`0 ${w / 2} ${h / 2}`}
              to={`360 ${w / 2} ${h / 2}`}
              dur="4s"
              repeatCount="indefinite"
            />
          </rect>
        </g>
      </svg>
    </div>
  );
}

function GradientBorderCard({
  children,
  className,
  onClick,
  gradientColors,
  cardId,
}: {
  children: React.ReactNode;
  className?: string;
  onClick?: () => void;
  gradientColors: [string, string];
  cardId: string;
}) {
  return (
    <div
      className="relative rounded-2xl cursor-pointer"
      onClick={onClick}
    >
      <RotatingBorderSVG colors={gradientColors} id={cardId} />
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
        cardId="total"
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
        cardId="valid"
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
        cardId="expiring"
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
        cardId="expired"
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
