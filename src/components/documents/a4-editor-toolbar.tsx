'use client';

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ComponentType,
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
  Indent,
  Italic,
  List,
  ListOrdered,
  ListPlus,
  MoreHorizontal,
  Outdent,
  Redo2,
  RotateCcw,
  SeparatorHorizontal,
  Table2,
  Trash2,
  Underline,
  Undo2,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import type { A4DocumentLayout } from './a4-pagination/layout';
import {
  DOCUMENT_FONT_OPTIONS,
  DOCUMENT_FONT_SIZE_OPTIONS,
} from './document-typography';

export interface EditorFormatState {
  bold: boolean;
  italic: boolean;
  underline: boolean;
  alignment: 'left' | 'center' | 'right' | 'justify';
  list: 'none' | 'ordered' | 'unordered';
}

export type EditorCommand =
  | { type: 'undo' | 'redo' | 'bold' | 'italic' | 'underline' | 'clear-formatting' }
  | { type: 'align'; value: EditorFormatState['alignment'] }
  | { type: 'list'; value: EditorFormatState['list'] }
  | { type: 'indent' | 'outdent' | 'insert-table' };

export interface A4EditorToolbarProps {
  disabled: boolean;
  layout: A4DocumentLayout;
  activeFormats: EditorFormatState;
  showPageNumbers: boolean;
  canDeletePage: boolean;
  onCommand(command: EditorCommand): void;
  onLayoutChange(layout: A4DocumentLayout): void;
  onInsertPageBreak(): void;
  onAddBlankPage(): void;
  onDeleteCurrentPage(): void;
  onTogglePageNumbers(value: boolean): void;
  onSaveSelection(): void;
  onLegacyCommand?(command: string, value?: string): void;
}

const compactControlClass =
  'inline-flex h-8 w-8 items-center justify-center rounded text-text-secondary transition-colors duration-150 hover:bg-background-tertiary hover:text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-focus disabled:cursor-not-allowed disabled:opacity-50';
