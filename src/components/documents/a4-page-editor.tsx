'use client';

import { useState, useCallback, useMemo, useRef, useEffect, useImperativeHandle, forwardRef } from 'react';
import DOMPurify from 'dompurify';
import {
  FileText,
  Printer,
  Plus,
  Trash2,
  ChevronUp,
  ChevronDown,
  Bold,
  Italic,
  Underline,
  List,
  ListOrdered,
  AlignLeft,
  AlignCenter,
  AlignRight,
  Indent,
  Outdent,
  Undo,
  Redo,
  Eye,
  Edit3,
  Loader2,
  Type,
} from 'lucide-react';
import { cn } from '@/lib/utils';

// ============================================================================
// HTML Sanitization
// ============================================================================

/**
 * Sanitize HTML to prevent XSS attacks while preserving formatting
 */
function sanitizeHtml(html: string): string {
  return DOMPurify.sanitize(html, {
    ALLOWED_TAGS: [
      'p', 'br', 'div', 'span',
      'strong', 'b', 'em', 'i', 'u', 's', 'strike',
      'ul', 'ol', 'li',
      'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
      'a', 'hr',
    ],
    ALLOWED_ATTR: ['href', 'target', 'rel', 'style', 'class'],
    ALLOWED_URI_REGEXP: /^(?:(?:https?|mailto):|[^a-z]|[a-z+.\-]+(?:[^a-z+.\-:]|$))/i,
  });
}

// ============================================================================
// Types
// ============================================================================

export interface A4PageEditorProps {
  value: string;
  onChange: (html: string) => void;
  placeholder?: string;
  className?: string;
  tenantId?: string;
  /** Content to show in preview mode (with placeholders resolved) */
  previewContent?: string;
  /** Show preview mode toggle */
  showPreviewToggle?: boolean;
  /** Callback to generate preview (resolves placeholders) */
  onPreview?: () => void;
  /** Whether preview is currently loading */
  isPreviewLoading?: boolean;
}

/** Methods exposed via ref */
export interface A4PageEditorRef {
  /** Insert text at the current cursor position */
  insertAtCursor: (text: string) => void;
  /** Focus the editor */
  focus: () => void;
}

interface PageData {
  id: string;
  content: string;
}

// ============================================================================
// A4 Constants - 96 DPI (standard screen) for true WYSIWYG
// ============================================================================

const A4 = {
  // A4 at 96 DPI (portrait: 210mm x 297mm)
  // 1 inch = 25.4mm, 96 pixels/inch
  // Width: 210mm / 25.4 * 96 = 794px
  // Height: 297mm / 25.4 * 96 = 1123px
  WIDTH_PX: 794,
  HEIGHT_PX: 1123,
  // Margins: 20mm = 20 / 25.4 * 96 = 76px
  MARGIN_MM: 20,
  MARGIN_PX: 76,
  // Content area (what user can type in)
  get CONTENT_WIDTH_PX() { return this.WIDTH_PX - (this.MARGIN_PX * 2); }, // 642px
  get CONTENT_HEIGHT_PX() { return this.HEIGHT_PX - (this.MARGIN_PX * 2); }, // 971px
};

// Shared font styles
const FONT_FAMILY = "'Times New Roman', Times, serif";
const FONT_SIZE = '12pt';
const LINE_HEIGHT = '1.5';

// ============================================================================
// Toolbar Component
// ============================================================================

// Font options (Arial is default)
const FONT_OPTIONS = [
  { value: 'Arial, Helvetica, sans-serif', label: 'Arial' },
  { value: "'Times New Roman', Times, serif", label: 'Times New Roman' },
  { value: "'Courier New', Courier, monospace", label: 'Courier New' },
  { value: 'Georgia, serif', label: 'Georgia' },
  { value: 'Verdana, Geneva, sans-serif', label: 'Verdana' },
  { value: "'Trebuchet MS', sans-serif", label: 'Trebuchet MS' },
  { value: "'Lucida Console', Monaco, monospace", label: 'Lucida Console' },
];

const FONT_SIZE_OPTIONS = [
  { value: '8pt', label: '8' },
  { value: '9pt', label: '9' },
  { value: '10pt', label: '10' },
  { value: '11pt', label: '11' },
  { value: '12pt', label: '12' },
  { value: '14pt', label: '14' },
  { value: '16pt', label: '16' },
  { value: '18pt', label: '18' },
  { value: '20pt', label: '20' },
  { value: '24pt', label: '24' },
  { value: '28pt', label: '28' },
  { value: '36pt', label: '36' },
];

const LINE_SPACING_OPTIONS = [
  { value: '1', label: 'Single' },
  { value: '1.15', label: '1.15' },
  { value: '1.5', label: '1.5' },
  { value: '2', label: 'Double' },
  { value: '2.5', label: '2.5' },
  { value: '3', label: 'Triple' },
];

