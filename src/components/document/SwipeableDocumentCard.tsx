import { useState } from "react";
import { useSwipeable } from "react-swipeable";
import { Link } from "react-router-dom";
import { Trash2 } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { RenewalOptionsSheet } from "@/components/document/RenewalOptionsSheet";

interface SwipeableDocumentCardProps {
  doc: {
    id: string;
    name: string;
    document_type: string;
    category_detail?: string;
    issuing_authority: string;
    expiry_date: string;
  };
  statusInfo: {
    label: string;
    badgeVariant: "default" | "destructive" | "outline" | "secondary";
    colorClass: string;
    bgClass: string;
    borderClass: string;
    textClass: string;
  };
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

  return (
    <>
      <div className="relative overflow-hidden">
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
          <Link to={`/documents/${doc.id}`}>
            <Card
              className={`hover:shadow-lg transition-shadow cursor-pointer border-2 ${statusInfo.bgClass} ${statusInfo.borderClass}`}
            >
              <CardContent className="p-4">
                <div className="flex items-start justify-between mb-2">
                  <div className="flex-1">
                    <h3 className={`font-semibold mb-1 ${statusInfo.textClass}`}>
                      {doc.name}
                    </h3>
                    <p className="text-sm text-muted-foreground">
                      {getSubCategoryName(doc.category_detail || doc.document_type)}
                    </p>
                  </div>
                  <Badge variant={statusInfo.badgeVariant} className={statusInfo.colorClass}>
                    {statusInfo.label}
                  </Badge>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">Expires:</span>
                  <span className={`font-medium ${statusInfo.textClass}`}>
                    {new Date(doc.expiry_date).toLocaleDateString()}
                  </span>
                </div>
                {doc.issuing_authority && (
                  <div className="mt-2 text-sm text-muted-foreground">
                    Issued by: {doc.issuing_authority}
                  </div>
                )}
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
