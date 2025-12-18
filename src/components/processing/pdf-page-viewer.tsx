'use client';

import { useState, useCallback, useRef, useEffect } from 'react';
import {
  ZoomIn,
  ZoomOut,
  ChevronLeft,
  ChevronRight,
  Maximize2,
  Minimize2,
  RefreshCw,
  FileText,
} from 'lucide-react';
import { cn } from '@/lib/utils';

// Import pdfjs-dist types
import type { PDFDocumentProxy, PDFPageProxy } from 'pdfjs-dist';
import type { TextItem } from 'pdfjs-dist/types/src/display/api';

interface BoundingBox {
  pageNumber: number;
  x: number; // 0-1 normalized (left edge)
  y: number; // 0-1 normalized (top edge)
  width: number; // 0-1 normalized
  height: number; // 0-1 normalized
  label?: string;
  color?: string;
}

// Text item with position extracted from PDF
interface TextLayerItem {
  text: string;
  x: number; // normalized 0-1
  y: number; // normalized 0-1
  width: number; // normalized 0-1
  height: number; // normalized 0-1
}

// Track canvas dimensions for overlay positioning
interface CanvasDimensions {
  width: number;
  height: number;
}

// Field values to match against PDF text layer
interface FieldValue {
  label: string;
  value: string;
  color?: string;
}

interface PdfPageViewerProps {
  pdfUrl: string;
  initialPage?: number;
  highlights?: BoundingBox[];
  fieldValues?: FieldValue[]; // Values to find in PDF text layer
  onPageChange?: (pageNumber: number) => void;
  onPageCountChange?: (pageCount: number) => void;
  onTextLayerReady?: (textItems: TextLayerItem[], pageNumber: number) => void;
  className?: string;
}

const ZOOM_LEVELS = [0.5, 0.75, 1, 1.25, 1.5, 2];
const DEFAULT_ZOOM_INDEX = 2; // 100%

/**
 * Extract text layer from PDF page and convert to normalized coordinates
 * PDF coordinate system: origin at bottom-left, Y increases upward
 * Canvas/screen: origin at top-left, Y increases downward
 */
async function extractTextLayer(page: PDFPageProxy): Promise<TextLayerItem[]> {
  const textContent = await page.getTextContent();
  const viewport = page.getViewport({ scale: 1 });
  const pageWidth = viewport.width;
  const pageHeight = viewport.height;

  const items: TextLayerItem[] = [];

  for (const item of textContent.items) {
    // Skip marked content (non-text items)
    if (!('str' in item) || !(item as TextItem).str) continue;

    const textItem = item as TextItem;
    const text = textItem.str.trim();
    if (!text) continue;

    // Transform matrix: [scaleX, skewX, skewY, scaleY, translateX, translateY]
    const transform = textItem.transform;
    const fontSize = Math.sqrt(transform[0] * transform[0] + transform[1] * transform[1]);

    // PDF coordinates (bottom-left origin)
    const pdfX = transform[4];
    const pdfY = transform[5];
    const textWidth = textItem.width;
    const textHeight = textItem.height || fontSize;

    // Convert to normalized coordinates (0-1)
    // X: straightforward normalization
    const x = pdfX / pageWidth;
    const width = textWidth / pageWidth;

    // Y: flip from bottom-left to top-left origin
    // In PDF: pdfY is distance from bottom
    // In screen: y should be distance from top
    const y = 1 - (pdfY / pageHeight) - (textHeight / pageHeight);
    const height = textHeight / pageHeight;

    items.push({
      text,
      x: Math.max(0, Math.min(1, x)),
      y: Math.max(0, Math.min(1, y)),
      width: Math.max(0, Math.min(1, width)),
      height: Math.max(0, Math.min(1, height)),
    });
  }

  return items;
}

// Fixed padding for bounding boxes (normalized 0-1 coordinates)
// These values provide healthy padding around text without being excessive
const BBOX_HORIZONTAL_PADDING = 0.01; // ~1% of page width on each side
const BBOX_VERTICAL_PADDING = 0.008; // ~0.8% of page height on each side

/**
 * Add fixed padding to a bounding box while keeping it clamped to 0-1 range
 */
function addBboxPadding(
  x: number,
  y: number,
  width: number,
  height: number
): { x: number; y: number; width: number; height: number } {
  const paddedX = Math.max(0, x - BBOX_HORIZONTAL_PADDING);
  const paddedY = Math.max(0, y - BBOX_VERTICAL_PADDING);
  const paddedWidth = Math.min(1 - paddedX, width + BBOX_HORIZONTAL_PADDING * 2);
  const paddedHeight = Math.min(1 - paddedY, height + BBOX_VERTICAL_PADDING * 2);

  return {
    x: paddedX,
    y: paddedY,
    width: paddedWidth,
    height: paddedHeight,
  };
}

