'use client';

import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
  type ClipboardEvent as ReactClipboardEvent,
} from 'react';
import DOMPurify from 'dompurify';
import {
  AlignCenter,
  AlignLeft,
  AlignRight,
  Bold,
  ChevronDown,
  ChevronUp,
  Edit3,
  Eye,
  FileText,
  Indent,
  Italic,
  List,
  ListOrdered,
  Loader2,
  Outdent,
  Plus,
  Printer,
  Redo,
  SeparatorHorizontal,
  Trash2,
  Type,
  Underline,
  Undo,
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
      'p',
      'br',
      'div',
      'span',
      'strong',
      'b',
      'em',
      'i',
      'u',
      's',
      'strike',
      'ul',
      'ol',
      'li',
      'h1',
      'h2',
      'h3',
      'h4',
      'h5',
      'h6',
      'a',
      'hr',
    ],
    ALLOWED_ATTR: ['href', 'target', 'rel', 'style', 'class'],
    ALLOWED_URI_REGEXP:
      /^(?:(?:https?|mailto):|[^a-z]|[a-z+.\-]+(?:[^a-z+.\-:]|$))/i,
  });
}

// ============================================================================
// Overflow helpers
// ============================================================================

const OVERFLOW_TOLERANCE_PX = 5;
const HTML_PAGE_BREAK_REGEX =
  /<[^>]*class\s*=\s*["'][^"']*\bpage-break\b[^"']*["'][^>]*>(?:\s*<\/[^>]+>)?/gi;

interface SplitResult {
  fitHtml: string;
  overflowHtml: string;
}

interface TextNodeInfo {
  node: Text;
  start: number;
  length: number;
  end: number;
}

function fragmentToHtml(fragment: DocumentFragment): string {
  const wrapper = document.createElement('div');
  wrapper.appendChild(fragment);
  return wrapper.innerHTML;
}

function splitByManualBreak(container: HTMLElement): SplitResult | null {
  const manualBreak = container.querySelector('.page-break');
  if (!manualBreak) return null;

  const rangeBefore = document.createRange();
  rangeBefore.setStart(container, 0);
  rangeBefore.setEndBefore(manualBreak);

  const rangeAfter = document.createRange();
  rangeAfter.setStartAfter(manualBreak);
  rangeAfter.setEnd(container, container.childNodes.length);

  const fitHtml = fragmentToHtml(rangeBefore.cloneContents());
  const overflowHtml = fragmentToHtml(rangeAfter.cloneContents());

  if (!overflowHtml.trim()) {
    return null;
  }

  return { fitHtml, overflowHtml };
}

function collectTextNodes(container: HTMLElement): {
  nodes: TextNodeInfo[];
  totalLength: number;
} {
  const walker = document.createTreeWalker(
    container,
    NodeFilter.SHOW_TEXT,
    null,
  );
  const nodes: TextNodeInfo[] = [];
  let totalLength = 0;
  let current: Node | null;

  while ((current = walker.nextNode())) {
    const textNode = current as Text;
    const textContent = textNode.textContent ?? '';
    const length = textContent.length;

    if (length === 0) continue;

    nodes.push({
      node: textNode,
      start: totalLength,
      length,
      end: totalLength + length,
    });

    totalLength += length;
  }

  return { nodes, totalLength };
}

function mapOffsetToDomPosition(
  nodes: TextNodeInfo[],
  offset: number,
): { node: Text; offset: number } | null {
  if (nodes.length === 0) return null;

  if (offset <= 0) {
    return { node: nodes[0].node, offset: 0 };
  }

  const totalLength = nodes[nodes.length - 1].end;
  if (offset >= totalLength) {
    const last = nodes[nodes.length - 1];
    return { node: last.node, offset: last.length };
  }

  for (const info of nodes) {
    if (offset >= info.start && offset <= info.end) {
      return { node: info.node, offset: offset - info.start };
    }
  }

  const last = nodes[nodes.length - 1];
  return { node: last.node, offset: last.length };
}

function getCharAt(nodes: TextNodeInfo[], index: number): string | null {
  if (index < 0) return null;

  for (const info of nodes) {
    if (index >= info.start && index < info.end) {
      const text = info.node.textContent ?? '';
      return text.charAt(index - info.start) ?? null;
    }
  }

  return null;
}

function findWhitespaceSplitOffset(nodes: TextNodeInfo[], offset: number): number {
  const WHITESPACE_REGEX = /[\s\u00A0]/;
  let adjusted = offset;

  for (let i = 0; i < 50 && adjusted > 0; i += 1) {
    const char = getCharAt(nodes, adjusted - 1);
    if (!char) break;
    if (WHITESPACE_REGEX.test(char)) {
      return adjusted;
    }
    adjusted -= 1;
  }

  return offset;
}

function measureRangeHeight(range: Range, containerTop: number): number {
  const rects = Array.from(range.getClientRects?.() ?? []);
  if (rects.length === 0) {
    const rect = range.getBoundingClientRect();
    if (rect.width === 0 && rect.height === 0) {
      return 0;
    }
    return Math.ceil(rect.bottom - containerTop);
  }

  let maxBottom = containerTop;
  rects.forEach((rect) => {
    if (rect.bottom > maxBottom) {
      maxBottom = rect.bottom;
    }
  });

  return Math.ceil(maxBottom - containerTop);
}

function splitByCharacter(
  container: HTMLElement,
  maxHeight: number,
): SplitResult | null {
  const { nodes, totalLength } = collectTextNodes(container);
  if (nodes.length === 0 || totalLength === 0) {
    return null;
  }

  const containerTop = container.getBoundingClientRect().top;

  let low = 0;
  let high = totalLength;
  let bestOffset = -1;

  while (low <= high) {
    const mid = Math.floor((low + high) / 2);
    const domPos = mapOffsetToDomPosition(nodes, mid);
    if (!domPos) break;

    const testRange = document.createRange();
    testRange.setStart(container, 0);
    testRange.setEnd(domPos.node, domPos.offset);

    const measuredHeight = measureRangeHeight(testRange, containerTop);

    if (measuredHeight <= maxHeight + OVERFLOW_TOLERANCE_PX) {
      bestOffset = mid;
      low = mid + 1;
    } else {
      high = mid - 1;
    }
  }

  if (bestOffset <= 0 || bestOffset >= totalLength) {
    return null;
  }

  const adjustedOffset = findWhitespaceSplitOffset(nodes, bestOffset);
  if (adjustedOffset <= 0 || adjustedOffset >= totalLength) {
    return null;
  }

  const finalPosition = mapOffsetToDomPosition(nodes, adjustedOffset);
  if (!finalPosition) return null;

  const fitRange = document.createRange();
  fitRange.setStart(container, 0);
  fitRange.setEnd(finalPosition.node, finalPosition.offset);

  const overflowRange = document.createRange();
  overflowRange.setStart(finalPosition.node, finalPosition.offset);
  overflowRange.setEnd(container, container.childNodes.length);

  const fitHtml = fragmentToHtml(fitRange.cloneContents());
  const overflowHtml = fragmentToHtml(overflowRange.cloneContents());

  if (!overflowHtml.trim()) {
    return null;
  }

  return { fitHtml, overflowHtml };
}

function splitByElement(container: HTMLElement): SplitResult | null {
  const nodes = Array.from(container.childNodes);
  if (nodes.length <= 1) return null;

  const splitNode = nodes[nodes.length - 1];

  const fitRange = document.createRange();
  fitRange.setStart(container, 0);
  fitRange.setEndBefore(splitNode);

  const overflowRange = document.createRange();
  overflowRange.setStartBefore(splitNode);
  overflowRange.setEnd(container, container.childNodes.length);

  const fitHtml = fragmentToHtml(fitRange.cloneContents());
  const overflowHtml = fragmentToHtml(overflowRange.cloneContents());

  if (!overflowHtml.trim()) {
    return null;
  }

  return { fitHtml, overflowHtml };
}

function splitContainerContent(
  container: HTMLElement,
  maxHeight: number,
): SplitResult | null {
  const manualSplit = splitByManualBreak(container);
  if (manualSplit) {
    return manualSplit;
  }

  const characterSplit = splitByCharacter(container, maxHeight);
  if (characterSplit) {
    return characterSplit;
  }

  const elementSplit = splitByElement(container);
  if (elementSplit) {
    return elementSplit;
  }

  return null;
}

function hasRenderableContent(html: string): boolean {
  if (!html) return false;

  const cleaned = html
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<[^>]+>/g, '')
    .trim();

  if (cleaned.length > 0) {
    return true;
  }

  return /<(img|svg|object|embed|video|audio|canvas|table|tr|td|th|li|ul|ol|hr|br)\b/i.test(
    html,
  );
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
  previewContent?: string;
  showPreviewToggle?: boolean;
  onPreview?: () => void;
  isPreviewLoading?: boolean;
}

