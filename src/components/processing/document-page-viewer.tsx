'use client';

import { useState, useCallback, useRef, useEffect, useMemo } from 'react';
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
  PanelLeft,
  Plus,
  Trash2,
} from 'lucide-react';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { useDocumentPages, useAppendPages, useReorderPages, useDeletePages } from '@/hooks/use-processing-documents';
import { cn } from '@/lib/utils';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';

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
  /** Document revision status for append/reorder confirmation */
  documentStatus?: 'DRAFT' | 'APPROVED' | 'SUPERSEDED';
  /** Callback when pages are modified (append/reorder) */
  onPagesChanged?: () => void;
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
  documentStatus,
  onPagesChanged,
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
  const [showThumbnails, setShowThumbnails] = useState(true);

  const showHighlights = showHighlightsProp ?? showHighlightsInternal;
  const zoom = ZOOM_LEVELS[zoomIndex];

  // Refs
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
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

  // Keyboard navigation for PDF pages and zoom
  // Left/Right arrows for page navigation, +/- for zoom
  // Up/Down arrows are NOT captured to allow natural scrolling
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement ||
          e.target instanceof HTMLSelectElement ||
          e.target instanceof HTMLTextAreaElement) return;

      // Left/Right arrows for page navigation
      if (e.key === 'ArrowLeft') {
        e.preventDefault();
        handlePrevPage();
        return;
      }
      if (e.key === 'ArrowRight') {
        e.preventDefault();
        handleNextPage();
        return;
      }

      // Page Up/Down for page navigation (alternative)
      if (e.key === 'PageUp') {
        e.preventDefault();
        handlePrevPage();
        return;
      }
      if (e.key === 'PageDown') {
        e.preventDefault();
        handleNextPage();
        return;
      }

      // Zoom with +/- keys
      if (e.key === '+' || e.key === '=') {
        handleZoomIn();
        return;
      }
      if (e.key === '-') {
        handleZoomOut();
        return;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handlePrevPage, handleNextPage, handleZoomIn, handleZoomOut]);

  // Auto-focus scroll container when PDF loads to enable keyboard scrolling
  useEffect(() => {
    if (!isPdfLoading && scrollContainerRef.current) {
      // Only focus if no other element is focused (e.g., user isn't in an input)
      if (!document.activeElement || document.activeElement === document.body) {
        scrollContainerRef.current.focus();
      }
    }
  }, [isPdfLoading]);

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
            title="Previous page (â†)"
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
            title="Next page (â†’)"
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

          <div className="w-px h-4 bg-border-primary mx-1" />

          {/* Page thumbnails toggle */}
          <button
            onClick={() => setShowThumbnails(!showThumbnails)}
            className={cn(
              'btn-ghost btn-xs p-1.5 flex items-center gap-1',
              showThumbnails && 'text-oak-primary'
            )}
            title={showThumbnails ? 'Hide page thumbnails' : 'Show page thumbnails'}
          >
            <PanelLeft className="w-4 h-4" />
            <span className="text-xs hidden sm:inline">Pages</span>
          </button>
        </div>
      </div>

      {/* PDF viewer with optional thumbnail sidebar */}
      <div className="flex-1 flex overflow-hidden">
        {/* Page thumbnail sidebar */}
        {showThumbnails && data?.pages && data.pages.length > 0 && (
          <PageThumbnailSidebar
            pages={data.pages}
            currentPage={currentPage}
            onPageSelect={setCurrentPage}
            pdfUrl={data.isPdf && effectivePdfUrl ? effectivePdfUrl : undefined}
            documentId={documentId}
            documentStatus={documentStatus}
            isPdf={data.isPdf}
            onPagesChanged={onPagesChanged}
          />
        )}

        {/* Main viewer area with navigation bars */}
        <div className="flex-1 flex overflow-hidden relative">
          {/* Left navigation bar - sticky full height */}
          {currentPage > 1 && (
            <button
              onClick={handlePrevPage}
              disabled={isLoading}
              className={cn(
                'sticky top-0 left-0 z-20 self-stretch flex-shrink-0',
                'w-12 flex items-center justify-center',
                'bg-black/5 hover:bg-black/20 dark:bg-white/5 dark:hover:bg-white/20',
                'transition-colors duration-200',
                'disabled:opacity-30 disabled:cursor-not-allowed'
              )}
              title="Previous page (←)"
            >
              <ChevronLeft className="w-6 h-6 text-text-primary" />
            </button>
          )}

          {/* Scrollable PDF content area - tabIndex allows keyboard scrolling with arrow keys */}
          <div
            ref={scrollContainerRef}
            className="flex-1 overflow-auto p-4 bg-background-secondary focus:outline-none"
            tabIndex={0}
          >
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

          {/* Right navigation bar - sticky full height */}
          {currentPage < pageCount && (
            <button
              onClick={handleNextPage}
              disabled={isLoading}
              className={cn(
                'sticky top-0 right-0 z-20 self-stretch flex-shrink-0',
                'w-12 flex items-center justify-center',
                'bg-black/5 hover:bg-black/20 dark:bg-white/5 dark:hover:bg-white/20',
                'transition-colors duration-200',
                'disabled:opacity-30 disabled:cursor-not-allowed'
              )}
              title="Next page (→)"
            >
              <ChevronRight className="w-6 h-6 text-text-primary" />
            </button>
          )}
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

