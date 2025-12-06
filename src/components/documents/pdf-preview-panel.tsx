'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import {
  FileText,
  ZoomIn,
  ZoomOut,
  RotateCw,
  Download,
  ChevronLeft,
  ChevronRight,
  Maximize2,
  Minimize2,
  Loader2,
  AlertCircle,
  RefreshCw,
  Printer,
  FileDown,
  Settings,
  Check,
} from 'lucide-react';
import { Button } from '@/components/ui/button';

// ============================================================================
// Types
// ============================================================================

export interface PdfPreviewOptions {
  format: 'A4' | 'Letter';
  orientation: 'portrait' | 'landscape';
  includeLetterhead: boolean;
}

export interface PdfPreviewPanelProps {
  /**
   * Document ID to preview
   */
  documentId: string;
  /**
   * API endpoint to fetch PDF (defaults to /api/generated-documents/[id]/export/pdf)
   */
  endpoint?: string;
  /**
   * Initial preview options
   */
  initialOptions?: Partial<PdfPreviewOptions>;
  /**
   * Callback when preview is loaded
   */
  onLoad?: () => void;
  /**
   * Callback when preview fails
   */
  onError?: (error: string) => void;
  /**
   * Callback when options change
   */
  onOptionsChange?: (options: PdfPreviewOptions) => void;
  /**
   * Show toolbar
   */
  showToolbar?: boolean;
  /**
   * Show page navigation
   */
  showPageNav?: boolean;
  /**
   * Show zoom controls
   */
  showZoom?: boolean;
  /**
   * Show download button
   */
  showDownload?: boolean;
  /**
   * Show print button
   */
  showPrint?: boolean;
  /**
   * Show options menu
   */
  showOptions?: boolean;
  /**
   * Enable fullscreen mode
   */
  enableFullscreen?: boolean;
  /**
   * Additional CSS classes
   */
  className?: string;
}

// ============================================================================
// Constants
// ============================================================================

const ZOOM_LEVELS = [50, 75, 100, 125, 150, 200];
const DEFAULT_ZOOM = 100;

// ============================================================================
// Main Component
// ============================================================================

