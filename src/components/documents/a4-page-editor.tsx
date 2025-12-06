'use client';

import { useState, useCallback, useMemo, memo } from 'react';
import {
  Eye,
  EyeOff,
  FileText,
  Printer,
  ChevronLeft,
  ChevronRight,
  Plus,
  Trash2,
  AlertTriangle,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { RichTextEditor, EditorToolbar, Editor } from '@/components/ui/rich-text-editor';
import { LetterheadHeader, LetterheadFooter } from './letterhead-display';
import { useLetterhead, hasLetterheadContent } from '@/hooks/use-letterhead';
import {
  A4_WIDTH_PX,
  A4_HEIGHT_PX,
  DEFAULT_MARGIN_TOP_PX,
  DEFAULT_MARGIN_RIGHT_PX,
  DEFAULT_MARGIN_BOTTOM_PX,
  DEFAULT_MARGIN_LEFT_PX,
  LETTERHEAD_HEADER_HEIGHT_PX,
  LETTERHEAD_FOOTER_HEIGHT_PX,
} from '@/lib/constants/a4';

// ============================================================================
// Types
// ============================================================================

export interface A4PageEditorProps {
  value: string;
  onChange: (html: string) => void;
  placeholder?: string;
  tenantId?: string;
  className?: string;
}

// ============================================================================
// Constants
// ============================================================================

// Fixed content area height (what user can actually type in)
const getContentAreaHeight = (withLetterhead: boolean): number => {
  const margins = DEFAULT_MARGIN_TOP_PX + DEFAULT_MARGIN_BOTTOM_PX;
  const letterhead = withLetterhead
    ? LETTERHEAD_HEADER_HEIGHT_PX + LETTERHEAD_FOOTER_HEIGHT_PX
    : 0;
  return A4_HEIGHT_PX - margins - letterhead;
};

// ============================================================================
// Letterhead Toggle Button
// ============================================================================

interface LetterheadToggleProps {
  enabled: boolean;
  onToggle: () => void;
  hasLetterhead: boolean;
}

const LetterheadToggle = memo(function LetterheadToggle({
  enabled,
  onToggle,
  hasLetterhead,
}: LetterheadToggleProps) {
  return (
    <button
      type="button"
      onClick={onToggle}
      className={cn(
        'flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium transition-all',
        enabled
          ? 'bg-accent-primary/10 text-accent-primary border border-accent-primary/30'
          : 'bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400 border border-gray-200 dark:border-gray-700'
      )}
      title={enabled ? 'Hide letterhead' : 'Show letterhead'}
    >
      {enabled ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />}
      <span>{hasLetterhead ? 'Letterhead' : 'No Letterhead'}</span>
    </button>
  );
});

// ============================================================================
// Page Navigation
// ============================================================================

interface PageNavigationProps {
  currentPage: number;
  totalPages: number;
  onPageChange: (page: number) => void;
  onAddPage: () => void;
  onDeletePage: () => void;
  canDelete: boolean;
}

const PageNavigation = memo(function PageNavigation({
  currentPage,
  totalPages,
  onPageChange,
  onAddPage,
  onDeletePage,
  canDelete,
}: PageNavigationProps) {
  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        onClick={() => onPageChange(currentPage - 1)}
        disabled={currentPage <= 1}
        className="p-1.5 rounded hover:bg-gray-200 dark:hover:bg-gray-700 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
        title="Previous page"
      >
        <ChevronLeft className="w-4 h-4" />
      </button>

      <span className="text-sm font-medium min-w-[80px] text-center">
        Page {currentPage} of {totalPages}
      </span>

      <button
        type="button"
        onClick={() => onPageChange(currentPage + 1)}
        disabled={currentPage >= totalPages}
        className="p-1.5 rounded hover:bg-gray-200 dark:hover:bg-gray-700 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
        title="Next page"
      >
        <ChevronRight className="w-4 h-4" />
      </button>

      <div className="w-px h-5 bg-border-primary mx-1" />

      <button
        type="button"
        onClick={onAddPage}
        className="flex items-center gap-1 px-2 py-1.5 rounded text-xs font-medium bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300 hover:bg-green-200 dark:hover:bg-green-900/50 transition-colors"
        title="Add new page"
      >
        <Plus className="w-3.5 h-3.5" />
        <span>Add Page</span>
      </button>

      {canDelete && (
        <button
          type="button"
          onClick={onDeletePage}
          className="flex items-center gap-1 px-2 py-1.5 rounded text-xs font-medium bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300 hover:bg-red-200 dark:hover:bg-red-900/50 transition-colors"
          title="Delete current page"
        >
          <Trash2 className="w-3.5 h-3.5" />
        </button>
      )}
    </div>
  );
});

