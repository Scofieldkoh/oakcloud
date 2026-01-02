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
  ToggleLeft,
  ToggleRight,
  RotateCw,
  RotateCcw,
} from 'lucide-react';
import { useDocumentPages } from '@/hooks/use-processing-documents';
import { cn } from '@/lib/utils';

// Import pdfjs-dist types
import type { PDFDocumentProxy, PDFPageProxy } from 'pdfjs-dist';
import type { TextItem } from 'pdfjs-dist/types/src/display/api';

// =============================================================================
// Types
// =============================================================================

export interface BoundingBox {
  pageNumber: number;
  x: number; // 0-1 normalized (left edge)
  y: number; // 0-1 normalized (top edge)
  width: number; // 0-1 normalized
  height: number; // 0-1 normalized
  label?: string;
  color?: string;
}

export interface TextLayerItem {
  text: string;
  x: number; // normalized 0-1
  y: number; // normalized 0-1
  width: number; // normalized 0-1
  height: number; // normalized 0-1
}

export interface FieldValue {
  label: string;
  value: string;
  color?: string;
}

interface CanvasDimensions {
  width: number;
  height: number;
}

interface DocumentPageViewerProps {
  /** Document ID to fetch PDF from (used with useDocumentPages hook) */
  documentId?: string;
  /** Direct PDF URL (alternative to documentId - skips data fetching) */
  pdfUrl?: string;
  initialPage?: number;
  initialRotation?: number;
  highlights?: BoundingBox[];
  fieldValues?: FieldValue[];
  onPageChange?: (pageNumber: number) => void;
  onPageCountChange?: (pageCount: number) => void;
  onTextLayerReady?: (textItems: TextLayerItem[], pageNumber: number) => void;
  onRotationChange?: (rotation: number, pageNumber: number) => void;
  showHighlights?: boolean;
  onShowHighlightsChange?: (show: boolean) => void;
  className?: string;
}

// =============================================================================
// Constants
// =============================================================================

const ZOOM_LEVELS = [0.1, 0.25, 0.5, 0.75, 1, 1.25, 1.5, 2, 3];
const DEFAULT_ZOOM_INDEX = 6; // 150%

// Fixed padding for bounding boxes (normalized 0-1 coordinates)
const BBOX_HORIZONTAL_PADDING = 0.008;
const BBOX_VERTICAL_PADDING = 0.003;

// Empty arrays to avoid creating new references on each render
const EMPTY_HIGHLIGHTS: BoundingBox[] = [];
const EMPTY_FIELD_VALUES: FieldValue[] = [];

// =============================================================================
// PDF.js Initialization
// =============================================================================

let pdfjsLib: typeof import('pdfjs-dist') | null = null;
let workerInitialized = false;

async function getPdfJs() {
  if (pdfjsLib && workerInitialized) return pdfjsLib;

  const pdfjs = await import('pdfjs-dist');

  if (!workerInitialized) {
    pdfjs.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.mjs';
    workerInitialized = true;
  }

  pdfjsLib = pdfjs;
  return pdfjs;
}

// =============================================================================
// Text Layer Extraction
// =============================================================================

/**
 * Extract text layer from PDF page and convert to normalized coordinates
 */
