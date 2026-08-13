import { FileText, AlertTriangle, CheckCircle, Clock } from "lucide-react";
import { useNavigate } from "react-router-dom";

type StatCard = {
  key: string;
  label: string;
  value: number;
  icon: React.ComponentType<{ className?: string }>;
  accent: string;
  bg: string;
};

export function DocumentStats({ total, expiringSoon, expired, valid }: {
  total: number;
  expiringSoon: number;
  expired: number;
  valid: number;
}) {
  const navigate = useNavigate();

  const cards: StatCard[] = [
    { key: "all", label: "Total Documents", value: total, icon: FileText, accent: "hsl(var(--primary))", bg: "hsl(var(--card))" },
    { key: "valid", label: "Valid", value: valid, icon: CheckCircle, accent: "hsl(var(--valid))", bg: "hsl(var(--valid-bg))" },
    { key: "expiring", label: "Expiring Soon", value: expiringSoon, icon: Clock, accent: "hsl(var(--expiring))", bg: "hsl(var(--expiring-bg))" },
    { key: "expired", label: "Expired", value: expired, icon: AlertTriangle, accent: "hsl(var(--expired))", bg: "hsl(var(--expired-bg))" },
  ];

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
      {cards.map(({ key, label, value, icon: Icon, accent, bg }) => (
        <button
          key={key}
          onClick={() => navigate(`/documents?status=${key}`)}
          className="group relative text-left rounded-[14px] p-4 border border-border/80 transition-all duration-200 ease-out hover:-translate-y-0.5 hover:shadow-card-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          style={{ background: bg, boxShadow: "var(--card-shadow)" }}
        >
          <div className="flex items-center justify-between mb-3">
            <span
              className="flex h-9 w-9 items-center justify-center rounded-xl"
              style={{ background: "hsl(var(--background))", color: accent }}
            >
              <Icon className="h-4 w-4" />
            </span>
            <span aria-hidden className="h-2 w-2 rounded-full" style={{ background: accent }} />
          </div>
          <div className="text-[26px] font-bold tracking-tight text-foreground leading-none">
            {value}
          </div>
          <div className="text-[13px] font-medium text-muted-foreground mt-1.5">
            {label}
          </div>
        </button>
      ))}
    </div>
  );
}
