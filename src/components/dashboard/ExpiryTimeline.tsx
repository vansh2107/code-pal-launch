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
    <Card className="p-0 overflow-hidden animate-fade-in">
      <div className="px-4 pt-4 pb-2 animate-scale-in">
        <h2 className="text-lg font-bold">Expiry Timeline</h2>
        <p className="text-sm text-muted-foreground">Scroll to explore past and upcoming expiries</p>
      </div>

      <div
        ref={containerRef}
        className="relative max-h-[420px] overflow-y-auto px-6 pb-6 scroll-smooth"
      >
        {/* Vertical timeline line - spans full content height */}
        <div 
          className="absolute left-1/2 -translate-x-1/2 w-[3px] bg-gradient-to-b from-primary/20 via-primary/50 to-primary/20 pointer-events-none z-0" 
          style={{ 
            top: '24px',
            bottom: '24px',
            minHeight: '100%'
          }} 
        />

        {/* Moving current-date marker */}
        <div
          className="pointer-events-none absolute left-1/2 -translate-x-1/2 -translate-y-1/2 transition-all duration-700 ease-out z-10"
          style={{ top: `calc(${markerOffset * 100}%)` }}
        >
          <div className="relative animate-scale-in" style={{ animationDelay: '200ms' }}>
            <div className="h-3 w-3 rounded-full bg-primary border-2 border-primary-foreground/20 transition-all duration-300 shadow-[0_0_8px_rgba(255,149,6,0.4)]" />
          </div>
        </div>

        <ul className="relative space-y-8 py-6 z-1">
          {items.map((item, idx) => {
            const isActive = item.index === activeIndex;
            const baseFade = item.isPast ? "opacity-60" : "opacity-100";
            const sideClass = item.side === "left" ? "pr-12 md:pr-24" : "pl-12 md:pl-24";
            const align = item.side === "left" ? "md:items-end" : "md:items-start";
            const floatSide = item.side === "left" ? "md:mr-auto md:pr-6" : "md:ml-auto md:pl-6";
            const animationDelay = `${(idx * 80) + 300}ms`;
            
            // Determine status color for dot
            const dotColorClass = item.isPast 
              ? "bg-expired border-expired" 
              : item.isToday 
              ? "bg-expiring border-expiring" 
              : "bg-valid border-valid";

            return (
              <li key={item.doc.id} className="relative animate-fade-in" style={{ animationDelay }}>
                {/* Connector dot with status color - higher z-index to stay above line */}
                <div 
                  className={`absolute left-1/2 top-1.5 -translate-x-1/2 h-3 w-3 rounded-full ${dotColorClass} animate-scale-in transition-all duration-300 hover:scale-125 z-10`} 
                  style={{ animationDelay }} 
                />

                <div className={`grid grid-cols-1 md:grid-cols-2 ${sideClass} ${align}`} data-tl-card data-index={item.index}>
                  {item.side === "left" ? (
                    <div className="hidden md:block" />
                  ) : null}

                  <div
                    className={`relative ${floatSide} transition-all duration-500 ease-out ${baseFade} z-1`}
                  >
                    <Link
                      to={`/documents/${item.doc.id}`}
                      className="group block relative border border-border/80 rounded-[14px] bg-card p-4 card-hover shadow-[0_3px_10px_rgba(0,0,0,0.06)]"
                    >
                      <div className="flex items-center gap-2 text-xs text-muted-foreground transition-all duration-300 mb-2">
                        <Calendar className="h-4 w-4 transition-transform duration-300 group-hover:scale-110" />
                        <span className="transition-all duration-300">{item.expiry.toLocaleDateString()}</span>
                        <Badge 
                          variant={item.isPast ? "destructive" : item.isToday ? "secondary" : "default"} 
                          className="text-xs px-2 py-0.5"
                        >
                          {item.isPast ? "Expired" : item.isToday ? "Today" : "Upcoming"}
                        </Badge>
                      </div>

                      <div className="transition-all duration-300">
                        <div className="font-semibold text-sm text-foreground line-clamp-1 mb-1">{item.doc.name}</div>
                        <div className="text-xs text-muted-foreground capitalize line-clamp-1 transition-all duration-300">{item.doc.document_type.replace("_", " ")}</div>
                      </div>

                      <div className="mt-2 flex items-center gap-1 text-[11px] text-muted-foreground transition-all duration-300">
                        <Clock className="h-3 w-3 transition-transform duration-300 group-hover:scale-110" />
                        <span className="transition-all duration-300">{diffFromTodayLabel(item.expiry, today)}</span>
                      </div>
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


