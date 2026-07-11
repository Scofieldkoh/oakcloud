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
  type CompositionEvent as ReactCompositionEvent,
  type FormEvent as ReactFormEvent,
  type KeyboardEvent as ReactKeyboardEvent,
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
  Table2,
  Trash2,
  Type,
  Underline,
  Undo,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  deleteCharacterBeforeTextOffset,
  deleteFlowSelection,
  replaceFlowSelection,
  hydrateFlowHtml,
  reassemblePageFragments,
  splitHardSections,
  stripFlowMetadata,
  type PageFragment,
} from './a4-pagination/model';
import {
  paginateFlowHtml,
  type HtmlMeasurer,
} from './a4-pagination/engine';
import {
  captureFlowSelection,
  restoreFlowSelection,
  type FlowSelectionBookmark,
} from './a4-pagination/selection';
import {
  appendHardPage,
  applyLogicalDelete,
  deleteHardPageSection,
  type DocumentTransactionResult,
} from './a4-pagination/document-actions';
import {
  DEFAULT_A4_DOCUMENT_LAYOUT,
  normalizeA4DocumentLayout,
  type A4DocumentLayout,
  type A4MarginsMm,
} from './a4-pagination/layout';

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
      'blockquote',
      'h1',
      'h2',
      'h3',
      'h4',
      'h5',
      'h6',
      'a',
      'hr',
      'table',
      'thead',
      'tbody',
      'tfoot',
      'tr',
      'th',
      'td',
      'caption',
    ],
    ALLOWED_ATTR: [
      'href',
      'target',
      'rel',
      'style',
      'class',
      'colspan',
      'rowspan',
      'scope',
      'align',
      'valign',
      'width',
      'height',
      'data-break-type',
      'data-flow-id',
      'data-flow-continuation',
      'data-flow-oversized',
    ],
    ALLOWED_URI_REGEXP:
      /^(?:(?:https?|mailto):|[^a-z]|[a-z+.\-]+(?:[^a-z+.\-:]|$))/i,
  });
}

// ============================================================================
// Overflow helpers
// ============================================================================

function fragmentToHtml(fragment: DocumentFragment): string {
  const wrapper = document.createElement('div');
  wrapper.appendChild(fragment);
  return wrapper.innerHTML;
}

function hasMeaningfulContentBeforeCaret(html: string): boolean {
  if (!html) return false;

  const textContent = html
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/&nbsp;/gi, ' ')
    .replace(/<br\s*\/?>/gi, '')
    .replace(/<[^>]+>/g, '')
    .trim();

  if (textContent.length > 0) {
    return true;
  }

  return /<(img|svg|object|embed|video|audio|canvas|table|tr|td|th|li|ul|ol|hr)\b/i.test(
    html,
  );
}

function isCaretAtEditorStart(editor: HTMLElement): boolean {
  const selection = window.getSelection();
  if (!selection || selection.rangeCount === 0) return false;
  if (!selection.isCollapsed || !editor.contains(selection.anchorNode)) {
    return false;
  }

  const range = selection.getRangeAt(0);
  const before = document.createRange();
  before.setStart(editor, 0);

  try {
    before.setEnd(range.startContainer, range.startOffset);
  } catch {
    return false;
  }

  const beforeHtml = fragmentToHtml(before.cloneContents());
  return !hasMeaningfulContentBeforeCaret(beforeHtml);
}

function isCaretAtEditorEnd(editor: HTMLElement): boolean {
  const selection = window.getSelection();
  if (!selection || !selection.isCollapsed || selection.rangeCount === 0) {
    return false;
  }

  const range = selection.getRangeAt(0);
  if (!editor.contains(range.startContainer)) return false;
  const afterCaret = range.cloneRange();
  afterCaret.selectNodeContents(editor);
  afterCaret.setStart(range.startContainer, range.startOffset);
  return afterCaret.toString().length === 0;
}

function getEditorSelectionRange(editor: HTMLElement): Range | null {
  const selection = window.getSelection();
  if (!selection || selection.rangeCount === 0) return null;

  const range = selection.getRangeAt(0);
  if (!editor.contains(range.commonAncestorContainer)) return null;

  return range;
}

function pageContentFromTarget(
  root: HTMLElement,
  target: EventTarget | Node | null,
): HTMLElement | null {
  const node = target instanceof Node ? target : null;
  if (!node || !root.contains(node)) return null;

  const element =
    node.nodeType === Node.ELEMENT_NODE
      ? (node as HTMLElement)
      : node.parentElement;
  const pageElement = element?.closest<HTMLElement>('[data-page-id]');
  if (!pageElement) return null;
  if (pageElement.matches('[data-testid^="a4-page-content-"]')) {
    return pageElement;
  }

  return Array.from(
    pageElement.querySelectorAll<HTMLElement>(
      '[data-testid^="a4-page-content-"][data-page-id]',
    ),
  ).find((candidate) => candidate.dataset.pageId === pageElement.dataset.pageId) ?? null;
}

function pageContentContainingNode(
  root: HTMLElement,
  target: Node | null,
): HTMLElement | null {
  if (!target || !root.contains(target)) return null;

  const element =
    target.nodeType === Node.ELEMENT_NODE
      ? (target as HTMLElement)
      : target.parentElement;
  return element?.closest<HTMLElement>(
    '[data-testid^="a4-page-content-"][data-page-id]',
  ) ?? null;
}

function selectionIsWithinPageContents(root: HTMLElement): boolean {
  const selection = window.getSelection();
  if (!selection || selection.rangeCount === 0) return false;

  return Boolean(
    pageContentContainingNode(root, selection.anchorNode) &&
      pageContentContainingNode(root, selection.focusNode),
  );
}

function selectionPageContents(root: HTMLElement): {
  anchor: HTMLElement | null;
  focus: HTMLElement | null;
} {
  const selection = window.getSelection();
  return {
    anchor: pageContentFromTarget(root, selection?.anchorNode ?? null),
    focus: pageContentFromTarget(root, selection?.focusNode ?? null),
  };
}

function selectionSpansPages(root: HTMLElement): boolean {
  const selection = window.getSelection();
  if (!selection || selection.isCollapsed) return false;
  const { anchor, focus } = selectionPageContents(root);
  return Boolean(
    anchor?.dataset.pageId &&
      focus?.dataset.pageId &&
      anchor.dataset.pageId !== focus.dataset.pageId,
  );
}

function selectionStartPoint(
  bookmark: FlowSelectionBookmark,
): FlowSelectionBookmark['anchor'] {
  const selection = window.getSelection();
  if (!selection || selection.rangeCount === 0) return bookmark.anchor;
  const range = selection.getRangeAt(0);
  const anchorIsStart =
    selection.anchorNode === range.startContainer &&
    selection.anchorOffset === range.startOffset;
  return anchorIsStart ? bookmark.anchor : bookmark.focus;
}

function documentTextOffsetForFlowPoint(
  html: string,
  point: FlowSelectionBookmark['anchor'],
): number | null {
  const container = document.createElement('div');
  container.innerHTML = html;
  const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT);
  let documentOffset = 0;
  let flowOffset = 0;
  let node: Node | null;

  while ((node = walker.nextNode())) {
    const length = node.textContent?.length ?? 0;
    const flowElement = node.parentElement?.closest<HTMLElement>('[data-flow-id]');
    if (flowElement?.dataset.flowId === point.flowId) {
      if (point.offset <= flowOffset + length) {
        return documentOffset + Math.max(0, point.offset - flowOffset);
      }
      flowOffset += length;
    }
    documentOffset += length;
  }

  return null;
}

function flowPointAtDocumentTextOffset(
  html: string,
  requestedOffset: number,
): FlowSelectionBookmark['anchor'] | null {
  const container = document.createElement('div');
  container.innerHTML = html;
  const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT);
  const offsetsByFlowId = new Map<string, number>();
  let remaining = Math.max(0, requestedOffset);
  let fallback: FlowSelectionBookmark['anchor'] | null = null;
  let node: Node | null;

  while ((node = walker.nextNode())) {
    const length = node.textContent?.length ?? 0;
    const flowElement = node.parentElement?.closest<HTMLElement>('[data-flow-id]');
    const flowId = flowElement?.dataset.flowId;
    if (!flowId) {
      remaining = Math.max(0, remaining - length);
      continue;
    }

    const flowOffset = offsetsByFlowId.get(flowId) ?? 0;
    fallback = { flowId, offset: flowOffset + length };
    if (remaining <= length) {
      return { flowId, offset: flowOffset + remaining };
    }

    offsetsByFlowId.set(flowId, flowOffset + length);
    remaining -= length;
  }

  return fallback;
}

function replaceTypedPageBreaks(html: string): string {
  const pageBreakReplacement = '<div class="page-break"></div>';
  return html
    .replace(/\[pagebreak\]/gi, pageBreakReplacement)
    .replace(/\[page-break\]/gi, pageBreakReplacement)
    .replace(/\[pb\]/gi, pageBreakReplacement)
    .replace(/---\s*pagebreak\s*---/gi, pageBreakReplacement)
    .replace(/===\s*pagebreak\s*===/gi, pageBreakReplacement)
    .replace(/&lt;pagebreak&gt;/gi, pageBreakReplacement);
}

function clipboardHtml(clipboard: DataTransfer | null): string {
  if (!clipboard) return '';

  const rawHtml = clipboard.getData('text/html');
  if (rawHtml) return sanitizeHtml(rawHtml);

  const text = clipboard.getData('text/plain');
  if (!text) return '';
  const escape = (value: string) =>
    value
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');

  return sanitizeHtml(
    text
      .replace(/\r\n/g, '\n')
      .replace(/\r/g, '\n')
      .split('\n')
      .map((line) =>
        line.length ? `<p>${escape(line)}</p>` : '<p><br /></p>',
      )
      .join(''),
  );
}

function selectNodeContents(node: Node): void {
  const selection = window.getSelection();
  if (!selection) return;

  const range = document.createRange();
  range.selectNodeContents(node);
  selection.removeAllRanges();
  selection.addRange(range);
}

function dispatchEditorInput(editor: HTMLElement): void {
  editor.dispatchEvent(new Event('input', { bubbles: true }));
}