/**
 * Find text in the PDF text layer that matches a given value
 * Returns bounding box for the matched text with padding applied
 * Note: Labels are not included - only color is used for highlighting
 */
function findTextInLayer(
  textItems: TextLayerItem[],
  searchValue: string,
  pageNumber: number,
  _label?: string, // Unused - kept for API compatibility
  color?: string
): BoundingBox | null {
  if (!searchValue || searchValue.trim().length === 0) return null;

  const normalizedSearch = searchValue.trim().toLowerCase();

  // Helper to create bbox with padding
  const createBbox = (x: number, y: number, w: number, h: number): BoundingBox => {
    const padded = addBboxPadding(x, y, w, h);
    return {
      pageNumber,
      x: padded.x,
      y: padded.y,
      width: padded.width,
      height: padded.height,
      // No label - cleaner appearance
      color,
    };
  };

  // Strategy 1: Exact match
  for (const item of textItems) {
    if (item.text.toLowerCase() === normalizedSearch) {
      return createBbox(item.x, item.y, item.width, item.height);
    }
  }

  // Strategy 2: Contains match (for partial text within larger text items)
  for (const item of textItems) {
    if (item.text.toLowerCase().includes(normalizedSearch)) {
      return createBbox(item.x, item.y, item.width, item.height);
    }
  }

  // Strategy 3: Multi-item spanning match (text split across multiple items)
  // Combine consecutive text items and search
  const fullText = textItems.map(i => i.text).join(' ').toLowerCase();
  if (fullText.includes(normalizedSearch)) {
    // Find the items that contain parts of the search value
    let accumulated = '';
    let startIdx = -1;
    let endIdx = -1;

    for (let i = 0; i < textItems.length; i++) {
      accumulated += (accumulated ? ' ' : '') + textItems[i].text.toLowerCase();

      if (startIdx === -1 && accumulated.includes(normalizedSearch.split(' ')[0])) {
        startIdx = i;
      }

      if (startIdx !== -1 && accumulated.includes(normalizedSearch)) {
        endIdx = i;
        break;
      }
    }

    if (startIdx !== -1 && endIdx !== -1) {
      // Combine bounding boxes
      const relevantItems = textItems.slice(startIdx, endIdx + 1);
      const minX = Math.min(...relevantItems.map(i => i.x));
      const minY = Math.min(...relevantItems.map(i => i.y));
      const maxX = Math.max(...relevantItems.map(i => i.x + i.width));
      const maxY = Math.max(...relevantItems.map(i => i.y + i.height));

      return createBbox(minX, minY, maxX - minX, maxY - minY);
    }
  }

  // Strategy 4: Fuzzy match for numbers (handle formatting differences)
  // e.g., "1234.56" might be "1,234.56" in the PDF
  const numericSearch = searchValue.replace(/[,$\s]/g, '');
  if (/^[\d.]+$/.test(numericSearch)) {
    for (const item of textItems) {
      const numericItem = item.text.replace(/[,$\s]/g, '');
      if (numericItem === numericSearch || numericItem.includes(numericSearch)) {
        return createBbox(item.x, item.y, item.width, item.height);
      }
    }
  }

  return null;
}

// We'll initialize pdfjsLib dynamically to avoid SSR issues
let pdfjsLib: typeof import('pdfjs-dist') | null = null;
let workerInitialized = false;

async function getPdfJs() {
  if (pdfjsLib && workerInitialized) return pdfjsLib;

  // Dynamic import for client-side only
  const pdfjs = await import('pdfjs-dist');

  if (!workerInitialized) {
    // Use locally served worker from public folder to avoid CORS issues
    pdfjs.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.mjs';
    workerInitialized = true;
  }

  pdfjsLib = pdfjs;
  return pdfjs;
}

// Empty arrays to avoid creating new references on each render
const EMPTY_HIGHLIGHTS: BoundingBox[] = [];
const EMPTY_FIELD_VALUES: FieldValue[] = [];

