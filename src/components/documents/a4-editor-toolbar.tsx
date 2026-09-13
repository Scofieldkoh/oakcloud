'use client';

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ComponentType,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
  type RefObject,
  type ReactNode,
} from 'react';
import { createPortal } from 'react-dom';
import {
  AlignCenter,
  AlignJustify,
  AlignLeft,
  AlignRight,
  Bold,
  CaseLower,
  Hash,
  Indent,
  Italic,
  List,
  ListOrdered,
  ListPlus,
  ListTree,
  MoreHorizontal,
  Outdent,
  Redo2,
  RotateCcw,
  SeparatorHorizontal,
  Table2,
  Trash2,
  Underline,
  Undo2,
  Unlink,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import type { A4DocumentLayout } from './a4-pagination/layout';
import type { EditorFormatState } from './a4-pagination/formatting';
import {
  DOCUMENT_FONT_OPTIONS,
  DOCUMENT_FONT_SIZE_OPTIONS,
} from './document-typography';

export type { EditorFormatState } from './a4-pagination/formatting';

export type EditorCommand =
  | { type: 'undo' | 'redo' | 'bold' | 'italic' | 'underline' | 'clear-formatting' }
  | { type: 'align'; value: EditorFormatState['alignment'] }
  | { type: 'list'; value: EditorFormatState['list'] }
  | { type: 'list-start'; value: number }
  | { type: 'continue-numbering' }
  | { type: 'nest-list' }
  | { type: 'list-bold-numbers' }
  | { type: 'indent' | 'outdent' | 'insert-table' };

export interface A4EditorToolbarProps {
  disabled: boolean;
  /** Explicit command lock only. Repagination/reflow must not be wired to this prop. */
  mutationDisabled?: boolean;
  layout: A4DocumentLayout;
  activeFormats: EditorFormatState;
  showPageNumbers: boolean;
  /** Expose page-number authoring only after persistence and every output support it. */
  pageNumbersSupported?: boolean;
  canDeletePage: boolean;
  canRemovePageBreak: boolean;
  onCommand(command: EditorCommand): void;
  onLayoutChange(layout: A4DocumentLayout): void;
  onInsertPageBreak(): void;
  onAddBlankPage(): void;
  onDeleteCurrentPage(): void;
  onRemovePageBreak(): void;
  onTogglePageNumbers(value: boolean): void;
  onSaveSelection(): void;
  onLegacyCommand?(command: string, value?: string): void;
}

const compactControlClass =
  'inline-flex h-8 w-8 items-center justify-center rounded text-text-secondary transition-colors duration-150 hover:bg-background-tertiary hover:text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-focus disabled:cursor-not-allowed disabled:opacity-50';
const toolbarSelectClass =
  'h-8 rounded border border-border-primary bg-background-secondary px-2 text-xs text-text-secondary outline-none transition-colors duration-150 focus-visible:ring-2 focus-visible:ring-border-focus disabled:cursor-not-allowed disabled:opacity-50';
const toolbarColorClass =
  'h-8 w-9 shrink-0 cursor-pointer rounded border border-border-primary bg-background-secondary p-1 outline-none transition-colors duration-150 focus-visible:ring-2 focus-visible:ring-border-focus disabled:cursor-not-allowed disabled:opacity-50';

function preserveSelectionForPrimaryPointer(
  event: ReactPointerEvent<HTMLElement>,
  onSaveSelection: () => void,
  preventFocus = false,
) {
  if (event.button !== 0 || event.isPrimary === false) return;
  onSaveSelection();
  if (preventFocus) event.preventDefault();
}

function useEscapeDismiss(
  isOpen: boolean,
  onDismiss: () => void,
  triggerRef: RefObject<HTMLButtonElement | null>,
) {
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      onDismiss();
      triggerRef.current?.focus();
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onDismiss, triggerRef]);
}

interface ToolbarButtonProps {
  label: string;
  icon: ComponentType<{ className?: string }>;
  onClick(): void;
  onSaveSelection(): void;
  disabled?: boolean;
  pressed?: boolean;
  destructive?: boolean;
  title?: string;
}