function applyInlineStyleToSelection(
  editor: HTMLElement,
  styles: Record<string, string>,
): boolean {
  const range = getEditorSelectionRange(editor);
  if (!range || range.collapsed) return false;

  const span = document.createElement('span');
  Object.entries(styles).forEach(([key, value]) => {
    if (value) {
      const cssProperty = key.replace(/[A-Z]/g, (match) => `-${match.toLowerCase()}`);
      span.style.setProperty(cssProperty, value);
    }
  });

  span.appendChild(range.extractContents());
  range.insertNode(span);
  selectNodeContents(span);
  dispatchEditorInput(editor);
  return true;
}

function findEditableBlock(start: Node, editor: HTMLElement): HTMLElement | null {
  let node: Node | null = start.nodeType === Node.TEXT_NODE ? start.parentNode : start;
  const blockTags = new Set([
    'P',
    'DIV',
    'H1',
    'H2',
    'H3',
    'H4',
    'H5',
    'H6',
    'BLOCKQUOTE',
    'LI',
    'TD',
    'TH',
  ]);

  while (node && node !== editor) {
    if (node.nodeType === Node.ELEMENT_NODE) {
      const element = node as HTMLElement;
      if (blockTags.has(element.tagName)) {
        return element;
      }
    }
    node = node.parentNode;
  }

  return null;
}

function applyBlockTagToSelection(editor: HTMLElement, tagName: string): boolean {
  const range = getEditorSelectionRange(editor);
  if (!range) return false;

  const block = findEditableBlock(range.startContainer, editor);
  const replacement = document.createElement(tagName);

  if (block) {
    replacement.innerHTML = block.innerHTML;
    block.parentNode?.replaceChild(replacement, block);
  } else {
    replacement.appendChild(range.extractContents());
    range.insertNode(replacement);
  }

  selectNodeContents(replacement);
  dispatchEditorInput(editor);
  return true;
}

function insertHtmlIntoEditor(editor: HTMLElement, html: string): boolean {
  const selection = window.getSelection();
  let range = getEditorSelectionRange(editor);

  if (!range) {
    range = document.createRange();
    range.selectNodeContents(editor);
    range.collapse(false);
    selection?.removeAllRanges();
    selection?.addRange(range);
  }

  const template = document.createElement('template');
  template.innerHTML = sanitizeHtml(html);
  const fragment = template.content;
  const insertedNodes = Array.from(fragment.childNodes);

  range.deleteContents();
  range.insertNode(fragment);

  const lastNode = insertedNodes[insertedNodes.length - 1];
  if (lastNode && selection) {
    const afterRange = document.createRange();
    afterRange.setStartAfter(lastNode);
    afterRange.collapse(true);
    selection.removeAllRanges();
    selection.addRange(afterRange);
  }

  dispatchEditorInput(editor);
  return insertedNodes.length > 0;
}

function findSelectedTableCell(editor: HTMLElement): HTMLTableCellElement | null {
  const selection = window.getSelection();
  if (!selection || selection.rangeCount === 0) return null;

  let node: Node | null = selection.anchorNode;
  while (node && node !== editor) {
    if (
      node.nodeType === Node.ELEMENT_NODE &&
      ['TD', 'TH'].includes((node as HTMLElement).tagName)
    ) {
      return node as HTMLTableCellElement;
    }
    node = node.parentNode;
  }

  return null;
}

function addTableRowAtSelection(editor: HTMLElement): boolean {
  const cell = findSelectedTableCell(editor);
  const row = cell?.closest('tr');
  if (!cell || !row) return false;

  const newRow = document.createElement('tr');
  Array.from(row.children).forEach((sourceCell) => {
    const tagName = sourceCell.tagName.toLowerCase() === 'th' ? 'th' : 'td';
    const newCell = document.createElement(tagName);
    newCell.innerHTML = '<br>';
    newRow.appendChild(newCell);
  });

  row.insertAdjacentElement('afterend', newRow);
  dispatchEditorInput(editor);
  return true;
}

function addTableColumnAtSelection(editor: HTMLElement): boolean {
  const cell = findSelectedTableCell(editor);
  const table = cell?.closest('table');
  const row = cell?.closest('tr');
  if (!cell || !table || !row) return false;

  const columnIndex = Array.from(row.children).indexOf(cell);
  if (columnIndex === -1) return false;

  Array.from(table.querySelectorAll('tr')).forEach((tableRow) => {
    const cells = Array.from(tableRow.children);
    const referenceCell = cells[Math.min(columnIndex, cells.length - 1)] as
      | HTMLTableCellElement
      | undefined;
    const tagName = referenceCell?.tagName.toLowerCase() === 'th' ? 'th' : 'td';
    const newCell = document.createElement(tagName);
    newCell.innerHTML = '<br>';

    if (referenceCell) {
      referenceCell.insertAdjacentElement('afterend', newCell);
    } else {
      tableRow.appendChild(newCell);
    }
  });

  dispatchEditorInput(editor);
  return true;
}

function stripInlineLineHeight(html: string): string {
  if (!html) return html;

  const wrapper = document.createElement('div');
  wrapper.innerHTML = sanitizeHtml(html);
  wrapper.querySelectorAll<HTMLElement>('[style]').forEach((element) => {
    element.style.lineHeight = '';
    if (!element.getAttribute('style')?.trim()) {
      element.removeAttribute('style');
    }
  });

  return wrapper.innerHTML;
}

// ============================================================================
// Types
// ============================================================================

export interface A4PageEditorProps {
  value: string;
  onChange?: (html: string) => void;
  placeholder?: string;
  className?: string;
  tenantId?: string;
  previewContent?: string;
  showPreviewToggle?: boolean;
  onPreview?: () => void;
  isPreviewLoading?: boolean;
  readOnly?: boolean;
  layout?: A4DocumentLayout;
  onLayoutChange?: (layout: A4DocumentLayout) => void;
}

export interface A4PageEditorRef {
  insertAtCursor: (text: string) => void;
  insertHtmlAtCursor: (html: string) => void;
  focus: () => void;
  getContent: () => string;
  setContent: (html: string) => void;
}

interface PageData {
  id: string;
  content: string;
  hardBreakBefore: boolean;
  oversized?: boolean;
}

// ============================================================================
// A4 Constants - 96 DPI (standard screen) for true WYSIWYG
// ============================================================================

const DEFAULT_PAGE_MARGIN_MM = 20;

const A4 = {
  WIDTH_PX: 794,
  HEIGHT_PX: 1123,
  MARGIN_MM: DEFAULT_PAGE_MARGIN_MM,
};

// Shared font styles
const FONT_FAMILY = "'Times New Roman', Times, serif";
const FONT_SIZE = '12pt';
const MM_TO_PX = 96 / 25.4;

interface PageLayout {
  marginsMm: A4MarginsMm;
  topPx: number;
  rightPx: number;
  bottomPx: number;
  leftPx: number;
  contentWidthPx: number;
  contentHeightPx: number;
}

function createPageLayout(marginsMm: A4MarginsMm): PageLayout {
  const topPx = Math.round(marginsMm.top * MM_TO_PX);
  const rightPx = Math.round(marginsMm.right * MM_TO_PX);
  const bottomPx = Math.round(marginsMm.bottom * MM_TO_PX);
  const leftPx = Math.round(marginsMm.left * MM_TO_PX);

  return {
    marginsMm,
    topPx,
    rightPx,
    bottomPx,
    leftPx,
    contentWidthPx: A4.WIDTH_PX - leftPx - rightPx,
    contentHeightPx: A4.HEIGHT_PX - topPx - bottomPx,
  };
}

function createPageMeasurer(
  pageLayout: PageLayout,
  lineHeight: string,
  paragraphSpacing: string,
): HtmlMeasurer & { dispose: () => void } {
  const element = document.createElement('div');
  element.className = 'a4-page-content';
  Object.assign(element.style, {
    position: 'fixed',
    visibility: 'hidden',
    pointerEvents: 'none',
    contain: 'layout style',
    top: '-100000px',
    left: '0',
    width: `${pageLayout.contentWidthPx}px`,
    height: 'auto',
    minHeight: '0',
    overflow: 'visible',
    fontFamily: 'Arial, Helvetica, sans-serif',
    fontSize: '11pt',
    lineHeight,
    overflowWrap: 'break-word',
    wordBreak: 'break-word',
    whiteSpace: 'pre-wrap',
  });
  element.style.setProperty('--a4-paragraph-spacing', paragraphSpacing);
  document.body.appendChild(element);

  return {
    measure(html: string) {
      element.innerHTML = sanitizeHtml(html);
      return element.scrollHeight;
    },
    dispose() {
      element.remove();
    },
  };
}

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

const PAGE_MARGIN_OPTIONS = [
  { value: 10, label: '10mm' },
  { value: 15, label: '15mm' },
  { value: 20, label: '20mm' },
  { value: 25, label: '25mm' },
  { value: 30, label: '30mm' },
];

const PARAGRAPH_STYLE_OPTIONS = [
  { value: 'p', label: 'Normal' },
  { value: 'h1', label: 'Heading 1' },
  { value: 'h2', label: 'Heading 2' },
  { value: 'h3', label: 'Heading 3' },
  { value: 'blockquote', label: 'Quote' },
];

const PARAGRAPH_SPACING_OPTIONS = [
  { value: '0', label: 'No spacing' },
  { value: '0.25em', label: 'Compact' },
  { value: '0.5em', label: 'Normal' },
  { value: '1em', label: 'Loose' },
  { value: '1.5em', label: 'Wide' },
];