const compactSelectClass =
  'h-8 w-full rounded border border-border-primary bg-background-secondary px-2 text-xs text-text-secondary outline-none transition-colors duration-150 focus-visible:ring-2 focus-visible:ring-border-focus disabled:cursor-not-allowed';

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
  const skipNextClickRef = useRef(false);

  return (
    <button
      type="button"
      aria-label={label}
      aria-pressed={pressed}
      title={title ?? label}
      disabled={disabled}
      onPointerDown={onSaveSelection}
      onMouseDown={(event) => {
        event.preventDefault();
        skipNextClickRef.current = true;
        onSaveSelection();
        onClick();
      }}
      onClick={() => {
        if (skipNextClickRef.current) {
          skipNextClickRef.current = false;
          return;
        }
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
}: {
  label: string;
  disabled: boolean;
  children: ReactNode;
  isOpen: boolean;
  onOpenChange(open: boolean): void;
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
        aria-label={label}
        aria-expanded={isOpen}
        disabled={disabled}
        onClick={() => onOpenChange(!isOpen)}
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

export function A4EditorToolbar({
  disabled,
  activeFormats,
  showPageNumbers,
  canDeletePage,
  onCommand,
  onInsertPageBreak,
  onAddBlankPage,
  onDeleteCurrentPage,
  onTogglePageNumbers,
  onSaveSelection,
  onLegacyCommand,
}: A4EditorToolbarProps) {
  const command = (nextCommand: EditorCommand) => () => onCommand(nextCommand);
  const [openMenu, setOpenMenu] = useState<'tables' | 'formats' | null>(null);

  return (
    <div
      aria-label="Document editor toolbar"
      className={cn(
        'flex items-center gap-2 overflow-x-auto border-b border-border-primary bg-background-secondary px-3 py-2',
        disabled && 'opacity-60',
      )}
    >
      <ToolbarGroup label="History">
        <ToolbarButton label="Undo" title="Undo (Ctrl+Z)" icon={Undo2} onSaveSelection={onSaveSelection} onClick={command({ type: 'undo' })} disabled={disabled} />
        <ToolbarButton label="Redo" title="Redo (Ctrl+Y)" icon={Redo2} onSaveSelection={onSaveSelection} onClick={command({ type: 'redo' })} disabled={disabled} />
      </ToolbarGroup>
      <ToolbarGroup label="Text">
        <ToolbarButton label="Bold" title="Bold (Ctrl+B)" icon={Bold} onSaveSelection={onSaveSelection} onClick={command({ type: 'bold' })} disabled={disabled} pressed={activeFormats.bold} />
        <ToolbarButton label="Italic" title="Italic (Ctrl+I)" icon={Italic} onSaveSelection={onSaveSelection} onClick={command({ type: 'italic' })} disabled={disabled} pressed={activeFormats.italic} />
        <ToolbarButton label="Underline" title="Underline (Ctrl+U)" icon={Underline} onSaveSelection={onSaveSelection} onClick={command({ type: 'underline' })} disabled={disabled} pressed={activeFormats.underline} />
        <ToolbarButton label="Clear formatting" icon={RotateCcw} onSaveSelection={onSaveSelection} onClick={command({ type: 'clear-formatting' })} disabled={disabled} />
      </ToolbarGroup>
      <ToolbarGroup label="Paragraph">
        <ToolbarButton label="Align left" icon={AlignLeft} onSaveSelection={onSaveSelection} onClick={command({ type: 'align', value: 'left' })} disabled={disabled} pressed={activeFormats.alignment === 'left'} />
        <ToolbarButton label="Align center" icon={AlignCenter} onSaveSelection={onSaveSelection} onClick={command({ type: 'align', value: 'center' })} disabled={disabled} pressed={activeFormats.alignment === 'center'} />
        <ToolbarButton label="Align right" icon={AlignRight} onSaveSelection={onSaveSelection} onClick={command({ type: 'align', value: 'right' })} disabled={disabled} pressed={activeFormats.alignment === 'right'} />
        <ToolbarButton label="Justify text" icon={AlignJustify} onSaveSelection={onSaveSelection} onClick={command({ type: 'align', value: 'justify' })} disabled={disabled} pressed={activeFormats.alignment === 'justify'} />
        <ToolbarButton label="Bulleted list" icon={List} onSaveSelection={onSaveSelection} onClick={command({ type: 'list', value: 'unordered' })} disabled={disabled} pressed={activeFormats.list === 'unordered'} />
        <ToolbarButton label="Numbered list" icon={ListOrdered} onSaveSelection={onSaveSelection} onClick={command({ type: 'list', value: 'ordered' })} disabled={disabled} pressed={activeFormats.list === 'ordered'} />
        <ToolbarButton label="Decrease indent" icon={Outdent} onSaveSelection={onSaveSelection} onClick={command({ type: 'outdent' })} disabled={disabled} />
        <ToolbarButton label="Increase indent" icon={Indent} onSaveSelection={onSaveSelection} onClick={command({ type: 'indent' })} disabled={disabled} />
      </ToolbarGroup>
      <ToolbarGroup label="Insert">
        <ToolbarMenu label="Tables" disabled={disabled} isOpen={openMenu === 'tables'} onOpenChange={(open) => setOpenMenu(open ? 'tables' : null)}>
          <div role="group" aria-label="Insert actions">
            <ToolbarButton label="Insert table" title="Insert Table" icon={Table2} onSaveSelection={onSaveSelection} onClick={command({ type: 'insert-table' })} disabled={disabled} />
            <ToolbarButton label="Add table row" title="Add Table Row" icon={ListPlus} onSaveSelection={onSaveSelection} onClick={() => onLegacyCommand?.('addTableRow')} disabled={disabled || !onLegacyCommand} />
            <ToolbarButton label="Add table column" title="Add Table Column" icon={Table2} onSaveSelection={onSaveSelection} onClick={() => onLegacyCommand?.('addTableColumn')} disabled={disabled || !onLegacyCommand} />
          </div>
        </ToolbarMenu>
      </ToolbarGroup>
      <ToolbarGroup label="Page">
        <ToolbarButton label="Insert page break" title="Insert Page Break" icon={SeparatorHorizontal} onSaveSelection={onSaveSelection} onClick={onInsertPageBreak} disabled={disabled} />
        <ToolbarButton label="Add blank page" icon={ListPlus} onSaveSelection={onSaveSelection} onClick={onAddBlankPage} disabled={disabled} />
        <ToolbarButton label="Delete current page" icon={Trash2} onSaveSelection={onSaveSelection} onClick={onDeleteCurrentPage} disabled={disabled || !canDeletePage} destructive />
      </ToolbarGroup>
      <ToolbarGroup label="View">
        <ToolbarMenu label="Formats" disabled={disabled} isOpen={openMenu === 'formats'} onOpenChange={(open) => setOpenMenu(open ? 'formats' : null)}>
          <div role="group" aria-label="View actions" className="grid grid-cols-2 gap-2">
            <label className="flex h-8 self-end items-center gap-2 text-xs text-text-secondary">
              <input type="checkbox" aria-label="Show page numbers" checked={showPageNumbers} disabled={disabled} onPointerDown={onSaveSelection} onChange={(event) => onTogglePageNumbers(event.target.checked)} className="h-3.5 w-3.5 rounded border-border-primary text-oak-primary focus:ring-border-focus" />
              Page #
            </label>
          </div>
          <div role="group" aria-label="Advanced formatting" className="mt-3 grid grid-cols-2 gap-2 border-t border-border-primary pt-3">
            <label className="text-xs font-medium text-text-secondary">Font family
              <select aria-label="Font family" title="Font Family" disabled={disabled || !onLegacyCommand} defaultValue="Arial, Helvetica, sans-serif" onPointerDown={onSaveSelection} onChange={(event) => onLegacyCommand?.('fontName', event.target.value)} className={cn(compactSelectClass, 'mt-1')}>
                {DOCUMENT_FONT_OPTIONS.map((font) => <option key={font.value} value={font.value}>{font.label}</option>)}
              </select>
            </label>
            <label className="text-xs font-medium text-text-secondary">Font size
              <select aria-label="Font size" title="Font Size" disabled={disabled || !onLegacyCommand} defaultValue="11pt" onPointerDown={onSaveSelection} onChange={(event) => onLegacyCommand?.('customFontSize', event.target.value)} className={cn(compactSelectClass, 'mt-1')}>
                {DOCUMENT_FONT_SIZE_OPTIONS.map((size) => <option key={size} value={size}>{size.replace('pt', '')}</option>)}
              </select>
            </label>
            <label className="text-xs font-medium text-text-secondary">Paragraph style
              <select title="Paragraph Style" disabled={disabled || !onLegacyCommand} defaultValue="p" onPointerDown={onSaveSelection} onChange={(event) => onLegacyCommand?.('paragraphStyle', event.target.value)} className={cn(compactSelectClass, 'mt-1')}>
                <option value="p">Normal</option><option value="h1">Heading 1</option><option value="h2">Heading 2</option><option value="h3">Heading 3</option><option value="blockquote">Quote</option>
              </select>
            </label>
            <label className="text-xs font-medium text-text-secondary">Text color
              <input type="color" title="Text Color" defaultValue="#000000" disabled={disabled || !onLegacyCommand} onPointerDown={onSaveSelection} onChange={(event) => onLegacyCommand?.('textColor', event.target.value)} className="mt-1 h-8 w-full rounded border border-border-primary bg-background-secondary p-1" />
            </label>
            <label className="text-xs font-medium text-text-secondary">Highlight color
              <input type="color" title="Highlight Color" defaultValue="#ffffff" disabled={disabled || !onLegacyCommand} onPointerDown={onSaveSelection} onChange={(event) => onLegacyCommand?.('highlightColor', event.target.value)} className="mt-1 h-8 w-full rounded border border-border-primary bg-background-secondary p-1" />
            </label>
          </div>
        </ToolbarMenu>
      </ToolbarGroup>
    </div>
  );
}
