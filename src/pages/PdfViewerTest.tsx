// TEMPORARY test page for DocumentViewer verification — remove after testing.
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { DocumentViewer } from "@/components/document/DocumentViewer";

export default function PdfViewerTest() {
  const [viewer, setViewer] = useState<{ url: string; name: string } | null>(null);
  const [reopenKey, setReopenKey] = useState(0);

  return (
    <div className="min-h-screen p-6 flex flex-col gap-4 items-start">
      <h1 className="text-xl font-semibold">DocumentViewer test harness</h1>
      <div className="flex flex-wrap gap-3">
        <Button onClick={() => setViewer({ url: "/test/sample-1.pdf", name: "sample-1.pdf" })}>
          Open 1-page PDF
        </Button>
        <Button onClick={() => setViewer({ url: "/test/sample-5.pdf", name: "sample-5.pdf" })}>
          Open 5-page PDF
        </Button>
        <Button
          variant="outline"
          onClick={() => {
            // Simulate reopen of the same file
            setViewer(null);
            setReopenKey((k) => k + 1);
            setTimeout(() => setViewer({ url: "/test/sample-5.pdf", name: "sample-5-reopen.pdf" }), 300);
          }}
        >
          Close &amp; reopen 5-page PDF
        </Button>
      </div>
      <p data-testid="reopen-key">{reopenKey}</p>
      {viewer && (
        <DocumentViewer
          fileUrl={viewer.url}
          fileName={viewer.name}
          open
          onClose={() => setViewer(null)}
        />
      )}
    </div>
  );
}