function Toolbar({
  onCommand,
  onSaveSelection,
  lineHeight,
  onLineHeightChange,
  paragraphSpacing,
  onParagraphSpacingChange,
  pageMarginMm,
  onPageMarginChange,
  showPageNumbers,
  onShowPageNumbersChange,
  disabled,
}: {
  onCommand: (cmd: string, value?: string) => void;
  onSaveSelection: () => void;
  lineHeight: string;
  onLineHeightChange: (value: string) => void;
  paragraphSpacing: string;
  onParagraphSpacingChange: (value: string) => void;
  pageMarginMm: number;
  onPageMarginChange: (value: number) => void;
  showPageNumbers: boolean;
  onShowPageNumbersChange: (value: boolean) => void;
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
        'p-1.5 rounded text-text-secondary transition-colors',
        disabled
          ? 'opacity-50 cursor-not-allowed'
          : 'hover:bg-background-tertiary',
      )}
      title={title}
    >
      <Icon className="w-4 h-4" />
    </button>
  );

  const selectClass = cn(
    'px-2 py-1 text-xs border rounded bg-background-elevated border-border-primary text-text-secondary',
    disabled && 'opacity-50 cursor-not-allowed',
  );

  const handleSelectMouseDown = () => {
    onSaveSelection();
  };

  return (
    <div
      className={cn(
        'flex items-center gap-1 p-2 bg-background-secondary border-b border-border-primary flex-wrap',
        disabled && 'opacity-60',
      )}
    >
      <Button cmd="undo" icon={Undo} title="Undo (Ctrl+Z)" />
      <Button cmd="redo" icon={Redo} title="Redo (Ctrl+Y)" />

      <div className="w-px h-5 bg-border-primary mx-1" />

      <div className="flex items-center gap-1">
        <Type className="w-4 h-4 text-text-muted" />
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

      <div className="w-px h-5 bg-border-primary mx-1" />

      <select
        onMouseDown={handleSelectMouseDown}
        onChange={(e) => onCommand('paragraphStyle', e.target.value)}
        disabled={disabled}
        className={selectClass}
        defaultValue="p"
        title="Paragraph Style"
      >
        {PARAGRAPH_STYLE_OPTIONS.map((style) => (
          <option key={style.value} value={style.value}>
            {style.label}
          </option>
        ))}
      </select>

      <div className="w-px h-5 bg-border-primary mx-1" />

      <Button cmd="bold" icon={Bold} title="Bold (Ctrl+B)" />
      <Button cmd="italic" icon={Italic} title="Italic (Ctrl+I)" />
      <Button cmd="underline" icon={Underline} title="Underline (Ctrl+U)" />

      <label className="flex items-center gap-1 px-1 text-xs text-text-secondary">
        A
        <input
          type="color"
          title="Text Color"
          defaultValue="#000000"
          onMouseDown={handleSelectMouseDown}
          onChange={(e) => onCommand('textColor', e.target.value)}
          disabled={disabled}
          className="h-6 w-7 cursor-pointer rounded border border-border-primary bg-background-elevated"
        />
      </label>

      <label className="flex items-center gap-1 px-1 text-xs text-text-secondary">
        HL
        <input
          type="color"
          title="Highlight Color"
          defaultValue="#ffffff"
          onMouseDown={handleSelectMouseDown}
          onChange={(e) => onCommand('highlightColor', e.target.value)}
          disabled={disabled}
          className="h-6 w-7 cursor-pointer rounded border border-border-primary bg-background-elevated"
        />
      </label>

      <div className="w-px h-5 bg-border-primary mx-1" />

      <Button cmd="insertUnorderedList" icon={List} title="Bullet List" />
      <Button cmd="insertOrderedList" icon={ListOrdered} title="Numbered List" />

      <div className="w-px h-5 bg-border-primary mx-1" />

      <Button cmd="justifyLeft" icon={AlignLeft} title="Align Left" />
      <Button cmd="justifyCenter" icon={AlignCenter} title="Align Center" />
      <Button cmd="justifyRight" icon={AlignRight} title="Align Right" />

      <div className="w-px h-5 bg-border-primary mx-1" />

      <Button cmd="outdent" icon={Outdent} title="Decrease Indent" />
      <Button cmd="indent" icon={Indent} title="Increase Indent" />

      <div className="w-px h-5 bg-border-primary mx-1" />

      <select
        onMouseDown={handleSelectMouseDown}
        onChange={(e) => {
          onLineHeightChange(e.target.value);
          onCommand('lineSpacing', e.target.value);
        }}
        disabled={disabled}
        className={selectClass}
        value={lineHeight}
        title="Line Spacing"
      >
        {LINE_SPACING_OPTIONS.map((spacing) => (
          <option key={spacing.value} value={spacing.value}>
            {spacing.label}
          </option>
        ))}
      </select>

      <select
        onMouseDown={handleSelectMouseDown}
        onChange={(e) => {
          onParagraphSpacingChange(e.target.value);
          onCommand('paragraphSpacing', e.target.value);
        }}
        disabled={disabled}
        className={selectClass}
        value={paragraphSpacing}
        title="Paragraph Spacing"
      >
        {PARAGRAPH_SPACING_OPTIONS.map((spacing) => (
          <option key={spacing.value} value={spacing.value}>
            {spacing.label}
          </option>
        ))}
      </select>

      <select
        onMouseDown={handleSelectMouseDown}
        onChange={(e) => onPageMarginChange(Number(e.target.value))}
        disabled={disabled}
        className={selectClass}
        value={pageMarginMm}
        title="Page Margin"
      >
        {PAGE_MARGIN_OPTIONS.map((margin) => (
          <option key={margin.value} value={margin.value}>
            {margin.label}
          </option>
        ))}
      </select>

      <label className="flex items-center gap-1.5 px-2 py-1 text-xs text-text-secondary">
        <input
          type="checkbox"
          aria-label="Show page numbers"
          checked={showPageNumbers}
          onChange={(e) => onShowPageNumbersChange(e.target.checked)}
          disabled={disabled}
          className="h-3.5 w-3.5"
        />
        Page #
      </label>

      <div className="w-px h-5 bg-border-primary mx-1" />

      <Button cmd="insertTable" icon={Table2} title="Insert Table" />
      <Button cmd="addTableRow" icon={Plus} title="Add Table Row" />
      <Button cmd="addTableColumn" icon={Plus} title="Add Table Column" />
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
  onDelete: (id: string) => void;
  canDelete: boolean;
  placeholder?: string;
  pageLayout: PageLayout;
  lineHeight: string;
  showPageNumbers: boolean;
}