function ToolbarButton({
  label,
  icon: Icon,
  onClick,
  onSaveSelection,
  disabled = false,
  pressed,
  destructive = false,
  title,
}: ToolbarButtonProps) {
  return (
    <button
      type="button"
      data-a4-toolbar-control="true"
      aria-label={label}
      aria-pressed={pressed}
      title={title ?? label}
      disabled={disabled}
      onPointerDown={(event) =>
        preserveSelectionForPrimaryPointer(event, onSaveSelection, true)
      }
      onClick={(event) => {
        if (event.button !== 0) return;
        onClick();
      }}
      className={cn(
        compactControlClass,
        pressed && 'bg-background-tertiary text-text-primary',
        destructive && 'text-status-error hover:bg-red-50 dark:hover:bg-red-950/30',
      )}
    >
      <Icon className="h-4 w-4" aria-hidden="true" />
    </button>
  );
}

function ToolbarGroup({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div
      role="group"
      aria-label={label}
      className="flex shrink-0 items-center gap-1 border-r border-border-primary pr-2 last:border-r-0 last:pr-0"
    >
      {children}
    </div>
  );
}

function ToolbarMenu({
  label,
  disabled,
  children,
  isOpen,
  onOpenChange,
  onSaveSelection,
}: {
  label: string;
  disabled: boolean;
  children: ReactNode;
  isOpen: boolean;
  onOpenChange(open: boolean): void;
  onSaveSelection(): void;
}) {
  const triggerRef = useRef<HTMLButtonElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState({ top: 0, left: 0 });
  const dismiss = useCallback(() => onOpenChange(false), [onOpenChange]);
  useEscapeDismiss(isOpen, dismiss, triggerRef);

  useEffect(() => {
    if (!isOpen) return;
    const updatePosition = () => {
      const rect = triggerRef.current?.getBoundingClientRect();
      if (!rect) return;
      const width = 288;
      setPosition({
        top: rect.bottom + 8,
        left: Math.max(8, Math.min(rect.right - width, window.innerWidth - width - 8)),
      });
    };
    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target as Node;
      if (!triggerRef.current?.contains(target) && !popoverRef.current?.contains(target)) dismiss();
    };
    updatePosition();
    window.addEventListener('resize', updatePosition);
    window.addEventListener('scroll', updatePosition, true);
    document.addEventListener('pointerdown', handlePointerDown);
    return () => {
      window.removeEventListener('resize', updatePosition);
      window.removeEventListener('scroll', updatePosition, true);
      document.removeEventListener('pointerdown', handlePointerDown);
    };
  }, [dismiss, isOpen]);

  return (
    <div className="relative">
      <button
        ref={triggerRef}
        type="button"
        data-a4-toolbar-control="true"
        aria-label={label}
        aria-haspopup="dialog"
        aria-expanded={isOpen}
        disabled={disabled}
        onPointerDown={(event) =>
          preserveSelectionForPrimaryPointer(event, onSaveSelection)
        }
        onClick={(event) => {
          if (event.button !== 0) return;
          onOpenChange(!isOpen);
        }}
        className={cn(compactControlClass, 'w-auto gap-1 px-2')}
      >
        <MoreHorizontal className="h-4 w-4" aria-hidden="true" />
        <span className="text-xs">{label}</span>
      </button>
      {isOpen && typeof document !== 'undefined'
        ? createPortal(
            <div
              ref={popoverRef}
              role="dialog"
              aria-label={`${label} popover`}
              style={position}
              className="fixed z-[100] w-72 rounded border border-border-primary bg-background-elevated p-3 shadow-lg"
            >
              {children}
            </div>,
            document.body,
          )
        : null}
    </div>
  );
}

function handleToolbarArrowNavigation(event: ReactKeyboardEvent<HTMLDivElement>) {
  const target = event.target as HTMLElement;
  if (
    target.tagName === 'SELECT' ||
    (target.tagName === 'INPUT' && target.getAttribute('type') !== 'button')
  ) {
    return;
  }
  if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;

  const controls = Array.from(
    event.currentTarget.querySelectorAll<HTMLElement>(
      '[data-a4-toolbar-control="true"]:not([disabled])',
    ),
  );
  const currentIndex = controls.indexOf(target);
  if (currentIndex < 0 || controls.length === 0) return;

  event.preventDefault();
  let nextIndex = currentIndex;
  if (event.key === 'Home') nextIndex = 0;
  if (event.key === 'End') nextIndex = controls.length - 1;
  if (event.key === 'ArrowRight') nextIndex = (currentIndex + 1) % controls.length;
  if (event.key === 'ArrowLeft') nextIndex = (currentIndex - 1 + controls.length) % controls.length;
  controls[nextIndex]?.focus();
}