// ============================================================================
// Main A4 Page Editor Component
// ============================================================================

export function A4PageEditor({
  value,
  onChange,
  placeholder = 'Start typing your content...',
  tenantId,
  className,
}: A4PageEditorProps) {
  // Parse value as multi-page content (pages separated by <!-- PAGE_BREAK -->)
  const PAGE_SEPARATOR = '<!-- PAGE_BREAK -->';

  const pages = useMemo(() => {
    if (!value) return [''];
    const parts = value.split(PAGE_SEPARATOR);
    return parts.length > 0 ? parts : [''];
  }, [value]);

  const [currentPage, setCurrentPage] = useState(1);
  const [showLetterhead, setShowLetterhead] = useState(true);
  const [editorInstance, setEditorInstance] = useState<Editor | null>(null);

  // Fetch letterhead data
  const { letterhead } = useLetterhead(tenantId);
  const hasActualLetterhead = useMemo(
    () => hasLetterheadContent(letterhead),
    [letterhead]
  );

  // Content area height
  const contentHeight = getContentAreaHeight(showLetterhead);

  // Current page content
  const currentPageContent = pages[currentPage - 1] || '';

  // Update page content
  const handlePageContentChange = useCallback((newContent: string) => {
    const newPages = [...pages];
    newPages[currentPage - 1] = newContent;
    onChange(newPages.join(PAGE_SEPARATOR));
  }, [pages, currentPage, onChange]);

  // Add new page
  const handleAddPage = useCallback(() => {
    const newPages = [...pages, ''];
    onChange(newPages.join(PAGE_SEPARATOR));
    setCurrentPage(newPages.length);
  }, [pages, onChange]);

  // Delete current page
  const handleDeletePage = useCallback(() => {
    if (pages.length <= 1) return;

    const newPages = pages.filter((_, i) => i !== currentPage - 1);
    onChange(newPages.join(PAGE_SEPARATOR));

    if (currentPage > newPages.length) {
      setCurrentPage(newPages.length);
    }
  }, [pages, currentPage, onChange]);

  // Page navigation
  const handlePageChange = useCallback((page: number) => {
    if (page >= 1 && page <= pages.length) {
      setCurrentPage(page);
    }
  }, [pages.length]);

  // Toggle letterhead
  const handleToggleLetterhead = useCallback(() => {
    setShowLetterhead(prev => !prev);
  }, []);

  // Render toolbar callback
  const renderToolbar = useCallback((editor: Editor | null) => {
    setEditorInstance(editor);
    return null;
  }, []);

  // Handle print
  const handlePrint = useCallback(() => {
    const printWindow = window.open('', '_blank', 'width=800,height=600');
    if (!printWindow) return;

    const pagesHtml = pages.map((pageContent, index) => {
      const isLastPage = index === pages.length - 1;
      return `
        <div class="page ${!isLastPage ? 'page-break' : ''}">
          ${showLetterhead ? '<div class="letterhead-header">[Letterhead Header]</div>' : ''}
          <div class="content">${pageContent || '<p>&nbsp;</p>'}</div>
          ${showLetterhead ? `<div class="letterhead-footer">[Letterhead Footer] — Page ${index + 1} of ${pages.length}</div>` : ''}
        </div>
      `;
    }).join('');

    printWindow.document.write(`
      <!DOCTYPE html>
      <html>
        <head>
          <title>Print Document</title>
          <style>
            @page { size: A4; margin: 20mm; }
            * { box-sizing: border-box; }
            html, body {
              font-family: 'Times New Roman', Times, serif;
              font-size: 12pt;
              line-height: 1.5;
              margin: 0;
              padding: 0;
            }
            .page { position: relative; min-height: 250mm; }
            .page-break { page-break-after: always; }
            .letterhead-header {
              text-align: center;
              padding: 10px 0;
              border-bottom: 1px solid #ccc;
              margin-bottom: 15px;
              color: #666;
            }
            .letterhead-footer {
              position: absolute;
              bottom: 0;
              left: 0;
              right: 0;
              text-align: center;
              padding: 10px 0;
              border-top: 1px solid #ccc;
              color: #666;
              font-size: 10pt;
            }
            .content { padding-bottom: 40px; }
            p { margin: 0 0 0.8em 0; }
            ul, ol { margin: 0 0 0.8em 0; padding-left: 1.5em; }
            @media print {
              body { print-color-adjust: exact; -webkit-print-color-adjust: exact; }
            }
          </style>
        </head>
        <body>${pagesHtml}</body>
      </html>
    `);

    printWindow.document.close();
    printWindow.onload = () => {
      printWindow.focus();
      printWindow.print();
      printWindow.close();
    };
  }, [pages, showLetterhead]);

  return (
    <div className={cn('flex flex-col h-full', className)}>
      {/* Header */}
      <div className="flex-shrink-0 flex items-center justify-between px-4 py-2 bg-background-secondary border-b border-border-primary">
        <div className="flex items-center gap-2">
          <FileText className="w-4 h-4 text-text-muted" />
          <span className="text-sm font-medium text-text-primary">
            A4 Document Editor
          </span>
        </div>

        <div className="flex items-center gap-3">
          <PageNavigation
            currentPage={currentPage}
            totalPages={pages.length}
            onPageChange={handlePageChange}
            onAddPage={handleAddPage}
            onDeletePage={handleDeletePage}
            canDelete={pages.length > 1}
          />

          <div className="w-px h-5 bg-border-primary" />

          <LetterheadToggle
            enabled={showLetterhead}
            onToggle={handleToggleLetterhead}
            hasLetterhead={hasActualLetterhead}
          />

          <button
            type="button"
            onClick={handlePrint}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
            title="Print all pages"
          >
            <Printer className="w-3.5 h-3.5" />
            <span>Print</span>
          </button>
        </div>
      </div>

      {/* Formatting Toolbar */}
      <div className="flex-shrink-0 border-b border-border-primary">
        <EditorToolbar editor={editorInstance} />
      </div>

      {/* Editor Container */}
      <div className="flex-1 overflow-auto bg-gray-100 dark:bg-gray-800">
        <div className="p-6 flex justify-center">
          {/* A4 Page */}
          <div
            className="relative bg-white dark:bg-gray-900 shadow-xl rounded-sm"
            style={{
              width: A4_WIDTH_PX,
              height: A4_HEIGHT_PX,
            }}
          >
            {/* Page number badge */}
            <div className="absolute -top-3 left-1/2 -translate-x-1/2 px-4 py-1 bg-blue-500 text-white rounded-full text-xs font-medium shadow-md z-10">
              Page {currentPage} of {pages.length}
            </div>

            {/* Letterhead Header */}
            {showLetterhead && <LetterheadHeader letterhead={letterhead} />}

            {/* Content Area - Fixed height with overflow hidden */}
            <div
              className="relative"
              style={{
                height: contentHeight,
                marginTop: DEFAULT_MARGIN_TOP_PX,
                marginRight: DEFAULT_MARGIN_RIGHT_PX,
                marginBottom: DEFAULT_MARGIN_BOTTOM_PX,
                marginLeft: DEFAULT_MARGIN_LEFT_PX,
                overflow: 'hidden',
              }}
            >
              <RichTextEditor
                value={currentPageContent}
                onChange={handlePageContentChange}
                placeholder={placeholder}
                minHeight={contentHeight - 20}
                className="border-0 rounded-none shadow-none bg-transparent h-full"
                renderToolbar={renderToolbar}
              />

              {/* Overflow warning indicator */}
              <div className="absolute bottom-0 left-0 right-0 h-8 bg-gradient-to-t from-amber-100/80 dark:from-amber-900/50 to-transparent pointer-events-none flex items-end justify-center pb-1">
                <span className="text-xs text-amber-700 dark:text-amber-300 flex items-center gap-1">
                  <AlertTriangle className="w-3 h-3" />
                  Content beyond this line won't print — add a new page if needed
                </span>
              </div>
            </div>

            {/* Letterhead Footer */}
            {showLetterhead && (
              <div className="absolute bottom-0 left-0 right-0">
                <LetterheadFooter
                  letterhead={letterhead}
                  pageNumber={currentPage}
                  totalPages={pages.length}
                />
              </div>
            )}

            {/* Page boundary indicator */}
            <div className="absolute inset-0 border-2 border-dashed border-gray-300 dark:border-gray-600 rounded-sm pointer-events-none" />
          </div>
        </div>
      </div>

      {/* Status bar */}
      <div className="flex-shrink-0 px-4 py-2 bg-background-secondary border-t border-border-primary">
        <div className="flex items-center justify-between text-xs text-text-muted">
          <span>
            A4: {A4_WIDTH_PX}×{A4_HEIGHT_PX}px | Content area: {contentHeight}px
            {showLetterhead ? ' (with letterhead)' : ''}
          </span>
          <span>
            {pages.length} page{pages.length !== 1 ? 's' : ''} total
          </span>
        </div>
      </div>
    </div>
  );
}

export default A4PageEditor;