// =============================================================================
// Thumbnail Sidebar (vertical, for left side of viewer)
// =============================================================================

interface PageInfo {
  id: string;
  pageNumber: number;
  imageUrl: string;
}

const MIN_SIDEBAR_WIDTH = 80;
const MAX_SIDEBAR_WIDTH = 200;
const DEFAULT_SIDEBAR_WIDTH = 150;
const THUMBNAIL_SCALE = 0.5; // Scale for thumbnail rendering (higher = sharper)

// Component for rendering a single PDF page thumbnail using canvas
function PdfThumbnail({
  pdfUrl,
  pageNumber,
  onLoad,
  onError,
  isLoading,
}: {
  pdfUrl: string;
  pageNumber: number;
  onLoad: () => void;
  onError: () => void;
  isLoading: boolean;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [rendered, setRendered] = useState(false);
  const prevPdfUrlRef = useRef(pdfUrl);

  // Use refs to avoid re-running the effect when callbacks change
  const onLoadRef = useRef(onLoad);
  const onErrorRef = useRef(onError);

  // Keep refs updated
  useEffect(() => {
    onLoadRef.current = onLoad;
    onErrorRef.current = onError;
  });

  // Reset rendered state when pdfUrl changes (cache busting)
  useEffect(() => {
    if (prevPdfUrlRef.current !== pdfUrl) {
      setRendered(false);
      prevPdfUrlRef.current = pdfUrl;
    }
  }, [pdfUrl]);

  useEffect(() => {
    // Skip if already rendered
    if (rendered) return;

    let cancelled = false;

    async function renderThumbnail() {
      try {
        const pdfjs = await getPdfJs();
        const loadingTask = pdfjs.getDocument(pdfUrl);
        const pdf = await loadingTask.promise;

        if (cancelled) {
          pdf.destroy();
          return;
        }

        // Validate page number is within bounds
        if (pageNumber < 1 || pageNumber > pdf.numPages) {
          pdf.destroy();
          onErrorRef.current();
          return;
        }

        const page = await pdf.getPage(pageNumber);
        const viewport = page.getViewport({ scale: THUMBNAIL_SCALE });

        const canvas = canvasRef.current;
        if (!canvas || cancelled) {
          pdf.destroy();
          return;
        }

        const context = canvas.getContext('2d');
        if (!context) {
          pdf.destroy();
          onErrorRef.current();
          return;
        }

        canvas.width = viewport.width;
        canvas.height = viewport.height;

        await page.render({
          canvasContext: context,
          viewport,
          canvas,
        } as Parameters<typeof page.render>[0]).promise;

        if (!cancelled) {
          setRendered(true);
          onLoadRef.current();
        }

        pdf.destroy();
      } catch (err) {
        console.error(`Failed to render thumbnail for page ${pageNumber}:`, err);
        if (!cancelled) {
          onErrorRef.current();
        }
      }
    }

    renderThumbnail();

    return () => {
      cancelled = true;
    };
  }, [pdfUrl, pageNumber, rendered]);

  return (
    <>
      {isLoading && (
        <div className="absolute inset-0 flex items-center justify-center bg-background-tertiary">
          <RefreshCw className="w-4 h-4 animate-spin text-text-muted" />
        </div>
      )}
      <canvas
        ref={canvasRef}
        className={cn(
          'w-full h-full object-cover',
          isLoading && 'opacity-0'
        )}
      />
    </>
  );
}

// Sortable thumbnail item wrapper
function SortableThumbnail({
  page,
  displayNumber,
  currentPage,
  onPageSelect,
  onDelete,
  pdfUrl,
  isLoading,
  hasFailed,
  onLoad,
  onError,
  disabled,
  canDelete,
}: {
  page: PageInfo;
  displayNumber: number; // Visual position in the list (1-indexed)
  currentPage: number;
  onPageSelect: (pageNumber: number) => void;
  onDelete?: (pageNumber: number) => void;
  pdfUrl?: string;
  isLoading: boolean;
  hasFailed: boolean;
  onLoad: () => void;
  onError: () => void;
  disabled?: boolean;
  canDelete?: boolean;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: page.id, disabled });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
    zIndex: isDragging ? 1000 : undefined,
  };

  const usePdfThumbnails = !!pdfUrl;

  const handleDeleteClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    if (onDelete && canDelete) {
      onDelete(page.pageNumber);
    }
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      onClick={() => !isDragging && onPageSelect(displayNumber)}
      role="button"
      tabIndex={0}
      className={cn(
        'group relative w-full aspect-[3/4] rounded border-2 overflow-hidden transition-all',
        'hover:scale-[1.02] cursor-grab active:cursor-grabbing',
        currentPage === displayNumber
          ? 'border-oak-primary ring-2 ring-oak-primary/30 shadow-md'
          : 'border-border-primary hover:border-oak-light',
        isDragging && 'shadow-lg ring-2 ring-oak-primary'
      )}
    >
      {/* Delete button - appears on hover */}
      {canDelete && onDelete && !isDragging && (
        <button
          onClick={handleDeleteClick}
          className={cn(
            'absolute top-1 right-1 z-10 p-1 rounded',
            'bg-red-500/80 hover:bg-red-600 text-white',
            'opacity-0 group-hover:opacity-100 transition-opacity',
            'focus:opacity-100 focus:outline-none focus:ring-2 focus:ring-red-400'
          )}
          title="Delete page"
        >
          <Trash2 className="w-3 h-3" />
        </button>
      )}

      {/* Show placeholder if image failed to load */}
      {hasFailed ? (
        <div className="absolute inset-0 flex items-center justify-center bg-background-tertiary">
          <FileText className="w-8 h-8 text-text-muted" />
        </div>
      ) : usePdfThumbnails ? (
        <PdfThumbnail
          pdfUrl={pdfUrl}
          pageNumber={displayNumber}
          isLoading={isLoading}
          onLoad={onLoad}
          onError={onError}
        />
      ) : (
        <>
          {isLoading && (
            <div className="absolute inset-0 flex items-center justify-center bg-background-tertiary">
              <RefreshCw className="w-4 h-4 animate-spin text-text-muted" />
            </div>
          )}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={page.imageUrl}
            alt={`Page ${page.pageNumber}`}
            className={cn('w-full h-full object-cover', isLoading && 'opacity-0')}
            onLoad={onLoad}
            onError={onError}
          />
        </>
      )}
      <span className={cn(
        'absolute bottom-0 left-0 right-0 text-white text-xs text-center py-0.5',
        currentPage === displayNumber ? 'bg-oak-primary' : 'bg-black/60'
      )}>
        {displayNumber}
      </span>
    </div>
  );
}

