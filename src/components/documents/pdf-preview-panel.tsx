'use client';

import { useState, useCallback, useEffect, useRef, useMemo } from 'react';
import {
  FileText,
  Download,
  Printer,
  ZoomIn,
  ZoomOut,
  RotateCw,
  ChevronLeft,
  ChevronRight,
  Maximize2,
  Minimize2,
  Loader2,
  AlertCircle,
  Eye,
  EyeOff,
  Settings,
  RefreshCw,
  ExternalLink,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';

// ============================================================================
// Types
// ============================================================================

export interface PDFPreviewPanelProps {
  documentId?: string;
  content?: string;
  title?: string;
  includeLetterhead?: boolean;
  onLetterheadToggle?: (value: boolean) => void;
  onDownload?: () => void;
  onPrint?: () => void;
  onOpenFullscreen?: () => void;
  isLoading?: boolean;
  error?: string | null;
  className?: string;
  showToolbar?: boolean;
  showPageNavigation?: boolean;
  showZoomControls?: boolean;
  defaultZoom?: number;
  maxPages?: number;
  refreshInterval?: number; // ms, 0 to disable auto-refresh
}

export interface PDFPage {
  number: number;
  element: HTMLElement | null;
}

// ============================================================================
// Zoom Levels
// ============================================================================

const ZOOM_LEVELS = [50, 75, 100, 125, 150, 200];
const DEFAULT_ZOOM = 100;
const ZOOM_STEP = 25;

// ============================================================================
// PDF Preview Toolbar Component
// ============================================================================

interface PDFToolbarProps {
  zoom: number;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onZoomChange: (zoom: number) => void;
  currentPage: number;
  totalPages: number;
  onPageChange: (page: number) => void;
  includeLetterhead: boolean;
  onLetterheadToggle: (value: boolean) => void;
  onDownload?: () => void;
  onPrint?: () => void;
  onRefresh?: () => void;
  onFullscreen?: () => void;
  isLoading?: boolean;
  isFullscreen?: boolean;
}

function PDFToolbar({
  zoom,
  onZoomIn,
  onZoomOut,
  onZoomChange,
  currentPage,
  totalPages,
  onPageChange,
  includeLetterhead,
  onLetterheadToggle,
  onDownload,
  onPrint,
  onRefresh,
  onFullscreen,
  isLoading,
  isFullscreen,
}: PDFToolbarProps) {
  return (
    <div className="flex items-center justify-between px-4 py-2 bg-background-secondary border-b border-border-primary">
      {/* Left section: Page navigation */}
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => onPageChange(Math.max(1, currentPage - 1))}
          disabled={currentPage <= 1 || isLoading}
          className="p-1.5 rounded hover:bg-background-tertiary disabled:opacity-50 disabled:cursor-not-allowed text-text-muted hover:text-text-primary transition-colors"
          title="Previous page"
        >
          <ChevronLeft className="w-4 h-4" />
        </button>

        <div className="flex items-center gap-1 text-sm">
          <input
            type="number"
            value={currentPage}
            onChange={(e) => {
              const page = parseInt(e.target.value);
              if (page >= 1 && page <= totalPages) {
                onPageChange(page);
              }
            }}
            min={1}
            max={totalPages}
            className="w-12 text-center px-1 py-0.5 border border-border-primary rounded bg-background-elevated text-text-primary text-sm"
          />
          <span className="text-text-muted">/</span>
          <span className="text-text-muted">{totalPages}</span>
        </div>

        <button
          type="button"
          onClick={() => onPageChange(Math.min(totalPages, currentPage + 1))}
          disabled={currentPage >= totalPages || isLoading}
          className="p-1.5 rounded hover:bg-background-tertiary disabled:opacity-50 disabled:cursor-not-allowed text-text-muted hover:text-text-primary transition-colors"
          title="Next page"
        >
          <ChevronRight className="w-4 h-4" />
        </button>
      </div>

      {/* Center section: Zoom controls */}
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={onZoomOut}
          disabled={zoom <= ZOOM_LEVELS[0] || isLoading}
          className="p-1.5 rounded hover:bg-background-tertiary disabled:opacity-50 disabled:cursor-not-allowed text-text-muted hover:text-text-primary transition-colors"
          title="Zoom out"
        >
          <ZoomOut className="w-4 h-4" />
        </button>

        <select
          value={zoom}
          onChange={(e) => onZoomChange(parseInt(e.target.value))}
          className="px-2 py-1 border border-border-primary rounded bg-background-elevated text-text-primary text-sm cursor-pointer"
        >
          {ZOOM_LEVELS.map((level) => (
            <option key={level} value={level}>
              {level}%
            </option>
          ))}
        </select>

        <button
          type="button"
          onClick={onZoomIn}
          disabled={zoom >= ZOOM_LEVELS[ZOOM_LEVELS.length - 1] || isLoading}
          className="p-1.5 rounded hover:bg-background-tertiary disabled:opacity-50 disabled:cursor-not-allowed text-text-muted hover:text-text-primary transition-colors"
          title="Zoom in"
        >
          <ZoomIn className="w-4 h-4" />
        </button>
      </div>

      {/* Right section: Actions */}
      <div className="flex items-center gap-1">
        {/* Letterhead toggle */}
        <button
          type="button"
          onClick={() => onLetterheadToggle(!includeLetterhead)}
          className={cn(
            'flex items-center gap-1.5 px-2 py-1 rounded text-sm transition-colors',
            includeLetterhead
              ? 'bg-accent-primary/10 text-accent-primary'
              : 'bg-background-tertiary text-text-muted hover:text-text-primary'
          )}
          title={includeLetterhead ? 'Hide letterhead' : 'Show letterhead'}
        >
          {includeLetterhead ? (
            <Eye className="w-3.5 h-3.5" />
          ) : (
            <EyeOff className="w-3.5 h-3.5" />
          )}
          <span className="hidden sm:inline">Letterhead</span>
        </button>

        <div className="w-px h-5 bg-border-secondary mx-1" />

        {/* Refresh */}
        {onRefresh && (
          <button
            type="button"
            onClick={onRefresh}
            disabled={isLoading}
            className="p-1.5 rounded hover:bg-background-tertiary text-text-muted hover:text-text-primary transition-colors disabled:opacity-50"
            title="Refresh preview"
          >
            <RefreshCw className={cn('w-4 h-4', isLoading && 'animate-spin')} />
          </button>
        )}

        {/* Print */}
        {onPrint && (
          <button
            type="button"
            onClick={onPrint}
            disabled={isLoading}
            className="p-1.5 rounded hover:bg-background-tertiary text-text-muted hover:text-text-primary transition-colors disabled:opacity-50"
            title="Print"
          >
            <Printer className="w-4 h-4" />
          </button>
        )}

        {/* Download */}
        {onDownload && (
          <button
            type="button"
            onClick={onDownload}
            disabled={isLoading}
            className="p-1.5 rounded hover:bg-background-tertiary text-text-muted hover:text-text-primary transition-colors disabled:opacity-50"
            title="Download PDF"
          >
            <Download className="w-4 h-4" />
          </button>
        )}

        {/* Fullscreen */}
        {onFullscreen && (
          <button
            type="button"
            onClick={onFullscreen}
            className="p-1.5 rounded hover:bg-background-tertiary text-text-muted hover:text-text-primary transition-colors"
            title={isFullscreen ? 'Exit fullscreen' : 'Fullscreen'}
          >
            {isFullscreen ? (
              <Minimize2 className="w-4 h-4" />
            ) : (
              <Maximize2 className="w-4 h-4" />
            )}
          </button>
        )}
      </div>
    </div>
  );
}