export interface A4PageEditorRef {
  insertAtCursor: (text: string) => void;
  insertHtmlAtCursor: (html: string) => void;
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
  WIDTH_PX: 794,
  HEIGHT_PX: 1123,
  MARGIN_MM: 20,
  MARGIN_PX: 76,
  get CONTENT_WIDTH_PX() {
    return this.WIDTH_PX - this.MARGIN_PX * 2;
  },
  get CONTENT_HEIGHT_PX() {
    return this.HEIGHT_PX - this.MARGIN_PX * 2;
  },
};

// Shared font styles
const FONT_FAMILY = "'Times New Roman', Times, serif";
const FONT_SIZE = '12pt';
const LINE_HEIGHT = '1.5';

// ============================================================================
// Toolbar Component
// ============================================================================

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
  disabled,
}: {
  onCommand: (cmd: string, value?: string) => void;
  onSaveSelection: () => void;
  disabled?: boolean;
}) {
  const Button = ({
    cmd,
    icon: Icon,
    title,
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
          : 'hover:bg-gray-200 dark:hover:bg-gray-700',
      )}
      title={title}
    >
      <Icon className="w-4 h-4" />
    </button>
  );

  const selectClass = cn(
    'px-2 py-1 text-xs border rounded bg-white dark:bg-gray-800 border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300',
    disabled && 'opacity-40 cursor-not-allowed',
  );

  const handleSelectMouseDown = () => {
    onSaveSelection();
  };

  return (
    <div
      className={cn(
        'flex items-center gap-1 p-2 bg-gray-50 dark:bg-gray-900 border-b border-gray-200 dark:border-gray-700 flex-wrap',
        disabled && 'opacity-60',
      )}
    >
      <Button cmd="undo" icon={Undo} title="Undo (Ctrl+Z)" />
      <Button cmd="redo" icon={Redo} title="Redo (Ctrl+Y)" />

      <div className="w-px h-5 bg-gray-300 dark:bg-gray-600 mx-1" />

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

      <div className="w-px h-5 bg-gray-300 dark:bg-gray-600 mx-1" />

      <Button cmd="pageBreak" icon={SeparatorHorizontal} title="Insert Page Break" />
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
  const isEmpty =
    !page.content || page.content.replace(/<[^>]*>/g, '').trim() === '';

  useEffect(() => {
    if (contentRef.current) {
      const sanitized = sanitizeHtml(page.content || '');
      if (contentRef.current.innerHTML !== sanitized) {
        contentRef.current.innerHTML = sanitized;
      }
    }
  }, [page.content]);

  const checkOverflow = useCallback(() => {
    const el = contentRef.current;
    if (
      !el ||
      isPreviewMode ||
      isCheckingOverflow.current ||
      !onOverflow ||
      !el.innerHTML
    ) {
      return;
    }

    const overflowThreshold = maxContentHeight + OVERFLOW_TOLERANCE_PX;

    if (el.scrollHeight <= overflowThreshold) {
      return;
    }

    isCheckingOverflow.current = true;
    const originalHtml = el.innerHTML;

    const split = splitContainerContent(el, maxContentHeight);

    if (!split) {
      isCheckingOverflow.current = false;
      return;
    }

    const sanitizedFit = sanitizeHtml(split.fitHtml);
    const sanitizedOverflow = sanitizeHtml(split.overflowHtml);

    if (!hasRenderableContent(sanitizedOverflow)) {
      if (contentRef.current) {
        contentRef.current.innerHTML = originalHtml;
      }
      isCheckingOverflow.current = false;
      return;
    }

    if (contentRef.current) {
      contentRef.current.innerHTML = sanitizedFit;
    }

    if (sanitizedFit !== page.content) {
      onContentChange(page.id, sanitizedFit);
    }

    onOverflow(page.id, sanitizedOverflow);

    setTimeout(() => {
      isCheckingOverflow.current = false;
      checkOverflow();
    }, 30);
  }, [
    isPreviewMode,
    maxContentHeight,
    onContentChange,
    onOverflow,
    page.content,
    page.id,
  ]);

  useEffect(() => {
    const timer = setTimeout(checkOverflow, 100);
    return () => clearTimeout(timer);
  }, [page.content, checkOverflow]);

  const handleInput = useCallback(() => {
    if (contentRef.current && !isPreviewMode) {
      let html = contentRef.current.innerHTML;

      // Convert typed page break patterns to actual page breaks
      // Supports: [pagebreak], [page-break], [pb], ---pagebreak---, ===pagebreak===
      const originalHtml = html;
      const pageBreakReplacement = '<div class="page-break"></div>';

      html = html
        .replace(/\[pagebreak\]/gi, pageBreakReplacement)
        .replace(/\[page-break\]/gi, pageBreakReplacement)
        .replace(/\[pb\]/gi, pageBreakReplacement)
        .replace(/---\s*pagebreak\s*---/gi, pageBreakReplacement)
        .replace(/===\s*pagebreak\s*===/gi, pageBreakReplacement)
        .replace(/&lt;pagebreak&gt;/gi, pageBreakReplacement);

      if (html !== originalHtml) {
        // Save cursor position info
        const selection = window.getSelection();
        const hadSelection = selection && selection.rangeCount > 0;

        // Update the content
        contentRef.current.innerHTML = html;

        // Move cursor to end if we had a selection
        if (hadSelection && contentRef.current) {
          const range = document.createRange();
          range.selectNodeContents(contentRef.current);
          range.collapse(false);
          selection?.removeAllRanges();
          selection?.addRange(range);
        }
      }

      onContentChange(page.id, contentRef.current.innerHTML);
    }
  }, [page.id, onContentChange, isPreviewMode]);

  const handlePaste = useCallback(
    (e: ReactClipboardEvent<HTMLDivElement>) => {
      if (isPreviewMode) return;
      e.preventDefault();

      const clipboard = e.clipboardData;
      let html = '';

      if (clipboard) {
        const rawHtml = clipboard.getData('text/html');
        if (rawHtml) {
          html = sanitizeHtml(rawHtml);
        }

        if (!html) {
          const text = clipboard.getData('text/plain');
          if (text) {
            const escape = (str: string) =>
              str
                .replace(/&/g, '&amp;')
                .replace(/</g, '&lt;')
                .replace(/>/g, '&gt;')
                .replace(/"/g, '&quot;')
                .replace(/'/g, '&#39;');

            const paragraphHtml = text
              .replace(/\r\n/g, '\n')
              .replace(/\r/g, '\n')
              .split('\n')
              .map((line) =>
                line.length ? `<p>${escape(line)}</p>` : '<p><br /></p>',
              )
              .join('');

            html = sanitizeHtml(paragraphHtml);
          }
        }
      }

      if (!html) return;

      document.execCommand('insertHTML', false, html);

      setTimeout(() => {
        handleInput();
        checkOverflow();
      }, 0);
    },
    [checkOverflow, handleInput, isPreviewMode],
  );

  return (
    <div
      className="relative group"
      style={{
        width: A4.WIDTH_PX,
        height: A4.HEIGHT_PX,
      }}
    >
      <div className="absolute -top-6 left-1/2 -translate-x-1/2 px-3 py-1 bg-gray-700 text-white text-xs rounded-t-md z-10">
        Page {pageNumber} of {totalPages}
      </div>

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

      <div
        className={cn(
          'bg-white shadow-xl transition-all relative',
          isActive && !isPreviewMode && 'ring-2 ring-blue-500',
          isPreviewMode && 'ring-2 ring-green-500',
        )}
        style={{
          width: A4.WIDTH_PX,
          height: A4.HEIGHT_PX,
          boxShadow: '0 4px 20px rgba(0,0,0,0.15)',
        }}
      >
        <div
          ref={(el) => {
            (contentRef as React.MutableRefObject<HTMLDivElement | null>).current =
              el;
            if (isActive && editorRef) {
              (editorRef as React.MutableRefObject<HTMLDivElement | null>).current =
                el;
            }
          }}
          contentEditable={!isPreviewMode}
          suppressContentEditableWarning
          onPaste={handlePaste}
          onInput={handleInput}
          onFocus={() => !isPreviewMode && onFocus(page.id)}
          onBlur={() => !isPreviewMode && onBlur?.()}
          data-placeholder={placeholder}
          className={cn('outline-none', isPreviewMode && 'cursor-default')}
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
            overflow: 'hidden',
            overflowWrap: 'break-word',
            wordBreak: 'break-word',
            whiteSpace: 'pre-wrap',
          }}
        />

        {isEmpty && placeholder && !isPreviewMode && (
          <div
            className="pointer-events-none select-none text-gray-400"
            style={{
              position: 'absolute',
              top: A4.MARGIN_PX,
              left: A4.MARGIN_PX,
              fontFamily: FONT_FAMILY,
              fontSize: FONT_SIZE,
              lineHeight: LINE_HEIGHT,
            }}
          >
            {placeholder}
          </div>
        )}

        <div
          className="absolute left-1/2 -translate-x-1/2 text-gray-400"
          style={{
            fontFamily: FONT_FAMILY,
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

export const A4PageEditor = forwardRef<A4PageEditorRef, A4PageEditorProps>(
  function A4PageEditor(
    {
      value,
      onChange,
      placeholder,
      className,
      tenantId: _tenantId,
      previewContent,
      showPreviewToggle = true,
      onPreview,
      isPreviewLoading = false,
    },
    ref,
  ) {
    const PAGE_SEPARATOR = '<!-- PAGE_BREAK -->';
    const activeEditorRef = useRef<HTMLDivElement | null>(null);
    const lastValueRef = useRef<string>(value);
    const isInternalUpdate = useRef(false);

    const savedSelectionRef = useRef<{
      startNode: Node;
      startOffset: number;
      endNode: Node;
      endOffset: number;
      collapsed: boolean;
    } | null>(null);

    const saveCursorPosition = useCallback(() => {
      const selection = window.getSelection();
      if (selection && selection.rangeCount > 0) {
        const range = selection.getRangeAt(0);
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

    const restoreSelection = useCallback(() => {
      const editor = activeEditorRef.current;
      const saved = savedSelectionRef.current;
      if (!editor || !saved) return false;

      if (
        !editor.contains(saved.startNode) ||
        !editor.contains(saved.endNode)
      ) {
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

    const insertAtCursor = useCallback(
      (text: string) => {
        const editor = activeEditorRef.current;
        if (!editor) return;

        editor.focus();

        const selection = window.getSelection();
        if (!selection) return;

        if (
          selection.rangeCount === 0 ||
          !editor.contains(selection.anchorNode)
        ) {
          if (!restoreSelection()) {
            const range = document.createRange();
            range.selectNodeContents(editor);
            range.collapse(false);
            selection.removeAllRanges();
            selection.addRange(range);
          }
        }

        document.execCommand('insertText', false, text);
      },
      [restoreSelection],
    );

    const insertHtmlAtCursor = useCallback(
      (html: string) => {
        const editor = activeEditorRef.current;
        if (!editor) return;

        editor.focus();

        const selection = window.getSelection();
        if (!selection) return;

        if (
          selection.rangeCount === 0 ||
          !editor.contains(selection.anchorNode)
        ) {
          if (!restoreSelection()) {
            const range = document.createRange();
            range.selectNodeContents(editor);
            range.collapse(false);
            selection.removeAllRanges();
            selection.addRange(range);
          }
        }

        document.execCommand('insertHTML', false, html);
      },
      [restoreSelection],
    );

    useImperativeHandle(
      ref,
      () => ({
        insertAtCursor,
        insertHtmlAtCursor,
        focus: () => activeEditorRef.current?.focus(),
      }),
      [insertAtCursor, insertHtmlAtCursor],
    );

    const normalizePageSeparators = useCallback(
      (input: string) => {
        if (!input || input.indexOf('page-break') === -1) return input;
        return input.replace(HTML_PAGE_BREAK_REGEX, PAGE_SEPARATOR);
      },
      [PAGE_SEPARATOR],
    );

    const parsePages = useCallback(
      (content: string, existingPages?: PageData[]): PageData[] => {
        if (!content) return [{ id: crypto.randomUUID(), content: '' }];
        const normalizedContent = normalizePageSeparators(content);
        const parts = normalizedContent.split(PAGE_SEPARATOR);
        console.log('[parsePages] Input length:', content.length, 'Has page-break:', content.includes('page-break'), 'Normalized has PAGE_BREAK:', normalizedContent.includes('PAGE_BREAK'), 'Parts count:', parts.length);
        return parts.map((c, i) => ({
          id: existingPages?.[i]?.id || crypto.randomUUID(),
          content: c,
        }));
      },
      [normalizePageSeparators],
    );

    const [pages, setPages] = useState<PageData[]>(() => parsePages(value));
    const [activePageId, setActivePageId] = useState<string>(
      pages[0]?.id || '',
    );
    const [isPreviewMode, setIsPreviewMode] = useState(false);

    const previewPages = useMemo(() => {
      if (!previewContent) return null;
      return parsePages(previewContent);
    }, [previewContent, parsePages]);

    const displayPages = isPreviewMode && previewPages ? previewPages : pages;

    useEffect(() => {
      if (displayPages.length === 0) return;
      const currentIdx = displayPages.findIndex((p) => p.id === activePageId);
      if (currentIdx === -1) {
        setActivePageId(displayPages[0].id);
      }
    }, [displayPages, activePageId]);

    useEffect(() => {
      if (isInternalUpdate.current || value === lastValueRef.current) {
        isInternalUpdate.current = false;
        return;
      }

      lastValueRef.current = value;

      if (!isPreviewMode) {
        setPages((prev) => {
          const newPages = parsePages(value, prev);
          if (
            !newPages.find((p) => p.id === activePageId) &&
            newPages.length > 0
          ) {
            setActivePageId(newPages[0].id);
          }
          return newPages;
        });
      }
    }, [value, parsePages, isPreviewMode, activePageId]);

    const pendingUpdateRef = useRef(false);

    useEffect(() => {
      if (pendingUpdateRef.current) {
        pendingUpdateRef.current = false;
        const html = pages.map((p) => p.content).join(PAGE_SEPARATOR);
        isInternalUpdate.current = true;
        lastValueRef.current = html;
        onChange(html);
      }
    }, [pages, onChange]);

    const handleContentChange = useCallback(
      (id: string, content: string) => {
        if (isPreviewMode) return;
        pendingUpdateRef.current = true;
        setPages((prev) =>
          prev.map((p) => (p.id === id ? { ...p, content } : p)),
        );
      },
      [isPreviewMode],
    );

    const handleAddPage = useCallback(() => {
      if (isPreviewMode) return;
      const newPage: PageData = { id: crypto.randomUUID(), content: '' };
      pendingUpdateRef.current = true;
      setPages((prev) => [...prev, newPage]);
      setActivePageId(newPage.id);
    }, [isPreviewMode]);

    const handleDeletePage = useCallback(
      (id: string) => {
        if (isPreviewMode) return;
        pendingUpdateRef.current = true;
        setPages((prev) => {
          if (prev.length <= 1) return prev;
          const newPages = prev.filter((p) => p.id !== id);
          const deletedIndex = prev.findIndex((p) => p.id === id);
          const newActiveIndex = Math.min(deletedIndex, newPages.length - 1);
          setTimeout(
            () => setActivePageId(newPages[newActiveIndex]?.id || ''),
            0,
          );
          return newPages;
        });
      },
      [isPreviewMode],
    );

    const isHandlingOverflow = useRef(false);
    const pendingFocusPageId = useRef<string | null>(null);

    const focusPageAtEnd = useCallback((pageId: string) => {
      const pageEl = document.querySelector(
        `[data-page-id="${pageId}"] [contenteditable]`,
      ) as HTMLDivElement | null;

      if (pageEl) {
        pageEl.focus();
        const selection = window.getSelection();
        if (selection) {
          const range = document.createRange();
          range.selectNodeContents(pageEl);
          range.collapse(false);
          selection.removeAllRanges();
          selection.addRange(range);
        }
      }
    }, []);

    const handleOverflow = useCallback(
      (pageId: string, overflowContent: string) => {
        if (isPreviewMode || !overflowContent.trim() || isHandlingOverflow.current) {
          return;
        }

        isHandlingOverflow.current = true;
        pendingUpdateRef.current = true;

        setPages((prev) => {
          const pageIndex = prev.findIndex((p) => p.id === pageId);
          if (pageIndex === -1) return prev;

          const nextPageIndex = pageIndex + 1;

          if (nextPageIndex < prev.length) {
            const nextPage = prev[nextPageIndex];
            const updatedPages = [...prev];
            updatedPages[nextPageIndex] = {
              ...nextPage,
              content: overflowContent + nextPage.content,
            };
            pendingFocusPageId.current = nextPage.id;
            return updatedPages;
          }

          const newPage: PageData = {
            id: crypto.randomUUID(),
            content: overflowContent,
          };
          pendingFocusPageId.current = newPage.id;
          return [...prev, newPage];
        });
      },
      [isPreviewMode],
    );

    useEffect(() => {
      if (pendingFocusPageId.current && isHandlingOverflow.current) {
        const targetId = pendingFocusPageId.current;
        const timer = setTimeout(() => {
          setActivePageId(targetId);
          setTimeout(() => {
            focusPageAtEnd(targetId);
            pendingFocusPageId.current = null;
            isHandlingOverflow.current = false;
          }, 100);
        }, 50);

        return () => clearTimeout(timer);
      }
    }, [pages, focusPageAtEnd]);

    const handleCommand = useCallback(
      (cmd: string, val?: string) => {
        if (isPreviewMode) return;

        const editor = activeEditorRef.current;
        if (!editor) return;

        editor.focus();
        restoreSelection();

        if (cmd === 'customFontSize' && val) {
          const selection = window.getSelection();
          if (selection && selection.rangeCount > 0) {
            const range = selection.getRangeAt(0);
            if (!range.collapsed) {
              document.execCommand('fontSize', false, '7');
              const fonts = editor.querySelectorAll('font[size="7"]');
              fonts.forEach((font) => {
                const span = document.createElement('span');
                span.style.fontSize = val;
                span.innerHTML = font.innerHTML;
                font.parentNode?.replaceChild(span, font);
              });
              const event = new Event('input', { bubbles: true });
              editor.dispatchEvent(event);
            }
          }
          return;
        }

        if (cmd === 'fontName' && val) {
          const selection = window.getSelection();
          if (selection && selection.rangeCount > 0) {
            const range = selection.getRangeAt(0);
            if (!range.collapsed) {
              document.execCommand('fontName', false, '__temp_font__');
              const fonts = editor.querySelectorAll('font[face="__temp_font__"]');
              fonts.forEach((font) => {
                const span = document.createElement('span');
                span.style.fontFamily = val;
                span.innerHTML = font.innerHTML;
                font.parentNode?.replaceChild(span, font);
              });
              const event = new Event('input', { bubbles: true });
              editor.dispatchEvent(event);
            }
          }
          return;
        }

        if (cmd === 'lineSpacing' && val) {
          const selection = window.getSelection();
          if (selection && selection.rangeCount > 0) {
            const range = selection.getRangeAt(0);
            let blockElement: HTMLElement | null = null;
            let node: Node | null = range.startContainer;

            while (node && node !== editor) {
              if (node.nodeType === Node.ELEMENT_NODE) {
                const element = node as HTMLElement;
                const display = window.getComputedStyle(element).display;
                if (
                  display === 'block' ||
                  display === 'list-item' ||
                  element.tagName === 'P' ||
                  element.tagName === 'DIV'
                ) {
                  blockElement = element;
                  break;
                }
              }
              node = node.parentNode;
            }

            if (blockElement && blockElement !== editor) {
              blockElement.style.lineHeight = val;
            } else {
              if (!range.collapsed) {
                const div = document.createElement('div');
                div.style.lineHeight = val;
                try {
                  range.surroundContents(div);
                } catch {
                  const firstChild = editor.firstElementChild as HTMLElement;
                  if (firstChild) {
                    firstChild.style.lineHeight = val;
                  }
                }
              } else {
                const firstChild = editor.firstElementChild as HTMLElement;
                if (firstChild) {
                  firstChild.style.lineHeight = val;
                }
              }
            }

            const event = new Event('input', { bubbles: true });
            editor.dispatchEvent(event);
          }
          return;
        }

        if (cmd === 'pageBreak') {
          document.execCommand(
            'insertHTML',
            false,
            '<div class="page-break"></div><p></p>',
          );
          const event = new Event('input', { bubbles: true });
          editor.dispatchEvent(event);
          return;
        }

        document.execCommand(cmd, false, val);
      },
      [isPreviewMode, restoreSelection],
    );

    const handlePrint = useCallback(() => {
      const printPages = isPreviewMode && previewPages ? previewPages : pages;
      const printWindow = window.open('', '_blank');
      if (!printWindow) return;

      // Filter out pages that only contain [Remove Page]
      const filteredPages = printPages.filter((page) => {
        const textContent = (page.content || '')
          .replace(/<[^>]*>/g, '')
          .replace(/&nbsp;/g, ' ')
          .trim();
        return !/^\[Remove\s*Page\]$/i.test(textContent);
      });

      // Join pages with page-break divs to trigger CSS page breaks on print
      const allContent = filteredPages
        .map((page) => sanitizeHtml(page.content) || '')
        .join('<div class="page-break"></div>')
        .trim();

      const pagesHtml = `<div class="content">${allContent || '&nbsp;'}</div>`;

      printWindow.document.write(`<!DOCTYPE html>
<html>
<head>
  <title>Print</title>
  <style>
    @page {
      size: 210mm 297mm;
      margin: ${A4.MARGIN_MM}mm;
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
    .content {
      width: 100%;
      white-space: pre-wrap;
      overflow-wrap: break-word;
      word-break: break-word;
    }
    p:empty, div:empty { min-height: 1em; }
    p { margin: 0 0 0.5em 0; }
    br { display: block; content: ""; margin-top: 0.5em; }
    ul, ol { margin: 0 0 0.5em 0; padding-left: 1.5em; }
    .page-break {
      display: block;
      page-break-before: always !important;
      break-before: page !important;
      page-break-after: auto;
      break-after: auto;
      page-break-inside: avoid;
      break-inside: avoid;
      height: 0;
      margin: 0;
      padding: 0;
      border: none;
      clear: both;
    }
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

    const scrollToPage = useCallback(
      (dir: 'up' | 'down') => {
        const idx = displayPages.findIndex((p) => p.id === activePageId);
        const newIdx =
          dir === 'up'
            ? Math.max(0, idx - 1)
            : Math.min(displayPages.length - 1, idx + 1);
        setActivePageId(displayPages[newIdx].id);
        document
          .querySelectorAll('[data-page-id]')
          [newIdx]?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      },
      [displayPages, activePageId],
    );

    const currentPageIdx = displayPages.findIndex((p) => p.id === activePageId);

    return (
      <div className={cn('flex flex-col h-full bg-gray-200 dark:bg-gray-800', className)}>
        <div className="flex-shrink-0 flex items-center justify-between px-4 py-2 bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-700">
          <div className="flex items-center gap-3">
            <FileText className="w-4 h-4 text-gray-500" />
            <span className="text-sm font-medium">Document Editor</span>
            <span className="text-xs text-gray-500">
              {displayPages.length} page{displayPages.length !== 1 ? 's' : ''}
            </span>

            {isPreviewMode && (
              <span className="px-2 py-0.5 text-xs font-medium bg-green-100 text-green-700 rounded">
                Preview Mode
              </span>
            )}
          </div>

          <div className="flex items-center gap-2">
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

            {(onPreview || (showPreviewToggle && previewContent)) && (
              <button
                type="button"
                onClick={() => {
                  if (isPreviewMode) {
                    setIsPreviewMode(false);
                  } else {
                    onPreview?.();
                    setIsPreviewMode(true);
                  }
                }}
                disabled={isPreviewLoading}
                className={cn(
                  'flex items-center gap-1 px-2 py-1.5 rounded text-xs font-medium transition-colors',
                  isPreviewMode
                    ? 'bg-blue-100 text-blue-700 hover:bg-blue-200'
                    : 'bg-amber-100 text-amber-700 hover:bg-amber-200',
                  isPreviewLoading && 'opacity-60 cursor-not-allowed',
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

        <Toolbar
          onCommand={handleCommand}
          onSaveSelection={saveCursorPosition}
          disabled={isPreviewMode}
        />

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

        <div className="flex-shrink-0 px-4 py-1.5 bg-white dark:bg-gray-900 border-t text-xs text-gray-500 flex justify-between">
          <span>
            A4: {A4.WIDTH_PX}×{A4.HEIGHT_PX}px ({A4.MARGIN_MM}mm margins)
          </span>
          <span>
            {isPreviewMode ? 'Viewing preview' : 'Editing'} • What you see = What prints
          </span>
        </div>
      </div>
    );
  },
);

export default A4PageEditor;
