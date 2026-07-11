'use client';

import {
  useEffect,
  useRef,
  useState,
  type ComponentType,
  type RefObject,
  type ReactNode,
} from 'react';
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
  Rows3,
  SeparatorHorizontal,
  Table2,
  Trash2,
  Underline,
  Undo2,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import type { A4DocumentLayout, A4MarginsMm } from './a4-pagination/layout';

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

const FONT_OPTIONS = [
  { value: 'Arial, Helvetica, sans-serif', label: 'Arial' },
  { value: "'Times New Roman', Times, serif", label: 'Times New Roman' },
  { value: "'Courier New', Courier, monospace", label: 'Courier New' },
  { value: 'Georgia, serif', label: 'Georgia' },
  { value: 'Verdana, Geneva, sans-serif', label: 'Verdana' },
  { value: "'Trebuchet MS', sans-serif", label: 'Trebuchet MS' },
  { value: "'Lucida Console', Monaco, monospace", label: 'Lucida Console' },
];

const FONT_SIZE_OPTIONS = ['8pt', '9pt', '10pt', '11pt', '12pt', '14pt', '16pt', '18pt', '20pt', '24pt', '28pt', '36pt'];
const LINE_HEIGHT_OPTIONS = [1, 1.15, 1.5, 2, 2.5, 3];
const PARAGRAPH_SPACING_OPTIONS = [
  { value: '0', label: 'No spacing' },
  { value: '0.25em', label: 'Compact' },
  { value: '0.5em', label: 'Normal' },
  { value: '1em', label: 'Loose' },
  { value: '1.5em', label: 'Wide' },
];

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
}: {
  label: string;
  disabled: boolean;
  children: ReactNode;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const dismiss = () => setIsOpen(false);
  useEscapeDismiss(isOpen, dismiss, triggerRef);

  return (
    <div className="relative">
      <button
        ref={triggerRef}
        type="button"
        aria-label={label}
        aria-expanded={isOpen}
        disabled={disabled}
        onClick={() => setIsOpen((open) => !open)}
        className={cn(compactControlClass, 'w-auto gap-1 px-2')}
      >
        <MoreHorizontal className="h-4 w-4" aria-hidden="true" />
        <span className="text-xs">More</span>
      </button>
      <div
        hidden={!isOpen}
        role="dialog"
        aria-label={`${label} popover`}
        className="absolute right-0 z-20 mt-2 w-72 rounded border border-border-primary bg-background-elevated p-3 shadow-lg"
      >
        {children}
      </div>
    </div>
  );
}

function MarginPopover({
  disabled,
  layout,
  onLayoutChange,
  onSaveSelection,
}: Pick<A4EditorToolbarProps, 'disabled' | 'layout' | 'onLayoutChange' | 'onSaveSelection'>) {
  const [isOpen, setIsOpen] = useState(false);
  const [sameOnAllSides, setSameOnAllSides] = useState(true);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const dismiss = () => setIsOpen(false);
  useEscapeDismiss(isOpen, dismiss, triggerRef);

  const updateMargin = (side: keyof A4MarginsMm, rawValue: string) => {
    const value = Number(rawValue);
    if (!Number.isFinite(value)) return;

    const margin = Math.min(60, Math.max(5, value));
    onLayoutChange({
      ...layout,
      marginsMm: sameOnAllSides
        ? { top: margin, right: margin, bottom: margin, left: margin }
        : { ...layout.marginsMm, [side]: margin },
    });
  };

  const inputs: Array<{ side: keyof A4MarginsMm; label: string }> = [
    { side: 'top', label: 'Top margin' },
    { side: 'right', label: 'Right margin' },
    { side: 'bottom', label: 'Bottom margin' },
    { side: 'left', label: 'Left margin' },
  ];

  return (
    <div className="relative">
      <button
        ref={triggerRef}
        type="button"
        aria-label="Page margins"
        aria-expanded={isOpen}
        title="Page margins"
        disabled={disabled}
        onPointerDown={onSaveSelection}
        onClick={() => setIsOpen((open) => !open)}
        className={compactControlClass}
      >
        <Rows3 className="h-4 w-4" aria-hidden="true" />
      </button>
      {isOpen ? (
        <div
          data-testid="a4-margin-popover"
          className="absolute left-0 z-20 mt-2 w-64 rounded border border-border-primary bg-background-elevated p-3 shadow-lg"
        >
          <div className="mb-3 flex items-center justify-between gap-2">
            <span className="text-xs font-medium text-text-primary">Page margins</span>
            <label className="flex items-center gap-1.5 text-xs text-text-secondary">
              <input
                type="checkbox"
                checked={sameOnAllSides}
                onPointerDown={onSaveSelection}
                onChange={(event) => setSameOnAllSides(event.target.checked)}
                className="h-3.5 w-3.5 rounded border-border-primary text-oak-primary focus:ring-border-focus"
              />
              Same on all sides
            </label>
          </div>
          {sameOnAllSides ? (
            <MarginInput
              label="Margin for all sides"
              value={layout.marginsMm.top}
              disabled={disabled}
              onSaveSelection={onSaveSelection}
              onChange={(value) => updateMargin('top', value)}
            />
          ) : (
            <div className="grid grid-cols-2 gap-2">
              {inputs.map(({ side, label }) => (
                <MarginInput
                  key={side}
                  label={label}
                  value={layout.marginsMm[side]}
                  disabled={disabled}
                  onSaveSelection={onSaveSelection}
                  onChange={(value) => updateMargin(side, value)}
                />
              ))}
            </div>
          )}
        </div>
      ) : null}
    </div>
  );
}