export function A4EditorToolbar({
  disabled,
  mutationDisabled = false,
  activeFormats,
  showPageNumbers,
  pageNumbersSupported = false,
  canDeletePage,
  canRemovePageBreak,
  onCommand,
  onInsertPageBreak,
  onAddBlankPage,
  onDeleteCurrentPage,
  onRemovePageBreak,
  onTogglePageNumbers,
  onSaveSelection,
  onLegacyCommand,
}: A4EditorToolbarProps) {
  const blocked = disabled || mutationDisabled;
  const command = (nextCommand: EditorCommand) => () => onCommand(nextCommand);
  const [openMenu, setOpenMenu] = useState<'list' | 'text' | 'tables' | 'page' | null>(null);
  const [startDraft, setStartDraft] = useState('1');

  useEffect(() => {
    setStartDraft(String(activeFormats.listStart));
  }, [activeFormats.listStart]);

  return (
    <div
      role="toolbar"
      aria-label="Document editor toolbar"
      aria-orientation="horizontal"
      onKeyDown={handleToolbarArrowNavigation}
      className={cn(
        'flex items-center gap-2 overflow-x-auto border-b border-border-primary bg-background-secondary px-3 py-2',
        disabled && 'opacity-60',
      )}
    >
      <ToolbarGroup label="History">
        <ToolbarButton label="Undo" title="Undo (Ctrl+Z)" icon={Undo2} onSaveSelection={onSaveSelection} onClick={command({ type: 'undo' })} disabled={blocked} />
        <ToolbarButton label="Redo" title="Redo (Ctrl+Y)" icon={Redo2} onSaveSelection={onSaveSelection} onClick={command({ type: 'redo' })} disabled={blocked} />
      </ToolbarGroup>

      <ToolbarGroup label="Writing style">
        <select
          data-a4-toolbar-control="true"
          aria-label="Paragraph style"
          title="Paragraph Style"
          value={activeFormats.paragraphStyle}
          disabled={blocked || !onLegacyCommand}
          onPointerDown={(event) => preserveSelectionForPrimaryPointer(event, onSaveSelection)}
          onChange={(event) => onLegacyCommand?.('paragraphStyle', event.target.value)}
          className={cn(toolbarSelectClass, 'w-28')}
        >
          <option value="p">Normal</option>
          <option value="h1">Heading 1</option>
          <option value="h2">Heading 2</option>
          <option value="h3">Heading 3</option>
          <option value="blockquote">Quote</option>
        </select>
        <ToolbarButton label="Bold" title="Bold (Ctrl+B)" icon={Bold} onSaveSelection={onSaveSelection} onClick={command({ type: 'bold' })} disabled={blocked} pressed={activeFormats.bold} />
        <ToolbarButton label="Italic" title="Italic (Ctrl+I)" icon={Italic} onSaveSelection={onSaveSelection} onClick={command({ type: 'italic' })} disabled={blocked} pressed={activeFormats.italic} />
        <ToolbarButton label="Underline" title="Underline (Ctrl+U)" icon={Underline} onSaveSelection={onSaveSelection} onClick={command({ type: 'underline' })} disabled={blocked} pressed={activeFormats.underline} />
        <ToolbarButton label="Clear formatting" icon={RotateCcw} onSaveSelection={onSaveSelection} onClick={command({ type: 'clear-formatting' })} disabled={blocked} />
      </ToolbarGroup>

      <ToolbarGroup label="Paragraph">
        <ToolbarButton label="Align left" icon={AlignLeft} onSaveSelection={onSaveSelection} onClick={command({ type: 'align', value: 'left' })} disabled={blocked} pressed={activeFormats.alignment === 'left'} />
        <ToolbarButton label="Align center" icon={AlignCenter} onSaveSelection={onSaveSelection} onClick={command({ type: 'align', value: 'center' })} disabled={blocked} pressed={activeFormats.alignment === 'center'} />
        <ToolbarButton label="Align right" icon={AlignRight} onSaveSelection={onSaveSelection} onClick={command({ type: 'align', value: 'right' })} disabled={blocked} pressed={activeFormats.alignment === 'right'} />
        <ToolbarButton label="Justify text" icon={AlignJustify} onSaveSelection={onSaveSelection} onClick={command({ type: 'align', value: 'justify' })} disabled={blocked} pressed={activeFormats.alignment === 'justify'} />
        <ToolbarButton label="Bulleted list" icon={List} onSaveSelection={onSaveSelection} onClick={command({ type: 'list', value: 'unordered' })} disabled={blocked} pressed={activeFormats.list === 'unordered'} />
        <ToolbarButton label="Numbered list" icon={ListOrdered} onSaveSelection={onSaveSelection} onClick={command({ type: 'list', value: 'ordered' })} disabled={blocked} pressed={activeFormats.list === 'ordered'} />
        <ToolbarButton label="Decrease indent" icon={Outdent} onSaveSelection={onSaveSelection} onClick={command({ type: 'outdent' })} disabled={blocked} />
        <ToolbarButton label="Increase indent" icon={Indent} onSaveSelection={onSaveSelection} onClick={command({ type: 'indent' })} disabled={blocked} />
        <ToolbarMenu label="List options" disabled={disabled} isOpen={openMenu === 'list'} onOpenChange={(open) => setOpenMenu(open ? 'list' : null)} onSaveSelection={onSaveSelection}>
          <div role="group" aria-label="Advanced list controls" className="flex flex-wrap items-center gap-2">
            <ToolbarButton label="Alphabetical list" icon={CaseLower} onSaveSelection={onSaveSelection} onClick={command({ type: 'list', value: 'alpha' })} disabled={blocked} pressed={activeFormats.list === 'alpha'} />
            <ToolbarButton label="Nested list" icon={ListTree} onSaveSelection={onSaveSelection} onClick={command({ type: 'nest-list' })} disabled={blocked} />
            <ToolbarButton label="Bold list numbers" icon={Hash} onSaveSelection={onSaveSelection} onClick={command({ type: 'list-bold-numbers' })} disabled={blocked || (activeFormats.list !== 'ordered' && activeFormats.list !== 'alpha')} pressed={activeFormats.listMarkersBold} />
            <label
              className="flex h-8 items-center gap-1 text-xs text-text-secondary"
              onPointerDown={(event) => preserveSelectionForPrimaryPointer(event, onSaveSelection)}
            >
              Start at
              <input
                type="number"
                min={1}
                aria-label="List start number"
                value={startDraft}
                disabled={blocked || (activeFormats.list !== 'ordered' && activeFormats.list !== 'alpha')}
                onChange={(event) => {
                  const value = event.target.value;
                  setStartDraft(value);
                  const parsed = Number.parseInt(value, 10);
                  if (value !== '' && Number.isFinite(parsed) && parsed >= 1) {
                    onCommand({ type: 'list-start', value: parsed });
                  }
                }}
                onBlur={() => setStartDraft(String(activeFormats.listStart))}
                className={cn(toolbarSelectClass, 'w-14')}
              />
            </label>
            <ToolbarButton label="Continue numbering" icon={ListOrdered} onSaveSelection={onSaveSelection} onClick={command({ type: 'continue-numbering' })} disabled={blocked || (activeFormats.list !== 'ordered' && activeFormats.list !== 'alpha')} />
          </div>
        </ToolbarMenu>
      </ToolbarGroup>

      <ToolbarGroup label="Insert">
        <ToolbarButton label="Page break" title="Page break" icon={SeparatorHorizontal} onSaveSelection={onSaveSelection} onClick={onInsertPageBreak} disabled={blocked} />
        <ToolbarMenu label="Table" disabled={disabled} isOpen={openMenu === 'tables'} onOpenChange={(open) => setOpenMenu(open ? 'tables' : null)} onSaveSelection={onSaveSelection}>
          <div role="group" aria-label="Table actions" className="flex items-center gap-2">
            <ToolbarButton label="Insert table" title="Insert Table" icon={Table2} onSaveSelection={onSaveSelection} onClick={command({ type: 'insert-table' })} disabled={blocked} />
            <ToolbarButton label="Add table row" title="Add Table Row" icon={ListPlus} onSaveSelection={onSaveSelection} onClick={() => onLegacyCommand?.('addTableRow')} disabled={blocked || !onLegacyCommand} />
            <ToolbarButton label="Add table column" title="Add Table Column" icon={Table2} onSaveSelection={onSaveSelection} onClick={() => onLegacyCommand?.('addTableColumn')} disabled={blocked || !onLegacyCommand} />
          </div>
        </ToolbarMenu>
      </ToolbarGroup>

      <ToolbarGroup label="More formatting">
        <ToolbarMenu label="Text options" disabled={disabled} isOpen={openMenu === 'text'} onOpenChange={(open) => setOpenMenu(open ? 'text' : null)} onSaveSelection={onSaveSelection}>
          <div className="grid gap-2">
            <label className="grid gap-1 text-xs text-text-secondary">
              Font family
              <select
                aria-label="Font family"
                title="Font Family"
                value={activeFormats.fontFamily}
                disabled={blocked || !onLegacyCommand}
                onPointerDown={(event) => preserveSelectionForPrimaryPointer(event, onSaveSelection)}
                onChange={(event) => onLegacyCommand?.('fontName', event.target.value)}
                className={cn(toolbarSelectClass, 'w-full')}
              >
                {DOCUMENT_FONT_OPTIONS.map((font) => <option key={font.value} value={font.value}>{font.label}</option>)}
              </select>
            </label>
            <label className="grid gap-1 text-xs text-text-secondary">
              Font size
              <select
                aria-label="Font size"
                title="Font Size"
                value={activeFormats.fontSize}
                disabled={blocked || !onLegacyCommand}
                onPointerDown={(event) => preserveSelectionForPrimaryPointer(event, onSaveSelection)}
                onChange={(event) => onLegacyCommand?.('customFontSize', event.target.value)}
                className={cn(toolbarSelectClass, 'w-full')}
              >
                {DOCUMENT_FONT_SIZE_OPTIONS.map((size) => <option key={size} value={size}>{size.replace('pt', '')}</option>)}
              </select>
            </label>
            <div className="flex items-center gap-2">
              <label className="flex items-center gap-1 text-xs text-text-secondary">
                Text
                <input type="color" aria-label="Text color" title="Text Color" value={activeFormats.textColor} disabled={blocked || !onLegacyCommand} onPointerDown={(event) => preserveSelectionForPrimaryPointer(event, onSaveSelection)} onChange={(event) => onLegacyCommand?.('textColor', event.target.value)} className={toolbarColorClass} />
              </label>
              <label className="flex items-center gap-1 text-xs text-text-secondary">
                Highlight
                <input type="color" aria-label="Highlight color" title="Highlight Color" value={activeFormats.highlightColor} disabled={blocked || !onLegacyCommand} onPointerDown={(event) => preserveSelectionForPrimaryPointer(event, onSaveSelection)} onChange={(event) => onLegacyCommand?.('highlightColor', event.target.value)} className={toolbarColorClass} />
              </label>
            </div>
          </div>
        </ToolbarMenu>
      </ToolbarGroup>

      <ToolbarGroup label="Page options">
        <ToolbarMenu label="Page options" disabled={disabled} isOpen={openMenu === 'page'} onOpenChange={(open) => setOpenMenu(open ? 'page' : null)} onSaveSelection={onSaveSelection}>
          <div role="group" aria-label="Page section actions" className="flex items-center gap-2">
            <ToolbarButton label="Append blank page" icon={ListPlus} onSaveSelection={onSaveSelection} onClick={onAddBlankPage} disabled={blocked} />
            <ToolbarButton label="Remove page break" title="Remove the page break before the current page" icon={Unlink} onSaveSelection={onSaveSelection} onClick={onRemovePageBreak} disabled={blocked || !canRemovePageBreak} />
            <ToolbarButton label="Delete current hard section" icon={Trash2} onSaveSelection={onSaveSelection} onClick={onDeleteCurrentPage} disabled={blocked || !canDeletePage} destructive />
          </div>
        </ToolbarMenu>
      </ToolbarGroup>

      {pageNumbersSupported ? (
        <ToolbarGroup label="View">
          <label className="flex h-8 items-center gap-1.5 text-xs text-text-secondary">
            <input
              type="checkbox"
              aria-label="Show page numbers"
              checked={showPageNumbers}
              disabled={disabled}
              onPointerDown={(event) => preserveSelectionForPrimaryPointer(event, onSaveSelection)}
              onChange={(event) => onTogglePageNumbers(event.target.checked)}
              className="h-3.5 w-3.5 rounded border-border-primary text-oak-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-focus"
            />
            Page numbers
          </label>
        </ToolbarGroup>
      ) : null}
    </div>
  );
}