// ============================================================================
// Page Container Component
// ============================================================================

interface PageContainerProps {
  content: string;
  pageNumber: number;
  zoom: number;
  includeLetterhead: boolean;
  onPageVisible?: (pageNumber: number) => void;
}

function PageContainer({
  content,
  pageNumber,
  zoom,
  includeLetterhead,
  onPageVisible,
}: PageContainerProps) {
  const pageRef = useRef<HTMLDivElement>(null);

  // Intersection observer to track visible page
  useEffect(() => {
    if (!pageRef.current || !onPageVisible) return;

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting && entry.intersectionRatio > 0.5) {
            onPageVisible(pageNumber);
          }
        });
      },
      { threshold: 0.5 }
    );

    observer.observe(pageRef.current);
    return () => observer.disconnect();
  }, [pageNumber, onPageVisible]);

  return (
    <div
      ref={pageRef}
      className="page-container bg-white shadow-lg mb-4 mx-auto"
      style={{
        width: `${(210 * zoom) / 100}mm`, // A4 width
        minHeight: `${(297 * zoom) / 100}mm`, // A4 height
        transform: `scale(${zoom / 100})`,
        transformOrigin: 'top center',
      }}
      data-page={pageNumber}
    >
      {/* Letterhead header placeholder */}
      {includeLetterhead && (
        <div className="h-16 bg-gray-50 border-b border-gray-200 flex items-center justify-center text-gray-400 text-sm">
          [Letterhead Header]
        </div>
      )}

      {/* Page content */}
      <div
        className="p-8 prose prose-sm max-w-none"
        dangerouslySetInnerHTML={{ __html: content }}
      />

      {/* Letterhead footer placeholder */}
      {includeLetterhead && (
        <div className="h-12 bg-gray-50 border-t border-gray-200 flex items-center justify-center text-gray-400 text-xs mt-auto">
          [Letterhead Footer] - Page {pageNumber}
        </div>
      )}
    </div>
  );
}