async function extractTextLayer(page: PDFPageProxy): Promise<TextLayerItem[]> {
  const textContent = await page.getTextContent();
  const viewport = page.getViewport({ scale: 1 });
  const pageWidth = viewport.width;
  const pageHeight = viewport.height;

  const items: TextLayerItem[] = [];

  for (const item of textContent.items) {
    if (!('str' in item) || !(item as TextItem).str) continue;

    const textItem = item as TextItem;
    const text = textItem.str.trim();
    if (!text) continue;

    const transform = textItem.transform;
    const fontSize = Math.sqrt(transform[0] * transform[0] + transform[1] * transform[1]);

    const pdfX = transform[4];
    const pdfY = transform[5];
    const textWidth = textItem.width;
    const textHeight = textItem.height || fontSize;

    const x = pdfX / pageWidth;
    const width = textWidth / pageWidth;
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

// =============================================================================
// Text Matching
// =============================================================================

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

  return { x: paddedX, y: paddedY, width: paddedWidth, height: paddedHeight };
}

function findTextInLayer(
  textItems: TextLayerItem[],
  searchValue: string,
  pageNumber: number,
  color?: string
): BoundingBox | null {
  if (!searchValue || searchValue.trim().length === 0) return null;

  const normalizedSearch = searchValue.trim().toLowerCase();

  const createBbox = (x: number, y: number, w: number, h: number): BoundingBox => {
    const padded = addBboxPadding(x, y, w, h);
    return {
      pageNumber,
      x: padded.x,
      y: padded.y,
      width: padded.width,
      height: padded.height,
      color,
    };
  };

  // Strategy 1: Exact match
  for (const item of textItems) {
    if (item.text.toLowerCase() === normalizedSearch) {
      return createBbox(item.x, item.y, item.width, item.height);
    }
  }

  // Strategy 2: Contains match
  for (const item of textItems) {
    if (item.text.toLowerCase().includes(normalizedSearch)) {
      return createBbox(item.x, item.y, item.width, item.height);
    }
  }

  // Strategy 3: Multi-item spanning match
  const fullText = textItems.map(i => i.text).join(' ').toLowerCase();
  if (fullText.includes(normalizedSearch)) {
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
      const relevantItems = textItems.slice(startIdx, endIdx + 1);
      const minX = Math.min(...relevantItems.map(i => i.x));
      const minY = Math.min(...relevantItems.map(i => i.y));
      const maxX = Math.max(...relevantItems.map(i => i.x + i.width));
      const maxY = Math.max(...relevantItems.map(i => i.y + i.height));

      return createBbox(minX, minY, maxX - minX, maxY - minY);
    }
  }

  // Strategy 4: Fuzzy match for numbers
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

// =============================================================================
// Main Component
// =============================================================================

export function DocumentPageViewer({
  documentId,
  pdfUrl: pdfUrlProp,
  initialPage = 1,
  initialRotation = 0,
  highlights,
  fieldValues,
  onPageChange,
  onPageCountChange,
  onTextLayerReady,
  onRotationChange,
  showHighlights: showHighlightsProp,
  onShowHighlightsChange,
  className,
}: DocumentPageViewerProps) {
  // Stable references
  const stableHighlights = highlights ?? EMPTY_HIGHLIGHTS;
  const stableFieldValues = fieldValues ?? EMPTY_FIELD_VALUES;

  // Data fetching (only if documentId is provided, skip if using pdfUrl directly)
  const { data, isLoading: isDataLoading, error: dataError, refetch } = useDocumentPages(documentId || '');

  // Determine which PDF URL to use (prop takes precedence)
  const effectivePdfUrl = pdfUrlProp || data?.pdfUrl;
  const skipDataFetch = !!pdfUrlProp;

  // State
  const [currentPage, setCurrentPage] = useState(initialPage);
  const [pageCount, setPageCount] = useState(0);
  const [zoomIndex, setZoomIndex] = useState(DEFAULT_ZOOM_INDEX);
  const [rotation, setRotation] = useState(initialRotation); // 0, 90, 180, 270 degrees
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isPdfLoading, setIsPdfLoading] = useState(true);
  const [pdfError, setPdfError] = useState<string | null>(null);
  const [canvasDimensions, setCanvasDimensions] = useState<CanvasDimensions>({ width: 0, height: 0 });
  const [textLayerItems, setTextLayerItems] = useState<TextLayerItem[]>([]);
  const [textLayerHighlights, setTextLayerHighlights] = useState<BoundingBox[]>([]);
  const [showHighlightsInternal, setShowHighlightsInternal] = useState(true);

  const showHighlights = showHighlightsProp ?? showHighlightsInternal;
  const zoom = ZOOM_LEVELS[zoomIndex];

  // Refs
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const pdfDocRef = useRef<PDFDocumentProxy | null>(null);
  const renderTaskRef = useRef<{ cancel: () => void } | null>(null);

  // ==========================================================================
  // Handlers
  // ==========================================================================

  const handleToggleHighlights = useCallback(() => {
    const newValue = !showHighlights;
    if (onShowHighlightsChange) {
      onShowHighlightsChange(newValue);
    } else {
      setShowHighlightsInternal(newValue);
    }
  }, [showHighlights, onShowHighlightsChange]);

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

  const handleRotateCW = useCallback(() => {
    setRotation((prev) => {
      const newRotation = (prev + 90) % 360;
      onRotationChange?.(newRotation, currentPage);
      return newRotation;
    });
  }, [currentPage, onRotationChange]);

  const handleRotateCCW = useCallback(() => {
    setRotation((prev) => {
      const newRotation = (prev - 90 + 360) % 360;
      onRotationChange?.(newRotation, currentPage);
      return newRotation;
    });
  }, [currentPage, onRotationChange]);

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

  // ==========================================================================
  // PDF Rendering
  // ==========================================================================

  const renderPage = useCallback(async (pdf: PDFDocumentProxy, pageNum: number, pageRotation: number = 0) => {
    if (!canvasRef.current) return;

    try {
      if (renderTaskRef.current) {
        renderTaskRef.current.cancel();
        renderTaskRef.current = null;
      }

      const page = await pdf.getPage(pageNum);
      // PDF.js viewport supports rotation in degrees
      const viewport = page.getViewport({ scale: zoom, rotation: pageRotation });

      const canvas = canvasRef.current;
      const context = canvas.getContext('2d');
      if (!context) return;

      canvas.height = viewport.height;
      canvas.width = viewport.width;

      setCanvasDimensions({
        width: viewport.width,
        height: viewport.height,
      });

      const renderContext = {
        canvasContext: context,
        viewport: viewport,
        canvas: canvas,
      };

      const renderTask = page.render(renderContext as Parameters<typeof page.render>[0]);
      renderTaskRef.current = renderTask;

      await renderTask.promise;
      renderTaskRef.current = null;

      // Extract text layer for highlighting
      try {
        const textItems = await extractTextLayer(page);
        setTextLayerItems(textItems);
        onTextLayerReady?.(textItems, pageNum);
      } catch (textErr) {
        console.warn('Failed to extract text layer:', textErr);
        setTextLayerItems([]);
      }
    } catch (err) {
      if (err instanceof Error && err.name === 'RenderingCancelledException') {
        return;
      }
      console.error('Error rendering page:', err);
    }
  }, [zoom, onTextLayerReady]);

  // ==========================================================================
  // Effects
  // ==========================================================================

  // Load PDF when URL is available
  useEffect(() => {
    if (!effectivePdfUrl) return;

    // Capture URL in const for TypeScript narrowing inside async function
    const pdfUrlToLoad = effectivePdfUrl;
    let cancelled = false;

    async function loadPdf() {
      try {
        setIsPdfLoading(true);
        setPdfError(null);

        const pdfjs = await getPdfJs();

        if (pdfDocRef.current) {
          pdfDocRef.current.destroy();
          pdfDocRef.current = null;
        }

        const loadingTask = pdfjs.getDocument(pdfUrlToLoad);
        const pdf = await loadingTask.promise;

        if (cancelled) {
          pdf.destroy();
          return;
        }

        pdfDocRef.current = pdf;
        setPageCount(pdf.numPages);
        onPageCountChange?.(pdf.numPages);

        // Get saved rotation from pages data if available
        const pageInfo = data?.pages?.find((p) => p.pageNumber === currentPage);
        const savedRotation = pageInfo?.rotation ?? rotation;

        // Update rotation state if different from saved value
        if (pageInfo?.rotation !== undefined && pageInfo.rotation !== rotation) {
          setRotation(pageInfo.rotation);
        }

        await renderPage(pdf, currentPage, savedRotation);
      } catch (err) {
        if (!cancelled) {
          console.error('Error loading PDF:', err);
          setPdfError(err instanceof Error ? err.message : 'Failed to load PDF');
        }
      } finally {
        if (!cancelled) {
          setIsPdfLoading(false);
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
    // eslint-disable-next-line react-hooks/exhaustive-deps -- Only re-run when URL changes, not on every render
  }, [effectivePdfUrl]);

  // Re-render page on page/zoom/rotation change (also when loading completes)
  useEffect(() => {
    if (pdfDocRef.current && !isPdfLoading) {
      renderPage(pdfDocRef.current, currentPage, rotation);
    }
  }, [currentPage, zoom, rotation, isPdfLoading, renderPage]);

  // Notify parent of page changes
  useEffect(() => {
    onPageChange?.(currentPage);
  }, [currentPage, onPageChange]);

  // Reset page when document changes
  useEffect(() => {
    setCurrentPage(initialPage);
  }, [documentId, initialPage]);

  // Load saved rotation from pages data when page changes or data loads
  useEffect(() => {
    if (data?.pages && data.pages.length > 0) {
      const pageInfo = data.pages.find((p) => p.pageNumber === currentPage);
      if (pageInfo && pageInfo.rotation !== undefined) {
        // Only update if different to avoid unnecessary re-renders
        setRotation((prev) => (prev !== pageInfo.rotation ? pageInfo.rotation : prev));
      }
    }
  }, [data?.pages, currentPage]);

  // Generate highlights from fieldValues
  useEffect(() => {
    if (textLayerItems.length === 0 || stableFieldValues.length === 0) {
      setTextLayerHighlights((prev) => (prev.length === 0 ? prev : EMPTY_HIGHLIGHTS));
      return;
    }

    const newHighlights: BoundingBox[] = [];

    for (const field of stableFieldValues) {
      const match = findTextInLayer(textLayerItems, field.value, currentPage, field.color);
      if (match) {
        newHighlights.push(match);
      }
    }

    setTextLayerHighlights(newHighlights);
  }, [textLayerItems, stableFieldValues, currentPage]);

  // Keyboard navigation
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

  // Ctrl+scroll wheel zoom
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const handleWheel = (e: WheelEvent) => {
      if (!e.ctrlKey) return;
      e.preventDefault();

      if (e.deltaY < 0) {
        handleZoomIn();
      } else if (e.deltaY > 0) {
        handleZoomOut();
      }
    };

    container.addEventListener('wheel', handleWheel, { passive: false });
    return () => container.removeEventListener('wheel', handleWheel);
  }, [handleZoomIn, handleZoomOut]);

  // ==========================================================================
  // Computed values
  // ==========================================================================

  const currentHighlights = [
    ...textLayerHighlights,
    ...stableHighlights.filter((h) => h.pageNumber === currentPage),
  ];

  // When using pdfUrl directly, skip data loading state
  const isLoading = skipDataFetch ? isPdfLoading : (isDataLoading || isPdfLoading);
  const error = skipDataFetch ? pdfError : (dataError || pdfError);

  // ==========================================================================
  // Render
  // ==========================================================================

  if (error) {
    return (
      <div className={cn('flex flex-col items-center justify-center h-96 bg-background-secondary rounded-lg', className)}>
        <FileText className="w-12 h-12 text-text-muted mb-4" />
        <p className="text-text-secondary mb-4">Failed to load document</p>
        {!skipDataFetch && (
          <button onClick={() => refetch()} className="btn-secondary btn-sm">
            Retry
          </button>
        )}
      </div>
    );
  }

  // Only show data loading state if fetching via documentId
  if (!skipDataFetch && isDataLoading) {
    return (
      <div className={cn('flex items-center justify-center h-96 bg-background-secondary rounded-lg', className)}>
        <RefreshCw className="w-6 h-6 animate-spin text-text-muted" />
        <span className="ml-3 text-text-secondary">Loading document...</span>
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
      <div className="flex items-center justify-between px-3 py-2 bg-background-tertiary border-b border-border-primary flex-wrap gap-2">
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
        <div className="flex items-center gap-1 sm:gap-2 flex-wrap">
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

          {/* Rotation controls */}
          <button
            onClick={handleRotateCCW}
            className="btn-ghost btn-xs p-1.5"
            title="Rotate counter-clockwise"
          >
            <RotateCcw className="w-4 h-4" />
          </button>
          <button
            onClick={handleRotateCW}
            className="btn-ghost btn-xs p-1.5"
            title="Rotate clockwise"
          >
            <RotateCw className="w-4 h-4" />
          </button>

          <div className="w-px h-4 bg-border-primary mx-1" />

          {/* Bounding box toggle */}
          <button
            onClick={handleToggleHighlights}
            className={cn(
              'btn-ghost btn-xs p-1.5 flex items-center gap-1',
              showHighlights && 'text-oak-primary'
            )}
            title={showHighlights ? 'Hide bounding boxes' : 'Show bounding boxes'}
          >
            {showHighlights ? (
              <ToggleRight className="w-4 h-4" />
            ) : (
              <ToggleLeft className="w-4 h-4" />
            )}
            <span className="text-xs hidden sm:inline">Boxes</span>
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
      <div className="flex-1 overflow-auto p-4 bg-background-secondary relative group/viewer">
        {/* Left navigation arrow - only show if there's a previous page */}
        {currentPage > 1 && (
          <button
            onClick={handlePrevPage}
            disabled={isLoading}
            className={cn(
              'absolute left-2 top-1/2 -translate-y-1/2 z-20',
              'w-10 h-10 rounded-full flex items-center justify-center',
              'bg-background-primary/80 backdrop-blur-sm border border-border-primary shadow-lg',
              'opacity-0 group-hover/viewer:opacity-100 transition-opacity duration-200',
              'hover:bg-background-secondary hover:border-oak-light',
              'disabled:opacity-30 disabled:cursor-not-allowed'
            )}
            title="Previous page"
          >
            <ChevronLeft className="w-5 h-5 text-text-primary" />
          </button>
        )}

        {/* Right navigation arrow - only show if there's a next page */}
        {currentPage < pageCount && (
          <button
            onClick={handleNextPage}
            disabled={isLoading}
            className={cn(
              'absolute right-2 top-1/2 -translate-y-1/2 z-20',
              'w-10 h-10 rounded-full flex items-center justify-center',
              'bg-background-primary/80 backdrop-blur-sm border border-border-primary shadow-lg',
              'opacity-0 group-hover/viewer:opacity-100 transition-opacity duration-200',
              'hover:bg-background-secondary hover:border-oak-light',
              'disabled:opacity-30 disabled:cursor-not-allowed'
            )}
            title="Next page"
          >
            <ChevronRight className="w-5 h-5 text-text-primary" />
          </button>
        )}

        <div className="inline-flex min-w-full min-h-full items-center justify-center">
          <div className="relative">
            {isPdfLoading && (
              <div className="absolute inset-0 flex items-center justify-center bg-background-tertiary rounded z-10 min-w-[600px] min-h-[800px]">
                <RefreshCw className="w-6 h-6 animate-spin text-text-muted" />
                <span className="ml-3 text-text-secondary">Loading PDF...</span>
              </div>
            )}

            <canvas
              ref={canvasRef}
              className={cn(
                'shadow-lg rounded border border-border-primary',
                isPdfLoading && 'opacity-0'
              )}
            />

            {/* SVG overlay for highlights */}
            {showHighlights && !isPdfLoading && currentHighlights.length > 0 && canvasDimensions.width > 0 && (
              <svg
                className="absolute top-0 left-0 pointer-events-none"
                style={{
                  width: canvasDimensions.width,
                  height: canvasDimensions.height,
                }}
                viewBox={`0 0 ${canvasDimensions.width} ${canvasDimensions.height}`}
                preserveAspectRatio="none"
              >
                {currentHighlights.map((highlight, idx) => {
                  const x = highlight.x * canvasDimensions.width;
                  const y = highlight.y * canvasDimensions.height;
                  const w = highlight.width * canvasDimensions.width;
                  const h = highlight.height * canvasDimensions.height;
                  const color = highlight.color || '#93C5FD';

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
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// =============================================================================
// Thumbnail Strip (kept for multi-page navigation)
// =============================================================================

export function PageThumbnailStrip({
  documentId,
  currentPage,
  onPageSelect,
  className,
}: {
  documentId: string;
  currentPage: number;
  onPageSelect: (pageNumber: number) => void;
  className?: string;
}) {
  const { data, isLoading } = useDocumentPages(documentId);

  if (isLoading || !data) {
    return null;
  }

  return (
    <div className={cn('flex gap-2 overflow-x-auto py-2 px-1', className)}>
      {data.pages.map((page) => (
        <button
          key={page.id}
          onClick={() => onPageSelect(page.pageNumber)}
          className={cn(
            'relative flex-shrink-0 w-16 h-20 rounded border-2 overflow-hidden transition-all',
            currentPage === page.pageNumber
              ? 'border-oak-primary ring-2 ring-oak-primary/20'
              : 'border-border-primary hover:border-oak-light'
          )}
        >
          {/* eslint-disable-next-line @next/next/no-img-element -- Dynamic page thumbnails with unknown dimensions */}
          <img
            src={page.imageUrl}
            alt={`Page ${page.pageNumber}`}
            className="w-full h-full object-cover"
          />
          <span className="absolute bottom-0 left-0 right-0 bg-black/60 text-white text-xs text-center py-0.5">
            {page.pageNumber}
          </span>
        </button>
      ))}
    </div>
  );
}
