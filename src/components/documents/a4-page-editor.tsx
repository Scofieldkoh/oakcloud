'use client';

import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ClipboardEvent as ReactClipboardEvent,
  type CompositionEvent as ReactCompositionEvent,
  type FormEvent as ReactFormEvent,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
} from 'react';
import DOMPurify from 'dompurify';
import {
  ChevronDown,
  ChevronUp,
  Edit3,
  Eye,
  FileText,
  Loader2,
  Plus,
  Printer,
  SeparatorHorizontal,
  Trash2,
  X,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  deleteFlowSelection,
  ensureEditableCanonicalHtml,
  hardSectionCountFromPages,
  hydrateFlowContainer,
  replaceFlowSelection,
  hydrateFlowHtml,
  normalizeEditedFlowIds,
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
  documentTextOffsetForFlowPoint,
  flowPointAtDocumentTextOffset,
  restoreFlowSelection,
  type FlowSelectionBookmark,
} from './a4-pagination/selection';
import {
  applyBlockAlignmentToSelection,
  applyBlockFormatToSelection,
  applyInlineFormat,
  applyIndentToSelection,
  applyListToSelection,
  applyListStartToSelection,
  applyOutdentToSelection,
  clearInlineFormatting,
  insertTextWithFormat,
  normalizeFormattingSpans,
  readLogicalFormatState,
  readInlineToggleState,
  readUniformFormatState,
  replaceFormattedSelection,
  toggleBoldListMarkersToSelection,
  toggleNestedListSelection,
  type InlineFormatPatch,
} from './a4-pagination/formatting';
import {
  appendHardPage,
  applyLogicalDelete,
  deleteHardPageSection,
  hardSectionIndexForFragment,
  insertTableColumnAtSelection,
  insertTableRowAtSelection,
  insertParagraphAtSelection,
  removeHardPageBreak,
  replaceLogicalSelection,
  getTableColumnResizeTarget,
  resizeTableColumnBoundary,
  TABLE_COLUMN_MIN_WIDTH_PX,
  type TableColumnResizeTarget,
  type DocumentTransactionResult,
} from './a4-pagination/document-actions';
import {
  DEFAULT_A4_DOCUMENT_LAYOUT,
  formatA4LayoutStatus,
  normalizeA4DocumentLayout,
  type A4DocumentLayout,
} from './a4-pagination/layout';
import {
  A4_WIDTH_PX,
  A4_HEIGHT_PX,
  createA4PageLayout,
  type A4PageLayout,
} from './a4-pagination/a4-page-layout';
import { buildA4PageContentStyles } from './a4-pagination/a4-page-content-css';
import { buildA4FontFaceCss } from './a4-pagination/a4-font-faces';
import {
  A4EditorToolbar,
  type EditorCommand,
  type EditorFormatState,
} from './a4-editor-toolbar';
import { buildA4PrintCss, PAGE_NUMBER_STRIP_MM } from './a4-print-styles';
import {
  createCanonicalEditorSession,
  type A4EditorSnapshot,
  type CanonicalEditorIntentKind,
  type CanonicalEditorSession,
  type SnapshotResult,
} from './a4-pagination/editor-session';

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
      'start',
      'align',
      'valign',
      'width',
      'height',
      'data-break-type',
      'data-flow-id',
      'data-flow-continuation',
      'data-flow-continuation-item',
      'data-flow-oversized',
      'data-flow-keep-together',
      'data-template-each',
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

  const container = document.createElement('div');
  container.innerHTML = html
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/&nbsp;/gi, ' ');

  const textContent = (container.textContent ?? '').trim();

  if (textContent.length > 0) {
    return true;
  }

  return /<(img|svg|object|embed|video|audio|canvas|hr|iframe|input|textarea|select)\b/i.test(
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
  /** Stable document identity. W2 should supply the persisted entity/item identity. */
  sessionKey?: string;
  contentJson?: Record<string, unknown>;
  fields?: readonly unknown[];
  onSnapshotChange?: (snapshot: A4EditorSnapshot) => void;
}

export interface A4PageEditorRef {
  insertAtCursor: (text: string) => void;
  insertHtmlAtCursor: (html: string) => void;
  focus: () => void;
  getContent: () => string;
  getSnapshot: () => SnapshotResult;
  prepareSnapshot: () => SnapshotResult;
  setContent: (html: string) => void;
  focusFlowBlock?: (flowId: string) => void;
}

interface PageData {
  id: string;
  content: string;
  hardBreakBefore: boolean;
  oversized?: boolean;
}

interface TableResizeSession {
  table: HTMLTableElement;
  linkedTables: HTMLTableElement[];
  boundaryIndex: number;
  startX: number;
  initialWidths: number[];
  currentWidths: number[];
  previousBodyCursor: string;
  previousBodyUserSelect: string;
  cleanup: () => void;
}

// Shared font styles
const FONT_FAMILY = "'Times New Roman', Times, serif";

function createPageMeasurer(
  pageLayout: A4PageLayout,
  fontFamily: string,
  fontSize: string,
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
    fontFamily,
    fontSize,
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
// Single A4 Page Component
// ============================================================================

interface PageProps {
  page: PageData;
  pageNumber: number;
  isActive: boolean;
  isPreviewMode: boolean;
  pageLayout: A4PageLayout;
  fontFamily: string;
  fontSize: string;
  lineHeight: string;
}

function Page({
  page,
  pageNumber,
  isActive,
  isPreviewMode,
  pageLayout,
  fontFamily,
  fontSize,
  lineHeight,
}: PageProps) {
  const contentRef = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
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
        width: A4_WIDTH_PX,
        height: A4_HEIGHT_PX,
      }}
    >
      <div
        className={cn(
          'bg-white shadow-xl transition-all relative',
          isActive && !isPreviewMode && 'ring-2 ring-blue-500',
          isPreviewMode && 'ring-2 ring-green-500',
        )}
        style={{
          width: A4_WIDTH_PX,
          height: A4_HEIGHT_PX,
          boxShadow: '0 4px 20px rgba(0,0,0,0.15)',
        }}
      >
        <div
          ref={contentRef}
          data-page-id={page.id}
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
            fontFamily,
            fontSize,
            lineHeight,
            color: '#000',
            overflow: page.oversized ? 'auto' : 'hidden',
            overflowWrap: 'break-word',
            wordBreak: 'break-word',
            whiteSpace: 'pre-wrap',
          }}
        />
        {page.oversized ? (
          <div
            role="alert"
            className="absolute inset-x-4 bottom-2 z-20 rounded bg-status-warning/10 px-2 py-1 text-xs text-status-warning"
          >
            This block is taller than the printable A4 area. Split the content or reduce its size.
          </div>
        ) : null}

      </div>
    </div>
  );
}