function MarginInput({
  label,
  value,
  disabled,
  onSaveSelection,
  onChange,
}: {
  label: string;
  value: number;
  disabled: boolean;
  onSaveSelection(): void;
  onChange(value: string): void;
}) {
  return (
    <label className="block text-xs font-medium text-text-secondary">
      {label}
      <span className="mt-1 flex items-center rounded border border-border-primary bg-background-secondary focus-within:ring-2 focus-within:ring-border-focus">
        <input
          type="number"
          aria-label={label}
          min="5"
          max="60"
          step="1"
          value={value}
          disabled={disabled}
          onPointerDown={onSaveSelection}
          onChange={(event) => onChange(event.target.value)}
          className="h-8 min-w-0 flex-1 bg-transparent px-2 text-sm text-text-primary outline-none disabled:cursor-not-allowed"
        />
        <span className="pr-2 text-2xs text-text-muted">mm</span>
      </span>
    </label>
  );
}

export function A4EditorToolbar({
  disabled,
  layout,
  activeFormats,
  showPageNumbers,
  canDeletePage,
  onCommand,
  onLayoutChange,
  onInsertPageBreak,
  onAddBlankPage,
  onDeleteCurrentPage,
  onTogglePageNumbers,
  onSaveSelection,
  onLegacyCommand,
}: A4EditorToolbarProps) {
  const command = (nextCommand: EditorCommand) => () => onCommand(nextCommand);

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
        <ToolbarMenu label="Insert actions" disabled={disabled}>
          <div role="group" aria-label="Insert actions">
            <ToolbarButton label="Insert table" title="Insert Table" icon={Table2} onSaveSelection={onSaveSelection} onClick={command({ type: 'insert-table' })} disabled={disabled} />
            <ToolbarButton label="Add table row" title="Add Table Row" icon={ListPlus} onSaveSelection={onSaveSelection} onClick={() => onLegacyCommand?.('addTableRow')} disabled={disabled || !onLegacyCommand} />
            <ToolbarButton label="Add table column" title="Add Table Column" icon={Table2} onSaveSelection={onSaveSelection} onClick={() => onLegacyCommand?.('addTableColumn')} disabled={disabled || !onLegacyCommand} />
          </div>
        </ToolbarMenu>
      </ToolbarGroup>
      <ToolbarGroup label="Page">
        <MarginPopover disabled={disabled} layout={layout} onLayoutChange={onLayoutChange} onSaveSelection={onSaveSelection} />
        <ToolbarButton label="Insert page break" title="Insert Page Break" icon={SeparatorHorizontal} onSaveSelection={onSaveSelection} onClick={onInsertPageBreak} disabled={disabled} />
        <ToolbarButton label="Add blank page" icon={ListPlus} onSaveSelection={onSaveSelection} onClick={onAddBlankPage} disabled={disabled} />
        <ToolbarButton label="Delete current page" icon={Trash2} onSaveSelection={onSaveSelection} onClick={onDeleteCurrentPage} disabled={disabled || !canDeletePage} destructive />
      </ToolbarGroup>
      <ToolbarGroup label="View">
        <ToolbarMenu label="More toolbar actions" disabled={disabled}>
          <div role="group" aria-label="View actions" className="grid grid-cols-2 gap-2">
            <label className="text-xs font-medium text-text-secondary">Line spacing
              <select aria-label="Line spacing" title="Line Spacing" value={layout.lineHeight} disabled={disabled} onPointerDown={onSaveSelection} onChange={(event) => onLayoutChange({ ...layout, lineHeight: Number(event.target.value) })} className={cn(compactSelectClass, 'mt-1')}>
                {LINE_HEIGHT_OPTIONS.map((value) => <option key={value} value={value}>{value === 1 ? 'Single' : value}</option>)}
              </select>
            </label>
            <label className="text-xs font-medium text-text-secondary">Paragraph spacing
              <select aria-label="Paragraph spacing" title="Paragraph Spacing" value={layout.paragraphSpacing} disabled={disabled} onPointerDown={onSaveSelection} onChange={(event) => onLayoutChange({ ...layout, paragraphSpacing: event.target.value })} className={cn(compactSelectClass, 'mt-1')}>
                {PARAGRAPH_SPACING_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
              </select>
            </label>
            <label className="text-xs font-medium text-text-secondary">Page margin
              <select aria-label="Uniform page margin" title="Page Margin" value={layout.marginsMm.top === layout.marginsMm.right && layout.marginsMm.top === layout.marginsMm.bottom && layout.marginsMm.top === layout.marginsMm.left ? layout.marginsMm.top : ''} disabled={disabled} onPointerDown={onSaveSelection} onChange={(event) => {
                const value = Number(event.target.value);
                if (Number.isFinite(value)) onLayoutChange({ ...layout, marginsMm: { top: value, right: value, bottom: value, left: value } });
              }} className={cn(compactSelectClass, 'mt-1')}>
                <option value="" disabled>Mixed</option>
                {[10, 15, 20, 25, 30].map((value) => <option key={value} value={value}>{value}mm</option>)}
              </select>
            </label>
            <label className="flex h-8 self-end items-center gap-2 text-xs text-text-secondary">
              <input type="checkbox" aria-label="Show page numbers" checked={showPageNumbers} disabled={disabled} onPointerDown={onSaveSelection} onChange={(event) => onTogglePageNumbers(event.target.checked)} className="h-3.5 w-3.5 rounded border-border-primary text-oak-primary focus:ring-border-focus" />
              Page #
            </label>
          </div>
          <div role="group" aria-label="Advanced formatting" className="mt-3 grid grid-cols-2 gap-2 border-t border-border-primary pt-3">
            <label className="text-xs font-medium text-text-secondary">Font family
              <select aria-label="Font family" title="Font Family" disabled={disabled || !onLegacyCommand} defaultValue="Arial, Helvetica, sans-serif" onPointerDown={onSaveSelection} onChange={(event) => onLegacyCommand?.('fontName', event.target.value)} className={cn(compactSelectClass, 'mt-1')}>
                {FONT_OPTIONS.map((font) => <option key={font.value} value={font.value}>{font.label}</option>)}
              </select>
            </label>
            <label className="text-xs font-medium text-text-secondary">Font size
              <select aria-label="Font size" title="Font Size" disabled={disabled || !onLegacyCommand} defaultValue="11pt" onPointerDown={onSaveSelection} onChange={(event) => onLegacyCommand?.('customFontSize', event.target.value)} className={cn(compactSelectClass, 'mt-1')}>
                {FONT_SIZE_OPTIONS.map((size) => <option key={size} value={size}>{size.replace('pt', '')}</option>)}
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
