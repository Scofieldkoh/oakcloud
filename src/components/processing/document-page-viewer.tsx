'use client';

import { useState, useCallback, useRef, useEffect } from 'react';
import {
  ZoomIn,
  ZoomOut,
  RotateCw,
  ChevronLeft,
  ChevronRight,
  Maximize2,
  Minimize2,
  RefreshCw,
  Image as ImageIcon,
} from 'lucide-react';
import { useDocumentPages, type DocumentPageInfo } from '@/hooks/use-processing-documents';
import { cn } from '@/lib/utils';

interface BoundingBox {
  pageNumber: number;
  x: number; // 0-1 normalized
  y: number; // 0-1 normalized
  width: number; // 0-1 normalized
  height: number; // 0-1 normalized
  label?: string;
  color?: string;
}

interface DocumentPageViewerProps {
  documentId: string;
  initialPage?: number;
  highlights?: BoundingBox[];
  onPageChange?: (pageNumber: number) => void;
  className?: string;
}

const ZOOM_LEVELS = [0.5, 0.75, 1, 1.25, 1.5, 2];
const DEFAULT_ZOOM_INDEX = 2; // 100%

export function DocumentPageViewer({
  documentId,
  initialPage = 1,
  highlights = [],
  onPageChange,
  className,
}: DocumentPageViewerProps) {
  const { data, isLoading, error, refetch } = useDocumentPages(documentId);
  const [currentPage, setCurrentPage] = useState(initialPage);
  const [zoomIndex, setZoomIndex] = useState(DEFAULT_ZOOM_INDEX);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [imageLoading, setImageLoading] = useState(true);
  const [imageError, setImageError] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const imageRef = useRef<HTMLImageElement>(null);

  const zoom = ZOOM_LEVELS[zoomIndex];
  const pageCount = data?.pageCount ?? 0;
  const currentPageData = data?.pages.find((p) => p.pageNumber === currentPage);

  // Reset to initial page when document changes
  useEffect(() => {
    setCurrentPage(initialPage);
  }, [documentId, initialPage]);

  // Notify parent of page changes
  useEffect(() => {
    onPageChange?.(currentPage);
  }, [currentPage, onPageChange]);

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
    } else {
      document.exitFullscreen?.();
    }
    setIsFullscreen(!isFullscreen);
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

  // Get highlights for current page
  const currentHighlights = highlights.filter((h) => h.pageNumber === currentPage);

  if (isLoading) {
    return (
      <div className={cn('flex items-center justify-center h-96 bg-background-secondary rounded-lg', className)}>
        <RefreshCw className="w-6 h-6 animate-spin text-text-muted" />
        <span className="ml-3 text-text-secondary">Loading pages...</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className={cn('flex flex-col items-center justify-center h-96 bg-background-secondary rounded-lg', className)}>
        <ImageIcon className="w-12 h-12 text-text-muted mb-4" />
        <p className="text-text-secondary mb-4">Failed to load document pages</p>
        <button onClick={() => refetch()} className="btn-secondary btn-sm">
          Retry
        </button>
      </div>
    );
  }

  if (pageCount === 0) {
    return (
      <div className={cn('flex flex-col items-center justify-center h-96 bg-background-secondary rounded-lg', className)}>
        <ImageIcon className="w-12 h-12 text-text-muted mb-4" />
        <p className="text-text-secondary">No pages available</p>
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      className={cn(
        'flex flex-col bg-background-secondary rounded-lg overflow-hidden',
        isFullscreen && 'fixed inset-0 z-50 rounded-none',
        className
      )}
    >
      {/* Toolbar */}
      <div className="flex items-center justify-between px-3 py-2 bg-background-tertiary border-b border-border-primary">
        {/* Navigation */}
        <div className="flex items-center gap-2">
          <button
            onClick={handlePrevPage}
            disabled={currentPage <= 1}
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
              className="w-12 px-2 py-1 text-center text-sm bg-background-primary border border-border-primary rounded"
            />
            <span className="text-text-muted">/ {pageCount}</span>
          </div>

          <button
            onClick={handleNextPage}
            disabled={currentPage >= pageCount}
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

      {/* Page viewer */}
      <div className="flex-1 overflow-auto p-4 flex items-center justify-center bg-background-secondary">
        <div
          className="relative"
          style={{
            transform: `scale(${zoom})`,
            transformOrigin: 'center center',
            transition: 'transform 0.2s ease',
          }}
        >
          {/* Page image */}
          {currentPageData && (
            <>
              {imageLoading && (
                <div className="absolute inset-0 flex items-center justify-center bg-background-tertiary">
                  <RefreshCw className="w-6 h-6 animate-spin text-text-muted" />
                </div>
              )}
              {imageError ? (
                <div className="flex flex-col items-center justify-center w-[600px] h-[800px] bg-background-tertiary border border-border-primary rounded">
                  <ImageIcon className="w-12 h-12 text-text-muted mb-2" />
                  <p className="text-sm text-text-muted">Failed to load image</p>
                </div>
              ) : (
                <img
                  ref={imageRef}
                  src={currentPageData.imageUrl}
                  alt={`Page ${currentPage}`}
                  className={cn(
                    'max-w-none shadow-lg rounded border border-border-primary',
                    imageLoading && 'opacity-0'
                  )}
                  style={{
                    transform: `rotate(${currentPageData.rotation}deg)`,
                  }}
                  onLoad={() => {
                    setImageLoading(false);
                    setImageError(false);
                  }}
                  onError={() => {
                    setImageLoading(false);
                    setImageError(true);
                  }}
                />
              )}

              {/* Highlight overlays */}
              {!imageLoading && !imageError && imageRef.current && currentHighlights.length > 0 && (
                <div
                  className="absolute inset-0 pointer-events-none"
                  style={{
                    width: imageRef.current.naturalWidth,
                    height: imageRef.current.naturalHeight,
                  }}
                >
                  {currentHighlights.map((highlight, idx) => (
                    <div
                      key={idx}
                      className="absolute border-2 rounded-sm"
                      style={{
                        left: `${highlight.x * 100}%`,
                        top: `${highlight.y * 100}%`,
                        width: `${highlight.width * 100}%`,
                        height: `${highlight.height * 100}%`,
                        borderColor: highlight.color || '#3B82F6',
                        backgroundColor: `${highlight.color || '#3B82F6'}20`,
                      }}
                    >
                      {highlight.label && (
                        <span
                          className="absolute -top-5 left-0 text-xs px-1 rounded text-white whitespace-nowrap"
                          style={{ backgroundColor: highlight.color || '#3B82F6' }}
                        >
                          {highlight.label}
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {/* Page info footer */}
      {currentPageData && (
        <div className="px-3 py-1.5 bg-background-tertiary border-t border-border-primary text-xs text-text-muted">
          {currentPageData.width} × {currentPageData.height} px • {currentPageData.dpi} DPI
          {currentPageData.textAcquisition && ` • Text: ${currentPageData.textAcquisition}`}
        </div>
      )}
    </div>
  );
}

// Thumbnail strip component for multi-page navigation
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
