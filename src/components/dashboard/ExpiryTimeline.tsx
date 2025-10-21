import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Calendar, Clock } from "lucide-react";

interface DocumentItem {
  id: string;
  name: string;
  document_type: string;
  expiry_date: string;
  created_at: string;
}

interface ExpiryTimelineProps {
  documents: DocumentItem[];
}

export function ExpiryTimeline({ documents }: ExpiryTimelineProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [markerOffset, setMarkerOffset] = useState(0);
  const [activeIndex, setActiveIndex] = useState<number>(-1);

  const today = useMemo(() => new Date(), []);

  const items = useMemo(() => {
    const sorted = [...documents].sort((a, b) => new Date(a.expiry_date).getTime() - new Date(b.expiry_date).getTime());
    return sorted.map((doc, index) => {
      const expiry = new Date(doc.expiry_date);
      const isPast = expiry < today;
      const isFuture = expiry > today;
      const isToday = expiry.toDateString() === today.toDateString();
      return {
        index,
        doc,
        expiry,
        isPast,
        isFuture,
        isToday,
        side: index % 2 === 0 ? "left" : "right",
      };
    });
  }, [documents, today]);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const handleScroll = () => {
      const { scrollTop, scrollHeight, clientHeight } = el;
      const progress = scrollHeight <= clientHeight ? 0 : scrollTop / (scrollHeight - clientHeight);
      setMarkerOffset(progress);
    };

    el.addEventListener("scroll", handleScroll, { passive: true });
    handleScroll();

    return () => {
      el.removeEventListener("scroll", handleScroll as EventListener);
    };
  }, []);

  useEffect(() => {
    if (!containerRef.current) return;
    const el = containerRef.current;
    const cards = Array.from(el.querySelectorAll<HTMLDivElement>("[data-tl-card]"));

    const observer = new IntersectionObserver(
      (entries) => {
        // Find the first mostly visible future card to highlight as active
        const visible = entries
          .filter((e) => e.isIntersecting && e.intersectionRatio > 0.5)
          .map((e) => Number(e.target.getAttribute("data-index")));
        if (visible.length) {
          setActiveIndex(Math.min(...visible));
        }
      },
      { root: el, threshold: [0.25, 0.5, 0.75] }
    );

    cards.forEach((c) => observer.observe(c));
    return () => observer.disconnect();
  }, [items.length]);

  if (items.length === 0) {
    return (
      <Card className="p-6">
        <div className="text-sm text-muted-foreground text-center py-8">No documents to display</div>
      </Card>
    );
  }

  return (
    <Card className="p-0 overflow-hidden">
      <div className="px-4 pt-6 pb-2">
        <h2 className="text-lg font-semibold">Expiry Timeline</h2>
        <p className="text-sm text-muted-foreground">Scroll to explore past and upcoming expiries</p>
      </div>

      <div
        ref={containerRef}
        className="relative max-h-[420px] overflow-y-auto px-6 pb-6"
      >
        {/* Vertical glowing line */}
        <div className="absolute left-1/2 top-0 -translate-x-1/2 h-full w-[2px] bg-gradient-to-b from-primary/40 via-primary to-primary/40" style={{ boxShadow: '0 0 20px hsl(var(--primary) / 0.5)' }} />

        {/* Moving current-date marker */}
        <div
          className="pointer-events-none absolute left-1/2 -translate-x-1/2 -translate-y-1/2"
          style={{ top: `calc(${markerOffset * 100}%)` }}
        >
          <div className="relative">
            <div className="h-3 w-3 rounded-full bg-background border border-primary" style={{ boxShadow: '0 0 12px hsl(var(--primary) / 0.8)' }} />
            <div className="absolute -left-2 -right-2 -top-2 -bottom-2 rounded-full blur-md bg-primary/30" />
          </div>
        </div>

        <ul className="relative space-y-8 py-6">
          {items.map((item) => {
            const isActive = item.index === activeIndex;
            const baseFade = item.isPast ? "opacity-50" : item.isFuture ? "opacity-100" : "opacity-90";
            const glowClass = item.isFuture || isActive ? "border-primary/50" : "border-border";
            const glowStyle = item.isFuture || isActive ? { boxShadow: '0 0 24px hsl(var(--primary) / 0.35)' } : {};
            const sideClass = item.side === "left" ? "pr-12 md:pr-24" : "pl-12 md:pl-24";
            const align = item.side === "left" ? "md:items-end" : "md:items-start";
            const floatSide = item.side === "left" ? "md:mr-auto md:pr-6" : "md:ml-auto md:pl-6";

            return (
              <li key={item.doc.id} className="relative">
                {/* Connector dot */}
                <div className="absolute left-1/2 top-1.5 -translate-x-1/2 h-3 w-3 rounded-full bg-primary border border-primary/60" />

                <div className={`grid grid-cols-1 md:grid-cols-2 ${sideClass} ${align}`} data-tl-card data-index={item.index}>
                  {item.side === "left" ? (
                    <div className="hidden md:block" />
                  ) : null}

                  <div
                    className={`relative ${floatSide} transition-all duration-500 ${baseFade}`}
                  >
                    <Link
                      to={`/document/${item.doc.id}`}
                      className={`block relative border rounded-lg bg-card p-3 hover:translate-y-[-2px] smooth ${glowClass}`}
                      style={glowStyle}
                    >
                      <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        <Calendar className="h-3.5 w-3.5" />
                        <span>{item.expiry.toLocaleDateString()}</span>
                        <Badge variant={item.isPast ? "destructive" : "secondary"} className={item.isFuture ? "bg-accent text-accent-foreground" : ""}>
                          {item.isPast ? "Expired" : item.isToday ? "Today" : "Upcoming"}
                        </Badge>
                      </div>

                      <div className="mt-1.5">
                        <div className="font-medium text-sm text-foreground">{item.doc.name}</div>
                        <div className="text-xs text-muted-foreground capitalize">
                          {item.doc.document_type.replace("_", " ")}
                        </div>
                      </div>

                      <div className="mt-2 flex items-center gap-2 text-xs text-muted-foreground">
                        <Clock className="h-3.5 w-3.5" />
                        <span>
                          {diffFromTodayLabel(item.expiry, today)}
                        </span>
                      </div>

                      {item.isFuture || item.isToday ? (
                        <div className="pointer-events-none absolute inset-0 rounded-xl ring-1 ring-primary/15" />
                      ) : null}
                    </Link>
                  </div>

                  {item.side === "right" ? (
                    <div className="hidden md:block" />
                  ) : null}
                </div>
              </li>
            );
          })}
        </ul>
      </div>
    </Card>
  );
}

function diffFromTodayLabel(date: Date, today: Date): string {
  const oneDay = 1000 * 60 * 60 * 24;
  const diff = Math.round((date.getTime() - today.getTime()) / oneDay);
  if (diff === 0) return "Due today";
  if (diff > 0) return `Due in ${diff} day${diff === 1 ? "" : "s"}`;
  const past = Math.abs(diff);
  return `${past} day${past === 1 ? "" : "s"} ago`;
}