function Page({
  page,
  pageNumber,
  totalPages,
  isActive,
  isPreviewMode,
  onDelete,
  canDelete,
  placeholder,
  pageLayout,
  lineHeight,
  showPageNumbers,
}: PageProps) {
  const contentRef = useRef<HTMLDivElement>(null);
  const isEmpty =
    !page.content || page.content.replace(/<[^>]*>/g, '').trim() === '';

  useEffect(() => {
    if (contentRef.current) {
      const sanitized = sanitizeHtml(page.content || '');
      const currentHtml = contentRef.current.innerHTML;
      if (currentHtml !== sanitized) {
        contentRef.current.innerHTML = sanitized;
      }
    }
  }, [page.content]);

  return (
    <div
      data-page-id={page.id}
      className="relative group"
      style={{
        position: 'relative',
        width: A4.WIDTH_PX,
        height: A4.HEIGHT_PX,
      }}
    >
      <div
        contentEditable={false}
        className="absolute -top-6 left-1/2 -translate-x-1/2 px-3 py-1 bg-gray-700 text-white text-xs rounded-t-md z-10"
      >
        Page {pageNumber} of {totalPages}
      </div>

      {canDelete && !isPreviewMode && (
        <button
          type="button"
          contentEditable={false}
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
          ref={contentRef}
          data-page-id={page.id}
          data-placeholder={placeholder}
          data-testid={`a4-page-content-${pageNumber}`}
          className={cn(
            'a4-page-content outline-none',
            isPreviewMode && 'cursor-default',
          )}
          style={{
            position: 'absolute',
            top: pageLayout.topPx,
            right: pageLayout.rightPx,
            bottom: pageLayout.bottomPx,
            left: pageLayout.leftPx,
            width: pageLayout.contentWidthPx,
            height: pageLayout.contentHeightPx,
            fontFamily: 'Arial, Helvetica, sans-serif',
            fontSize: '11pt',
            lineHeight,
            color: '#000',
            overflow: 'hidden',
            overflowWrap: 'break-word',
            wordBreak: 'break-word',
            whiteSpace: 'pre-wrap',
          }}
        />

        {isEmpty && placeholder && !isPreviewMode && (
          <div
            contentEditable={false}
            className="pointer-events-none select-none text-gray-400"
            style={{
              position: 'absolute',
              top: pageLayout.topPx,
              left: pageLayout.leftPx,
              fontFamily: FONT_FAMILY,
              fontSize: FONT_SIZE,
              lineHeight,
            }}
          >
            {placeholder}
          </div>
        )}

        {showPageNumbers && (
          <div
            contentEditable={false}
            className="absolute left-1/2 -translate-x-1/2 text-gray-400"
            data-testid={`a4-page-number-${pageNumber}`}
            style={{
              fontFamily: FONT_FAMILY,
              fontSize: '10pt',
              bottom: '30px',
            }}
          >
            {pageNumber}
          </div>
        )}
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
      readOnly = false,
      layout,
      onLayoutChange,
    },
    ref,
  ) {
    const documentSurfaceRef = useRef<HTMLDivElement | null>(null);
    const scrollContainerRef = useRef<HTMLDivElement | null>(null);
    // Client components are still rendered on the server by Next.js. Keep the
    // initial render DOM-free, then hydrate and paginate the canonical HTML in
    // the effects below once browser APIs are available.
    const lastValueRef = useRef<string | null>(null);
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
        if (documentSurfaceRef.current?.contains(range.startContainer)) {
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
      const editor = documentSurfaceRef.current;
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
        const editor = documentSurfaceRef.current;
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
        const editor = documentSurfaceRef.current;
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

    const parsePages = useCallback(
      (content: string, existingPages?: PageData[]): PageData[] => {
        const hydrated = hydrateFlowHtml(content || '');
        const sections = splitHardSections(hydrated);
        return sections.map((section, i) => ({
          id: existingPages?.[i]?.id || crypto.randomUUID(),
          content: sanitizeHtml(section),
          hardBreakBefore: i > 0,
        }));
      },
      [],
    );

    const serializePages = useCallback((pageList: PageData[]) => {
      const fragments: PageFragment[] = pageList.map((page) => ({
        content: page.content,
        hardBreakBefore: page.hardBreakBefore,
        oversized: page.oversized,
      }));
      return sanitizeHtml(stripFlowMetadata(reassemblePageFragments(fragments)));
    }, []);

    const canonicalPagesHtml = useCallback((pageList: PageData[]) => {
      return reassemblePageFragments(
        pageList.map((page) => ({
          content: page.content,
          hardBreakBefore: page.hardBreakBefore,
          oversized: page.oversized,
        })),
      );
    }, []);

    const [pages, setPages] = useState<PageData[]>(() => [
      {
        id: 'a4-page-initial',
        content: '',
        hardBreakBefore: false,
      },
    ]);
    const pagesRef = useRef<PageData[]>(pages);
    const reflowFrameRef = useRef<number | null>(null);
    const reflowGenerationRef = useRef(0);
    const pendingUpdateRef = useRef(false);
    const pendingFlowSelectionRef = useRef<FlowSelectionBookmark | null>(null);
    const pendingNonCancelableMutationRef = useRef<{
      pages: PageData[];
      canonical: string;
      bookmark: FlowSelectionBookmark | null;
      collapsePoint: FlowSelectionBookmark['anchor'] | null;
      targetPageId: string | null;
      inputType: string;
      data: string | null;
      repairOnly: boolean;
    } | null>(null);
    const [activePageId, setActivePageId] = useState<string>(
      pages[0]?.id || '',
    );
    const activePageIdRef = useRef(activePageId);
    activePageIdRef.current = activePageId;
    const [isPreviewMode, setIsPreviewMode] = useState(readOnly);
    const [internalLayout, setInternalLayout] = useState<A4DocumentLayout>(() =>
      normalizeA4DocumentLayout(DEFAULT_A4_DOCUMENT_LAYOUT),
    );
    const effectiveLayout = useMemo(
      () => normalizeA4DocumentLayout(layout ?? internalLayout),
      [internalLayout, layout],
    );
    const lineHeight = String(effectiveLayout.lineHeight);
    const paragraphSpacing = effectiveLayout.paragraphSpacing;
    const pageMarginMm = effectiveLayout.marginsMm.top;
    const updateLayout = useCallback(
      (next: A4DocumentLayout) => {
        const normalized = normalizeA4DocumentLayout(next);
        if (layout === undefined) setInternalLayout(normalized);
        onLayoutChange?.(normalized);
      },
      [layout, onLayoutChange],
    );
    const [showPageNumbers, setShowPageNumbers] = useState(true);
    const [surfaceRepairGeneration, setSurfaceRepairGeneration] = useState(0);
    const pageLayout = useMemo(
      () => createPageLayout(effectiveLayout.marginsMm),
      [effectiveLayout.marginsMm],
    );

    const scheduleReflow = useCallback(
      (sourcePages: PageData[], emitChange: boolean) => {
        pagesRef.current = sourcePages;
        reflowGenerationRef.current += 1;
        const generation = reflowGenerationRef.current;

        if (reflowFrameRef.current !== null) {
          cancelAnimationFrame(reflowFrameRef.current);
        }

        reflowFrameRef.current = requestAnimationFrame(() => {
          if (generation !== reflowGenerationRef.current) return;

          if (
            documentSurfaceRef.current &&
            !pendingFlowSelectionRef.current
          ) {
            pendingFlowSelectionRef.current = captureFlowSelection(
              documentSurfaceRef.current,
            );
          }

          const canonical = reassemblePageFragments(
            pagesRef.current.map((page) => ({
              content: page.content,
              hardBreakBefore: page.hardBreakBefore,
              oversized: page.oversized,
            })),
          );
          const measurer = createPageMeasurer(
            pageLayout,
            lineHeight,
            paragraphSpacing,
          );

          try {
            const fragments = paginateFlowHtml(
              canonical,
              measurer,
              pageLayout.contentHeightPx,
            );
            if (generation !== reflowGenerationRef.current) return;

            const nextPages = fragments.map((fragment, index) => ({
              id: pagesRef.current[index]?.id || crypto.randomUUID(),
              content: sanitizeHtml(fragment.content),
              hardBreakBefore: fragment.hardBreakBefore,
              oversized: fragment.oversized,
            }));
            pagesRef.current = nextPages;
            lastValueRef.current = serializePages(nextPages);
            pendingUpdateRef.current = emitChange;
            setPages(nextPages);
          } finally {
            measurer.dispose();
            if (reflowFrameRef.current !== null) {
              reflowFrameRef.current = null;
            }
          }
        });
      },
      [lineHeight, pageLayout, paragraphSpacing, serializePages],
    );

    useEffect(() => {
      scheduleReflow(pagesRef.current, false);
      return () => {
        reflowGenerationRef.current += 1;
        if (reflowFrameRef.current !== null) {
          cancelAnimationFrame(reflowFrameRef.current);
          reflowFrameRef.current = null;
        }
      };
    }, [scheduleReflow]);

    useEffect(() => {
      const bookmark = pendingFlowSelectionRef.current;
      const root = documentSurfaceRef.current;
      if (!bookmark || !root) return;

      const frame = requestAnimationFrame(() => {
        const targetFlowElement = Array.from(
          root.querySelectorAll<HTMLElement>('[data-flow-id]'),
        ).find(
          (element) => element.dataset.flowId === bookmark.anchor.flowId,
        );
        const targetEditor = targetFlowElement?.closest(
          '[contenteditable="true"]',
        ) as HTMLDivElement | null;
        targetEditor?.focus({ preventScroll: true });

        if (restoreFlowSelection(root, bookmark)) {
          const pageElement = targetFlowElement?.closest('[data-page-id]') as
            | HTMLElement
            | null;
          if (pageElement?.dataset.pageId) {
            setActivePageId(pageElement.dataset.pageId);
          }
        }
        pendingFlowSelectionRef.current = null;
      });

      return () => cancelAnimationFrame(frame);
    }, [pages, surfaceRepairGeneration]);

    // Expose methods via ref
    useImperativeHandle(
      ref,
      () => ({
        insertAtCursor,
        insertHtmlAtCursor,
        focus: () => documentSurfaceRef.current?.focus(),
        getContent: () => serializePages(pagesRef.current),
        setContent: (html: string) => {
          const newPages = parsePages(html, pagesRef.current);
          pagesRef.current = newPages;
          setPages(newPages);
          scheduleReflow(newPages, false);
          if (newPages.length > 0 && !newPages.find((p) => p.id === activePageId)) {
            setActivePageId(newPages[0].id);
          }
        },
      }),
      [
        activePageId,
        insertAtCursor,
        insertHtmlAtCursor,
        parsePages,
        scheduleReflow,
        serializePages,
      ],
    );

    // In read-only mode, always stay in preview/read mode
    const effectivePreviewMode = readOnly || isPreviewMode;

    const [previewPages, setPreviewPages] = useState<PageData[] | null>(null);

    useEffect(() => {
      if (!previewContent) {
        setPreviewPages(null);
        return;
      }

      const basePages = parsePages(previewContent, previewPages ?? undefined);
      const frame = requestAnimationFrame(() => {
        const canonical = reassemblePageFragments(
          basePages.map((page) => ({
            content: page.content,
            hardBreakBefore: page.hardBreakBefore,
          })),
        );
        const measurer = createPageMeasurer(
          pageLayout,
          lineHeight,
          paragraphSpacing,
        );
        try {
          const fragments = paginateFlowHtml(
            canonical,
            measurer,
            pageLayout.contentHeightPx,
          );
          setPreviewPages(
            fragments.map((fragment, index) => ({
              id: basePages[index]?.id || crypto.randomUUID(),
              content: sanitizeHtml(fragment.content),
              hardBreakBefore: fragment.hardBreakBefore,
              oversized: fragment.oversized,
            })),
          );
        } finally {
          measurer.dispose();
        }
      });

      return () => cancelAnimationFrame(frame);
      // previewPages is intentionally excluded: it supplies stable ids but must not
      // retrigger pagination after each derived preview layout.
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [lineHeight, pageLayout, paragraphSpacing, parsePages, previewContent]);

    // Helper to check if a page should be removed (contains only [Remove Page])
    const shouldRemovePage = useCallback((content: string) => {
      const textContent = (content || '')
        .replace(/<[^>]*>/g, '')
        .replace(/&nbsp;/g, ' ')
        .trim();
      return /^\[Remove\s*Page\]$/i.test(textContent);
    }, []);

    // Always filter out pages marked with [Remove Page] from display
    const rawDisplayPages = (isPreviewMode && previewPages) ? previewPages : pages;
    const displayPages = useMemo(() => {
      // Always filter out [Remove Page] pages, both in edit and preview modes
      return rawDisplayPages.filter((page) => !shouldRemovePage(page.content));
    }, [rawDisplayPages, shouldRemovePage]);

    useEffect(() => {
      if (displayPages.length === 0) return;
      const currentIdx = displayPages.findIndex((p) => p.id === activePageId);
      if (currentIdx === -1) {
        setActivePageId(displayPages[0].id);
      }
    }, [displayPages, activePageId]);

    useEffect(() => {
      const canonicalValue = stripFlowMetadata(hydrateFlowHtml(value));
      if (isInternalUpdate.current || canonicalValue === lastValueRef.current) {
        isInternalUpdate.current = false;
        return;
      }

      lastValueRef.current = canonicalValue;

      if (!isPreviewMode) {
        setPages((prev) => {
          const newPages = parsePages(value, prev);
          pagesRef.current = newPages;
          scheduleReflow(newPages, false);
          if (
            !newPages.find((p) => p.id === activePageIdRef.current) &&
            newPages.length > 0
          ) {
            setActivePageId(newPages[0].id);
          }
          return newPages;
        });
      }
    }, [value, parsePages, isPreviewMode, scheduleReflow]);

    const historyRef = useRef<{ past: string[]; future: string[] }>({
      past: [],
      future: [],
    });

    const pushHistorySnapshot = useCallback(
      (pageList: PageData[]) => {
        const snapshot = serializePages(pageList);
        const lastSnapshot =
          historyRef.current.past[historyRef.current.past.length - 1];

        if (snapshot === lastSnapshot) return;

        historyRef.current.past.push(snapshot);
        if (historyRef.current.past.length > 100) {
          historyRef.current.past.shift();
        }
        historyRef.current.future = [];
      },
      [serializePages],
    );

    useEffect(() => {
      if (pendingUpdateRef.current && onChange) {
        pendingUpdateRef.current = false;
        const html = serializePages(pages);
        isInternalUpdate.current = true;
        lastValueRef.current = html;
        onChange(html);
      }
    }, [pages, onChange, serializePages]);

    const handleUndo = useCallback(() => {
      if (effectivePreviewMode) return;

      setPages((prev) => {
        const previousSnapshot = historyRef.current.past.pop();
        if (!previousSnapshot) return prev;

        historyRef.current.future.push(serializePages(prev));

        const nextPages = parsePages(previousSnapshot, prev);
        pagesRef.current = nextPages;
        scheduleReflow(nextPages, true);
        if (nextPages.length > 0) {
          setActivePageId(nextPages[0].id);
        }
        return nextPages;
      });
    }, [effectivePreviewMode, parsePages, scheduleReflow, serializePages]);

    const handleRedo = useCallback(() => {
      if (effectivePreviewMode) return;

      setPages((prev) => {
        const nextSnapshot = historyRef.current.future.pop();
        if (!nextSnapshot) return prev;

        historyRef.current.past.push(serializePages(prev));

        const nextPages = parsePages(nextSnapshot, prev);
        pagesRef.current = nextPages;
        scheduleReflow(nextPages, true);
        if (nextPages.length > 0) {
          setActivePageId(nextPages[0].id);
        }
        return nextPages;
      });
    }, [effectivePreviewMode, parsePages, scheduleReflow, serializePages]);

    const commitDocumentSurface = useCallback(() => {
      const surface = documentSurfaceRef.current;
      if (effectivePreviewMode || !surface) return;

      const currentPages = pagesRef.current;
      const metadataByPageId = new Map(
        currentPages.map((page) => [page.id, page]),
      );
      const renderedPages = Array.from(
        surface.querySelectorAll<HTMLElement>(
          '[data-testid^="a4-page-content-"][data-page-id]',
        ),
      ).flatMap((element) => {
        const page = metadataByPageId.get(element.dataset.pageId!);
        if (!page) return [];

        const content = sanitizeHtml(
          replaceTypedPageBreaks(element.innerHTML),
        );
        return [content === page.content ? page : { ...page, content }];
      });
      const renderedPageIds = new Set(renderedPages.map((page) => page.id));
      let renderedIndex = 0;
      const nextPages = currentPages.map((page) => {
        if (!renderedPageIds.has(page.id)) return page;
        return renderedPages[renderedIndex++] ?? page;
      });
      nextPages.push(...renderedPages.slice(renderedIndex));

      if (
        nextPages.length === currentPages.length &&
        nextPages.every((page, index) => page === currentPages[index])
      ) {
        return;
      }

      pendingFlowSelectionRef.current = captureFlowSelection(surface);
      pushHistorySnapshot(currentPages);
      pagesRef.current = nextPages;
      setPages(nextPages);
      scheduleReflow(nextPages, true);
    }, [effectivePreviewMode, pushHistorySnapshot, scheduleReflow]);

    const commitUserTransaction = useCallback(
      (result: DocumentTransactionResult) => {
        if (effectivePreviewMode || !result.changed) return;
        const sourcePages = pagesRef.current;
        pushHistorySnapshot(sourcePages);
        pendingFlowSelectionRef.current = result.selection;
        const nextPages = parsePages(result.html, sourcePages);
        pagesRef.current = nextPages;
        setPages(nextPages);
        scheduleReflow(nextPages, true);
      },
      [effectivePreviewMode, parsePages, pushHistorySnapshot, scheduleReflow],
    );

    const handleAddPage = useCallback(() => {
      if (effectivePreviewMode) return;
      commitUserTransaction(appendHardPage(canonicalPagesHtml(pagesRef.current)));
    }, [canonicalPagesHtml, commitUserTransaction, effectivePreviewMode]);

    const handleDeletePage = useCallback(
      (id: string) => {
        if (effectivePreviewMode) return;
        const pageIndex = pagesRef.current.findIndex((page) => page.id === id);
        if (pageIndex < 0) return;
        const sectionIndex = pagesRef.current
          .slice(0, pageIndex + 1)
          .filter((page, index) => index === 0 || page.hardBreakBefore).length - 1;
        commitUserTransaction(
          deleteHardPageSection(canonicalPagesHtml(pagesRef.current), sectionIndex),
        );
      },
      [canonicalPagesHtml, commitUserTransaction, effectivePreviewMode],
    );

    const pendingFocusStartPageId = useRef<string | null>(null);
    const pendingBoundaryFocusRef = useRef<{
      pageId: string;
      previousContent: string;
    } | null>(null);

    const focusPageAtStart = useCallback((pageId: string) => {
      const pageEl = documentSurfaceRef.current?.querySelector(
        `[data-testid^="a4-page-content-"][data-page-id="${pageId}"]`,
      ) as HTMLDivElement | null;

      if (pageEl) {
        documentSurfaceRef.current?.focus();
        const selection = window.getSelection();
        if (selection) {
          const range = document.createRange();
          range.selectNodeContents(pageEl);
          range.collapse(true);
          selection.removeAllRanges();
          selection.addRange(range);
        }
      }
    }, []);

    const selectAllDocument = useCallback(() => {
      const surface = documentSurfaceRef.current;
      const pageContents = Array.from(
        surface?.querySelectorAll<HTMLElement>(
          '[data-testid^="a4-page-content-"]',
        ) ?? [],
      );
      const firstEditor = pageContents[0];
      const lastEditor = pageContents[pageContents.length - 1];
      const selection = window.getSelection();

      if (!firstEditor || !lastEditor || !selection) return;

      const range = document.createRange();
      range.setStart(firstEditor, 0);
      range.setEnd(lastEditor, lastEditor.childNodes.length);
      selection.removeAllRanges();
      selection.addRange(range);
    }, []);

    const syncFormattingFromSelection = useCallback(() => {
      // Reserved for selection-aware controls that should not affect document-level settings.
    }, []);

    const handleDeleteAcrossPages = useCallback(() => {
      if (effectivePreviewMode || !documentSurfaceRef.current) return;
      const bookmark = captureFlowSelection(documentSurfaceRef.current);
      if (!bookmark || bookmark.collapsed) return;
      const collapsePoint = selectionStartPoint(bookmark);

      setPages((prev) => {
        pushHistorySnapshot(prev);
        const canonical = reassemblePageFragments(
          prev.map((page) => ({
            content: page.content,
            hardBreakBefore: page.hardBreakBefore,
          })),
        );
        const deleted = deleteFlowSelection(canonical, bookmark);
        const nextPages = parsePages(deleted, prev);
        pendingFlowSelectionRef.current = {
          anchor: collapsePoint,
          focus: collapsePoint,
          collapsed: true,
        };
        pagesRef.current = nextPages;
        scheduleReflow(nextPages, true);
        return nextPages;
      });
    }, [effectivePreviewMode, parsePages, pushHistorySnapshot, scheduleReflow]);

    const handleReplaceAcrossPages = useCallback(
      (
        html: string,
        transaction?: {
          pages: PageData[];
          canonical: string;
          bookmark: FlowSelectionBookmark;
          replacementPoint: FlowSelectionBookmark['anchor'];
          repairSurface: boolean;
        },
      ) => {
        if (effectivePreviewMode || !documentSurfaceRef.current) return;
        const bookmark =
          transaction?.bookmark ??
          captureFlowSelection(documentSurfaceRef.current);
        if (!bookmark || bookmark.collapsed) return;
        const replacementPoint =
          transaction?.replacementPoint ?? selectionStartPoint(bookmark);
        const sourcePages = transaction?.pages ?? pagesRef.current;
        const canonical =
          transaction?.canonical ??
          reassemblePageFragments(
            sourcePages.map((page) => ({
              content: page.content,
              hardBreakBefore: page.hardBreakBefore,
            })),
          );
        pushHistorySnapshot(sourcePages);
        const replacementStartOffset = documentTextOffsetForFlowPoint(
          canonical,
          replacementPoint,
        );
        const replacementText = document.createElement('div');
        replacementText.innerHTML = html;
        const nextCanonical = replaceFlowSelection(canonical, bookmark, html);
        const hydratedNextCanonical = hydrateFlowHtml(nextCanonical);
        const replacementLength = replacementText.textContent?.length ?? 0;
        const replacementCaret =
          replacementStartOffset === null
            ? replacementPoint
            : flowPointAtDocumentTextOffset(
                hydratedNextCanonical,
                replacementStartOffset + replacementLength,
              ) ?? replacementPoint;
        const nextPages = parsePages(hydratedNextCanonical, sourcePages);
        pendingFlowSelectionRef.current = {
          anchor: replacementCaret,
          focus: replacementCaret,
          collapsed: true,
        };
        pagesRef.current = nextPages;
        if (transaction?.repairSurface) {
          setSurfaceRepairGeneration((generation) => generation + 1);
        }
        setPages(nextPages);
        scheduleReflow(nextPages, true);
      },
      [effectivePreviewMode, parsePages, pushHistorySnapshot, scheduleReflow],
    );

    const focusPageAtContentBoundary = useCallback(
      (pageId: string, previousContent: string) => {
        const pageEl = documentSurfaceRef.current?.querySelector(
          `[data-testid^="a4-page-content-"][data-page-id="${pageId}"]`,
        ) as HTMLDivElement | null;

        if (!pageEl) return;

        documentSurfaceRef.current?.focus();
        const selection = window.getSelection();
        if (!selection) return;

        const temp = document.createElement('div');
        temp.innerHTML = sanitizeHtml(previousContent || '');
        const boundaryIndex = temp.childNodes.length;
        const range = document.createRange();

        if (boundaryIndex <= 0) {
          range.setStart(pageEl, 0);
        } else {
          const boundaryNode =
            pageEl.childNodes[Math.min(boundaryIndex - 1, pageEl.childNodes.length - 1)];
          if (boundaryNode) {
            range.setStartAfter(boundaryNode);
          } else {
            range.selectNodeContents(pageEl);
            range.collapse(false);
          }
        }

        range.collapse(true);
        selection.removeAllRanges();
        selection.addRange(range);
      },
      [],
    );

    useEffect(() => {
      if (!pendingFocusStartPageId.current) return;

      const targetId = pendingFocusStartPageId.current;
      const timer = setTimeout(() => {
        focusPageAtStart(targetId);
        pendingFocusStartPageId.current = null;
      }, 0);

      return () => clearTimeout(timer);
    }, [pages, focusPageAtStart]);

    useEffect(() => {
      const pending = pendingBoundaryFocusRef.current;
      if (!pending) return;

      const timer = setTimeout(() => {
        focusPageAtContentBoundary(pending.pageId, pending.previousContent);
        pendingBoundaryFocusRef.current = null;
      }, 0);

      return () => clearTimeout(timer);
    }, [pages, focusPageAtContentBoundary]);

    const handleBackspaceAtPageStart = useCallback(
      (pageId: string, currentContent?: string) => {
        if (effectivePreviewMode) return;

        const currentPageIndex = pagesRef.current.findIndex((p) => p.id === pageId);
        if (currentPageIndex <= 0) return;

        const previousPage = pagesRef.current[currentPageIndex - 1];
        pendingBoundaryFocusRef.current = {
          pageId: previousPage.id,
          previousContent: previousPage.content,
        };

        setActivePageId(previousPage.id);
        setPages((prev) => {
          const pageIndex = prev.findIndex((p) => p.id === pageId);
          if (pageIndex <= 0) return prev;

          pushHistorySnapshot(prev);
          const previousPage = prev[pageIndex - 1];
          const currentPage = prev[pageIndex];
          const contentToMerge =
            currentContent === undefined
              ? currentPage.content
              : sanitizeHtml(currentContent);
          const updatedPages = [...prev];
          const previousContentContainer = document.createElement('div');
          previousContentContainer.innerHTML = previousPage.content;
          const boundaryTextOffset =
            previousContentContainer.textContent?.length ?? 0;
          let mergedContent = reassemblePageFragments([
            {
              content: previousPage.content,
              hardBreakBefore: false,
            },
            {
              content: contentToMerge,
              hardBreakBefore: false,
            },
          ]);
          if (!currentPage.hardBreakBefore) {
            mergedContent = deleteCharacterBeforeTextOffset(
              mergedContent,
              boundaryTextOffset,
            );

            const bookmark = documentSurfaceRef.current
              ? captureFlowSelection(documentSurfaceRef.current)
              : null;
            if (bookmark) {
              pendingFlowSelectionRef.current = {
                ...bookmark,
                anchor: {
                  ...bookmark.anchor,
                  offset: Math.max(0, bookmark.anchor.offset - 1),
                },
                focus: {
                  ...bookmark.focus,
                  offset: Math.max(0, bookmark.focus.offset - 1),
                },
              };
            }
          }

          updatedPages[pageIndex - 1] = {
            ...previousPage,
            content: mergedContent,
          };
          updatedPages.splice(pageIndex, 1);
          pagesRef.current = updatedPages;
          scheduleReflow(updatedPages, true);
          return updatedPages;
        });
      },
      [effectivePreviewMode, pushHistorySnapshot, scheduleReflow],
    );

    const syncActivePage = useCallback((target?: EventTarget | null) => {
      const surface = documentSurfaceRef.current;
      if (!surface) return null;
      const selection = window.getSelection();
      const pageContent =
        pageContentFromTarget(surface, target ?? null) ??
        pageContentFromTarget(surface, selection?.focusNode ?? null) ??
        pageContentFromTarget(surface, selection?.anchorNode ?? null);
      const pageId = pageContent?.dataset.pageId;
      if (pageId) setActivePageId(pageId);
      return pageContent;
    }, []);

    const repairPendingNonCancelableMutation = useCallback(
      (followup?: { inputType?: string; data?: string | null }) => {
        const pending = pendingNonCancelableMutationRef.current;
        if (!pending) return false;
        pendingNonCancelableMutationRef.current = null;

        const inputType = followup?.inputType || pending.inputType;
        const inputData = followup?.data ?? pending.data;
        if (pending.repairOnly) {
          pagesRef.current = pending.pages;
          if (pending.collapsePoint) {
            pendingFlowSelectionRef.current = {
              anchor: pending.collapsePoint,
              focus: pending.collapsePoint,
              collapsed: true,
            };
          } else if (pending.targetPageId) {
            pendingFocusStartPageId.current = pending.targetPageId;
          }
          setSurfaceRepairGeneration((generation) => generation + 1);
          setPages(pending.pages.map((page) => ({ ...page })));
          return true;
        }

        if (!pending.bookmark || !pending.collapsePoint) {
          pagesRef.current = pending.pages;
          if (pending.targetPageId) {
            pendingFocusStartPageId.current = pending.targetPageId;
          }
          setSurfaceRepairGeneration((generation) => generation + 1);
          setPages(pending.pages.map((page) => ({ ...page })));
          return true;
        }

        if (inputType.startsWith('delete')) {
          pushHistorySnapshot(pending.pages);
          const deleted = deleteFlowSelection(
            pending.canonical,
            pending.bookmark,
          );
          const nextPages = parsePages(deleted, pending.pages);
          pendingFlowSelectionRef.current = {
            anchor: pending.collapsePoint,
            focus: pending.collapsePoint,
            collapsed: true,
          };
          pagesRef.current = nextPages;
          setSurfaceRepairGeneration((generation) => generation + 1);
          setPages(nextPages);
          scheduleReflow(nextPages, true);
          return true;
        }

        const isSupportedTextReplacement =
          typeof inputData === 'string' &&
          [
            'insertText',
            'insertReplacementText',
            'insertCompositionText',
            'insertFromComposition',
          ].includes(inputType);
        if (isSupportedTextReplacement) {
          const replacement = document.createElement('div');
          replacement.textContent = inputData;
          handleReplaceAcrossPages(replacement.innerHTML, {
            pages: pending.pages,
            canonical: pending.canonical,
            bookmark: pending.bookmark,
            replacementPoint: pending.collapsePoint,
            repairSurface: true,
          });
          return true;
        }

        pagesRef.current = pending.pages;
        pendingFlowSelectionRef.current = {
          anchor: pending.collapsePoint,
          focus: pending.collapsePoint,
          collapsed: true,
        };
        setSurfaceRepairGeneration((generation) => generation + 1);
        setPages(pending.pages.map((page) => ({ ...page })));
        return true;
      },
      [
        handleReplaceAcrossPages,
        parsePages,
        pushHistorySnapshot,
        scheduleReflow,
      ],
    );

    const handleDocumentInput = useCallback((event: ReactFormEvent<HTMLDivElement>) => {
      const inputEvent = event.nativeEvent as InputEvent;
      if (
        repairPendingNonCancelableMutation({
          inputType: inputEvent.inputType,
          data: inputEvent.data,
        })
      ) {
        return;
      }
      commitDocumentSurface();
    }, [commitDocumentSurface, repairPendingNonCancelableMutation]);

    const handleDocumentCompositionEnd = useCallback(
      (event: ReactCompositionEvent<HTMLDivElement>) => {
        repairPendingNonCancelableMutation({
          inputType: 'insertCompositionText',
          data: event.data,
        });
      },
      [repairPendingNonCancelableMutation],
    );

    const handleDocumentPaste = useCallback(
      (event: ReactClipboardEvent<HTMLDivElement>) => {
        if (effectivePreviewMode) return;
        event.preventDefault();

        const surface = documentSurfaceRef.current;
        if (!surface || !selectionIsWithinPageContents(surface)) return;

        const html = clipboardHtml(event.clipboardData);
        if (!html) return;

        if (surface && selectionSpansPages(surface)) {
          handleReplaceAcrossPages(html);
          return;
        }

        document.execCommand('insertHTML', false, html);
        setTimeout(commitDocumentSurface, 0);
      },
      [commitDocumentSurface, effectivePreviewMode, handleReplaceAcrossPages],
    );

    const handleDocumentKeyDown = useCallback(
      (event: ReactKeyboardEvent<HTMLDivElement>) => {
        if (effectivePreviewMode) return;
        const pageContent = syncActivePage(event.target);

        if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'a') {
          event.preventDefault();
          selectAllDocument();
          return;
        }

        if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'z') {
          event.preventDefault();
          if (event.shiftKey) {
            handleRedo();
          } else {
            handleUndo();
          }
          return;
        }

        if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'y') {
          event.preventDefault();
          handleRedo();
          return;
        }

        const surface = documentSurfaceRef.current;
        if (
          surface &&
          event.key === 'Delete' &&
          pageContent &&
          isCaretAtEditorEnd(pageContent)
        ) {
          const bookmark = captureFlowSelection(surface);
          if (bookmark) {
            event.preventDefault();
            commitUserTransaction(
              applyLogicalDelete(
                canonicalPagesHtml(pagesRef.current),
                bookmark,
                'forward',
              ),
            );
            return;
          }
        }

        if (
          surface &&
          (event.key === 'Backspace' || event.key === 'Delete') &&
          selectionSpansPages(surface)
        ) {
          event.preventDefault();
          handleDeleteAcrossPages();
          return;
        }

        if (
          event.key === 'Backspace' &&
          pageContent &&
          isCaretAtEditorStart(pageContent)
        ) {
          event.preventDefault();
          handleBackspaceAtPageStart(
            pageContent.dataset.pageId!,
            pageContent.innerHTML,
          );
        }
      },
      [
        effectivePreviewMode,
        handleBackspaceAtPageStart,
        canonicalPagesHtml,
        commitUserTransaction,
        handleDeleteAcrossPages,
        handleRedo,
        handleUndo,
        selectAllDocument,
        syncActivePage,
      ],
    );

    const handleBeforeInput = useCallback(
      (inputEvent: InputEvent) => {
        const surface = documentSurfaceRef.current;
        if (
          !effectivePreviewMode &&
          surface &&
          !selectionIsWithinPageContents(surface)
        ) {
          if (inputEvent.cancelable) {
            inputEvent.preventDefault();
            return;
          }

          const selection = window.getSelection();
          const targetPage =
            pageContentFromTarget(surface, selection?.focusNode ?? null) ??
            pageContentFromTarget(surface, selection?.anchorNode ?? null) ??
            surface.querySelector<HTMLElement>(
              `[data-testid^="a4-page-content-"][data-page-id="${activePageIdRef.current}"]`,
            ) ??
            surface.querySelector<HTMLElement>(
              '[data-testid^="a4-page-content-"][data-page-id]',
            );
          const targetFlow = targetPage?.querySelector<HTMLElement>(
            '[data-flow-id]',
          );
          const flowId = targetFlow?.dataset.flowId;
          const isMutating = Boolean(
            inputEvent.inputType || inputEvent.data !== null,
          );
          const targetPageId = targetPage?.dataset.pageId;
          if (isMutating && targetPageId) {
            const safePoint = flowId ? { flowId, offset: 0 } : null;
            const snapshotPages = pagesRef.current;
            pendingNonCancelableMutationRef.current = {
              pages: snapshotPages,
              canonical: reassemblePageFragments(
                snapshotPages.map((page) => ({
                  content: page.content,
                  hardBreakBefore: page.hardBreakBefore,
                })),
              ),
              bookmark: safePoint
                ? {
                    anchor: safePoint,
                    focus: safePoint,
                    collapsed: true,
                  }
                : null,
              collapsePoint: safePoint,
              targetPageId,
              inputType: inputEvent.inputType,
              data: inputEvent.data,
              repairOnly: true,
            };
          }
          return;
        }

        if (!effectivePreviewMode && surface && selectionSpansPages(surface)) {
          const bookmark = captureFlowSelection(surface);
          if (!bookmark || bookmark.collapsed) return;
          const collapsePoint = selectionStartPoint(bookmark);
          if (!inputEvent.cancelable) {
            const snapshotPages = pagesRef.current;
            pendingNonCancelableMutationRef.current = {
              pages: snapshotPages,
              canonical: reassemblePageFragments(
                snapshotPages.map((page) => ({
                  content: page.content,
                  hardBreakBefore: page.hardBreakBefore,
                })),
              ),
              bookmark,
              collapsePoint,
              targetPageId:
                pageContentFromTarget(
                  surface,
                  window.getSelection()?.focusNode ?? null,
                )?.dataset.pageId ?? null,
              inputType: inputEvent.inputType,
              data: inputEvent.data,
              repairOnly: false,
            };
            return;
          }

          inputEvent.preventDefault();

          if (inputEvent.inputType?.startsWith('delete')) {
            handleDeleteAcrossPages();
            return;
          }

          const isCompositionInput =
            inputEvent.isComposing ||
            inputEvent.inputType?.toLowerCase().includes('composition');
          const inputData = inputEvent.data;
          const isTextReplacement =
            !isCompositionInput &&
            typeof inputData === 'string' &&
            (!inputEvent.inputType ||
              inputEvent.inputType === 'insertText' ||
              inputEvent.inputType === 'insertReplacementText');
          if (isTextReplacement) {
            const replacement = document.createElement('div');
            replacement.textContent = inputData;
            handleReplaceAcrossPages(replacement.innerHTML);
          }
        }
      },
      [
        effectivePreviewMode,
        handleDeleteAcrossPages,
        handleReplaceAcrossPages,
      ],
    );

    useEffect(() => {
      const surface = documentSurfaceRef.current;
      if (!surface || effectivePreviewMode) return;

      surface.addEventListener('beforeinput', handleBeforeInput);
      return () => surface.removeEventListener('beforeinput', handleBeforeInput);
    }, [effectivePreviewMode, handleBeforeInput, surfaceRepairGeneration]);

    const splitActivePageAtSelection = useCallback(() => {
      if (effectivePreviewMode) return;

      const surface = documentSurfaceRef.current;
      if (!surface) return;
      const selection = window.getSelection();
      const editor =
        pageContentFromTarget(surface, selection?.focusNode ?? null) ??
        surface.querySelector<HTMLElement>(
          `[data-testid^="a4-page-content-"][data-page-id="${activePageId}"]`,
        );
      const pageId = editor?.dataset.pageId;
      if (!pageId) return;

      const activeRange =
        selection &&
        selection.rangeCount > 0 &&
        editor.contains(selection.getRangeAt(0).commonAncestorContainer)
          ? selection.getRangeAt(0)
          : null;

      const splitRange = activeRange ?? document.createRange();
      if (!activeRange) {
        splitRange.selectNodeContents(editor);
        splitRange.collapse(false);
      }

      const beforeRange = document.createRange();
      beforeRange.setStart(editor, 0);
      beforeRange.setEnd(splitRange.startContainer, splitRange.startOffset);

      const afterRange = document.createRange();
      afterRange.setStart(splitRange.endContainer, splitRange.endOffset);
      afterRange.setEnd(editor, editor.childNodes.length);

      const beforeHtml = sanitizeHtml(fragmentToHtml(beforeRange.cloneContents()));
      const afterHtml = sanitizeHtml(fragmentToHtml(afterRange.cloneContents()));
      const newPage: PageData = {
        id: crypto.randomUUID(),
        content: afterHtml || '<p><br></p>',
        hardBreakBefore: true,
      };

      pendingFocusStartPageId.current = newPage.id;
      setActivePageId(newPage.id);
      setPages((prev) => {
        const pageIndex = prev.findIndex((p) => p.id === pageId);
        if (pageIndex === -1) return prev;

        pushHistorySnapshot(prev);
        const updatedPages = [...prev];
        updatedPages[pageIndex] = {
          ...updatedPages[pageIndex],
          content: beforeHtml,
        };
        updatedPages.splice(pageIndex + 1, 0, newPage);
        pagesRef.current = updatedPages;
        scheduleReflow(updatedPages, true);
        return updatedPages;
      });
    }, [activePageId, effectivePreviewMode, pushHistorySnapshot, scheduleReflow]);

    const handleCommand = useCallback(
      (cmd: string, val?: string) => {
        if (effectivePreviewMode) return;

        if (cmd === 'undo') {
          handleUndo();
          return;
        }

        if (cmd === 'redo') {
          handleRedo();
          return;
        }

        const editor = documentSurfaceRef.current;
        if (!editor) return;

        if (!getEditorSelectionRange(editor)) {
          editor.focus();
          restoreSelection();
        }

        if (cmd === 'paragraphStyle' && val) {
          applyBlockTagToSelection(editor, val);
          return;
        }

        if (cmd === 'textColor' && val) {
          applyInlineStyleToSelection(editor, { color: val });
          return;
        }

        if (cmd === 'highlightColor' && val) {
          applyInlineStyleToSelection(editor, { backgroundColor: val });
          return;
        }

        if (cmd === 'paragraphSpacing' && val) {
          updateLayout({ ...effectiveLayout, paragraphSpacing: val });
          return;
        }

        if (cmd === 'insertTable') {
          insertHtmlIntoEditor(
            editor,
            '<table><tbody><tr><th>Header</th><th>Header</th></tr><tr><td>Cell</td><td>Cell</td></tr></tbody></table><p><br /></p>',
          );
          return;
        }

        if (cmd === 'addTableRow') {
          addTableRowAtSelection(editor);
          return;
        }

        if (cmd === 'addTableColumn') {
          addTableColumnAtSelection(editor);
          return;
        }

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
          updateLayout({ ...effectiveLayout, lineHeight: Number(val) });
          setPages((prev) => {
            const next = prev.map((page) => ({
              ...page,
              content: stripInlineLineHeight(page.content),
            }));
            const changed = next.some(
              (page, index) => page.content !== prev[index]?.content,
            );

            if (!changed) return prev;

            pushHistorySnapshot(prev);
            pendingUpdateRef.current = true;
            return next;
          });
          return;
        }

        if (cmd === 'pageBreak') {
          splitActivePageAtSelection();
          return;
        }

        document.execCommand(cmd, false, val);
      },
      [
        effectiveLayout,
        effectivePreviewMode,
        handleRedo,
        handleUndo,
        pushHistorySnapshot,
        restoreSelection,
        splitActivePageAtSelection,
        updateLayout,
      ],
    );

    const handlePrint = useCallback(() => {
      const printPages = isPreviewMode && previewPages ? previewPages : pages;

      // Filter out pages that only contain [Remove Page]
      const filteredPages = printPages.filter((page) => !shouldRemovePage(page.content));

      const pagesHtml = filteredPages.length > 0
        ? filteredPages
            .map((page, index) => {
              const content = sanitizeHtml(page.content) || '&nbsp;';
              const pageNumberHtml = showPageNumbers
                ? `<div class="print-page-number">${index + 1}</div>`
                : '';
              return `<section class="print-page"><div class="content">${content}</div>${pageNumberHtml}</section>`;
            })
            .join('')
        : '<section class="print-page"><div class="content">&nbsp;</div></section>';

      // Create a hidden iframe for printing (stays on same page)
      const printFrame = document.createElement('iframe');
      printFrame.style.position = 'absolute';
      printFrame.style.top = '-9999px';
      printFrame.style.left = '-9999px';
      printFrame.style.width = '0';
      printFrame.style.height = '0';
      printFrame.style.border = 'none';
      document.body.appendChild(printFrame);

      const frameDoc = printFrame.contentDocument || printFrame.contentWindow?.document;
      if (!frameDoc) {
        document.body.removeChild(printFrame);
        return;
      }

      frameDoc.open();
      frameDoc.write(`<!DOCTYPE html>
<html>
<head>
  <title>Print</title>
  <style>
    @page {
      size: 210mm 297mm;
      margin: ${pageLayout.marginsMm.top}mm ${pageLayout.marginsMm.right}mm ${pageLayout.marginsMm.bottom}mm ${pageLayout.marginsMm.left}mm;
    }
    * {
      box-sizing: border-box;
      margin: 0;
      padding: 0;
    }
    html, body {
      font-family: Arial, Helvetica, sans-serif;
      font-size: 11pt;
      line-height: ${lineHeight};
      color: #000;
    }
    .print-page {
      position: relative;
      min-height: calc(297mm - ${pageLayout.marginsMm.top + pageLayout.marginsMm.bottom}mm);
      page-break-after: always;
      break-after: page;
    }
    .print-page:last-child {
      page-break-after: auto;
      break-after: auto;
    }
    .content {
      width: 100%;
      white-space: pre-wrap;
      overflow-wrap: break-word;
      word-break: break-word;
    }
    .print-page-number {
      position: absolute;
      left: 0;
      right: 0;
      bottom: 0;
      text-align: center;
      font-family: ${FONT_FAMILY};
      font-size: 10pt;
      color: #555;
    }
    p:empty, div:empty { min-height: 1em; }
    p { margin: 0 0 ${paragraphSpacing} 0; }
    p, div, span, li, blockquote, th, td {
      line-height: inherit;
    }
    h1, h2, h3 {
      font-family: Arial, Helvetica, sans-serif;
      font-weight: 700;
      line-height: inherit;
      margin: 0 0 ${paragraphSpacing} 0;
    }
    h1 { font-size: 24pt; }
    h2 { font-size: 18pt; }
    h3 { font-size: 14pt; }
    br { display: block; content: ""; margin-top: 0.5em; }
    ul, ol { margin: 0 0 ${paragraphSpacing} 0; padding-left: 1.5em; }
    ul { list-style-type: disc; }
    ol { list-style-type: decimal; }
    li { display: list-item; margin: 0 0 0.25em 0; }
    blockquote { margin: 0 0 ${paragraphSpacing} 40px; padding: 0; }
    table {
      width: 100%;
      border-collapse: collapse;
      table-layout: fixed;
      margin: 0 0 ${paragraphSpacing} 0;
    }
    th, td {
      border: 1px solid #9ca3af;
      padding: 6px 8px;
      vertical-align: top;
      min-height: 1.5em;
      word-break: break-word;
    }
    th {
      background: #f3f4f6;
      font-weight: 700;
    }
    a {
      color: #1155cc;
      text-decoration: underline;
    }
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
    @media print {
      html, body {
        -webkit-print-color-adjust: exact;
        print-color-adjust: exact;
      }
    }
  </style>
</head>
<body>${pagesHtml}</body>
</html>`);
      frameDoc.close();

      // Wait for content to load, then print
      setTimeout(() => {
        printFrame.contentWindow?.focus();
        printFrame.contentWindow?.print();
        // Remove iframe after printing
        setTimeout(() => {
          document.body.removeChild(printFrame);
        }, 1000);
      }, 200);
    }, [
      isPreviewMode,
      lineHeight,
      paragraphSpacing,
      pageLayout.marginsMm,
      pages,
      previewPages,
      shouldRemovePage,
      showPageNumbers,
    ]);

    const scrollToPage = useCallback(
      (dir: 'up' | 'down') => {
        const idx = displayPages.findIndex((p) => p.id === activePageId);
        const newIdx =
          dir === 'up'
            ? Math.max(0, idx - 1)
            : Math.min(displayPages.length - 1, idx + 1);
        const targetPageId = displayPages[newIdx].id;
        setActivePageId(targetPageId);
        // Use ID-based query to find the exact page element
        const container = scrollContainerRef.current;
        if (container) {
          const pageEl = container.querySelector(`[data-page-id="${targetPageId}"]`);
          pageEl?.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
      },
      [displayPages, activePageId],
    );

    const currentPageIdx = displayPages.findIndex((p) => p.id === activePageId);

    return (
      <div className={cn('flex flex-col h-full bg-background-secondary', className)}>
        <style>{`
          .a4-page-content p {
            margin: 0 0 ${paragraphSpacing} 0;
          }
          .a4-page-content p,
          .a4-page-content div,
          .a4-page-content span,
          .a4-page-content li,
          .a4-page-content blockquote,
          .a4-page-content th,
          .a4-page-content td {
            line-height: inherit;
          }
          .a4-page-content h1,
          .a4-page-content h2,
          .a4-page-content h3 {
            font-family: Arial, Helvetica, sans-serif;
            font-weight: 700;
            line-height: inherit;
            margin: 0 0 ${paragraphSpacing} 0;
          }
          .a4-page-content h1 {
            font-size: 24pt;
          }
          .a4-page-content h2 {
            font-size: 18pt;
          }
          .a4-page-content h3 {
            font-size: 14pt;
          }
          .a4-page-content ul {
            list-style-type: disc;
            margin: 0 0 ${paragraphSpacing} 0;
            padding-left: 1.5em;
          }
          .a4-page-content ol {
            list-style-type: decimal;
            margin: 0 0 ${paragraphSpacing} 0;
            padding-left: 1.5em;
          }
          .a4-page-content li {
            display: list-item;
            margin: 0 0 0.25em 0;
          }
          .a4-page-content blockquote {
            margin: 0 0 ${paragraphSpacing} 40px;
            padding: 0;
          }
          .a4-page-content table {
            width: 100%;
            border-collapse: collapse;
            table-layout: fixed;
            margin: 0 0 ${paragraphSpacing} 0;
          }
          .a4-page-content th,
          .a4-page-content td {
            border: 1px solid #9ca3af;
            padding: 6px 8px;
            vertical-align: top;
            min-height: 1.5em;
            word-break: break-word;
          }
          .a4-page-content th {
            background: #f3f4f6;
            font-weight: 700;
          }
          .a4-page-content a {
            color: #1155cc;
            text-decoration: underline;
          }
        `}</style>
        <div className="flex-shrink-0 flex items-center justify-between px-4 py-2 bg-background-elevated border-b border-border-primary">
          <div className="flex items-center gap-3">
            <FileText className="w-4 h-4 text-text-muted" />
            <span className="text-sm font-medium text-text-primary">Document Editor</span>
            <span className="text-xs text-text-muted">
              {displayPages.length} page{displayPages.length !== 1 ? 's' : ''}
            </span>

            {readOnly && (
              <span className="px-2 py-0.5 text-xs font-medium bg-background-tertiary text-text-secondary rounded">
                View Only
              </span>
            )}

            {!readOnly && isPreviewMode && (
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
              className="p-1.5 rounded text-text-secondary hover:bg-background-tertiary disabled:opacity-50"
            >
              <ChevronUp className="w-4 h-4" />
            </button>
            <span className="text-xs font-medium w-12 text-center text-text-secondary">
              {currentPageIdx + 1}/{displayPages.length}
            </span>
            <button
              type="button"
              onClick={() => scrollToPage('down')}
              disabled={currentPageIdx === displayPages.length - 1}
              className="p-1.5 rounded text-text-secondary hover:bg-background-tertiary disabled:opacity-50"
            >
              <ChevronDown className="w-4 h-4" />
            </button>

            <div className="w-px h-5 bg-border-primary mx-1" />

            {!readOnly && !isPreviewMode && (
              <button
                type="button"
                onClick={handleAddPage}
                className="flex items-center gap-1 px-2 py-1.5 rounded text-xs font-medium bg-green-100 text-green-700 hover:bg-green-200"
              >
                <Plus className="w-4 h-4" />
                Add Page
              </button>
            )}

            {!readOnly && (onPreview || (showPreviewToggle && previewContent)) && (
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
              className="flex items-center gap-1 px-2 py-1.5 rounded text-xs font-medium bg-background-tertiary text-text-secondary hover:bg-background-secondary"
            >
              <Printer className="w-4 h-4" />
              Print
            </button>
          </div>
        </div>

        {!readOnly && (
          <Toolbar
            onCommand={handleCommand}
            onSaveSelection={saveCursorPosition}
            lineHeight={lineHeight}
            onLineHeightChange={(value) =>
              updateLayout({ ...effectiveLayout, lineHeight: Number(value) })
            }
            paragraphSpacing={paragraphSpacing}
            onParagraphSpacingChange={(value) =>
              updateLayout({ ...effectiveLayout, paragraphSpacing: value })
            }
            pageMarginMm={pageMarginMm}
            onPageMarginChange={(value) =>
              updateLayout({
                ...effectiveLayout,
                marginsMm: { top: value, right: value, bottom: value, left: value },
              })
            }
            showPageNumbers={showPageNumbers}
            onShowPageNumbersChange={setShowPageNumbers}
            disabled={effectivePreviewMode}
          />
        )}

        <div ref={scrollContainerRef} className="flex-1 overflow-auto py-8">
          <div
            key={surfaceRepairGeneration}
            ref={documentSurfaceRef}
            data-testid="a4-document-surface"
            contentEditable={!effectivePreviewMode}
            suppressContentEditableWarning
            onInput={handleDocumentInput}
            onCompositionEnd={handleDocumentCompositionEnd}
            onKeyDown={handleDocumentKeyDown}
            onPaste={handleDocumentPaste}
            onMouseUp={(event) => {
              if (!effectivePreviewMode) {
                syncActivePage(event.target);
                syncFormattingFromSelection();
              }
            }}
            onKeyUp={(event) => {
              if (!effectivePreviewMode) {
                syncActivePage(event.target);
                syncFormattingFromSelection();
              }
            }}
            onFocus={(event) => {
              if (!effectivePreviewMode) {
                syncActivePage(event.target);
                setTimeout(syncFormattingFromSelection, 0);
              }
            }}
            onBlur={() => !effectivePreviewMode && saveCursorPosition()}
            className={cn(
              'flex flex-col items-center gap-8 outline-none',
              effectivePreviewMode && 'cursor-default',
            )}
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: '2rem',
            }}
          >
            {displayPages.map((page, index) => (
              <Page
                key={page.id}
                page={page}
                pageNumber={index + 1}
                totalPages={displayPages.length}
                isActive={page.id === activePageId}
                isPreviewMode={effectivePreviewMode}
                onDelete={handleDeletePage}
                canDelete={displayPages.length > 1 && !readOnly}
                placeholder={index === 0 ? placeholder : undefined}
                pageLayout={pageLayout}
                lineHeight={lineHeight}
                showPageNumbers={showPageNumbers}
              />
            ))}
          </div>

          {!readOnly && !effectivePreviewMode && (
            <button
              type="button"
              onClick={handleAddPage}
              className="mx-auto mt-8 flex items-center gap-2 px-4 py-3 rounded-lg border-2 border-dashed border-border-primary text-text-muted hover:border-text-muted hover:text-text-secondary transition-colors"
            >
              <Plus className="w-5 h-5" />
              Add New Page
            </button>
          )}
        </div>

        <div className="flex-shrink-0 px-4 py-1.5 bg-background-elevated border-t border-border-primary text-xs text-text-muted flex justify-between">
          <span>
            A4: {A4.WIDTH_PX}Ã—{A4.HEIGHT_PX}px ({A4.MARGIN_MM}mm margins)
          </span>
          <span>
            {readOnly ? 'Viewing document' : (effectivePreviewMode ? 'Viewing preview' : 'Editing')} • What you see = What prints
          </span>
        </div>
      </div>
    );
  },
);

export default A4PageEditor;