function PageChrome({
  page,
  pageNumber,
  totalPages,
  isPreviewMode,
  canDelete,
  onDelete,
  onRemoveBreak,
  placeholder,
  pageLayout,
  fontFamily,
  fontSize,
  lineHeight,
  showPageNumbers,
}: {
  page: PageData;
  pageNumber: number;
  totalPages: number;
  isPreviewMode: boolean;
  canDelete: boolean;
  onDelete(id: string): void;
  onRemoveBreak(id: string): void;
  placeholder?: string;
  pageLayout: A4PageLayout;
  fontFamily: string;
  fontSize: string;
  lineHeight: string;
  showPageNumbers: boolean;
}) {
  const isEmpty = !page.content || page.content.replace(/<[^>]*>/g, '').trim() === '';
  return (
    <div className="pointer-events-none relative select-none" style={{ width: A4_WIDTH_PX, height: A4_HEIGHT_PX }}>
      <div className="absolute -top-6 left-1/2 z-10 -translate-x-1/2 rounded-t-md bg-gray-700 px-3 py-1 text-xs text-white">
        Page {pageNumber} of {totalPages}
      </div>
      {page.hardBreakBefore && !isPreviewMode ? (
        <button
          type="button"
          onClick={() => onRemoveBreak(page.id)}
          className="pointer-events-auto absolute left-8 top-[-16px] z-20 flex items-center gap-1 rounded-full border border-border-primary bg-background-elevated px-2 py-0.5 text-[10px] font-medium text-text-muted shadow-sm transition-colors hover:border-status-error hover:text-status-error"
          title="Remove the page break and merge this page with the previous one"
          aria-label={`Remove page break before page ${pageNumber}`}
        >
          <SeparatorHorizontal className="h-3 w-3" aria-hidden="true" />
          Page break
          <X className="h-3 w-3" aria-hidden="true" />
        </button>
      ) : null}
      {canDelete && !isPreviewMode ? (
        <button
          type="button"
          onClick={() => onDelete(page.id)}
          className="pointer-events-auto absolute right-4 top-4 z-10 rounded bg-red-100 p-1.5 text-red-600 transition-colors hover:bg-red-200"
          title="Delete explicit page section"
          aria-label={`Delete explicit page section starting at page ${pageNumber}`}
        >
          <Trash2 className="h-4 w-4" />
        </button>
      ) : null}
      {isEmpty && placeholder && !isPreviewMode ? (
        <div className="absolute text-gray-400" style={{ top: pageLayout.topPx, left: pageLayout.leftPx, fontFamily, fontSize, lineHeight }}>
          {placeholder}
        </div>
      ) : null}
      {showPageNumbers ? (
        <div className="absolute left-1/2 -translate-x-1/2 text-gray-400" data-testid={`a4-page-number-${pageNumber}`} style={{ fontFamily: FONT_FAMILY, fontSize: '10pt', bottom: pageLayout.bottomPx / 2 }}>
          {pageNumber}
        </div>
      ) : null}
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
      sessionKey,
      contentJson,
      fields,
      onSnapshotChange,
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
    const onChangeRef = useRef(onChange);
    const onSnapshotChangeRef = useRef(onSnapshotChange);
    const suppressNextOnChangeRef = useRef(false);
    onChangeRef.current = onChange;
    onSnapshotChangeRef.current = onSnapshotChange;
    const canonicalSessionRef = useRef<
      CanonicalEditorSession<
        FlowSelectionBookmark | null,
        unknown,
        InlineFormatPatch | null,
        A4DocumentLayout
      > | null
    >(null);
    const sessionsRef = useRef(
      new Map<
        string,
        CanonicalEditorSession<
          FlowSelectionBookmark | null,
          unknown,
          InlineFormatPatch | null,
          A4DocumentLayout
        >
      >(),
    );
    const resolvedSessionKey = sessionKey ?? 'legacy-a4-editor';

    const savedSelectionRef = useRef<FlowSelectionBookmark | null>(null);
    const pendingTypingFormatRef = useRef<InlineFormatPatch | null>(null);
    const pendingTypingPointRef = useRef<FlowSelectionBookmark['anchor'] | null>(
      null,
    );
    const applyInsertionTransactionRef = useRef<(html: string) => void>(
      () => undefined,
    );
    const [activeFormats, setActiveFormats] = useState<EditorFormatState>({
      bold: false,
      italic: false,
      underline: false,
      alignment: 'left',
      list: 'none',
      listStart: 1,
      listMarkersBold: false,
      paragraphStyle: 'p',
      fontFamily: DEFAULT_A4_DOCUMENT_LAYOUT.fontFamily,
      fontSize: DEFAULT_A4_DOCUMENT_LAYOUT.fontSize,
      textColor: '#000000',
      highlightColor: '#ffffff',
    });
    const [editorStatus, setEditorStatus] = useState<string | null>(null);

    const saveCursorPosition = useCallback(() => {
      const surface = documentSurfaceRef.current;
      if (surface) {
        savedSelectionRef.current = captureFlowSelection(surface);
        canonicalSessionRef.current?.endTypingGroup();
      }
    }, []);

    const restoreSelection = useCallback(() => {
      const surface = documentSurfaceRef.current;
      const bookmark = savedSelectionRef.current;
      if (!surface || !bookmark) return false;

      if (restoreFlowSelection(surface, bookmark)) {
        savedSelectionRef.current = captureFlowSelection(surface) ?? bookmark;
        setEditorStatus(null);
        return true;
      }

      const firstFlow = surface.querySelector<HTMLElement>('[data-flow-id]');
      const firstEditor = firstFlow?.closest<HTMLElement>(
        '[contenteditable="true"]',
      );
      firstEditor?.focus({ preventScroll: true });
      setEditorStatus(
        'Selection moved after repagination; choose the text again.',
      );
      return false;
    }, []);

    const insertAtCursor = useCallback((text: string) => {
      const wrapper = document.createElement('div');
      wrapper.textContent = text;
      applyInsertionTransactionRef.current(wrapper.innerHTML);
    }, []);

    const insertHtmlAtCursor = useCallback((html: string) => {
      applyInsertionTransactionRef.current(html);
    }, []);

    const parsePages = useCallback(
      (content: string, existingPages?: PageData[]): PageData[] => {
        const hydrated = hydrateFlowHtml(ensureEditableCanonicalHtml(content));
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
      const session = canonicalSessionRef.current;
      if (session) return session.getState().internalHtml;
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
    const renderedPagesRef = useRef<PageData[]>(pages);
    renderedPagesRef.current = pages;
    const reflowFrameRef = useRef<number | null>(null);
    const reflowGenerationRef = useRef(0);
    const [isReflowing, setIsReflowing] = useState(false);
    const pendingScrollTopRef = useRef<number | null>(null);
    const pendingViewPageIdRef = useRef<string | null>(null);
    const pendingSelectionFlowIdRef = useRef<string | null>(null);
    const pendingUpdateRef = useRef(false);
    const pendingFlowSelectionRef = useRef<FlowSelectionBookmark | null>(null);
    const compositionTargetRef = useRef<FlowSelectionBookmark | null>(null);
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
    const fontFamily = effectiveLayout.fontFamily;
    const fontSize = effectiveLayout.fontSize;
    const updateLayout = useCallback(
      (next: A4DocumentLayout) => {
        const normalized = normalizeA4DocumentLayout(next);
        const session = canonicalSessionRef.current;
        if (session) {
          const state = session.getState();
          if (JSON.stringify(state.metadata) !== JSON.stringify(normalized)) {
            session.dispatch({
              sessionKey: state.sessionKey,
              baseRevision: state.revision,
              intent: {
                kind: 'layout',
                origin: 'programmatic',
                history: 'separate',
                affectsLayout: true,
              },
              selection: state.selection,
              apply: () => ({
                status: 'applied',
                internalHtml: state.internalHtml,
                selection: state.selection,
                metadata: normalized,
                contentJson: {
                  ...state.contentJson,
                  editorLayout: normalized,
                },
              }),
            });
          }
        }
        if (layout === undefined) setInternalLayout(normalized);
        onLayoutChange?.(normalized);
      },
      [layout, onLayoutChange],
    );
    const [showPageNumbers, setShowPageNumbers] = useState(true);
    const [surfaceRepairGeneration, setSurfaceRepairGeneration] = useState(0);
    const tableResizeRef = useRef<TableResizeSession | null>(null);
    const tableResizeHoverRef = useRef<{
      cell: HTMLTableCellElement;
      className: string;
      previousCursor: string;
    } | null>(null);
    const pageLayout = useMemo(
      () => createA4PageLayout(effectiveLayout.marginsMm),
      [effectiveLayout.marginsMm],
    );

    const preserveScrollPosition = useCallback(() => {
      if (scrollContainerRef.current) {
        pendingScrollTopRef.current = scrollContainerRef.current.scrollTop;
      }
      pendingViewPageIdRef.current = activePageIdRef.current;
    }, []);

    const scheduleReflow = useCallback(
      (sourcePages: PageData[], emitChange: boolean) => {
        const renderedPages = renderedPagesRef.current;
        const session = canonicalSessionRef.current;
        const projectionRevision = session?.createProjectionRevision() ?? null;
        const canonical =
          session?.getState().internalHtml ??
          reassemblePageFragments(
            sourcePages.map((page) => ({
              content: page.content,
              hardBreakBefore: page.hardBreakBefore,
              oversized: page.oversized,
            })),
          );
        pagesRef.current = sourcePages;
        reflowGenerationRef.current += 1;
        const generation = reflowGenerationRef.current;

        if (reflowFrameRef.current !== null) {
          cancelAnimationFrame(reflowFrameRef.current);
          reflowFrameRef.current = null;
        }

        setIsReflowing(true);

        reflowFrameRef.current = requestAnimationFrame(() => {
          if (generation !== reflowGenerationRef.current) return;

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

            const measurer = createPageMeasurer(
              pageLayout,
              fontFamily,
              fontSize,
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
              if (session && canonicalSessionRef.current !== session) {
                return;
              }
              if (
                session &&
                projectionRevision &&
                !session.publishProjection(projectionRevision)
              ) {
                return;
              }

              const nextPages = fragments.map((fragment, index) => ({
                id:
                  renderedPages[index]?.id ||
                  pagesRef.current[index]?.id ||
                  crypto.randomUUID(),
                content: sanitizeHtml(fragment.content),
                hardBreakBefore: fragment.hardBreakBefore,
                oversized: fragment.oversized,
              }));
              pagesRef.current = nextPages;
              if (!session) {
                lastValueRef.current = serializePages(nextPages);
                pendingUpdateRef.current = emitChange;
              }
              setPages(nextPages);
            } finally {
              measurer.dispose();
              if (generation === reflowGenerationRef.current) {
                reflowFrameRef.current = null;
                setIsReflowing(false);
              }
            }
          });
        });
      },
      [fontFamily, fontSize, lineHeight, pageLayout, paragraphSpacing, serializePages],
    );

    useEffect(() => {
      const canonicalValue = sanitizeHtml(
        stripFlowMetadata(hydrateFlowHtml(ensureEditableCanonicalHtml(value))),
      );
      let session = sessionsRef.current.get(resolvedSessionKey) ?? null;
      if (!session) {
        const initialHtml = hydrateFlowHtml(ensureEditableCanonicalHtml(value));
        session = createCanonicalEditorSession({
          sessionKey: resolvedSessionKey,
          internalHtml: initialHtml,
          selection: null,
          typingMarks: null,
          contentJson: contentJson ?? {},
          fields,
          metadata: effectiveLayout,
          serializeContent: (internalHtml) =>
            sanitizeHtml(stripFlowMetadata(internalHtml)),
          onSnapshotChange: (snapshot) => {
            const contentChanged = snapshot.content !== lastValueRef.current;
            const suppressOnChange = suppressNextOnChangeRef.current;
            suppressNextOnChangeRef.current = false;
            lastValueRef.current = snapshot.content;
            onSnapshotChangeRef.current?.(snapshot);
            if (contentChanged && !suppressOnChange) {
              isInternalUpdate.current = true;
              onChangeRef.current?.(snapshot.content);
            }
          },
        });
        sessionsRef.current.set(resolvedSessionKey, session);
      } else {
        const current = session.getSnapshot();
        const currentContent = current.ok ? current.snapshot.content : null;
        const controlledEcho = canonicalValue === lastValueRef.current;
        if (!controlledEcho && currentContent !== canonicalValue) {
          suppressNextOnChangeRef.current = true;
          session.replaceExternalState({
            internalHtml: hydrateFlowHtml(ensureEditableCanonicalHtml(value)),
            selection: null,
            contentJson: contentJson ?? session.getState().contentJson,
            fields: fields ?? session.getState().fields,
            metadata: effectiveLayout,
            resetHistory: true,
            acknowledged: true,
          });
        }
      }
      canonicalSessionRef.current = session;
      lastValueRef.current = canonicalValue;
      const nextPages = parsePages(session.getState().internalHtml, pagesRef.current);
      pagesRef.current = nextPages;
      setPages(nextPages);
      scheduleReflow(nextPages, false);
    }, [
      contentJson,
      effectiveLayout,
      fields,
      parsePages,
      resolvedSessionKey,
      scheduleReflow,
      value,
    ]);

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

      const targetFlowElement = Array.from(
        root.querySelectorAll<HTMLElement>('[data-flow-id]'),
      ).find(
        (element) => element.dataset.flowId === bookmark.anchor.flowId,
      );
      const targetEditor = targetFlowElement?.closest(
        '[contenteditable="true"]',
      ) as HTMLDivElement | null;
      targetEditor?.focus({ preventScroll: true });
      const pageElement = targetFlowElement?.closest<HTMLElement>(
        '[data-page-id]',
      ) ?? null;
      pendingSelectionFlowIdRef.current = bookmark.anchor.flowId;

      if (restoreFlowSelection(root, bookmark)) {
        savedSelectionRef.current = captureFlowSelection(root) ?? bookmark;
        setEditorStatus(null);
        if (pageElement?.dataset.pageId) {
          setActivePageId(pageElement.dataset.pageId);
        }
      }
      pendingFlowSelectionRef.current = null;
    }, [pages, surfaceRepairGeneration]);

    useEffect(() => {
      if (isReflowing) return;
      const scrollTop = pendingScrollTopRef.current;
      if (scrollTop === null || !scrollContainerRef.current) return;

      const root = documentSurfaceRef.current;
      const flowId = pendingSelectionFlowIdRef.current;
      const pageElement =
        flowId && root
          ? (Array.from(
              root.querySelectorAll<HTMLElement>('[data-flow-id]'),
            ).find((element) => element.dataset.flowId === flowId)
              ?.closest<HTMLElement>('[data-page-id]') ?? null)
          : null;
      const selectionPageId = pageElement?.dataset.pageId ?? null;
      const viewPageId = pendingViewPageIdRef.current;
      if (selectionPageId && viewPageId && selectionPageId !== viewPageId) {
        if (typeof pageElement?.scrollIntoView === 'function') {
          pageElement.scrollIntoView({ behavior: 'auto', block: 'start' });
        }
      } else {
        scrollContainerRef.current.scrollTop = scrollTop;
      }
      pendingScrollTopRef.current = null;
      pendingViewPageIdRef.current = null;
      pendingSelectionFlowIdRef.current = null;
    }, [isReflowing, pages, surfaceRepairGeneration]);

    // Expose methods via ref
    useImperativeHandle(
      ref,
      () => ({
        insertAtCursor,
        insertHtmlAtCursor,
        focus: () => documentSurfaceRef.current?.focus(),
        focusFlowBlock: (flowId: string) => {
          const root = documentSurfaceRef.current;
          const target = Array.from(root?.querySelectorAll<HTMLElement>('[data-flow-id]') ?? []).find(
            (element) => element.dataset.flowId === flowId,
          );
          if (!root || !target) return;
          root.focus({ preventScroll: true });
          target.scrollIntoView?.({ behavior: 'smooth', block: 'center' });
          const pageElement = target.closest('[data-page-id]') as HTMLElement | null;
          if (pageElement?.dataset.pageId) setActivePageId(pageElement.dataset.pageId);
        },
        getContent: () => {
          const snapshot = canonicalSessionRef.current?.getSnapshot();
          return snapshot?.ok ? snapshot.snapshot.content : lastValueRef.current ?? '';
        },
        getSnapshot: () =>
          canonicalSessionRef.current?.getSnapshot() ?? {
            ok: false,
            reason: 'unreconciled-input',
            message: 'The canonical editor session is not ready.',
          },
        prepareSnapshot: () =>
          canonicalSessionRef.current?.prepareSnapshot() ?? {
            ok: false,
            reason: 'unreconciled-input',
            message: 'The canonical editor session is not ready.',
          },
        setContent: (html: string) => {
          const session = canonicalSessionRef.current;
          const canonical = hydrateFlowHtml(ensureEditableCanonicalHtml(html));
          if (session) {
            suppressNextOnChangeRef.current = true;
            session.replaceExternalState({
              internalHtml: canonical,
              selection: null,
              resetHistory: true,
              acknowledged: true,
            });
          }
          const newPages = parsePages(canonical, pagesRef.current);
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
          fontFamily,
          fontSize,
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
    }, [fontFamily, fontSize, lineHeight, pageLayout, paragraphSpacing, parsePages, previewContent]);

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

    const hardSectionCount = useMemo(
      () => hardSectionCountFromPages(pages),
      [pages],
    );

    useEffect(() => {
      if (displayPages.length === 0) return;
      const currentIdx = displayPages.findIndex((p) => p.id === activePageId);
      if (currentIdx === -1) {
        setActivePageId(displayPages[0].id);
      }
    }, [displayPages, activePageId]);


    const pushHistorySnapshot = useCallback((_pageList: PageData[]) => undefined, []);

    useEffect(() => {
      if (pendingUpdateRef.current && onChange && !canonicalSessionRef.current) {
        pendingUpdateRef.current = false;
        const html = serializePages(pages);
        isInternalUpdate.current = true;
        lastValueRef.current = html;
        onChange(html);
      }
    }, [pages, onChange, serializePages]);

    const restoreCanonicalHistoryResult = useCallback(
      (direction: 'undo' | 'redo') => {
        if (effectivePreviewMode) return;
        const session = canonicalSessionRef.current;
        if (!session) return;
        const result = direction === 'undo' ? session.undo() : session.redo();
        if (result.status !== 'applied') return;
        const restoredState = session.getState();
        const restoredLayout = normalizeA4DocumentLayout(restoredState.metadata);
        if (JSON.stringify(restoredLayout) !== JSON.stringify(effectiveLayout)) {
          if (layout === undefined) setInternalLayout(restoredLayout);
          onLayoutChange?.(restoredLayout);
        }
        pendingFlowSelectionRef.current = result.selection;
        const nextPages = parsePages(restoredState.internalHtml, pagesRef.current);
        pagesRef.current = nextPages;
        setPages(nextPages);
        scheduleReflow(nextPages, false);
      },
      [
        effectiveLayout,
        effectivePreviewMode,
        layout,
        onLayoutChange,
        parsePages,
        scheduleReflow,
      ],
    );

    const handleUndo = useCallback(
      () => restoreCanonicalHistoryResult('undo'),
      [restoreCanonicalHistoryResult],
    );
    const handleRedo = useCallback(
      () => restoreCanonicalHistoryResult('redo'),
      [restoreCanonicalHistoryResult],
    );

    const commitDocumentSurface = useCallback(() => {
      const surface = documentSurfaceRef.current;
      const session = canonicalSessionRef.current;
      if (effectivePreviewMode || !surface || !session) return;
      const state = session.getState();
      if (session.getRenderedProjection().documentRevision !== state.revision) {
        setSurfaceRepairGeneration((generation) => generation + 1);
        setPages(parsePages(state.internalHtml, pagesRef.current));
        return;
      }

      const currentPages = pagesRef.current;
      const metadataByPageId = new Map(currentPages.map((page) => [page.id, page]));
      const renderedPageElements = Array.from(
        surface.querySelectorAll<HTMLElement>(
          '[data-testid^="a4-page-content-"][data-page-id]',
        ),
      );
      renderedPageElements.forEach(normalizeEditedFlowIds);
      normalizeFormattingSpans(surface);
      const bookmark = captureFlowSelection(surface) ?? state.selection;
      const renderedPages = renderedPageElements.flatMap((element) => {
        const page = metadataByPageId.get(element.dataset.pageId!);
        if (!page) return [];
        return [{
          ...page,
          content: sanitizeHtml(replaceTypedPageBreaks(element.innerHTML)),
        }];
      });
      if (renderedPages.length !== currentPages.length) {
        setSurfaceRepairGeneration((generation) => generation + 1);
        setPages(parsePages(state.internalHtml, currentPages));
        return;
      }
      const candidate = hydrateFlowHtml(
        ensureEditableCanonicalHtml(
          reassemblePageFragments(
            renderedPages.map((page) => ({
              content: page.content,
              hardBreakBefore: page.hardBreakBefore,
              oversized: page.oversized,
            })),
          ),
        ),
      );
      if (candidate === state.internalHtml) return;
      preserveScrollPosition();
      const result = session.dispatch({
        sessionKey: state.sessionKey,
        baseRevision: state.revision,
        intent: { kind: 'native-reconcile', origin: 'pointer', history: 'separate' },
        selection: bookmark,
        apply: () => ({
          status: 'applied',
          internalHtml: candidate,
          selection: bookmark,
        }),
      });
      if (result.status !== 'applied') return;
      pendingFlowSelectionRef.current = result.selection;
      const nextPages = parsePages(session.getState().internalHtml, currentPages);
      pagesRef.current = nextPages;
      setPages(nextPages);
      scheduleReflow(nextPages, false);
    }, [effectivePreviewMode, parsePages, preserveScrollPosition, scheduleReflow]);

    const clearTableResizeHover = useCallback(() => {
      const previous = tableResizeHoverRef.current;
      if (!previous) return;
      previous.cell.classList.remove(previous.className);
      previous.cell.style.cursor = previous.previousCursor;
      tableResizeHoverRef.current = null;
    }, []);

    const setTableResizeHover = useCallback(
      (target: TableColumnResizeTarget | null) => {
        const previous = tableResizeHoverRef.current;
        if (previous?.cell === target?.cell) return;

        clearTableResizeHover();
        if (!target) return;

        const className = `a4-table-resize-target-${target.edge}`;
        tableResizeHoverRef.current = {
          cell: target.cell,
          className,
          previousCursor: target.cell.style.cursor,
        };
        target.cell.classList.add(className);
        target.cell.style.cursor = 'col-resize';
      },
      [clearTableResizeHover],
    );

    const finishTableResize = useCallback(
      (commit: boolean) => {
        const session = tableResizeRef.current;
        if (!session) {
          clearTableResizeHover();
          return;
        }

        session.cleanup();
        tableResizeRef.current = null;
        if (!commit) {
          session.linkedTables.forEach((table) => {
            resizeTableColumnBoundary(
              table,
              session.boundaryIndex,
              session.initialWidths,
            );
          });
        }
        document.body.style.cursor = session.previousBodyCursor;
        document.body.style.userSelect = session.previousBodyUserSelect;
        clearTableResizeHover();

        const changed = session.currentWidths.some(
          (width, index) => width !== session.initialWidths[index],
        );
        if (commit && changed) commitDocumentSurface();
        setEditorStatus(null);
      },
      [clearTableResizeHover, commitDocumentSurface],
    );

    const handleTableResizePointerDown = useCallback(
      (event: ReactPointerEvent<HTMLDivElement>) => {
        if (effectivePreviewMode || tableResizeRef.current) return;

        const target = getTableColumnResizeTarget(
          documentSurfaceRef.current ?? event.currentTarget,
          event.target,
          event.clientX,
        );
        if (!target) return;

        event.preventDefault();
        event.stopPropagation();
        setTableResizeHover(target);

        const previousBodyCursor = document.body.style.cursor;
        const previousBodyUserSelect = document.body.style.userSelect;
        document.body.style.cursor = 'col-resize';
        document.body.style.userSelect = 'none';

        const initialWidths = [...target.columnWidths];
        const linkedTables = Array.from(
          (documentSurfaceRef.current ?? event.currentTarget).querySelectorAll<HTMLTableElement>('table'),
        ).filter(
          (table) =>
            table === target.table ||
            (target.table.dataset.flowId &&
              table.dataset.flowId === target.table.dataset.flowId),
        );
        const onMove = (moveEvent: globalThis.PointerEvent) => {
          const session = tableResizeRef.current;
          if (!session) return;

          moveEvent.preventDefault();
          const leftIndex = session.boundaryIndex - 1;
          const rightIndex = session.boundaryIndex;
          const pairWidth =
            session.initialWidths[leftIndex] + session.initialWidths[rightIndex];
          const minimumWidth = Math.min(TABLE_COLUMN_MIN_WIDTH_PX, pairWidth / 2);
          const nextLeftWidth = Math.min(
            pairWidth - minimumWidth,
            Math.max(
              minimumWidth,
              session.initialWidths[leftIndex] +
                (moveEvent.clientX - session.startX),
            ),
          );
          const nextWidths = [...session.initialWidths];
          nextWidths[leftIndex] = nextLeftWidth;
          nextWidths[rightIndex] = pairWidth - nextLeftWidth;
          session.linkedTables.forEach((table) => {
            resizeTableColumnBoundary(
              table,
              session.boundaryIndex,
              nextWidths,
            );
          });
          session.currentWidths = nextWidths;
        };
        const onUp = () => finishTableResize(true);
        const cleanup = () => {
          window.removeEventListener('pointermove', onMove);
          window.removeEventListener('pointerup', onUp);
          window.removeEventListener('pointercancel', onUp);
        };

        tableResizeRef.current = {
          table: target.table,
          linkedTables,
          boundaryIndex: target.boundaryIndex,
          startX: event.clientX,
          initialWidths,
          currentWidths: initialWidths,
          previousBodyCursor,
          previousBodyUserSelect,
          cleanup,
        };
        window.addEventListener('pointermove', onMove);
        window.addEventListener('pointerup', onUp);
        window.addEventListener('pointercancel', onUp);
        setEditorStatus('Drag to adjust the table column width.');
      },
      [effectivePreviewMode, finishTableResize, setTableResizeHover],
    );

    useEffect(
      () => () => finishTableResize(false),
      [finishTableResize],
    );

    const handleTableResizePointerMove = useCallback(
      (event: ReactPointerEvent<HTMLDivElement>) => {
        if (effectivePreviewMode || tableResizeRef.current) return;
        const surface = documentSurfaceRef.current ?? event.currentTarget;
        setTableResizeHover(
          getTableColumnResizeTarget(surface, event.target, event.clientX),
        );
      },
      [effectivePreviewMode, setTableResizeHover],
    );

    const commitUserTransaction = useCallback(
      (
        result: DocumentTransactionResult,
        intentKind: CanonicalEditorIntentKind = 'structural',
      ) => {
        const session = canonicalSessionRef.current;
        if (effectivePreviewMode || !result.changed || !session) return;
        const state = session.getState();
        const selection = result.selection ?? state.selection;
        const canonical = hydrateFlowHtml(ensureEditableCanonicalHtml(result.html));
        preserveScrollPosition();
        const committed = session.dispatch({
          sessionKey: state.sessionKey,
          baseRevision: state.revision,
          intent: {
            kind: intentKind,
            origin: 'keyboard',
            history: intentKind === 'insert-text' ? 'typing' : 'separate',
          },
          selection,
          apply: () => ({
            status: 'applied',
            internalHtml: canonical,
            selection,
          }),
        });
        if (committed.status !== 'applied') return;
        pendingFlowSelectionRef.current = committed.selection;
        const nextPages = parsePages(session.getState().internalHtml, pagesRef.current);
        pagesRef.current = nextPages;
        setPages(nextPages);
        scheduleReflow(nextPages, false);
      },
      [effectivePreviewMode, parsePages, preserveScrollPosition, scheduleReflow],
    );

    const applyInsertionTransaction = useCallback(
      (html: string) => {
        const surface = documentSurfaceRef.current;
        if (!surface || effectivePreviewMode) return;
        const bookmark =
          savedSelectionRef.current ?? captureFlowSelection(surface);
        if (!bookmark) {
          setEditorStatus(
            'Selection moved after repagination; choose the text again.',
          );
          return;
        }
        surface.focus();
        const result = replaceLogicalSelection(
          canonicalPagesHtml(pagesRef.current),
          bookmark,
          html,
        );
        if (!result.changed) {
          setEditorStatus(
            'Selection moved after repagination; choose the text again.',
          );
          return;
        }
        pendingTypingFormatRef.current = null;
        pendingTypingPointRef.current = null;
        commitUserTransaction(result);
        savedSelectionRef.current = result.selection;
      },
      [canonicalPagesHtml, commitUserTransaction, effectivePreviewMode],
    );

    useEffect(() => {
      applyInsertionTransactionRef.current = applyInsertionTransaction;
    }, [applyInsertionTransaction]);

    const handleAddPage = useCallback(() => {
      if (effectivePreviewMode) return;
      commitUserTransaction(appendHardPage(canonicalPagesHtml(pagesRef.current)));
    }, [canonicalPagesHtml, commitUserTransaction, effectivePreviewMode]);

    const handleDeletePage = useCallback(
      (id: string) => {
        if (effectivePreviewMode) return;
        const currentPages = pagesRef.current;
        const pageIndex = currentPages.findIndex((page) => page.id === id);
        if (pageIndex < 0) return;
        const sectionIndex = hardSectionIndexForFragment(currentPages, pageIndex);
        if (sectionIndex === null) return;
        commitUserTransaction(
          deleteHardPageSection(
            canonicalPagesHtml(currentPages),
            sectionIndex,
          ),
        );
      },
      [canonicalPagesHtml, commitUserTransaction, effectivePreviewMode],
    );

    const handleRemovePageBreak = useCallback(
      (id: string) => {
        if (effectivePreviewMode) return;
        const currentPages = pagesRef.current;
        const pageIndex = currentPages.findIndex((page) => page.id === id);
        if (pageIndex < 0) return;
        const sectionIndex = hardSectionIndexForFragment(currentPages, pageIndex);
        if (sectionIndex === null || sectionIndex < 1) return;
        commitUserTransaction(
          removeHardPageBreak(
            canonicalPagesHtml(currentPages),
            sectionIndex,
          ),
        );
      },
      [canonicalPagesHtml, commitUserTransaction, effectivePreviewMode],
    );

    const pendingFocusStartPageId = useRef<string | null>(null);

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
      const surface = documentSurfaceRef.current;
      if (!surface) return;
      const bookmark = captureFlowSelection(surface);
      if (!bookmark) return;
      if (bookmark.collapsed && pendingTypingFormatRef.current) {
        const pendingPoint = pendingTypingPointRef.current;
        if (
          !pendingPoint ||
          pendingPoint.flowId !== bookmark.anchor.flowId ||
          pendingPoint.offset !== bookmark.anchor.offset
        ) {
          pendingTypingFormatRef.current = null;
          pendingTypingPointRef.current = null;
        }
      }
      savedSelectionRef.current = bookmark;
      setActiveFormats(
        readLogicalFormatState(surface, bookmark, effectiveLayout),
      );
    }, [effectiveLayout]);

    const handleDeleteAcrossPages = useCallback(() => {
      if (effectivePreviewMode || !documentSurfaceRef.current) return;
      const session = canonicalSessionRef.current;
      if (!session) return;
      const rendered = captureFlowSelection(documentSurfaceRef.current);
      if (!rendered || rendered.collapsed) return;
      const target = session.resolveNativeInputTarget({
        renderedRevision: session.getRenderedProjection().documentRevision,
        origin: 'keyboard',
        renderedSelection: rendered,
      });
      if (!target.ok || !target.selection || target.selection.collapsed) return;
      const collapsePoint = selectionStartPoint(target.selection);
      const canonical = session.getState().internalHtml;
      const deleted = deleteFlowSelection(canonical, target.selection);
      commitUserTransaction(
        {
          html: deleted,
          selection: {
            anchor: collapsePoint,
            focus: collapsePoint,
            collapsed: true,
          },
          changed: deleted !== canonical,
        },
        'delete-backward',
      );
    }, [commitUserTransaction, effectivePreviewMode]);

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
        const session = canonicalSessionRef.current;
        if (!session) return;
        const rendered =
          transaction?.bookmark ?? captureFlowSelection(documentSurfaceRef.current);
        if (!rendered) return;
        const target = transaction
          ? { ok: true as const, selection: rendered }
          : session.resolveNativeInputTarget({
              renderedRevision: session.getRenderedProjection().documentRevision,
              origin: 'keyboard',
              renderedSelection: rendered,
            });
        if (!target.ok || !target.selection) return;
        const result = replaceLogicalSelection(
          session.getState().internalHtml,
          target.selection,
          html,
        );
        commitUserTransaction(result, 'insert-text');
        if (transaction?.repairSurface) {
          setSurfaceRepairGeneration((generation) => generation + 1);
        }
      },
      [commitUserTransaction, effectivePreviewMode],
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
        const session = canonicalSessionRef.current;
        if (!pending || !session) return false;
        pendingNonCancelableMutationRef.current = null;
        const inputType = followup?.inputType || pending.inputType;
        const inputData = followup?.data ?? pending.data;
        if (pending.repairOnly || !pending.bookmark) {
          const nextPages = parsePages(
            session.getState().internalHtml,
            pagesRef.current,
          );
          const focusPageId = pending.targetPageId ?? nextPages[0]?.id ?? null;
          if (focusPageId) pendingFocusStartPageId.current = focusPageId;
          pagesRef.current = nextPages;
          setPages(nextPages);
          setSurfaceRepairGeneration((generation) => generation + 1);
          return true;
        }
        if (inputType.startsWith('delete')) {
          const direction = inputType.toLowerCase().includes('forward')
            ? 'forward'
            : 'backward';
          commitUserTransaction(
            applyLogicalDelete(
              session.getState().internalHtml,
              pending.bookmark,
              direction,
            ),
            direction === 'forward' ? 'delete-forward' : 'delete-backward',
          );
          setSurfaceRepairGeneration((generation) => generation + 1);
          return true;
        }
        if (typeof inputData === 'string') {
          const replacement = document.createElement('div');
          replacement.textContent = inputData;
          const result = replaceLogicalSelection(
            session.getState().internalHtml,
            pending.bookmark,
            replacement.innerHTML,
          );
          commitUserTransaction(result, 'insert-text');
          setSurfaceRepairGeneration((generation) => generation + 1);
          return true;
        }
        session.markUnreconciledInput(
          'A native edit could not be reconciled safely. Review the affected text before saving.',
        );
        setSurfaceRepairGeneration((generation) => generation + 1);
        return true;
      },
      [commitUserTransaction, parsePages],
    );

    const handleDocumentInput = useCallback(
      (event: ReactFormEvent<HTMLDivElement>) => {
        const inputEvent = event.nativeEvent as InputEvent;
        const session = canonicalSessionRef.current;
        if (
          repairPendingNonCancelableMutation({
            inputType: inputEvent.inputType,
            data: inputEvent.data,
          })
        ) {
          return;
        }
        if (inputEvent.isComposing) {
          session?.updateCompositionDom(event.currentTarget.innerHTML);
          return;
        }
        if (session) {
          const nextPages = parsePages(session.getState().internalHtml, pagesRef.current);
          pagesRef.current = nextPages;
          setPages(nextPages);
          setSurfaceRepairGeneration((generation) => generation + 1);
          return;
        }
        commitDocumentSurface();
      },
      [commitDocumentSurface, parsePages, repairPendingNonCancelableMutation],
    );

    const handleDocumentCompositionStart = useCallback(
      (event: ReactCompositionEvent<HTMLDivElement>) => {
        const session = canonicalSessionRef.current;
        const surface = documentSurfaceRef.current;
        if (!session || !surface) return;
        const rendered = captureFlowSelection(surface);
        if (!rendered) return;
        const target = session.beginComposition({
          renderedRevision: session.getRenderedProjection().documentRevision,
          renderedSelection: rendered,
          affectedNodeIds: [rendered.anchor.flowId, rendered.focus.flowId],
        });
        compositionTargetRef.current = target.ok ? target.selection : null;
      },
      [],
    );

    const handleDocumentCompositionEnd = useCallback(
      (event: ReactCompositionEvent<HTMLDivElement>) => {
        const session = canonicalSessionRef.current;
        const target = compositionTargetRef.current;
        compositionTargetRef.current = null;
        if (!session || !target) return;
        const replacement = document.createElement('div');
        replacement.textContent = event.data;
        const result = replaceLogicalSelection(
          session.getState().internalHtml,
          target,
          replacement.innerHTML,
        );
        if (!result.changed || !result.selection) {
          session.markUnreconciledInput(
            'Text composition could not be reconciled with the canonical range.',
          );
          return;
        }
        const committed = session.finishComposition({
          internalHtml: hydrateFlowHtml(ensureEditableCanonicalHtml(result.html)),
          selection: result.selection,
        });
        if (committed.status !== 'applied') return;
        pendingFlowSelectionRef.current = result.selection;
        const nextPages = parsePages(session.getState().internalHtml, pagesRef.current);
        pagesRef.current = nextPages;
        setPages(nextPages);
        setSurfaceRepairGeneration((generation) => generation + 1);
        scheduleReflow(nextPages, false);
      },
      [parsePages, scheduleReflow],
    );

    const handleDocumentPaste = useCallback(
      (event: ReactClipboardEvent<HTMLDivElement>) => {
        if (effectivePreviewMode) return;
        event.preventDefault();

        const surface = documentSurfaceRef.current;
        if (!surface || !selectionIsWithinPageContents(surface)) return;

        const html = clipboardHtml(event.clipboardData);
        if (!html) return;

        const bookmark = captureFlowSelection(surface);
        if (!bookmark) return;
        const pendingFormat = pendingTypingFormatRef.current;
        const result = pendingFormat
          ? replaceFormattedSelection(
              canonicalPagesHtml(pagesRef.current),
              bookmark,
              html,
              pendingFormat,
            )
          : replaceLogicalSelection(
              canonicalPagesHtml(pagesRef.current),
              bookmark,
              html,
            );
        if (result.changed && result.selection) {
          pendingTypingPointRef.current = result.selection.anchor;
        }
        commitUserTransaction(result, 'paste');
      },
      [canonicalPagesHtml, commitUserTransaction, effectivePreviewMode],
    );

    const handleDocumentCut = useCallback(
      (event: ReactClipboardEvent<HTMLDivElement>) => {
        if (effectivePreviewMode) return;
        const surface = documentSurfaceRef.current;
        const session = canonicalSessionRef.current;
        if (!surface || !session) return;
        const rendered = captureFlowSelection(surface);
        if (!rendered || rendered.collapsed) return;
        const target = session.resolveNativeInputTarget({
          renderedRevision: session.getRenderedProjection().documentRevision,
          origin: 'keyboard',
          renderedSelection: rendered,
        });
        if (!target.ok || !target.selection || target.selection.collapsed) return;
        event.preventDefault();
        const selection = window.getSelection();
        const text = selection?.toString() ?? '';
        event.clipboardData.setData('text/plain', text);
        const collapsePoint = selectionStartPoint(target.selection);
        const canonical = session.getState().internalHtml;
        const deleted = deleteFlowSelection(canonical, target.selection);
        commitUserTransaction(
          {
            html: deleted,
            selection: {
              anchor: collapsePoint,
              focus: collapsePoint,
              collapsed: true,
            },
            changed: deleted !== canonical,
          },
          'cut',
        );
      },
      [commitUserTransaction, effectivePreviewMode],
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
          const session = canonicalSessionRef.current;
          const bookmark = captureFlowSelection(surface);
          if (session && bookmark) {
            event.preventDefault();
            const target = session.resolveNativeInputTarget({
              renderedRevision: session.getRenderedProjection().documentRevision,
              origin: 'keyboard',
              renderedSelection: bookmark,
            });
            if (!target.ok || !target.selection) {
              const nextPages = parsePages(
                session.getState().internalHtml,
                pagesRef.current,
              );
              pagesRef.current = nextPages;
              setPages(nextPages);
              setSurfaceRepairGeneration((generation) => generation + 1);
              return;
            }
            commitUserTransaction(
              applyLogicalDelete(
                session.getState().internalHtml,
                target.selection,
                'forward',
              ),
              'delete-forward',
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
          surface &&
          event.key === 'Backspace' &&
          pageContent &&
          isCaretAtEditorStart(pageContent)
        ) {
          event.preventDefault();
          const session = canonicalSessionRef.current;
          const bookmark = captureFlowSelection(surface);
          if (!session || !bookmark) {
            if (session) {
              const nextPages = parsePages(
                session.getState().internalHtml,
                pagesRef.current,
              );
              pagesRef.current = nextPages;
              setPages(nextPages);
              setSurfaceRepairGeneration((generation) => generation + 1);
            }
            return;
          }
          const target = session.resolveNativeInputTarget({
            renderedRevision: session.getRenderedProjection().documentRevision,
            origin: 'keyboard',
            renderedSelection: bookmark,
          });
          if (!target.ok || !target.selection) {
            const nextPages = parsePages(
              session.getState().internalHtml,
              pagesRef.current,
            );
            pagesRef.current = nextPages;
            setPages(nextPages);
            setSurfaceRepairGeneration((generation) => generation + 1);
            return;
          }
          commitUserTransaction(
            applyLogicalDelete(
              session.getState().internalHtml,
              target.selection,
              'backward',
            ),
            'delete-backward',
          );
        }
      },
      [
        effectivePreviewMode,
        canonicalPagesHtml,
        commitUserTransaction,
        handleDeleteAcrossPages,
        handleRedo,
        handleUndo,
        selectAllDocument,
        syncActivePage,
        parsePages,
      ],
    );

    const handleBeforeInput = useCallback(
      (inputEvent: InputEvent) => {
        if (effectivePreviewMode) return;
        const surface = documentSurfaceRef.current;
        const session = canonicalSessionRef.current;
        if (!surface || !session) return;
        const rendered = captureFlowSelection(surface);
        if (!rendered) {
          if (inputEvent.cancelable) {
            inputEvent.preventDefault();
            return;
          }
          const state = session.getState();
          pendingNonCancelableMutationRef.current = {
            pages: pagesRef.current,
            canonical: state.internalHtml,
            bookmark: null,
            collapsePoint: null,
            targetPageId:
              pageContentFromTarget(
                surface,
                window.getSelection()?.focusNode ?? null,
              )?.dataset.pageId ?? activePageIdRef.current ?? null,
            inputType: inputEvent.inputType,
            data: inputEvent.data,
            repairOnly: true,
          };
          return;
        }
        const target = session.resolveNativeInputTarget({
          renderedRevision: session.getRenderedProjection().documentRevision,
          origin: inputEvent.isComposing ? 'composition' : 'keyboard',
          renderedSelection: rendered,
        });
        if (!target.ok || !target.selection) {
          if (inputEvent.cancelable) inputEvent.preventDefault();
          setEditorStatus('Selection is from an older page layout; choose the text again.');
          return;
        }
        if (
          inputEvent.isComposing ||
          inputEvent.inputType.toLowerCase().includes('composition')
        ) {
          return;
        }
        const canonical = session.getState().internalHtml;
        const bookmark = target.selection;
        if (!inputEvent.cancelable) {
          pendingNonCancelableMutationRef.current = {
            pages: pagesRef.current,
            canonical,
            bookmark,
            collapsePoint: bookmark.anchor,
            targetPageId: pageContentFromTarget(
              surface,
              window.getSelection()?.focusNode ?? null,
            )?.dataset.pageId ?? null,
            inputType: inputEvent.inputType,
            data: inputEvent.data,
            repairOnly: false,
          };
          return;
        }

        const inputType = inputEvent.inputType;
        if (inputType === 'insertText' || inputType === 'insertReplacementText') {
          inputEvent.preventDefault();
          const data = inputEvent.data ?? '';
          const pendingFormat = pendingTypingFormatRef.current;
          const result = pendingFormat
            ? insertTextWithFormat(canonical, bookmark, data, pendingFormat)
            : (() => {
                const replacement = document.createElement('div');
                replacement.textContent = data;
                return replaceLogicalSelection(canonical, bookmark, replacement.innerHTML);
              })();
          if (result.changed && result.selection) {
            pendingTypingPointRef.current = result.selection.anchor;
          }
          commitUserTransaction(result, 'insert-text');
          return;
        }
        if (inputType === 'insertParagraph') {
          inputEvent.preventDefault();
          commitUserTransaction(
            insertParagraphAtSelection(canonical, bookmark),
            'insert-paragraph',
          );
          return;
        }
        if (inputType === 'insertLineBreak') {
          inputEvent.preventDefault();
          commitUserTransaction(
            replaceLogicalSelection(canonical, bookmark, '<br>'),
            'insert-line-break',
          );
          return;
        }
        if (inputType === 'deleteContentBackward') {
          inputEvent.preventDefault();
          commitUserTransaction(
            applyLogicalDelete(canonical, bookmark, 'backward'),
            'delete-backward',
          );
          return;
        }
        if (inputType === 'deleteContentForward') {
          inputEvent.preventDefault();
          commitUserTransaction(
            applyLogicalDelete(canonical, bookmark, 'forward'),
            'delete-forward',
          );
          return;
        }
        if (inputType === 'insertFromPaste' || inputType === 'deleteByCut') {
          inputEvent.preventDefault();
          return;
        }
        if (inputType) {
          inputEvent.preventDefault();
          setEditorStatus(`Unsupported native edit was blocked: ${inputType}`);
        }
      },
      [commitUserTransaction, effectivePreviewMode],
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
        const session = canonicalSessionRef.current;
        if (session) {
          const canonical = reassemblePageFragments(
            updatedPages.map((page) => ({
              content: page.content,
              hardBreakBefore: page.hardBreakBefore,
              oversized: page.oversized,
            })),
          );
          const state = session.getState();
          session.dispatch({
            sessionKey: state.sessionKey,
            baseRevision: state.revision,
            intent: { kind: 'structural', origin: 'keyboard', history: 'separate' },
            selection: pendingFlowSelectionRef.current ?? state.selection,
            apply: () => ({
              status: 'applied',
              internalHtml: hydrateFlowHtml(ensureEditableCanonicalHtml(canonical)),
              selection: pendingFlowSelectionRef.current ?? state.selection,
            }),
          });
        }
        pagesRef.current = updatedPages;
        scheduleReflow(updatedPages, false);
        return updatedPages;
      });
    }, [activePageId, effectivePreviewMode, pushHistorySnapshot, scheduleReflow]);

    const clearPendingTypingFormat = useCallback(() => {
      pendingTypingFormatRef.current = null;
      pendingTypingPointRef.current = null;
    }, []);

    const setPendingTypingFormat = useCallback(
      (patch: InlineFormatPatch) => {
        const surface = documentSurfaceRef.current;
        const bookmark =
          savedSelectionRef.current ??
          (surface ? captureFlowSelection(surface) : null);
        if (!surface || !bookmark?.collapsed) return false;

        const merged = {
          ...pendingTypingFormatRef.current,
          ...patch,
        };
        const persisted = readUniformFormatState(
          surface,
          bookmark,
          effectiveLayout,
        );
        const mergedIsNeutral =
          persisted !== null &&
          (Object.entries(merged) as Array<
            [keyof InlineFormatPatch, string | null | undefined]
          >).every(([key, value]) => {
            if (typeof value === 'string') return false;
            if (key === 'fontWeight') return persisted.bold === false;
            if (key === 'fontStyle') return persisted.italic === false;
            if (key === 'textDecoration') {
              return persisted.underline === false;
            }
            if (key === 'color') return persisted.textColor === '#000000';
            if (key === 'backgroundColor') {
              return persisted.highlightColor === '#ffffff';
            }
            if (key === 'fontFamily') {
              return persisted.fontFamily === effectiveLayout.fontFamily;
            }
            if (key === 'fontSize') {
              return persisted.fontSize === effectiveLayout.fontSize;
            }
            return true;
          });

        if (mergedIsNeutral) {
          pendingTypingFormatRef.current = null;
          pendingTypingPointRef.current = null;
        } else {
          pendingTypingFormatRef.current = merged;
          pendingTypingPointRef.current = bookmark.anchor;
        }

        setActiveFormats((prev) => {
          const next = { ...prev };
          if (merged.fontWeight !== undefined) {
            next.bold = merged.fontWeight === 'bold';
          }
          if (merged.fontStyle !== undefined) {
            next.italic = merged.fontStyle === 'italic';
          }
          if (merged.textDecoration !== undefined) {
            next.underline = merged.textDecoration === 'underline';
          }
          if (typeof merged.fontFamily === 'string') {
            next.fontFamily = merged.fontFamily;
          }
          if (typeof merged.fontSize === 'string') {
            next.fontSize = merged.fontSize;
          }
          if (typeof merged.color === 'string') {
            next.textColor = merged.color;
          }
          if (typeof merged.backgroundColor === 'string') {
            next.highlightColor = merged.backgroundColor;
          }
          return next;
        });
        return true;
      },
      [effectiveLayout],
    );

    const applyFormattingTransaction = useCallback(
      (
        patch: InlineFormatPatch,
        toggleField?: 'bold' | 'italic' | 'underline',
      ) => {
        const surface = documentSurfaceRef.current;
        if (!surface || effectivePreviewMode) return;
        if (!selectionIsWithinPageContents(surface) && !restoreSelection()) {
          return;
        }
        const bookmark = captureFlowSelection(surface);
        if (!bookmark) return;

        if (bookmark.collapsed) {
          if (toggleField) {
            const uniform = readUniformFormatState(
              surface,
              bookmark,
              effectiveLayout,
            );
            const property =
              toggleField === 'bold'
                ? 'fontWeight'
                : toggleField === 'italic'
                  ? 'fontStyle'
                  : 'textDecoration';
            const value = patch[
              property as keyof InlineFormatPatch
            ] as InlineFormatPatch[keyof InlineFormatPatch];
            const pendingValue = pendingTypingFormatRef.current?.[
              property as keyof InlineFormatPatch
            ];
            const active =
              pendingValue !== undefined
                ? pendingValue !== null
                : uniform?.[toggleField] === true;
            setPendingTypingFormat({
              ...patch,
              [property]: active ? null : value,
            } as InlineFormatPatch);
          } else {
            setPendingTypingFormat(patch);
          }
          return;
        }

        clearPendingTypingFormat();
        if (toggleField) {
          const property =
            toggleField === 'bold'
              ? 'fontWeight'
              : toggleField === 'italic'
                ? 'fontStyle'
                : 'textDecoration';
          const toggleState = readInlineToggleState(
            surface,
            bookmark,
            toggleField,
          );
          const effectivePatch =
            toggleState === 'on'
              ? ({ ...patch, [property]: null } as InlineFormatPatch)
              : patch;
          commitUserTransaction(
            applyInlineFormat(
              canonicalPagesHtml(pagesRef.current),
              bookmark,
              effectivePatch,
            ),
          );
          return;
        }

        commitUserTransaction(
          applyInlineFormat(
            canonicalPagesHtml(pagesRef.current),
            bookmark,
            patch,
          ),
        );
      },
      [
        canonicalPagesHtml,
        clearPendingTypingFormat,
        commitUserTransaction,
        effectiveLayout,
        effectivePreviewMode,
        restoreSelection,
        setPendingTypingFormat,
      ],
    );

    const applyClearFormattingTransaction = useCallback(() => {
      const surface = documentSurfaceRef.current;
      if (!surface || effectivePreviewMode) return;
      if (!selectionIsWithinPageContents(surface) && !restoreSelection()) {
        return;
      }
      const bookmark = captureFlowSelection(surface);
      if (!bookmark) return;

      clearPendingTypingFormat();
      if (bookmark.collapsed) {
        setActiveFormats((prev) => ({
          ...prev,
          bold: false,
          italic: false,
          underline: false,
        }));
        return;
      }
      commitUserTransaction(
        clearInlineFormatting(
          canonicalPagesHtml(pagesRef.current),
          bookmark,
        ),
      );
    }, [
      canonicalPagesHtml,
      clearPendingTypingFormat,
      commitUserTransaction,
      effectivePreviewMode,
      restoreSelection,
    ]);

    const applySelectionTransaction = useCallback(
      (
        build: (
          html: string,
          bookmark: FlowSelectionBookmark,
        ) => DocumentTransactionResult,
      ) => {
        const surface = documentSurfaceRef.current;
        if (!surface || effectivePreviewMode) return;
        if (!selectionIsWithinPageContents(surface) && !restoreSelection()) {
          return;
        }
        const bookmark = captureFlowSelection(surface);
        if (!bookmark) return;
        clearPendingTypingFormat();
        commitUserTransaction(
          build(canonicalPagesHtml(pagesRef.current), bookmark),
        );
      },
      [
        canonicalPagesHtml,
        clearPendingTypingFormat,
        commitUserTransaction,
        effectivePreviewMode,
        restoreSelection,
      ],
    );

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
          applySelectionTransaction((html, bookmark) =>
            applyBlockFormatToSelection(html, bookmark, val),
          );
          return;
        }

        if (cmd === 'textColor' && val) {
          applyFormattingTransaction({ color: val });
          return;
        }

        if (cmd === 'highlightColor' && val) {
          applyFormattingTransaction({ backgroundColor: val });
          return;
        }

        if (cmd === 'customFontSize' && val) {
          applyFormattingTransaction({ fontSize: val });
          return;
        }

        if (cmd === 'fontName' && val) {
          applyFormattingTransaction({ fontFamily: val });
          return;
        }

        if (cmd === 'bold') {
          applyFormattingTransaction({ fontWeight: 'bold' }, 'bold');
          return;
        }

        if (cmd === 'italic') {
          applyFormattingTransaction({ fontStyle: 'italic' }, 'italic');
          return;
        }

        if (cmd === 'underline') {
          applyFormattingTransaction(
            { textDecoration: 'underline' },
            'underline',
          );
          return;
        }

        if (cmd === 'removeFormat') {
          applyClearFormattingTransaction();
          return;
        }

        if (cmd === 'paragraphSpacing' && val) {
          updateLayout({ ...effectiveLayout, paragraphSpacing: val });
          return;
        }

        if (cmd === 'insertTable') {
          insertHtmlAtCursor(
            '<table><tbody><tr><th>Header</th><th>Header</th></tr><tr><td>Cell</td><td>Cell</td></tr></tbody></table><p><br /></p>',
          );
          return;
        }

        if (cmd === 'addTableRow') {
          applySelectionTransaction((html, bookmark) =>
            insertTableRowAtSelection(html, bookmark),
          );
          return;
        }

        if (cmd === 'addTableColumn') {
          applySelectionTransaction((html, bookmark) =>
            insertTableColumnAtSelection(html, bookmark),
          );
          return;
        }

        if (cmd === 'lineSpacing' && val) {
          updateLayout({ ...effectiveLayout, lineHeight: Number(val) });
          return;
        }

        if (cmd === 'pageBreak') {
          splitActivePageAtSelection();
          return;
        }

        if (cmd === 'indent') {
          applySelectionTransaction((html, bookmark) =>
            applyIndentToSelection(html, bookmark),
          );
          return;
        }

        if (cmd === 'outdent') {
          applySelectionTransaction((html, bookmark) =>
            applyOutdentToSelection(html, bookmark),
          );
        }
      },
      [
        applyClearFormattingTransaction,
        applyFormattingTransaction,
        applySelectionTransaction,
        effectiveLayout,
        effectivePreviewMode,
        handleRedo,
        handleUndo,
        insertHtmlAtCursor,
        restoreSelection,
        splitActivePageAtSelection,
        updateLayout,
      ],
    );

    const handleToolbarCommand = useCallback(
      (command: EditorCommand) => {
        if (command.type === 'align') {
          applySelectionTransaction((html, bookmark) =>
            applyBlockAlignmentToSelection(html, bookmark, command.value),
          );
          return;
        }

        if (command.type === 'list') {
          const listType = command.value;
          if (listType === 'none') return;
          applySelectionTransaction((html, bookmark) =>
            applyListToSelection(html, bookmark, listType),
          );
          return;
        }

        if (command.type === 'list-start') {
          applySelectionTransaction((html, bookmark) =>
            applyListStartToSelection(html, bookmark, command.value),
          );
          return;
        }

        if (command.type === 'nest-list') {
          applySelectionTransaction((html, bookmark) =>
            toggleNestedListSelection(html, bookmark),
          );
          return;
        }

        if (command.type === 'list-bold-numbers') {
          applySelectionTransaction((html, bookmark) =>
            toggleBoldListMarkersToSelection(html, bookmark),
          );
          return;
        }

        const commandMap = {
          undo: 'undo',
          redo: 'redo',
          bold: 'bold',
          italic: 'italic',
          underline: 'underline',
          'clear-formatting': 'removeFormat',
          indent: 'indent',
          outdent: 'outdent',
          'insert-table': 'insertTable',
        } as const;
        handleCommand(commandMap[command.type]);
      },
      [applySelectionTransaction, handleCommand],
    );

    const handlePrint = useCallback(() => {
      const printPages = isPreviewMode && previewPages ? previewPages : pages;

      // Filter out pages that only contain [Remove Page]
      const filteredPages = printPages.filter((page) => !shouldRemovePage(page.content));

      const stripBreakElements = (html: string): string => {
        const container = document.createElement('div');
        container.innerHTML = html;
        container
          .querySelectorAll(
            '.page-break, [style*="page-break-after"], [style*="page-break-before"]',
          )
          .forEach((element) => element.remove());
        return container.innerHTML;
      };

      const pagesHtml = filteredPages.length > 0
        ? filteredPages
            .map((page, index) => {
              const content = stripBreakElements(sanitizeHtml(page.content)) || '&nbsp;';
              const pageNumberHtml = showPageNumbers
                ? `<div class="print-page-number">${index + 1}</div>`
                : '';
              const oversized = page.oversized
                ? ' data-oversized="true"'
                : '';
              return `<section class="print-page"${oversized}><div class="content">${content}</div>${pageNumberHtml}</section>`;
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
    ${buildA4PrintCss(effectiveLayout, {
      pageNumberStripMm: showPageNumbers ? PAGE_NUMBER_STRIP_MM : undefined,
    })}
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
      effectiveLayout,
      isPreviewMode,
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
        <style>{`${buildA4FontFaceCss()}\n${buildA4PageContentStyles(paragraphSpacing)}
          .a4-page-content .a4-table-resize-target-left { box-shadow: inset 2px 0 0 var(--oak-primary, #294d44); cursor: col-resize !important; }
          .a4-page-content .a4-table-resize-target-right { box-shadow: inset -2px 0 0 var(--oak-primary, #294d44); cursor: col-resize !important; }
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
          <A4EditorToolbar
            onCommand={handleToolbarCommand}
            onSaveSelection={saveCursorPosition}
            layout={effectiveLayout}
            activeFormats={activeFormats}
            onLayoutChange={updateLayout}
            showPageNumbers={showPageNumbers}
            canDeletePage={hardSectionCount > 1}
            canRemovePageBreak={
              displayPages[currentPageIdx]?.hardBreakBefore === true
            }
            onInsertPageBreak={splitActivePageAtSelection}
            onAddBlankPage={handleAddPage}
            onDeleteCurrentPage={() => handleDeletePage(activePageId)}
            onRemovePageBreak={() => handleRemovePageBreak(activePageId)}
            onTogglePageNumbers={setShowPageNumbers}
            onLegacyCommand={handleCommand}
            disabled={effectivePreviewMode}
            mutationDisabled={isReflowing}
          />
        )}

        <div ref={scrollContainerRef} className="flex-1 overflow-auto py-8">
          <div className="relative mx-auto w-fit">
          <div
            key={surfaceRepairGeneration}
            ref={documentSurfaceRef}
            data-testid="a4-document-surface"
            data-document-revision={
              canonicalSessionRef.current?.getRenderedProjection().documentRevision ?? 0
            }
            contentEditable={!effectivePreviewMode}
            suppressContentEditableWarning
            aria-busy={isReflowing}
            onInput={handleDocumentInput}
            onCompositionStart={handleDocumentCompositionStart}
            onCompositionEnd={handleDocumentCompositionEnd}
            onKeyDown={handleDocumentKeyDown}
            onPaste={handleDocumentPaste}
            onCut={handleDocumentCut}
            onPointerDown={handleTableResizePointerDown}
            onPointerMove={handleTableResizePointerMove}
            onPointerLeave={clearTableResizeHover}
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
                syncFormattingFromSelection();
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
                isActive={page.id === activePageId}
                isPreviewMode={effectivePreviewMode}
                pageLayout={pageLayout}
                fontFamily={fontFamily}
                fontSize={fontSize}
                lineHeight={lineHeight}
              />
            ))}
          </div>
          <div className="pointer-events-none absolute inset-0 flex flex-col items-center gap-8">
            {displayPages.map((page, index) => (
              <PageChrome
                key={page.id}
                page={page}
                pageNumber={index + 1}
                totalPages={displayPages.length}
                isPreviewMode={effectivePreviewMode}
                onDelete={handleDeletePage}
                onRemoveBreak={handleRemovePageBreak}
                canDelete={
                  hardSectionCount > 1 &&
                  !readOnly &&
                  (index === 0 || page.hardBreakBefore)
                }
                placeholder={index === 0 ? placeholder : undefined}
                pageLayout={pageLayout}
                fontFamily={fontFamily}
                fontSize={fontSize}
                lineHeight={lineHeight}
                showPageNumbers={showPageNumbers}
              />
            ))}
          </div>
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
          {editorStatus ? (
            <span role="status" className="text-status-warning">
              {editorStatus}
            </span>
          ) : null}
          <span>
            {formatA4LayoutStatus(effectiveLayout)}
          </span>
          <span role="status" aria-live="polite" data-testid="a4-editor-status">
            {isReflowing
              ? 'Repaginating…'
              : readOnly
                ? 'Viewing document'
                : effectivePreviewMode
                  ? 'Viewing preview'
                  : 'Editing'}
          </span>
        </div>
      </div>
    );
  },
);

export default A4PageEditor;