export function PdfPreviewPanel({
  documentId,
  endpoint,
  initialOptions,
  onLoad,
  onError,
  onOptionsChange,
  showToolbar = true,
  showPageNav = true,
  showZoom = true,
  showDownload = true,
  showPrint = true,
  showOptions = true,
  enableFullscreen = true,
  className = '',
}: PdfPreviewPanelProps) {
  // State
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [zoom, setZoom] = useState(DEFAULT_ZOOM);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [showOptionsMenu, setShowOptionsMenu] = useState(false);
  const [options, setOptions] = useState<PdfPreviewOptions>({
    format: initialOptions?.format || 'A4',
    orientation: initialOptions?.orientation || 'portrait',
    includeLetterhead: initialOptions?.includeLetterhead ?? true,
  });

  // Refs
  const containerRef = useRef<HTMLDivElement>(null);
  const iframeRef = useRef<HTMLIFrameElement>(null);

  // Build PDF URL
  const buildPdfUrl = useCallback(() => {
    const baseUrl = endpoint || `/api/generated-documents/${documentId}/export/pdf`;
    const params = new URLSearchParams({
      format: options.format,
      orientation: options.orientation,
      letterhead: String(options.includeLetterhead),
      inline: 'true',
    });
    return `${baseUrl}?${params.toString()}`;
  }, [documentId, endpoint, options]);

  // Load PDF
  const loadPdf = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      const url = buildPdfUrl();

      // Fetch to check if PDF is valid
      const response = await fetch(url);
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.error || 'Failed to load PDF');
      }

      // Use blob URL for iframe
      const blob = await response.blob();
      const blobUrl = URL.createObjectURL(blob);

      // Revoke previous URL
      if (pdfUrl) {
        URL.revokeObjectURL(pdfUrl);
      }

      setPdfUrl(blobUrl);
      setIsLoading(false);
      onLoad?.();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to load PDF';
      setError(message);
      setIsLoading(false);
      onError?.(message);
    }
  }, [buildPdfUrl, pdfUrl, onLoad, onError]);

  // Load on mount and when options change
  useEffect(() => {
    loadPdf();

    return () => {
      if (pdfUrl) {
        URL.revokeObjectURL(pdfUrl);
      }
    };
  }, [options]);

  // Handle options change
  const handleOptionsChange = (newOptions: Partial<PdfPreviewOptions>) => {
    const updated = { ...options, ...newOptions };
    setOptions(updated);
    onOptionsChange?.(updated);
  };

  // Navigation
  const goToPage = (page: number) => {
    if (page >= 1 && page <= totalPages) {
      setCurrentPage(page);
      // For iframe-based PDF, we'd need PDF.js for page navigation
      // This is a simplified version that shows the concept
    }
  };

  // Zoom
  const handleZoomIn = () => {
    const currentIndex = ZOOM_LEVELS.indexOf(zoom);
    if (currentIndex < ZOOM_LEVELS.length - 1) {
      setZoom(ZOOM_LEVELS[currentIndex + 1]);
    }
  };

  const handleZoomOut = () => {
    const currentIndex = ZOOM_LEVELS.indexOf(zoom);
    if (currentIndex > 0) {
      setZoom(ZOOM_LEVELS[currentIndex - 1]);
    }
  };

  // Download
  const handleDownload = async () => {
    try {
      const url = buildPdfUrl().replace('inline=true', 'inline=false');
      const response = await fetch(url);
      const blob = await response.blob();
      const downloadUrl = URL.createObjectURL(blob);

      const a = document.createElement('a');
      a.href = downloadUrl;
      a.download = `document-${documentId}.pdf`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(downloadUrl);
    } catch (err) {
      console.error('Download failed:', err);
    }
  };

  // Print
  const handlePrint = () => {
    if (iframeRef.current) {
      iframeRef.current.contentWindow?.print();
    }
  };

  // Fullscreen
  const toggleFullscreen = () => {
    if (!containerRef.current) return;

    if (!isFullscreen) {
      containerRef.current.requestFullscreen?.();
    } else {
      document.exitFullscreen?.();
    }
  };

  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(!!document.fullscreenElement);
    };

    document.addEventListener('fullscreenchange', handleFullscreenChange);
    return () => document.removeEventListener('fullscreenchange', handleFullscreenChange);
  }, []);

  return (
    <div
      ref={containerRef}
      className={`
        flex flex-col bg-background-secondary rounded-lg border border-border-primary overflow-hidden
        ${isFullscreen ? 'fixed inset-0 z-50 rounded-none' : ''}
        ${className}
      `}
    >
      {/* Toolbar */}
      {showToolbar && (
        <div className="flex items-center justify-between px-3 py-2 bg-background-elevated border-b border-border-primary">
          {/* Left: Page Navigation */}
          <div className="flex items-center gap-2">
            {showPageNav && (
              <>
                <Button
                  variant="ghost"
                  size="xs"
                  onClick={() => goToPage(currentPage - 1)}
                  disabled={currentPage <= 1 || isLoading}
                >
                  <ChevronLeft className="w-4 h-4" />
                </Button>
                <span className="text-xs text-text-muted min-w-[80px] text-center">
                  Page {currentPage} of {totalPages}
                </span>
                <Button
                  variant="ghost"
                  size="xs"
                  onClick={() => goToPage(currentPage + 1)}
                  disabled={currentPage >= totalPages || isLoading}
                >
                  <ChevronRight className="w-4 h-4" />
                </Button>
              </>
            )}
          </div>

          {/* Center: Zoom Controls */}
          <div className="flex items-center gap-2">
            {showZoom && (
              <>
                <Button
                  variant="ghost"
                  size="xs"
                  onClick={handleZoomOut}
                  disabled={zoom <= ZOOM_LEVELS[0] || isLoading}
                >
                  <ZoomOut className="w-4 h-4" />
                </Button>
                <span className="text-xs text-text-muted min-w-[50px] text-center">
                  {zoom}%
                </span>
                <Button
                  variant="ghost"
                  size="xs"
                  onClick={handleZoomIn}
                  disabled={zoom >= ZOOM_LEVELS[ZOOM_LEVELS.length - 1] || isLoading}
                >
                  <ZoomIn className="w-4 h-4" />
                </Button>
              </>
            )}
          </div>

          {/* Right: Actions */}
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="xs"
              onClick={loadPdf}
              disabled={isLoading}
              title="Refresh preview"
            >
              <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
            </Button>

            {showPrint && (
              <Button
                variant="ghost"
                size="xs"
                onClick={handlePrint}
                disabled={isLoading || !pdfUrl}
                title="Print"
              >
                <Printer className="w-4 h-4" />
              </Button>
            )}

            {showDownload && (
              <Button
                variant="ghost"
                size="xs"
                onClick={handleDownload}
                disabled={isLoading}
                title="Download PDF"
              >
                <FileDown className="w-4 h-4" />
              </Button>
            )}

            {showOptions && (
              <div className="relative">
                <Button
                  variant="ghost"
                  size="xs"
                  onClick={() => setShowOptionsMenu(!showOptionsMenu)}
                  title="Options"
                >
                  <Settings className="w-4 h-4" />
                </Button>

                {/* Options Dropdown */}
                {showOptionsMenu && (
                  <div className="absolute right-0 top-full mt-1 w-48 bg-background-elevated border border-border-primary rounded-lg shadow-lg z-10">
                    <div className="p-2">
                      {/* Format */}
                      <div className="mb-3">
                        <p className="text-2xs text-text-muted uppercase tracking-wide mb-1.5 px-2">
                          Format
                        </p>
                        <div className="flex gap-1">
                          {(['A4', 'Letter'] as const).map((format) => (
                            <button
                              key={format}
                              onClick={() => handleOptionsChange({ format })}
                              className={`
                                flex-1 px-2 py-1.5 text-xs rounded transition-colors
                                ${
                                  options.format === format
                                    ? 'bg-accent-primary text-white'
                                    : 'bg-background-secondary text-text-muted hover:text-text-primary'
                                }
                              `}
                            >
                              {format}
                            </button>
                          ))}
                        </div>
                      </div>

                      {/* Orientation */}
                      <div className="mb-3">
                        <p className="text-2xs text-text-muted uppercase tracking-wide mb-1.5 px-2">
                          Orientation
                        </p>
                        <div className="flex gap-1">
                          {(['portrait', 'landscape'] as const).map((orientation) => (
                            <button
                              key={orientation}
                              onClick={() => handleOptionsChange({ orientation })}
                              className={`
                                flex-1 px-2 py-1.5 text-xs rounded capitalize transition-colors
                                ${
                                  options.orientation === orientation
                                    ? 'bg-accent-primary text-white'
                                    : 'bg-background-secondary text-text-muted hover:text-text-primary'
                                }
                              `}
                            >
                              {orientation}
                            </button>
                          ))}
                        </div>
                      </div>

                      {/* Letterhead Toggle */}
                      <div className="border-t border-border-primary pt-2">
                        <button
                          onClick={() =>
                            handleOptionsChange({ includeLetterhead: !options.includeLetterhead })
                          }
                          className="w-full flex items-center justify-between px-2 py-1.5 text-xs text-text-primary hover:bg-background-secondary rounded transition-colors"
                        >
                          <span>Include Letterhead</span>
                          <div
                            className={`
                              w-4 h-4 rounded border flex items-center justify-center transition-colors
                              ${
                                options.includeLetterhead
                                  ? 'bg-accent-primary border-accent-primary'
                                  : 'border-border-secondary'
                              }
                            `}
                          >
                            {options.includeLetterhead && (
                              <Check className="w-3 h-3 text-white" />
                            )}
                          </div>
                        </button>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}

            {enableFullscreen && (
              <Button
                variant="ghost"
                size="xs"
                onClick={toggleFullscreen}
                title={isFullscreen ? 'Exit fullscreen' : 'Fullscreen'}
              >
                {isFullscreen ? (
                  <Minimize2 className="w-4 h-4" />
                ) : (
                  <Maximize2 className="w-4 h-4" />
                )}
              </Button>
            )}
          </div>
        </div>
      )}

      {/* Preview Area */}
      <div className="flex-1 relative overflow-auto bg-[#525659] min-h-[400px]">
        {/* Loading */}
        {isLoading && (
          <div className="absolute inset-0 flex items-center justify-center bg-background-secondary/80 z-10">
            <div className="flex flex-col items-center gap-3">
              <Loader2 className="w-8 h-8 text-accent-primary animate-spin" />
              <p className="text-sm text-text-muted">Generating preview...</p>
            </div>
          </div>
        )}

        {/* Error */}
        {error && !isLoading && (
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="flex flex-col items-center gap-3 text-center p-6">
              <div className="w-12 h-12 rounded-full bg-status-error/10 flex items-center justify-center">
                <AlertCircle className="w-6 h-6 text-status-error" />
              </div>
              <p className="text-sm text-text-primary font-medium">Failed to load preview</p>
              <p className="text-xs text-text-muted max-w-xs">{error}</p>
              <Button variant="secondary" size="sm" onClick={loadPdf}>
                <RefreshCw className="w-4 h-4 mr-1.5" />
                Retry
              </Button>
            </div>
          </div>
        )}

        {/* PDF Iframe */}
        {pdfUrl && !error && (
          <div
            className="flex justify-center p-4"
            style={{ transform: `scale(${zoom / 100})`, transformOrigin: 'top center' }}
          >
            <iframe
              ref={iframeRef}
              src={pdfUrl}
              className="bg-white shadow-xl"
              style={{
                width: options.orientation === 'portrait' ? '595px' : '842px',
                height: options.orientation === 'portrait' ? '842px' : '595px',
                border: 'none',
              }}
              title="PDF Preview"
            />
          </div>
        )}

        {/* Empty state */}
        {!pdfUrl && !isLoading && !error && (
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="flex flex-col items-center gap-3 text-center">
              <FileText className="w-12 h-12 text-text-tertiary" />
              <p className="text-sm text-text-muted">No preview available</p>
            </div>
          </div>
        )}
      </div>

      {/* Click outside to close options */}
      {showOptionsMenu && (
        <div
          className="fixed inset-0 z-[5]"
          onClick={() => setShowOptionsMenu(false)}
        />
      )}
    </div>
  );
}

// ============================================================================
// Compact Preview (thumbnail)
// ============================================================================

export interface PdfPreviewThumbnailProps {
  documentId: string;
  onClick?: () => void;
  className?: string;
}

export function PdfPreviewThumbnail({
  documentId,
  onClick,
  className = '',
}: PdfPreviewThumbnailProps) {
  return (
    <button
      onClick={onClick}
      className={`
        relative w-full aspect-[3/4] bg-white border border-border-primary rounded-lg
        overflow-hidden transition-all hover:shadow-md hover:border-accent-primary
        group
        ${className}
      `}
    >
      <div className="absolute inset-0 flex items-center justify-center bg-background-secondary/50 opacity-0 group-hover:opacity-100 transition-opacity">
        <div className="w-10 h-10 rounded-full bg-background-elevated shadow-lg flex items-center justify-center">
          <Maximize2 className="w-5 h-5 text-text-primary" />
        </div>
      </div>
      <div className="absolute bottom-2 left-2 right-2">
        <div className="bg-background-elevated/90 backdrop-blur rounded px-2 py-1">
          <p className="text-2xs text-text-muted truncate">Click to preview</p>
        </div>
      </div>
    </button>
  );
}

export default PdfPreviewPanel;
