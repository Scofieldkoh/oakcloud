'use client';

import { useEffect, useRef, useState } from 'react';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Copy, GripVertical, MoveHorizontal, Trash2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Tooltip } from '@/components/ui/tooltip';
import { FIELD_TYPE_LABEL, WIDTH_CLASS, WIDTH_OPTIONS } from './builder-utils';
import type { BuilderField } from './builder-utils';

export function SortableFieldCard({
  field,
  selected,
  isDropTarget = false,
  dropPosition = null,
  onSelect,
  onDuplicate,
  onDelete,
  onSetWidth,
}: {
  field: BuilderField;
  selected: boolean;
  isDropTarget?: boolean;
  dropPosition?: 'before' | 'after' | null;
  onSelect: (id: string) => void;
  onDuplicate: (id: string) => void;
  onDelete: (id: string) => void;
  onSetWidth: (id: string, width: BuilderField['layoutWidth']) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: field.clientId,
  });
  const [showWidthOptions, setShowWidthOptions] = useState(false);
  const widthPopoverRef = useRef<HTMLDivElement>(null);
  const actionButtonClass = 'inline-flex h-7 w-7 items-center justify-center rounded text-text-secondary hover:bg-background-tertiary hover:text-text-primary';

  useEffect(() => {
    if (!showWidthOptions) return;

    function handleOutsideClick(event: MouseEvent) {
      if (!widthPopoverRef.current?.contains(event.target as Node)) {
        setShowWidthOptions(false);
      }
    }

    document.addEventListener('mousedown', handleOutsideClick);
    return () => {
      document.removeEventListener('mousedown', handleOutsideClick);
    };
  }, [showWidthOptions]);

  const style = {
    transform: !isDragging && transform ? CSS.Translate.toString(transform) : undefined,
    transition: isDragging ? undefined : transition,
    opacity: isDragging ? 0 : 1,
    pointerEvents: isDragging ? 'none' : undefined,
    willChange: 'transform',
  };

  return (
    <div ref={setNodeRef} style={style} className={cn(WIDTH_CLASS[field.layoutWidth], 'relative min-w-0')}>
      {isDropTarget && dropPosition && (
        <div
          className={cn(
            'pointer-events-none absolute left-2 right-2 z-20 border-t-2 border-oak-primary',
            dropPosition === 'before' ? '-top-1' : '-bottom-1'
          )}
        />
      )}
      <div
        className={cn(
          'rounded-lg border border-dashed bg-background-elevated px-3 py-3 transition-colors',
          field.type === 'PAGE_BREAK'
            ? 'border-orange-300 dark:border-orange-700 bg-orange-50/40 dark:bg-orange-900/10'
            : 'border-border-primary hover:border-border-secondary',
          selected && 'ring-1 ring-oak-primary border-oak-primary',
          isDropTarget && 'border-oak-primary/70 bg-oak-primary/5'
        )}
      >
        <div className="flex items-start gap-2">
          <Tooltip content="Drag">
            <button
              type="button"
              className="mt-0.5 rounded p-1 text-text-muted hover:text-text-primary cursor-grab active:cursor-grabbing"
              aria-label="Drag"
              {...attributes}
              {...listeners}
            >
              <GripVertical className="w-4 h-4" />
            </button>
          </Tooltip>

          <button
            type="button"
            className={cn('flex-1 min-w-0 text-left', field.type === 'PAGE_BREAK' && 'cursor-default')}
            onClick={() => {
              if (field.type === 'PAGE_BREAK') return;
              onSelect(field.clientId);
            }}
          >
            <div className="truncate font-semibold text-sm text-text-primary">
              {field.label || 'Untitled field'}
            </div>
            <div className="truncate text-xs text-text-secondary">
              {FIELD_TYPE_LABEL[field.type]}
              {field.key ? ` | ${field.key}` : ''}
            </div>
          </button>

          <div className="flex items-center gap-1">
            {field.type !== 'PAGE_BREAK' && (
              <div ref={widthPopoverRef} className="relative inline-flex">
                <Tooltip content="Width">
                  <button
                    type="button"
                    className={actionButtonClass}
                    onClick={() => setShowWidthOptions((prev) => !prev)}
                    aria-label="Field width"
                  >
                    <MoveHorizontal className="w-4 h-4" />
                  </button>
                </Tooltip>

                {showWidthOptions && (
                  <div className="absolute right-0 top-full z-40 mt-2 rounded-lg border border-border-primary bg-background-primary p-1.5 shadow-elevation-2">
                    <div className="flex items-center gap-1">
                      {WIDTH_OPTIONS.map((width) => (
                        <button
                          key={width}
                          type="button"
                          onClick={() => {
                            onSetWidth(field.clientId, width);
                            setShowWidthOptions(false);
                          }}
                          className={cn(
                            'rounded px-2.5 py-1 text-xs font-medium text-text-primary transition-colors',
                            field.layoutWidth === width
                              ? 'bg-orange-300 text-black'
                              : 'hover:bg-background-tertiary'
                          )}
                        >
                          {width}%
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
            <Tooltip content="Duplicate">
              <button
                type="button"
                className={actionButtonClass}
                onClick={() => onDuplicate(field.clientId)}
                aria-label="Duplicate"
              >
                <Copy className="w-4 h-4" />
              </button>
            </Tooltip>
            <Tooltip content="Delete">
              <button
                type="button"
                className={cn(actionButtonClass, 'hover:text-status-error')}
                onClick={() => onDelete(field.clientId)}
                aria-label="Delete"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </Tooltip>
          </div>
        </div>
      </div>
    </div>
  );
}
