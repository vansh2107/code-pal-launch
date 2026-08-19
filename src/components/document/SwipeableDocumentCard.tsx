import { useState } from "react";
import { useSwipeable } from "react-swipeable";
import { Link } from "react-router-dom";
import { Trash2, CheckCircle2, Clock, XCircle } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { RenewalOptionsSheet } from "@/components/document/RenewalOptionsSheet";
import { hasValidExpiryDate, type DocumentStatusInfo } from "@/utils/documentStatus";

interface SwipeableDocumentCardProps {
  doc: {
    id: string;
    name: string;
    document_type: string;
    category_detail?: string;
    issuing_authority: string;
    expiry_date: string | null;
  };
  statusInfo: DocumentStatusInfo;
  onDelete: (id: string) => void;
  getSubCategoryName: (type: string) => string;
}

export function SwipeableDocumentCard({
  doc,
  statusInfo,
  onDelete,
  getSubCategoryName,
}: SwipeableDocumentCardProps) {
  const [swipeOffset, setSwipeOffset] = useState(0);
  const [showRenewalSheet, setShowRenewalSheet] = useState(false);

  const handlers = useSwipeable({
    onSwiping: (eventData) => {
      if (eventData.dir === "Left") {
        const offset = Math.min(Math.abs(eventData.deltaX), 80);
        setSwipeOffset(offset);
      }
    },
    onSwipedLeft: () => {
      setSwipeOffset(80);
      setShowRenewalSheet(true);
    },
    onSwipedRight: () => {
      setSwipeOffset(0);
    },
    onTap: () => {
      if (swipeOffset > 0) {
        setSwipeOffset(0);
      }
    },
    trackMouse: false,
    trackTouch: true,
  });

  const handleDeleteClick = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setShowRenewalSheet(true);
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'valid':
        return <CheckCircle2 className="h-3.5 w-3.5 mr-1" />;
      case 'expiring':
        return <Clock className="h-3.5 w-3.5 mr-1" />;
      case 'expired':
        return <XCircle className="h-3.5 w-3.5 mr-1" />;
      default:
        return null;
    }
  };

  return (
    <>
      <div className="relative overflow-hidden rounded-[16px]">
        {/* Delete background */}
        <div
          className="absolute right-0 top-0 bottom-0 bg-destructive flex items-center justify-center px-6 transition-all duration-200"
          style={{ width: `${swipeOffset}px` }}
        >
          <Trash2 className="h-5 w-5 text-destructive-foreground" />
        </div>

        {/* Swipeable card */}
        <div
          {...handlers}
          className="relative transition-transform duration-200 ease-out"
          style={{ transform: `translateX(-${swipeOffset}px)` }}
        >
          <Link to={`/documents/${doc.id}`} aria-label={`View document ${doc.name}`}>
            <Card
              className="hover:shadow-md transition-shadow cursor-pointer border border-border rounded-[16px] bg-card text-card-foreground shadow-sm"
            >
              <CardContent className="p-4">
                <div className="flex items-start justify-between gap-3 mb-2">
                  <div className="flex-1 min-w-0">
                    <h3 className="text-[15px] font-semibold leading-[22px] text-foreground truncate mb-1" title={doc.name}>
                      {doc.name}
                    </h3>
                    <p className="text-[13px] leading-[20px] text-muted-foreground truncate">
                      {getSubCategoryName(doc.category_detail || doc.document_type)}
                      {doc.issuing_authority && ` · ${doc.issuing_authority}`}
                    </p>
                  </div>
                  <Badge variant={statusInfo.badgeVariant} className={`shrink-0 flex items-center font-medium ${statusInfo.colorClass}`}>
                    {getStatusIcon(statusInfo.status)}
                    {statusInfo.label}
                  </Badge>
                </div>
                <div className="flex items-center justify-between text-[13px] leading-[20px] pt-1 border-t border-border/50 mt-3">
                  <span className="text-muted-foreground">Expiration Date</span>
                  <span className={`font-medium ${statusInfo.textClass}`}>
                    {hasValidExpiryDate(doc.expiry_date)
                      ? new Date(doc.expiry_date as string).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })
                      : 'No expiry'}
                  </span>
                </div>
              </CardContent>
            </Card>
          </Link>
        </div>

        {/* Delete button overlay */}
        {swipeOffset > 0 && (
          <button
            onClick={handleDeleteClick}
            className="absolute right-0 top-0 bottom-0 bg-destructive flex items-center justify-center px-6 z-10"
            style={{ width: `${swipeOffset}px` }}
            aria-label="Delete document"
          >
            <Trash2 className="h-5 w-5 text-destructive-foreground" />
          </button>
        )}
      </div>

      {/* Renewal Options Sheet */}
      <RenewalOptionsSheet
        open={showRenewalSheet}
        onOpenChange={(open) => {
          setShowRenewalSheet(open);
          if (!open) {
            setSwipeOffset(0);
          }
        }}
        documentId={doc.id}
        documentName={doc.name}
        onSuccess={() => onDelete(doc.id)}
      />
    </>
  );
}