export function PdfPageViewer({
  pdfUrl,
  initialPage = 1,
  highlights,
  fieldValues,
  onPageChange,
  onPageCountChange,
  onTextLayerReady,
  className,
}: PdfPageViewerProps) {
  // Use stable references for empty arrays
  const stableHighlights = highlights ?? EMPTY_HIGHLIGHTS;
  const stableFieldValues = fieldValues ?? EMPTY_FIELD_VALUES;

  const [currentPage, setCurrentPage] = useState(initialPage);
  const [pageCount, setPageCount] = useState(0);
  const [zoomIndex, setZoomIndex] = useState(DEFAULT_ZOOM_INDEX);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pageSize, setPageSize] = useState({ width: 0, height: 0 });
  const [canvasDimensions, setCanvasDimensions] = useState<CanvasDimensions>({ width: 0, height: 0 });
  const [textLayerItems, setTextLayerItems] = useState<TextLayerItem[]>([]);
  const [textLayerHighlights, setTextLayerHighlights] = useState<BoundingBox[]>([]);

  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const pdfDocRef = useRef<PDFDocumentProxy | null>(null);
  const renderTaskRef = useRef<{ cancel: () => void } | null>(null);

  const zoom = ZOOM_LEVELS[zoomIndex];

  // Load PDF document
  useEffect(() => {
    let cancelled = false;

    async function loadPdf() {
      try {
        setIsLoading(true);
        setError(null);

        const pdfjs = await getPdfJs();

        // Cancel any previous document loading
        if (pdfDocRef.current) {
          pdfDocRef.current.destroy();
          pdfDocRef.current = null;
        }

        const loadingTask = pdfjs.getDocument(pdfUrl);
        const pdf = await loadingTask.promise;

        if (cancelled) {
          pdf.destroy();
          return;
        }

        pdfDocRef.current = pdf;
        setPageCount(pdf.numPages);
        onPageCountChange?.(pdf.numPages);

        // Render first page
        await renderPage(pdf, currentPage);
      } catch (err) {
        if (!cancelled) {
          console.error('Error loading PDF:', err);
          setError(err instanceof Error ? err.message : 'Failed to load PDF');
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    }

    loadPdf();

    return () => {
      cancelled = true;
      if (renderTaskRef.current) {
        renderTaskRef.current.cancel();
      }
    };
  }, [pdfUrl]);

  // Render page when page number or zoom changes
  useEffect(() => {
    if (pdfDocRef.current && !isLoading) {
      renderPage(pdfDocRef.current, currentPage);
    }
  }, [currentPage, zoom]);

  // Notify parent of page changes
  useEffect(() => {
    onPageChange?.(currentPage);
  }, [currentPage, onPageChange]);

  // Reset page when PDF changes
  useEffect(() => {
    setCurrentPage(initialPage);
  }, [pdfUrl, initialPage]);

  // Generate highlights from fieldValues using text layer
  useEffect(() => {
    // Early return without state update if nothing to process
    if (textLayerItems.length === 0 || stableFieldValues.length === 0) {
      // Only update if we have existing highlights to clear
      setTextLayerHighlights((prev) => (prev.length === 0 ? prev : EMPTY_HIGHLIGHTS));
      return;
    }

    const newHighlights: BoundingBox[] = [];

    for (const field of stableFieldValues) {
      const match = findTextInLayer(
        textLayerItems,
        field.value,
        currentPage,
        field.label,
        field.color
      );

      if (match) {
        newHighlights.push(match);
        if (process.env.NODE_ENV === 'development') {
          console.log(`[PdfPageViewer] Found "${field.label}" = "${field.value}" at:`, {
            x: match.x.toFixed(3),
            y: match.y.toFixed(3),
            w: match.width.toFixed(3),
            h: match.height.toFixed(3),
          });
        }
      } else if (process.env.NODE_ENV === 'development') {
        console.log(`[PdfPageViewer] Could not find "${field.label}" = "${field.value}" in text layer`);
      }
    }

    setTextLayerHighlights(newHighlights);
  }, [textLayerItems, stableFieldValues, currentPage]);

  async function renderPage(pdf: PDFDocumentProxy, pageNum: number) {
    if (!canvasRef.current) return;

    try {
      // Cancel any ongoing render
      if (renderTaskRef.current) {
        renderTaskRef.current.cancel();
        renderTaskRef.current = null;
      }

      const page = await pdf.getPage(pageNum);

      // Calculate scale - zoom directly controls the scale (1.0 = 100%)
      const viewport = page.getViewport({ scale: zoom });

      const canvas = canvasRef.current;
      const context = canvas.getContext('2d');
      if (!context) return;

      // Set canvas dimensions
      canvas.height = viewport.height;
      canvas.width = viewport.width;

      // Store canvas dimensions for overlay positioning
      setCanvasDimensions({
        width: viewport.width,
        height: viewport.height,
      });

      // Store page size for highlight overlay (unscaled)
      const unscaledViewport = page.getViewport({ scale: 1 });
      setPageSize({
        width: unscaledViewport.width,
        height: unscaledViewport.height,
      });

      // Render PDF page - pdfjs-dist v5 requires canvas in RenderParameters
      const renderContext = {
        canvasContext: context,
        viewport: viewport,
        canvas: canvas,
      };

      const renderTask = page.render(renderContext as Parameters<typeof page.render>[0]);
      renderTaskRef.current = renderTask;

      await renderTask.promise;
      renderTaskRef.current = null;

      // Extract text layer for accurate bounding boxes
      try {
        const textItems = await extractTextLayer(page);
        setTextLayerItems(textItems);
        onTextLayerReady?.(textItems, pageNum);

        if (process.env.NODE_ENV === 'development') {
          console.log(`[PdfPageViewer] Text layer extracted for page ${pageNum}:`, {
            itemCount: textItems.length,
            sampleItems: textItems.slice(0, 10).map(i => ({ text: i.text, x: i.x.toFixed(3), y: i.y.toFixed(3) })),
          });
        }
      } catch (textErr) {
        console.warn('Failed to extract text layer:', textErr);
      }
    } catch (err) {
      // Ignore cancellation errors
      if (err instanceof Error && err.name === 'RenderingCancelledException') {
        return;
      }
      console.error('Error rendering page:', err);
    }
  }

  const handlePrevPage = useCallback(() => {
    setCurrentPage((prev) => Math.max(1, prev - 1));
  }, []);

  const handleNextPage = useCallback(() => {
    setCurrentPage((prev) => Math.min(pageCount, prev + 1));
  }, [pageCount]);

  const handleZoomIn = useCallback(() => {
    setZoomIndex((prev) => Math.min(ZOOM_LEVELS.length - 1, prev + 1));
  }, []);

  const handleZoomOut = useCallback(() => {
    setZoomIndex((prev) => Math.max(0, prev - 1));
  }, []);

  const handlePageInput = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const value = parseInt(e.target.value, 10);
      if (!isNaN(value) && value >= 1 && value <= pageCount) {
        setCurrentPage(value);
      }
    },
    [pageCount]
  );

  const toggleFullscreen = useCallback(() => {
    if (!containerRef.current) return;

    if (!isFullscreen) {
      containerRef.current.requestFullscreen?.();
      setIsFullscreen(true);
    } else {
      if (document.fullscreenElement) {
        document.exitFullscreen?.();
      }
      setIsFullscreen(false);
    }
  }, [isFullscreen]);

  // Handle keyboard navigation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement) return;

      switch (e.key) {
        case 'ArrowLeft':
          handlePrevPage();
          break;
        case 'ArrowRight':
          handleNextPage();
          break;
        case '+':
        case '=':
          handleZoomIn();
          break;
        case '-':
          handleZoomOut();
          break;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handlePrevPage, handleNextPage, handleZoomIn, handleZoomOut]);

  // Handle Ctrl+scroll wheel for zooming
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const handleWheel = (e: WheelEvent) => {
      // Only handle Ctrl+scroll (zoom gesture)
      if (!e.ctrlKey) return;

      // Prevent browser zoom
      e.preventDefault();

      // Zoom in on scroll up, zoom out on scroll down
      if (e.deltaY < 0) {
        handleZoomIn();
      } else if (e.deltaY > 0) {
        handleZoomOut();
      }
    };

    // Use passive: false to allow preventDefault
    container.addEventListener('wheel', handleWheel, { passive: false });
    return () => container.removeEventListener('wheel', handleWheel);
  }, [handleZoomIn, handleZoomOut]);

  // Combine prop-based highlights with text layer highlights
  // Text layer highlights take priority (more accurate)
  const currentHighlights = [
    ...textLayerHighlights,
    ...stableHighlights.filter((h) => h.pageNumber === currentPage),
  ];

  if (error) {
    return (
      <div className={cn('flex flex-col items-center justify-center h-96 bg-background-secondary rounded-lg', className)}>
        <FileText className="w-12 h-12 text-text-muted mb-4" />
        <p className="text-text-secondary mb-4">Failed to load PDF: {error}</p>
        <button
          onClick={() => window.location.reload()}
          className="btn-secondary btn-sm"
        >
          Retry
        </button>
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      className={cn(
        'flex flex-col bg-background-secondary overflow-hidden',
        isFullscreen && 'fixed inset-0 z-50',
        className
      )}
    >
      {/* Toolbar */}
      <div className="flex items-center justify-between px-3 py-2 bg-background-tertiary border-b border-border-primary">
        {/* Navigation */}
        <div className="flex items-center gap-2">
          <button
            onClick={handlePrevPage}
            disabled={currentPage <= 1 || isLoading}
            className="btn-ghost btn-xs p-1.5"
            title="Previous page (←)"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>

          <div className="flex items-center gap-1 text-sm">
            <input
              type="number"
              value={currentPage}
              onChange={handlePageInput}
              min={1}
              max={pageCount}
              disabled={isLoading}
              className="w-12 px-2 py-1 text-center text-sm bg-background-primary border border-border-primary rounded"
            />
            <span className="text-text-muted">/ {pageCount || '?'}</span>
          </div>

          <button
            onClick={handleNextPage}
            disabled={currentPage >= pageCount || isLoading}
            className="btn-ghost btn-xs p-1.5"
            title="Next page (→)"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>

        {/* Zoom controls */}
        <div className="flex items-center gap-2">
          <button
            onClick={handleZoomOut}
            disabled={zoomIndex === 0}
            className="btn-ghost btn-xs p-1.5"
            title="Zoom out (-)"
          >
            <ZoomOut className="w-4 h-4" />
          </button>

          <span className="text-sm text-text-secondary w-12 text-center">
            {Math.round(zoom * 100)}%
          </span>

          <button
            onClick={handleZoomIn}
            disabled={zoomIndex === ZOOM_LEVELS.length - 1}
            className="btn-ghost btn-xs p-1.5"
            title="Zoom in (+)"
          >
            <ZoomIn className="w-4 h-4" />
          </button>

          <div className="w-px h-4 bg-border-primary mx-1" />

          <button
            onClick={toggleFullscreen}
            className="btn-ghost btn-xs p-1.5"
            title={isFullscreen ? 'Exit fullscreen' : 'Fullscreen'}
          >
            {isFullscreen ? (
              <Minimize2 className="w-4 h-4" />
            ) : (
              <Maximize2 className="w-4 h-4" />
            )}
          </button>
        </div>
      </div>

      {/* PDF viewer */}
      <div className="flex-1 overflow-auto p-4 bg-background-secondary">
        <div className="min-h-full flex items-center justify-center">
          <div className="relative">
            {isLoading && (
              <div className="absolute inset-0 flex items-center justify-center bg-background-tertiary rounded z-10 min-w-[600px] min-h-[800px]">
                <RefreshCw className="w-6 h-6 animate-spin text-text-muted" />
                <span className="ml-3 text-text-secondary">Loading PDF...</span>
              </div>
            )}

            {/* Canvas for PDF rendering */}
            <canvas
              ref={canvasRef}
              className={cn(
                'shadow-lg rounded border border-border-primary',
                isLoading && 'opacity-0'
              )}
            />

            {/* SVG overlay for highlights - uses canvas pixel coordinates */}
            {!isLoading && currentHighlights.length > 0 && canvasDimensions.width > 0 && (() => {
              const { width: canvasWidth, height: canvasHeight } = canvasDimensions;

              // Debug: log highlight coordinates
              if (process.env.NODE_ENV === 'development') {
                console.log('[PdfPageViewer] Rendering highlights:', {
                  canvasSize: { width: canvasWidth, height: canvasHeight },
                  zoom,
                  highlightCount: currentHighlights.length,
                });
              }

              return (
                <svg
                  className="absolute top-0 left-0 pointer-events-none"
                  style={{
                    width: canvasWidth,
                    height: canvasHeight,
                  }}
                  viewBox={`0 0 ${canvasWidth} ${canvasHeight}`}
                  preserveAspectRatio="none"
                >
                  {currentHighlights.map((highlight, idx) => {
                    // Convert normalized coordinates (0-1) to canvas pixel coordinates
                    const x = highlight.x * canvasWidth;
                    const y = highlight.y * canvasHeight;
                    const w = highlight.width * canvasWidth;
                    const h = highlight.height * canvasHeight;
                    // Default to mild pastel blue if no color specified
                    const color = highlight.color || '#93C5FD';

                    if (process.env.NODE_ENV === 'development') {
                      console.log(`[PdfPageViewer] Highlight ${idx}:`, {
                        normalized: { x: highlight.x, y: highlight.y, width: highlight.width, height: highlight.height },
                        pixels: { x, y, width: w, height: h },
                      });
                    }

                    return (
                      <rect
                        key={idx}
                        x={x}
                        y={y}
                        width={w}
                        height={h}
                        fill={`${color}30`}
                        stroke={color}
                        strokeWidth="1.5"
                        rx="4"
                      />
                    );
                  })}
                </svg>
              );
            })()}
          </div>
        </div>
      </div>
    </div>
  );
}

export { type BoundingBox, type FieldValue, type TextLayerItem };