function Toolbar({
  onCommand,
  onSaveSelection,
  disabled
}: {
  onCommand: (cmd: string, value?: string) => void;
  onSaveSelection: () => void;
  disabled?: boolean;
}) {
  const Button = ({
    cmd,
    icon: Icon,
    title
  }: {
    cmd: string;
    icon: React.ElementType;
    title: string;
  }) => (
    <button
      type="button"
      onMouseDown={(e) => {
        e.preventDefault();
        if (!disabled) onCommand(cmd);
      }}
      disabled={disabled}
      className={cn(
        'p-1.5 rounded text-gray-700 dark:text-gray-300 transition-colors',
        disabled
          ? 'opacity-40 cursor-not-allowed'
          : 'hover:bg-gray-200 dark:hover:bg-gray-700'
      )}
      title={title}
    >
      <Icon className="w-4 h-4" />
    </button>
  );

  const selectClass = cn(
    'px-2 py-1 text-xs border rounded bg-white dark:bg-gray-800 border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300',
    disabled && 'opacity-40 cursor-not-allowed'
  );

  // Save selection when mouse enters a dropdown (before it steals focus)
  const handleSelectMouseDown = (e: React.MouseEvent) => {
    // Don't prevent default - we need the select to work
    // But save selection first
    onSaveSelection();
  };

  return (
    <div className={cn(
      'flex items-center gap-1 p-2 bg-gray-50 dark:bg-gray-900 border-b border-gray-200 dark:border-gray-700 flex-wrap',
      disabled && 'opacity-60'
    )}>
      <Button cmd="undo" icon={Undo} title="Undo (Ctrl+Z)" />
      <Button cmd="redo" icon={Redo} title="Redo (Ctrl+Y)" />

      <div className="w-px h-5 bg-gray-300 dark:bg-gray-600 mx-1" />

      {/* Font Family */}
      <div className="flex items-center gap-1">
        <Type className="w-4 h-4 text-gray-500" />
        <select
          onMouseDown={handleSelectMouseDown}
          onChange={(e) => onCommand('fontName', e.target.value)}
          disabled={disabled}
          className={selectClass}
          defaultValue="Arial, Helvetica, sans-serif"
          title="Font Family"
        >
          {FONT_OPTIONS.map((font) => (
            <option key={font.value} value={font.value}>
              {font.label}
            </option>
          ))}
        </select>
      </div>

      {/* Font Size */}
      <select
        onMouseDown={handleSelectMouseDown}
        onChange={(e) => onCommand('customFontSize', e.target.value)}
        disabled={disabled}
        className={selectClass}
        defaultValue="11pt"
        title="Font Size"
      >
        {FONT_SIZE_OPTIONS.map((size) => (
          <option key={size.value} value={size.value}>
            {size.label}
          </option>
        ))}
      </select>

      <div className="w-px h-5 bg-gray-300 dark:bg-gray-600 mx-1" />

      <Button cmd="bold" icon={Bold} title="Bold (Ctrl+B)" />
      <Button cmd="italic" icon={Italic} title="Italic (Ctrl+I)" />
      <Button cmd="underline" icon={Underline} title="Underline (Ctrl+U)" />

      <div className="w-px h-5 bg-gray-300 dark:bg-gray-600 mx-1" />

      <Button cmd="insertUnorderedList" icon={List} title="Bullet List" />
      <Button cmd="insertOrderedList" icon={ListOrdered} title="Numbered List" />

      <div className="w-px h-5 bg-gray-300 dark:bg-gray-600 mx-1" />

      <Button cmd="justifyLeft" icon={AlignLeft} title="Align Left" />
      <Button cmd="justifyCenter" icon={AlignCenter} title="Align Center" />
      <Button cmd="justifyRight" icon={AlignRight} title="Align Right" />

      <div className="w-px h-5 bg-gray-300 dark:bg-gray-600 mx-1" />

      <Button cmd="outdent" icon={Outdent} title="Decrease Indent" />
      <Button cmd="indent" icon={Indent} title="Increase Indent" />

      <div className="w-px h-5 bg-gray-300 dark:bg-gray-600 mx-1" />

      {/* Line Spacing */}
      <select
        onMouseDown={handleSelectMouseDown}
        onChange={(e) => onCommand('lineSpacing', e.target.value)}
        disabled={disabled}
        className={selectClass}
        defaultValue="1.5"
        title="Line Spacing"
      >
        {LINE_SPACING_OPTIONS.map((spacing) => (
          <option key={spacing.value} value={spacing.value}>
            {spacing.label}
          </option>
        ))}
      </select>
    </div>
  );
}

