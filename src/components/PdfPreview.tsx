import { useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import {
  getDocument,
  GlobalWorkerOptions,
  type PDFDocumentProxy,
  type RenderTask,
} from "pdfjs-dist";
import workerSrc from "pdfjs-dist/build/pdf.worker.min.mjs?url";
import { Button } from "@/components/ui/button";

GlobalWorkerOptions.workerSrc = workerSrc;

/** CSS width the page is rendered at (scaled by devicePixelRatio). */
const WIDTH = 320;

/** One page of a PDF on a canvas, with prev/next paging. */
export function PdfPreview({ bytes }: { bytes: Uint8Array }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const [doc, setDoc] = useState<PDFDocumentProxy>();
  const [page, setPage] = useState(1);
  const [error, setError] = useState<string>();

  useEffect(() => {
    // pdf.js moves the buffer to its worker, so hand it a copy.
    const task = getDocument({ data: bytes.slice() });
    // A destroyed task rejects with "Loading aborted": not an error to show.
    let cancelled = false;
    task.promise.then(
      (d) => !cancelled && setDoc(d),
      (e) => !cancelled && setError(String(e))
    );
    return () => {
      cancelled = true;
      void task.destroy();
    };
  }, [bytes]);

  useEffect(() => {
    if (!doc) return;
    let render: RenderTask | undefined;
    let cancelled = false;
    void doc.getPage(page).then((p) => {
      if (cancelled || !canvas.current) return;
      const scale =
        (WIDTH / p.getViewport({ scale: 1 }).width) * devicePixelRatio;
      const viewport = p.getViewport({ scale });
      canvas.current.width = viewport.width;
      canvas.current.height = viewport.height;
      render = p.render({ canvas: canvas.current, viewport });
      // Cancelled by a page flip before it finished: expected.
      render.promise.catch(() => {});
    });
    return () => {
      cancelled = true;
      render?.cancel();
    };
  }, [doc, page]);

  if (error)
    return (
      <p className="text-sm text-destructive">Could not render PDF: {error}</p>
    );

  return (
    <div className="flex w-full max-w-80 flex-col gap-1">
      <canvas
        ref={canvas}
        className="h-auto w-full rounded-md border bg-white"
      />
      {doc && doc.numPages > 1 && (
        <div className="flex items-center justify-center gap-2">
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label="Previous page"
            disabled={page <= 1}
            onClick={() => setPage((n) => n - 1)}
          >
            <ChevronLeft />
          </Button>
          <span className="text-xs text-muted-foreground tabular-nums">
            {page} / {doc.numPages}
          </span>
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label="Next page"
            disabled={page >= doc.numPages}
            onClick={() => setPage((n) => n + 1)}
          >
            <ChevronRight />
          </Button>
        </div>
      )}
    </div>
  );
}