// Accepted file types for appending
const APPEND_ACCEPT = '.pdf,.png,.jpg,.jpeg,.tiff,.tif';
const APPEND_MIME_TYPES = ['application/pdf', 'image/png', 'image/jpeg', 'image/tiff'];

export function PageThumbnailSidebar({
  pages,
  currentPage,
  onPageSelect,
  pdfUrl,
  className,
  documentId,
  documentStatus,
  isPdf = true,
  onPagesChanged,
}: {
  pages: PageInfo[];
  currentPage: number;
  onPageSelect: (pageNumber: number) => void;
  pdfUrl?: string;
  className?: string;
  documentId?: string;
  documentStatus?: 'DRAFT' | 'APPROVED' | 'SUPERSEDED';
  isPdf?: boolean;
  onPagesChanged?: () => void;
}) {
  const [width, setWidth] = useState(DEFAULT_SIDEBAR_WIDTH);
  const [isResizing, setIsResizing] = useState(false);
  const sidebarRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [failedImages, setFailedImages] = useState<Set<string>>(new Set());
  const [loadingImages, setLoadingImages] = useState<Set<string>>(() => new Set(pages.map(p => p.id)));

  // Local state for optimistic reordering
  const [localPages, setLocalPages] = useState(pages);
  const [showApprovedConfirm, setShowApprovedConfirm] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [pendingAction, setPendingAction] = useState<'append' | 'reorder' | 'delete' | null>(null);
  const [pendingReorderData, setPendingReorderData] = useState<number[] | null>(null);
  const [pendingFiles, setPendingFiles] = useState<File[] | null>(null);
  const [pendingDeletePageNumber, setPendingDeletePageNumber] = useState<number | null>(null);

  // Mutations
  const appendPages = useAppendPages();
  const reorderPages = useReorderPages();
  const deletePagesMutation = useDeletePages();

  const isOperationPending = appendPages.isPending || reorderPages.isPending || deletePagesMutation.isPending;

  // Sync local pages with props and reset loading state for new pages
  useEffect(() => {
    setLocalPages(pages);
    // Reset loading state - mark all pages as loading, they'll clear as they render
    setLoadingImages(new Set(pages.map(p => p.id)));
    // Clear failed state since we have fresh data
    setFailedImages(new Set());
  }, [pages]);

  // DnD sensors
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8, // Require 8px of movement before starting drag
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  // Page IDs for sortable context
  const pageIds = useMemo(() => localPages.map((p) => p.id), [localPages]);

  // Handle drag end
  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      const { active, over } = event;

      if (!over || active.id === over.id || !documentId || !isPdf) return;

      const oldIndex = localPages.findIndex((p) => p.id === active.id);
      const newIndex = localPages.findIndex((p) => p.id === over.id);

      if (oldIndex === -1 || newIndex === -1) return;

      // Calculate new order (1-indexed page numbers in new order)
      const reorderedPages = arrayMove(localPages, oldIndex, newIndex);
      const newOrder = reorderedPages.map((p) => p.pageNumber);

      // Check if approved - show confirmation
      if (documentStatus === 'APPROVED') {
        setPendingAction('reorder');
        setPendingReorderData(newOrder);
        setShowApprovedConfirm(true);
        return;
      }

      // Execute reorder
      executeReorder(reorderedPages, newOrder);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps -- executeReorder is defined after handleDragEnd
    [localPages, documentId, isPdf, documentStatus]
  );

  const executeReorder = useCallback(
    (reorderedPages: PageInfo[], newOrder: number[]) => {
      if (!documentId) return;

      // Optimistic update - just reorder the array, keep original pageNumbers for PDF rendering
      // The visual page number badge will be calculated from array position
      setLocalPages(reorderedPages);

      // Call API
      reorderPages.mutate(
        { documentId, newOrder },
        {
          onSuccess: () => {
            onPagesChanged?.();
          },
          onError: () => {
            // Revert optimistic update
            setLocalPages(pages);
          },
        }
      );
    },
    [documentId, pages, reorderPages, onPagesChanged]
  );

  // Handle files for append (from file input or paste)
  const handleFilesForAppend = useCallback(
    (files: File[]) => {
      if (files.length === 0 || !documentId) return;

      // Check if approved - show confirmation
      if (documentStatus === 'APPROVED') {
        setPendingFiles(files);
        setPendingAction('append');
        setShowApprovedConfirm(true);
        return;
      }

      // Execute append
      executeAppend(files);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps -- executeAppend is defined after handleFilesForAppend
    [documentId, documentStatus]
  );

  // Handle file selection for append
  const handleFileSelect = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const files = e.target.files;
      if (!files || files.length === 0) return;
      handleFilesForAppend(Array.from(files));
    },
    [handleFilesForAppend]
  );

  // Handle paste event for appending files
  const handlePaste = useCallback(
    (e: ClipboardEvent) => {
      if (!documentId || !isPdf || isOperationPending) return;

      const items = e.clipboardData?.items;
      if (!items) return;

      const files: File[] = [];
      for (let i = 0; i < items.length; i++) {
        const item = items[i];
        if (item.kind === 'file' && APPEND_MIME_TYPES.includes(item.type)) {
          const file = item.getAsFile();
          if (file) files.push(file);
        }
      }

      if (files.length > 0) {
        e.preventDefault();
        handleFilesForAppend(files);
      }
    },
    [documentId, isPdf, isOperationPending, handleFilesForAppend]
  );

  // Add paste listener to sidebar
  useEffect(() => {
    const sidebar = sidebarRef.current;
    if (!sidebar || !documentId || !isPdf) return;

    sidebar.addEventListener('paste', handlePaste);
    return () => sidebar.removeEventListener('paste', handlePaste);
  }, [handlePaste, documentId, isPdf]);

  const executeAppend = useCallback(
    (files: File[]) => {
      if (!documentId) return;

      appendPages.mutate(
        { documentId, files },
        {
          onSuccess: () => {
            onPagesChanged?.();
            // Clear file input
            if (fileInputRef.current) {
              fileInputRef.current.value = '';
            }
          },
          onError: () => {
            // Clear file input on error too
            if (fileInputRef.current) {
              fileInputRef.current.value = '';
            }
          },
        }
      );
    },
    [documentId, appendPages, onPagesChanged]
  );

  // Handle delete page request
  const handleDeletePage = useCallback(
    (pageNumber: number) => {
      if (!documentId || localPages.length <= 1) return;

      // Check if approved - show approval confirmation first
      if (documentStatus === 'APPROVED') {
        setPendingDeletePageNumber(pageNumber);
        setPendingAction('delete');
        setShowApprovedConfirm(true);
        return;
      }

      // Show delete confirmation
      setPendingDeletePageNumber(pageNumber);
      setShowDeleteConfirm(true);
    },
    [documentId, localPages.length, documentStatus]
  );

  // Execute delete after confirmation
  const executeDelete = useCallback(
    (pageNumber: number) => {
      if (!documentId) return;

      deletePagesMutation.mutate(
        { documentId, pageNumbers: [pageNumber] },
        {
          onSuccess: () => {
            onPagesChanged?.();
          },
        }
      );
    },
    [documentId, deletePagesMutation, onPagesChanged]
  );

  // Handle delete confirmation
  const handleDeleteConfirm = useCallback(() => {
    setShowDeleteConfirm(false);
    if (pendingDeletePageNumber !== null) {
      executeDelete(pendingDeletePageNumber);
    }
    setPendingDeletePageNumber(null);
  }, [pendingDeletePageNumber, executeDelete]);

  const handleDeleteCancel = useCallback(() => {
    setShowDeleteConfirm(false);
    setPendingDeletePageNumber(null);
  }, []);

  // Handle confirmation for approved documents
  const handleApprovedConfirm = useCallback(() => {
    setShowApprovedConfirm(false);

    if (pendingAction === 'reorder' && pendingReorderData) {
      // Reconstruct reordered pages from newOrder
      const reorderedPages = pendingReorderData.map((pageNum) =>
        localPages.find((p) => p.pageNumber === pageNum)!
      );
      executeReorder(reorderedPages, pendingReorderData);
    } else if (pendingAction === 'append' && pendingFiles) {
      executeAppend(pendingFiles);
    } else if (pendingAction === 'delete' && pendingDeletePageNumber !== null) {
      // For delete, show the delete confirmation dialog next
      setShowDeleteConfirm(true);
      // Don't clear pendingDeletePageNumber - we need it for the delete dialog
      setPendingAction(null);
      setPendingReorderData(null);
      setPendingFiles(null);
      return;
    }

    setPendingAction(null);
    setPendingReorderData(null);
    setPendingFiles(null);
    setPendingDeletePageNumber(null);
  }, [pendingAction, pendingReorderData, pendingFiles, pendingDeletePageNumber, localPages, executeReorder, executeAppend]);

  const handleApprovedCancel = useCallback(() => {
    setShowApprovedConfirm(false);
    setPendingAction(null);
    setPendingReorderData(null);
    setPendingFiles(null);
    setPendingDeletePageNumber(null);
    // Clear file input if append was cancelled
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  }, []);

  // Handle resize drag
  useEffect(() => {
    if (!isResizing) return;

    const handleMouseMove = (e: MouseEvent) => {
      if (!sidebarRef.current) return;
      const rect = sidebarRef.current.getBoundingClientRect();
      const newWidth = e.clientX - rect.left;
      setWidth(Math.min(MAX_SIDEBAR_WIDTH, Math.max(MIN_SIDEBAR_WIDTH, newWidth)));
    };

    const handleMouseUp = () => {
      setIsResizing(false);
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isResizing]);

  if (pages.length === 0 && !documentId) {
    return null;
  }

  const canModify = !!documentId && isPdf;

  return (
    <>
      <div
        ref={sidebarRef}
        tabIndex={canModify ? 0 : undefined}
        className={cn(
          'flex-shrink-0 bg-background-tertiary border-r border-border-primary',
          'flex relative focus:outline-none',
          isResizing && 'select-none',
          className
        )}
        style={{ width }}
      >
        {/* Loading overlay */}
        {isOperationPending && (
          <div className="absolute inset-0 bg-background-tertiary/80 z-50 flex items-center justify-center">
            <RefreshCw className="w-6 h-6 animate-spin text-oak-primary" />
          </div>
        )}

        {/* Thumbnails container */}
        <div className="flex-1 overflow-y-auto overflow-x-hidden">
          <div className="flex flex-col gap-2 p-2">
            <DndContext
              sensors={sensors}
              collisionDetection={closestCenter}
              onDragEnd={handleDragEnd}
            >
              <SortableContext items={pageIds} strategy={verticalListSortingStrategy}>
                {localPages.map((page, index) => (
                  <SortableThumbnail
                    key={page.id}
                    page={page}
                    displayNumber={index + 1}
                    currentPage={currentPage}
                    onPageSelect={onPageSelect}
                    onDelete={handleDeletePage}
                    pdfUrl={pdfUrl}
                    isLoading={loadingImages.has(page.id)}
                    hasFailed={failedImages.has(page.id)}
                    onLoad={() => {
                      setLoadingImages((prev) => {
                        const next = new Set(prev);
                        next.delete(page.id);
                        return next;
                      });
                    }}
                    onError={() => {
                      setLoadingImages((prev) => {
                        const next = new Set(prev);
                        next.delete(page.id);
                        return next;
                      });
                      setFailedImages((prev) => new Set(prev).add(page.id));
                    }}
                    disabled={!canModify || isOperationPending}
                    canDelete={canModify && localPages.length > 1 && !isOperationPending}
                  />
                ))}
              </SortableContext>
            </DndContext>

            {/* Append button */}
            {canModify && (
              <>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept={APPEND_ACCEPT}
                  multiple
                  onChange={handleFileSelect}
                  className="hidden"
                />
                <button
                  onClick={() => fileInputRef.current?.click()}
                  disabled={isOperationPending}
                  className={cn(
                    'relative w-full aspect-[3/4] rounded border-2 border-dashed overflow-hidden transition-all',
                    'flex items-center justify-center',
                    'border-border-secondary hover:border-oak-light hover:bg-oak-primary/5',
                    'text-text-muted hover:text-oak-primary',
                    isOperationPending && 'opacity-50 cursor-not-allowed'
                  )}
                  title="Add pages (PDF, PNG, JPEG, TIFF) - or Ctrl+V to paste"
                >
                  <Plus className="w-6 h-6" />
                </button>
              </>
            )}
          </div>
        </div>

        {/* Resize handle */}
        <div
          className={cn(
            'absolute right-0 top-0 bottom-0 w-1 cursor-ew-resize',
            'hover:bg-oak-primary/30 transition-colors',
            isResizing && 'bg-oak-primary/50'
          )}
          onMouseDown={(e) => {
            e.preventDefault();
            setIsResizing(true);
          }}
        />
      </div>

      {/* Confirmation dialog for approved documents */}
      <ConfirmDialog
        isOpen={showApprovedConfirm}
        onClose={handleApprovedCancel}
        onConfirm={handleApprovedConfirm}
        title="Modify Approved Document"
        description={
          pendingAction === 'append'
            ? 'This document is approved. Adding pages will not change the approved extraction data. You can re-extract if needed after adding pages.'
            : pendingAction === 'delete'
            ? 'This document is approved. Deleting pages will not change the approved extraction data. You can re-extract if needed after deleting.'
            : 'This document is approved. Reordering pages will not change the approved extraction data. You can re-extract if needed after reordering.'
        }
        confirmLabel="Continue"
        cancelLabel="Cancel"
        variant="warning"
      />

      {/* Confirmation dialog for delete */}
      <ConfirmDialog
        isOpen={showDeleteConfirm}
        onClose={handleDeleteCancel}
        onConfirm={handleDeleteConfirm}
        title="Delete Page"
        description={`Are you sure you want to delete page ${pendingDeletePageNumber}? This action cannot be undone.`}
        confirmLabel="Delete"
        cancelLabel="Cancel"
        variant="danger"
      />
    </>
  );
}