// ============================================================================
// Single A4 Page Component
// ============================================================================

interface PageProps {
  page: PageData;
  pageNumber: number;
  totalPages: number;
  isActive: boolean;
  isPreviewMode: boolean;
  onContentChange: (id: string, content: string) => void;
  onFocus: (id: string) => void;
  onBlur?: () => void;
  onDelete: (id: string) => void;
  onOverflow?: (id: string, overflowContent: string) => void;
  canDelete: boolean;
  editorRef: React.RefObject<HTMLDivElement | null>;
  placeholder?: string;
  maxContentHeight: number;
}

function Page({
  page,
  pageNumber,
  totalPages,
  isActive,
  isPreviewMode,
  onContentChange,
  onFocus,
  onBlur,
  onDelete,
  onOverflow,
  canDelete,
  editorRef,
  placeholder,
  maxContentHeight,
}: PageProps) {
  const contentRef = useRef<HTMLDivElement>(null);
  const isCheckingOverflow = useRef(false);
  const isEmpty = !page.content || page.content.replace(/<[^>]*>/g, '').trim() === '';

  // Sync content with sanitized HTML
  useEffect(() => {
    if (contentRef.current) {
      const sanitized = sanitizeHtml(page.content || '');
      if (contentRef.current.innerHTML !== sanitized) {
        contentRef.current.innerHTML = sanitized;
      }
    }
  }, [page.content]);

  // Check for overflow and handle it
  const checkOverflow = useCallback(() => {
    const el = contentRef.current;
    if (!el || isPreviewMode || isCheckingOverflow.current || !onOverflow) return;

    // Check if content exceeds max height
    if (el.scrollHeight > maxContentHeight) {
      isCheckingOverflow.current = true;

      // Find the point where content overflows
      const children = Array.from(el.childNodes);
      let fittingContent = '';
      let overflowContent = '';

      // Create a temporary element to measure heights
      const tempDiv = document.createElement('div');
      tempDiv.style.cssText = el.style.cssText;
      tempDiv.style.position = 'absolute';
      tempDiv.style.visibility = 'hidden';
      tempDiv.style.width = `${el.offsetWidth}px`;
      document.body.appendChild(tempDiv);

      for (let i = 0; i < children.length; i++) {
        const child = children[i];
        const clone = child.cloneNode(true);
        tempDiv.appendChild(clone);

        if (tempDiv.scrollHeight > maxContentHeight) {
          // This node causes overflow - check if it's a text node we can split
          if (child.nodeType === Node.TEXT_NODE && child.textContent) {
            // For text nodes, find the break point
            const words = child.textContent.split(' ');
            tempDiv.removeChild(clone);
            let fittingText = '';

            for (const word of words) {
              const testText = fittingText ? `${fittingText} ${word}` : word;
              tempDiv.textContent = fittingContent + testText;

              if (tempDiv.scrollHeight > maxContentHeight) {
                // This word causes overflow
                overflowContent = child.textContent.substring(fittingText.length).trim();
                break;
              }
              fittingText = testText;
            }

            if (fittingText) {
              fittingContent += fittingText;
            }
          }

          // Add remaining nodes to overflow
          for (let j = i; j < children.length; j++) {
            const node = children[j];
            if (node.nodeType === Node.ELEMENT_NODE) {
              overflowContent += (node as Element).outerHTML;
            } else if (node.nodeType === Node.TEXT_NODE) {
              if (j === i && overflowContent) {
                // Already handled partial text
              } else {
                overflowContent += node.textContent || '';
              }
            }
          }
          break;
        } else {
          // This node fits
          if (child.nodeType === Node.ELEMENT_NODE) {
            fittingContent += (child as Element).outerHTML;
          } else if (child.nodeType === Node.TEXT_NODE) {
            fittingContent += child.textContent || '';
          }
        }
      }

      document.body.removeChild(tempDiv);

      // If we have overflow content, trigger the callback
      if (overflowContent.trim()) {
        // Update current page with fitting content
        onContentChange(page.id, fittingContent);
        // Pass overflow to parent
        onOverflow(page.id, overflowContent);
      }

      isCheckingOverflow.current = false;
    }
  }, [maxContentHeight, isPreviewMode, onOverflow, onContentChange, page.id]);

  // Check overflow after content changes
  useEffect(() => {
    const timer = setTimeout(checkOverflow, 100);
    return () => clearTimeout(timer);
  }, [page.content, checkOverflow]);

  const handleInput = useCallback(() => {
    if (contentRef.current && !isPreviewMode) {
      onContentChange(page.id, contentRef.current.innerHTML);
    }
  }, [page.id, onContentChange, isPreviewMode]);

  return (
    <div
      className="relative group"
      style={{
        width: A4.WIDTH_PX,
        height: A4.HEIGHT_PX,
      }}
    >
      {/* Page label */}
      <div className="absolute -top-6 left-1/2 -translate-x-1/2 px-3 py-1 bg-gray-700 text-white text-xs rounded-t-md z-10">
        Page {pageNumber} of {totalPages}
      </div>

      {/* Delete button */}
      {canDelete && !isPreviewMode && (
        <button
          type="button"
          onClick={() => onDelete(page.id)}
          className="absolute -right-10 top-4 p-1.5 rounded bg-red-100 text-red-600 opacity-0 group-hover:opacity-100 hover:bg-red-200 transition-opacity z-10"
          title="Delete page"
        >
          <Trash2 className="w-4 h-4" />
        </button>
      )}

      {/* A4 Page - exact dimensions, no scaling */}
      <div
        className={cn(
          'bg-white shadow-xl transition-all relative',
          isActive && !isPreviewMode && 'ring-2 ring-blue-500',
          isPreviewMode && 'ring-2 ring-green-500'
        )}
        style={{
          width: A4.WIDTH_PX,
          height: A4.HEIGHT_PX,
          boxShadow: '0 4px 20px rgba(0,0,0,0.15)',
        }}
      >
        {/* Content area - matches print exactly */}
        <div
          ref={(el) => {
            (contentRef as React.MutableRefObject<HTMLDivElement | null>).current = el;
            if (isActive && editorRef) {
              (editorRef as React.MutableRefObject<HTMLDivElement | null>).current = el;
            }
          }}
          contentEditable={!isPreviewMode}
          suppressContentEditableWarning
          onInput={handleInput}
          onFocus={() => !isPreviewMode && onFocus(page.id)}
          onBlur={() => !isPreviewMode && onBlur?.()}
          data-placeholder={placeholder}
          className={cn(
            'outline-none',
            isPreviewMode && 'cursor-default'
          )}
          style={{
            position: 'absolute',
            top: A4.MARGIN_PX,
            left: A4.MARGIN_PX,
            width: A4.CONTENT_WIDTH_PX,
            height: A4.CONTENT_HEIGHT_PX,
            fontFamily: 'Arial, Helvetica, sans-serif',
            fontSize: '11pt',
            lineHeight: '1.5',
            color: '#000',
            // Prevent text overflow
            overflow: 'hidden',
            overflowWrap: 'break-word',
            wordBreak: 'break-word',
            whiteSpace: 'pre-wrap',
          }}
        />

        {/* Placeholder overlay */}
        {isEmpty && placeholder && !isPreviewMode && (
          <div
            className="pointer-events-none select-none text-gray-400"
            style={{
              position: 'absolute',
              top: A4.MARGIN_PX,
              left: A4.MARGIN_PX,
              fontFamily: "'Times New Roman', Times, serif",
              fontSize: '12pt',
              lineHeight: '1.5',
            }}
          >
            {placeholder}
          </div>
        )}

        {/* Page number footer */}
        <div
          className="absolute left-1/2 -translate-x-1/2 text-gray-400"
          style={{
            fontFamily: "'Times New Roman', Times, serif",
            fontSize: '10pt',
            bottom: '30px',
          }}
        >
          {pageNumber}
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// Main A4 Page Editor Component
// ============================================================================

export const A4PageEditor = forwardRef<A4PageEditorRef, A4PageEditorProps>(function A4PageEditor({
  value,
  onChange,
  placeholder,
  className,
  tenantId: _tenantId,
  previewContent,
  showPreviewToggle = true,
  onPreview,
  isPreviewLoading = false,
}, ref) {
  const PAGE_SEPARATOR = '<!-- PAGE_BREAK -->';
  const activeEditorRef = useRef<HTMLDivElement | null>(null);
  const lastValueRef = useRef<string>(value);
  const isInternalUpdate = useRef(false);

  // Store last selection range for formatting commands
  const savedSelectionRef = useRef<{
    startNode: Node;
    startOffset: number;
    endNode: Node;
    endOffset: number;
    collapsed: boolean;
  } | null>(null);

  // Save selection (cursor position and selection range) when editor loses focus
  const saveCursorPosition = useCallback(() => {
    const selection = window.getSelection();
    if (selection && selection.rangeCount > 0) {
      const range = selection.getRangeAt(0);
      // Check if selection is within our editor
      if (activeEditorRef.current?.contains(range.startContainer)) {
        savedSelectionRef.current = {
          startNode: range.startContainer,
          startOffset: range.startOffset,
          endNode: range.endContainer,
          endOffset: range.endOffset,
          collapsed: range.collapsed,
        };
      }
    }
  }, []);

  // Restore saved selection to the editor
  const restoreSelection = useCallback(() => {
    const editor = activeEditorRef.current;
    const saved = savedSelectionRef.current;
    if (!editor || !saved) return false;

    // Check if saved nodes are still in the editor
    if (!editor.contains(saved.startNode) || !editor.contains(saved.endNode)) {
      return false;
    }

    try {
      const selection = window.getSelection();
      if (!selection) return false;

      const range = document.createRange();
      range.setStart(saved.startNode, saved.startOffset);
      range.setEnd(saved.endNode, saved.endOffset);
      selection.removeAllRanges();
      selection.addRange(range);
      return true;
    } catch {
      return false;
    }
  }, []);

  // Insert text at cursor position
  const insertAtCursor = useCallback((text: string) => {
    const editor = activeEditorRef.current;
    if (!editor) return;

    // Focus the editor first
    editor.focus();

    const selection = window.getSelection();
    if (!selection) return;

    // Try to restore saved position if no current selection in editor
    if (selection.rangeCount === 0 || !editor.contains(selection.anchorNode)) {
      if (!restoreSelection()) {
        // No saved position or restore failed, append to end
        const range = document.createRange();
        range.selectNodeContents(editor);
        range.collapse(false);
        selection.removeAllRanges();
        selection.addRange(range);
      }
    }

    // Insert the text using execCommand (maintains undo history)
    document.execCommand('insertText', false, text);
  }, [restoreSelection]);

  // Expose methods via ref
  useImperativeHandle(ref, () => ({
    insertAtCursor,
    focus: () => activeEditorRef.current?.focus(),
  }), [insertAtCursor]);

  // Parse pages - stable function that preserves IDs and whitespace
  const parsePages = useCallback((content: string, existingPages?: PageData[]): PageData[] => {
    if (!content) return [{ id: crypto.randomUUID(), content: '' }];
    const parts = content.split(PAGE_SEPARATOR);
    return parts.map((c, i) => ({
      id: existingPages?.[i]?.id || crypto.randomUUID(),
      content: c, // Preserve whitespace - don't trim
    }));
  }, []);

  const [pages, setPages] = useState<PageData[]>(() => parsePages(value));
  const [activePageId, setActivePageId] = useState<string>(pages[0]?.id || '');
  const [isPreviewMode, setIsPreviewMode] = useState(false);

  // Preview pages (when previewContent is provided)
  const previewPages = useMemo(() => {
    if (!previewContent) return null;
    return parsePages(previewContent);
  }, [previewContent, parsePages]);

  // Display pages (either edit or preview)
  const displayPages = isPreviewMode && previewPages ? previewPages : pages;

  // Sync activePageId when switching modes or when displayPages change
  useEffect(() => {
    if (displayPages.length === 0) return;

    // Check if current activePageId exists in displayPages
    const currentIdx = displayPages.findIndex(p => p.id === activePageId);
    if (currentIdx === -1) {
      // Reset to first page if current ID not found
      setActivePageId(displayPages[0].id);
    }
  }, [displayPages, activePageId]);

  // Sync when value changes externally (not from our own updates)
  useEffect(() => {
    // Skip if this is our own update or value hasn't changed
    if (isInternalUpdate.current || value === lastValueRef.current) {
      isInternalUpdate.current = false;
      return;
    }

    lastValueRef.current = value;

    if (!isPreviewMode) {
      setPages(prev => {
        const newPages = parsePages(value, prev);
        if (!newPages.find(p => p.id === activePageId) && newPages.length > 0) {
          setActivePageId(newPages[0].id);
        }
        return newPages;
      });
    }
  }, [value, parsePages, isPreviewMode, activePageId]);

  // Track if we need to notify parent of changes
  const pendingUpdateRef = useRef(false);

  // Notify parent of changes (called via useEffect to avoid setState during render)
  useEffect(() => {
    if (pendingUpdateRef.current) {
      pendingUpdateRef.current = false;
      const html = pages.map((p) => p.content).join(PAGE_SEPARATOR);
      isInternalUpdate.current = true;
      lastValueRef.current = html;
      onChange(html);
    }
  }, [pages, onChange]);

  // Content change - just update local state, parent notified via effect
  const handleContentChange = useCallback((id: string, content: string) => {
    if (isPreviewMode) return;
    pendingUpdateRef.current = true;
    setPages((prev) => prev.map((p) => (p.id === id ? { ...p, content } : p)));
  }, [isPreviewMode]);

  // Add page
  const handleAddPage = useCallback(() => {
    if (isPreviewMode) return;
    const newPage: PageData = { id: crypto.randomUUID(), content: '' };
    pendingUpdateRef.current = true;
    setPages((prev) => [...prev, newPage]);
    setActivePageId(newPage.id);
  }, [isPreviewMode]);

  // Delete page
  const handleDeletePage = useCallback((id: string) => {
    if (isPreviewMode) return;
    pendingUpdateRef.current = true;
    setPages((prev) => {
      if (prev.length <= 1) return prev;
      const newPages = prev.filter((p) => p.id !== id);
      const deletedIndex = prev.findIndex((p) => p.id === id);
      const newActiveIndex = Math.min(deletedIndex, newPages.length - 1);
      // Note: setActivePageId is called outside this callback via effect
      setTimeout(() => setActivePageId(newPages[newActiveIndex]?.id || ''), 0);
      return newPages;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isPreviewMode]);

  // Handle overflow - create new page or append to next page
  const handleOverflow = useCallback((pageId: string, overflowContent: string) => {
    if (isPreviewMode || !overflowContent.trim()) return;

    pendingUpdateRef.current = true;
    setPages((prev) => {
      const pageIndex = prev.findIndex((p) => p.id === pageId);
      if (pageIndex === -1) return prev;

      const nextPageIndex = pageIndex + 1;

      if (nextPageIndex < prev.length) {
        // Append to existing next page
        const nextPage = prev[nextPageIndex];
        const updatedPages = [...prev];
        updatedPages[nextPageIndex] = {
          ...nextPage,
          content: overflowContent + nextPage.content,
        };
        return updatedPages;
      } else {
        // Create new page with overflow content
        const newPage: PageData = {
          id: crypto.randomUUID(),
          content: overflowContent,
        };
        // Set focus to new page
        setTimeout(() => setActivePageId(newPage.id), 0);
        return [...prev, newPage];
      }
    });
  }, [isPreviewMode]);

  // Toolbar command
  // NOTE: document.execCommand is deprecated but still widely supported.
  // For a production app, consider migrating to Selection/Range API or
  // a rich-text library like TipTap, Slate, or ProseMirror.
  const handleCommand = useCallback((cmd: string, val?: string) => {
    if (isPreviewMode) return;

    const editor = activeEditorRef.current;
    if (!editor) return;

    // Focus editor and restore selection first
    editor.focus();
    restoreSelection();

    // Handle custom font size command with CSS
    if (cmd === 'customFontSize' && val) {
      const selection = window.getSelection();
      if (selection && selection.rangeCount > 0) {
        const range = selection.getRangeAt(0);
        if (!range.collapsed) {
          // Use execCommand with fontSize 7, then replace font tags with styled spans
          document.execCommand('fontSize', false, '7');
          // Find the font elements and replace with spans
          const fonts = editor.querySelectorAll('font[size="7"]');
          fonts.forEach((font) => {
            const span = document.createElement('span');
            span.style.fontSize = val;
            span.innerHTML = font.innerHTML;
            font.parentNode?.replaceChild(span, font);
          });
          // Trigger content change
          const event = new Event('input', { bubbles: true });
          editor.dispatchEvent(event);
        }
      }
      return;
    }

    // Handle font family command
    if (cmd === 'fontName' && val) {
      const selection = window.getSelection();
      if (selection && selection.rangeCount > 0) {
        const range = selection.getRangeAt(0);
        if (!range.collapsed) {
          // Use execCommand with fontName, then clean up font tags to use CSS
          document.execCommand('fontName', false, '__temp_font__');
          const fonts = editor.querySelectorAll('font[face="__temp_font__"]');
          fonts.forEach((font) => {
            const span = document.createElement('span');
            span.style.fontFamily = val;
            span.innerHTML = font.innerHTML;
            font.parentNode?.replaceChild(span, font);
          });
          // Trigger content change
          const event = new Event('input', { bubbles: true });
          editor.dispatchEvent(event);
        }
      }
      return;
    }

    // Handle line spacing command
    if (cmd === 'lineSpacing' && val) {
      const selection = window.getSelection();
      if (selection && selection.rangeCount > 0) {
        const range = selection.getRangeAt(0);

        // Find the block-level parent element to apply line-height
        let blockElement: HTMLElement | null = null;
        let node: Node | null = range.startContainer;

        // Walk up the tree to find a block-level element
        while (node && node !== editor) {
          if (node.nodeType === Node.ELEMENT_NODE) {
            const element = node as HTMLElement;
            const display = window.getComputedStyle(element).display;
            if (display === 'block' || display === 'list-item' || element.tagName === 'P' || element.tagName === 'DIV') {
              blockElement = element;
              break;
            }
          }
          node = node.parentNode;
        }

        if (blockElement && blockElement !== editor) {
          // Apply line-height to the block element
          blockElement.style.lineHeight = val;
        } else {
          // If no block element found, wrap content or apply to a new div
          // For simplicity, wrap selection in a div with line-height
          if (!range.collapsed) {
            const div = document.createElement('div');
            div.style.lineHeight = val;
            try {
              range.surroundContents(div);
            } catch {
              // If surroundContents fails, apply to editor content area
              const firstChild = editor.firstElementChild as HTMLElement;
              if (firstChild) {
                firstChild.style.lineHeight = val;
              }
            }
          } else {
            // No selection, apply to current paragraph or create one
            const firstChild = editor.firstElementChild as HTMLElement;
            if (firstChild) {
              firstChild.style.lineHeight = val;
            }
          }
        }

        // Trigger content change
        const event = new Event('input', { bubbles: true });
        editor.dispatchEvent(event);
      }
      return;
    }

    document.execCommand(cmd, false, val);
  }, [isPreviewMode, restoreSelection]);

  // Print
  const handlePrint = useCallback(() => {
    const printPages = isPreviewMode && previewPages ? previewPages : pages;
    const printWindow = window.open('', '_blank');
    if (!printWindow) return;

    const pagesHtml = printPages
      .map((page, i) =>
        `<div class="page">
          <div class="content">${sanitizeHtml(page.content) || '&nbsp;'}</div>
          <div class="page-num">${i + 1}</div>
        </div>`
      )
      .join('')
      .trim();

    // Print styles match screen exactly (WYSIWYG):
    // - Page: 210mm x 297mm (A4)
    // - Margins: 20mm all sides
    // - Content area: 170mm x 257mm
    // - Font: Arial 11pt, line-height 1.5
    // - white-space: pre-wrap to preserve spacing
    printWindow.document.write(`<!DOCTYPE html>
<html>
<head>
  <title>Print</title>
  <style>
    @page {
      size: 210mm 297mm;
      margin: 0;
    }
    * {
      box-sizing: border-box;
      margin: 0;
      padding: 0;
    }
    html, body {
      font-family: Arial, Helvetica, sans-serif;
      font-size: 11pt;
      line-height: 1.5;
      color: #000;
    }
    .page {
      width: 210mm;
      height: 297mm;
      position: relative;
      overflow: hidden;
    }
    .page + .page {
      page-break-before: always;
      break-before: page;
    }
    .content {
      position: absolute;
      top: ${A4.MARGIN_MM}mm;
      left: ${A4.MARGIN_MM}mm;
      width: calc(210mm - ${A4.MARGIN_MM * 2}mm);
      height: calc(297mm - ${A4.MARGIN_MM * 2}mm);
      overflow: hidden;
      /* WYSIWYG: preserve whitespace and line breaks exactly as in editor */
      white-space: pre-wrap;
      overflow-wrap: break-word;
      word-break: break-word;
    }
    .page-num {
      position: absolute;
      bottom: 8mm;
      left: 50%;
      transform: translateX(-50%);
      font-size: 10pt;
      color: #999;
    }
    /* Preserve empty paragraphs and divs */
    p:empty, div:empty { min-height: 1em; }
    p { margin: 0 0 0.5em 0; }
    br { display: block; content: ""; margin-top: 0.5em; }
    ul, ol { margin: 0 0 0.5em 0; padding-left: 1.5em; }
  </style>
</head>
<body>${pagesHtml}</body>
</html>`);

    printWindow.document.close();
    setTimeout(() => {
      printWindow.print();
      printWindow.close();
    }, 200);
  }, [pages, previewPages, isPreviewMode]);

  // Page navigation
  const scrollToPage = useCallback((dir: 'up' | 'down') => {
    const idx = displayPages.findIndex((p) => p.id === activePageId);
    const newIdx = dir === 'up' ? Math.max(0, idx - 1) : Math.min(displayPages.length - 1, idx + 1);
    setActivePageId(displayPages[newIdx].id);
    document.querySelectorAll('[data-page-id]')[newIdx]?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, [displayPages, activePageId]);

  const currentPageIdx = displayPages.findIndex((p) => p.id === activePageId);

  return (
    <div className={cn('flex flex-col h-full bg-gray-200 dark:bg-gray-800', className)}>
      {/* Header */}
      <div className="flex-shrink-0 flex items-center justify-between px-4 py-2 bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-700">
        <div className="flex items-center gap-3">
          <FileText className="w-4 h-4 text-gray-500" />
          <span className="text-sm font-medium">Document Editor</span>
          <span className="text-xs text-gray-500">
            {displayPages.length} page{displayPages.length !== 1 ? 's' : ''}
          </span>

          {/* Preview mode indicator */}
          {isPreviewMode && (
            <span className="px-2 py-0.5 text-xs font-medium bg-green-100 text-green-700 rounded">
              Preview Mode
            </span>
          )}
        </div>

        <div className="flex items-center gap-2">
          {/* Page nav */}
          <button
            type="button"
            onClick={() => scrollToPage('up')}
            disabled={currentPageIdx === 0}
            className="p-1.5 rounded hover:bg-gray-100 disabled:opacity-30"
          >
            <ChevronUp className="w-4 h-4" />
          </button>
          <span className="text-xs font-medium w-12 text-center">
            {currentPageIdx + 1}/{displayPages.length}
          </span>
          <button
            type="button"
            onClick={() => scrollToPage('down')}
            disabled={currentPageIdx === displayPages.length - 1}
            className="p-1.5 rounded hover:bg-gray-100 disabled:opacity-30"
          >
            <ChevronDown className="w-4 h-4" />
          </button>

          <div className="w-px h-5 bg-gray-300 mx-1" />

          {/* Add page (only in edit mode) */}
          {!isPreviewMode && (
            <button
              type="button"
              onClick={handleAddPage}
              className="flex items-center gap-1 px-2 py-1.5 rounded text-xs font-medium bg-green-100 text-green-700 hover:bg-green-200"
            >
              <Plus className="w-4 h-4" />
              Add Page
            </button>
          )}

          {/* Combined Preview/Edit button */}
          {(onPreview || (showPreviewToggle && previewContent)) && (
            <button
              type="button"
              onClick={() => {
                if (isPreviewMode) {
                  // Currently in preview mode - switch back to edit
                  setIsPreviewMode(false);
                } else {
                  // Currently in edit mode - generate preview and switch to preview mode
                  onPreview?.();
                  // Switch to preview mode immediately (preview content will update async)
                  setIsPreviewMode(true);
                }
              }}
              disabled={isPreviewLoading}
              className={cn(
                'flex items-center gap-1 px-2 py-1.5 rounded text-xs font-medium transition-colors',
                isPreviewMode
                  ? 'bg-blue-100 text-blue-700 hover:bg-blue-200'
                  : 'bg-amber-100 text-amber-700 hover:bg-amber-200',
                isPreviewLoading && 'opacity-60 cursor-not-allowed'
              )}
            >
              {isPreviewLoading ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : isPreviewMode ? (
                <Edit3 className="w-4 h-4" />
              ) : (
                <Eye className="w-4 h-4" />
              )}
              {isPreviewLoading ? 'Generating...' : isPreviewMode ? 'Edit' : 'Preview'}
            </button>
          )}

          {/* Print */}
          <button
            type="button"
            onClick={handlePrint}
            className="flex items-center gap-1 px-2 py-1.5 rounded text-xs font-medium bg-gray-100 hover:bg-gray-200"
          >
            <Printer className="w-4 h-4" />
            Print
          </button>
        </div>
      </div>

      {/* Toolbar */}
      <Toolbar onCommand={handleCommand} onSaveSelection={saveCursorPosition} disabled={isPreviewMode} />

      {/* Pages */}
      <div className="flex-1 overflow-auto py-8">
        <div className="flex flex-col items-center gap-8">
          {displayPages.map((page, index) => (
            <div key={page.id} data-page-id={page.id}>
              <Page
                page={page}
                pageNumber={index + 1}
                totalPages={displayPages.length}
                isActive={page.id === activePageId}
                isPreviewMode={isPreviewMode}
                onContentChange={handleContentChange}
                onFocus={setActivePageId}
                onBlur={saveCursorPosition}
                onDelete={handleDeletePage}
                onOverflow={handleOverflow}
                canDelete={displayPages.length > 1}
                editorRef={activeEditorRef}
                placeholder={index === 0 ? placeholder : undefined}
                maxContentHeight={A4.CONTENT_HEIGHT_PX}
              />
            </div>
          ))}

          {/* Add page button */}
          {!isPreviewMode && (
            <button
              type="button"
              onClick={handleAddPage}
              className="flex items-center gap-2 px-4 py-3 rounded-lg border-2 border-dashed border-gray-400 text-gray-500 hover:border-gray-500 hover:text-gray-600 transition-colors"
            >
              <Plus className="w-5 h-5" />
              Add New Page
            </button>
          )}
        </div>
      </div>

      {/* Status */}
      <div className="flex-shrink-0 px-4 py-1.5 bg-white dark:bg-gray-900 border-t text-xs text-gray-500 flex justify-between">
        <span>A4: {A4.WIDTH_PX}×{A4.HEIGHT_PX}px ({A4.MARGIN_MM}mm margins)</span>
        <span>
          {isPreviewMode ? 'Viewing preview' : 'Editing'} • What you see = What prints
        </span>
      </div>
    </div>
  );
});

export default A4PageEditor;