// ============================================================================
// Main PDF Preview Panel Component
// ============================================================================

export function PDFPreviewPanel({
  documentId,
  content,
  title,
  includeLetterhead: initialLetterhead = true,
  onLetterheadToggle,
  onDownload,
  onPrint,
  onOpenFullscreen,
  isLoading = false,
  error = null,
  className,
  showToolbar = true,
  showPageNavigation = true,
  showZoomControls = true,
  defaultZoom = DEFAULT_ZOOM,
  maxPages = 100,
  refreshInterval = 0,
}: PDFPreviewPanelProps) {
  const [zoom, setZoom] = useState(defaultZoom);
  const [currentPage, setCurrentPage] = useState(1);
  const [includeLetterhead, setIncludeLetterhead] = useState(initialLetterhead);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [previewContent, setPreviewContent] = useState<string | null>(
    content || null
  );
  const [isRefreshing, setIsRefreshing] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  // Parse content into pages (by page breaks)
  const pages = useMemo(() => {
    if (!previewContent) return [];

    // Split by page break markers
    const pageBreakPattern =
      /<div[^>]*class="[^"]*page-break[^"]*"[^>]*>.*?<\/div>/gi;
    const parts = previewContent.split(pageBreakPattern);

    return parts.filter((p) => p.trim()).slice(0, maxPages);
  }, [previewContent, maxPages]);

  const totalPages = pages.length || 1;

  // Sync with external letterhead prop
  useEffect(() => {
    setIncludeLetterhead(initialLetterhead);
  }, [initialLetterhead]);

  // Sync with external content prop
  useEffect(() => {
    if (content) {
      setPreviewContent(content);
    }
  }, [content]);

  // Auto-refresh
  useEffect(() => {
    if (!documentId || refreshInterval <= 0) return;

    const interval = setInterval(async () => {
      try {
        setIsRefreshing(true);
        const response = await fetch(
          `/api/generated-documents/${documentId}/preview?letterhead=${includeLetterhead}`
        );
        if (response.ok) {
          const data = await response.json();
          setPreviewContent(data.content);
        }
      } catch (err) {
        console.error('Auto-refresh error:', err);
      } finally {
        setIsRefreshing(false);
      }
    }, refreshInterval);

    return () => clearInterval(interval);
  }, [documentId, refreshInterval, includeLetterhead]);

  // Handle zoom
  const handleZoomIn = useCallback(() => {
    setZoom((prev) => {
      const currentIndex = ZOOM_LEVELS.indexOf(prev);
      if (currentIndex < ZOOM_LEVELS.length - 1) {
        return ZOOM_LEVELS[currentIndex + 1];
      }
      return Math.min(prev + ZOOM_STEP, ZOOM_LEVELS[ZOOM_LEVELS.length - 1]);
    });
  }, []);

  const handleZoomOut = useCallback(() => {
    setZoom((prev) => {
      const currentIndex = ZOOM_LEVELS.indexOf(prev);
      if (currentIndex > 0) {
        return ZOOM_LEVELS[currentIndex - 1];
      }
      return Math.max(prev - ZOOM_STEP, ZOOM_LEVELS[0]);
    });
  }, []);

  // Handle letterhead toggle
  const handleLetterheadToggle = useCallback(
    (value: boolean) => {
      setIncludeLetterhead(value);
      onLetterheadToggle?.(value);
    },
    [onLetterheadToggle]
  );

  // Handle page navigation
  const handlePageChange = useCallback(
    (page: number) => {
      setCurrentPage(page);

      // Scroll to page
      if (scrollContainerRef.current) {
        const pageElement = scrollContainerRef.current.querySelector(
          `[data-page="${page}"]`
        );
        if (pageElement) {
          pageElement.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
      }
    },
    []
  );

  // Handle page visibility
  const handlePageVisible = useCallback((pageNumber: number) => {
    setCurrentPage(pageNumber);
  }, []);

  // Handle refresh
  const handleRefresh = useCallback(async () => {
    if (!documentId) return;

    setIsRefreshing(true);
    try {
      const response = await fetch(
        `/api/generated-documents/${documentId}/preview?letterhead=${includeLetterhead}`
      );
      if (response.ok) {
        const data = await response.json();
        setPreviewContent(data.content);
      }
    } catch (err) {
      console.error('Refresh error:', err);
    } finally {
      setIsRefreshing(false);
    }
  }, [documentId, includeLetterhead]);

  // Handle print
  const handlePrint = useCallback(() => {
    if (onPrint) {
      onPrint();
    } else {
      window.print();
    }
  }, [onPrint]);

  // Handle download
  const handleDownload = useCallback(async () => {
    if (onDownload) {
      onDownload();
      return;
    }

    if (!documentId) return;

    try {
      const response = await fetch(
        `/api/generated-documents/${documentId}/export/pdf?letterhead=${includeLetterhead}`
      );
      if (response.ok) {
        const blob = await response.blob();
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${title || 'document'}.pdf`;
        a.click();
        URL.revokeObjectURL(url);
      }
    } catch (err) {
      console.error('Download error:', err);
    }
  }, [documentId, includeLetterhead, onDownload, title]);

  // Handle fullscreen
  const handleFullscreen = useCallback(() => {
    if (onOpenFullscreen) {
      onOpenFullscreen();
      return;
    }

    setIsFullscreen((prev) => !prev);
    if (containerRef.current) {
      if (!isFullscreen) {
        containerRef.current.requestFullscreen?.();
      } else {
        document.exitFullscreen?.();
      }
    }
  }, [isFullscreen, onOpenFullscreen]);

  // Loading state
  if (isLoading && !previewContent) {
    return (
      <div
        className={cn(
          'flex flex-col items-center justify-center h-96 bg-background-secondary rounded-lg border border-border-primary',
          className
        )}
      >
        <Loader2 className="w-10 h-10 animate-spin text-accent-primary mb-4" />
        <p className="text-text-muted">Loading preview...</p>
      </div>
    );
  }

  // Error state
  if (error) {
    return (
      <div
        className={cn(
          'flex flex-col items-center justify-center h-96 bg-background-secondary rounded-lg border border-border-primary',
          className
        )}
      >
        <AlertCircle className="w-10 h-10 text-red-500 mb-4" />
        <p className="text-red-600 dark:text-red-400 font-medium mb-2">
          Preview Error
        </p>
        <p className="text-text-muted text-sm">{error}</p>
        {documentId && (
          <Button variant="secondary" size="sm" onClick={handleRefresh} className="mt-4">
            <RefreshCw className="w-4 h-4 mr-2" />
            Retry
          </Button>
        )}
      </div>
    );
  }

  // Empty state
  if (!previewContent && pages.length === 0) {
    return (
      <div
        className={cn(
          'flex flex-col items-center justify-center h-96 bg-background-secondary rounded-lg border border-border-primary',
          className
        )}
      >
        <FileText className="w-10 h-10 text-text-muted mb-4" />
        <p className="text-text-muted">No content to preview</p>
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      className={cn(
        'flex flex-col bg-background-primary rounded-lg border border-border-primary overflow-hidden',
        isFullscreen && 'fixed inset-0 z-50',
        className
      )}
    >
      {/* Toolbar */}
      {showToolbar && (
        <PDFToolbar
          zoom={zoom}
          onZoomIn={handleZoomIn}
          onZoomOut={handleZoomOut}
          onZoomChange={setZoom}
          currentPage={currentPage}
          totalPages={totalPages}
          onPageChange={handlePageChange}
          includeLetterhead={includeLetterhead}
          onLetterheadToggle={handleLetterheadToggle}
          onDownload={documentId ? handleDownload : onDownload}
          onPrint={handlePrint}
          onRefresh={documentId ? handleRefresh : undefined}
          onFullscreen={handleFullscreen}
          isLoading={isLoading || isRefreshing}
          isFullscreen={isFullscreen}
        />
      )}

      {/* Preview content */}
      <div
        ref={scrollContainerRef}
        className="flex-1 overflow-auto bg-gray-100 dark:bg-gray-900 p-4"
      >
        <div className="flex flex-col items-center">
          {pages.length > 0 ? (
            pages.map((pageContent, index) => (
              <PageContainer
                key={index}
                content={pageContent}
                pageNumber={index + 1}
                zoom={zoom}
                includeLetterhead={includeLetterhead}
                onPageVisible={handlePageVisible}
              />
            ))
          ) : (
            <PageContainer
              content={previewContent || ''}
              pageNumber={1}
              zoom={zoom}
              includeLetterhead={includeLetterhead}
            />
          )}
        </div>
      </div>

      {/* Loading overlay */}
      {isRefreshing && (
        <div className="absolute inset-0 bg-black/20 flex items-center justify-center">
          <div className="bg-background-elevated rounded-lg px-4 py-3 flex items-center gap-2 shadow-lg">
            <Loader2 className="w-4 h-4 animate-spin text-accent-primary" />
            <span className="text-sm text-text-primary">Refreshing...</span>
          </div>
        </div>
      )}
    </div>
  );
}

// ============================================================================
// Compact PDF Preview (for sidebar/thumbnail view)
// ============================================================================

interface CompactPDFPreviewProps {
  content: string;
  onClick?: () => void;
  className?: string;
  showPageCount?: boolean;
}

export function CompactPDFPreview({
  content,
  onClick,
  className,
  showPageCount = true,
}: CompactPDFPreviewProps) {
  const pageCount = useMemo(() => {
    const pageBreakPattern =
      /<div[^>]*class="[^"]*page-break[^"]*"[^>]*>.*?<\/div>/gi;
    const parts = content.split(pageBreakPattern);
    return parts.filter((p) => p.trim()).length || 1;
  }, [content]);

  return (
    <div
      className={cn(
        'relative group cursor-pointer border border-border-primary rounded-lg overflow-hidden',
        'hover:border-accent-primary hover:shadow-md transition-all',
        className
      )}
      onClick={onClick}
      role="button"
      tabIndex={0}
    >
      {/* Thumbnail */}
      <div className="aspect-[210/297] bg-white p-2 overflow-hidden">
        <div
          className="transform scale-[0.15] origin-top-left w-[666%] h-[666%] prose prose-xs"
          dangerouslySetInnerHTML={{ __html: content.slice(0, 2000) }}
        />
      </div>

      {/* Overlay */}
      <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors flex items-center justify-center">
        <div className="opacity-0 group-hover:opacity-100 transition-opacity">
          <Eye className="w-6 h-6 text-white" />
        </div>
      </div>

      {/* Page count badge */}
      {showPageCount && pageCount > 1 && (
        <div className="absolute bottom-2 right-2 px-2 py-0.5 bg-black/60 text-white text-xs rounded">
          {pageCount} pages
        </div>
      )}
    </div>
  );
}

export default PDFPreviewPanel;
