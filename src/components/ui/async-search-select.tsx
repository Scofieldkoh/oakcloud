'use client';

import { useState, useEffect, useRef, useCallback, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { Search, Loader2, Check, X } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface AsyncSearchSelectOption {
  id: string;
  label: string;
  description?: string;
}

export interface AsyncSearchSelectProps<T extends AsyncSearchSelectOption> {
  /** Label for the select */
  label?: string;
  /** Currently selected value ID */
  value: string;
  /** Callback when value changes */
  onChange: (id: string, item: T | null) => void;
  /** Placeholder text */
  placeholder?: string;
  /** Whether the select is disabled */
  disabled?: boolean;
  /** Additional class name */
  className?: string;
  /** Search results from async query */
  options: T[];
  /** Whether options are loading */
  isLoading: boolean;
  /** Search query state */
  searchQuery: string;
  /** Callback to update search query */
  onSearchChange: (query: string) => void;
  /** Custom render function for selected item */
  renderSelected?: (item: T) => ReactNode;
  /** Custom render function for option in dropdown */
  renderOption?: (item: T, isHighlighted: boolean, isSelected: boolean) => ReactNode;
  /** Icon to show in search input and options */
  icon?: ReactNode;
  /** Text to show when there's no search query */
  emptySearchText?: string;
  /** Text to show when search returns no results */
  noResultsText?: string;
}

export function AsyncSearchSelect<T extends AsyncSearchSelectOption>({
  label,
  value,
  onChange,
  placeholder = 'Search...',
  disabled = false,
  className,
  options,
  isLoading,
  searchQuery,
  onSearchChange,
  renderSelected,
  renderOption,
  icon,
  emptySearchText = 'Type to search',
  noResultsText = 'No results found',
}: AsyncSearchSelectProps<T>) {
  const [isOpen, setIsOpen] = useState(false);
  const [highlightedIndex, setHighlightedIndex] = useState(0);
  const [selectedItem, setSelectedItem] = useState<T | null>(null);
  const [mounted, setMounted] = useState(false);
  const [position, setPosition] = useState({ top: 0, left: 0, width: 0 });

  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  // Mount check for portal
  useEffect(() => {
    setMounted(true);
  }, []);

  // Reset highlighted index when results change
  useEffect(() => {
    setHighlightedIndex(0);
  }, [options.length]);

  // Update position when opening
  useEffect(() => {
    if (isOpen && containerRef.current) {
      const rect = containerRef.current.getBoundingClientRect();
      setPosition({
        top: rect.bottom + 4,
        left: rect.left,
        width: rect.width,
      });
    }
  }, [isOpen]);

  // Handle click outside
  useEffect(() => {
    if (!isOpen) return;

    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Node;
      if (
        containerRef.current &&
        !containerRef.current.contains(target) &&
        popoverRef.current &&
        !popoverRef.current.contains(target)
      ) {
        setIsOpen(false);
        onSearchChange('');
      }
    };

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsOpen(false);
        onSearchChange('');
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleEscape);

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [isOpen, onSearchChange]);

  // Scroll highlighted item into view
  useEffect(() => {
    if (isOpen && listRef.current) {
      const highlightedElement = listRef.current.querySelector(
        `[data-index="${highlightedIndex}"]`
      );
      if (highlightedElement) {
        highlightedElement.scrollIntoView({ block: 'nearest' });
      }
    }
  }, [highlightedIndex, isOpen]);

  const handleSelect = useCallback(
    (item: T) => {
      setSelectedItem(item);
      onChange(item.id, item);
      setIsOpen(false);
      onSearchChange('');
    },
    [onChange, onSearchChange]
  );

  const handleClear = useCallback(() => {
    setSelectedItem(null);
    onChange('', null);
    onSearchChange('');
  }, [onChange, onSearchChange]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      switch (e.key) {
        case 'ArrowDown':
          e.preventDefault();
          if (!isOpen) {
            setIsOpen(true);
          } else {
            setHighlightedIndex((prev) =>
              prev < options.length - 1 ? prev + 1 : prev
            );
          }
          break;
        case 'ArrowUp':
          e.preventDefault();
          if (isOpen) {
            setHighlightedIndex((prev) => (prev > 0 ? prev - 1 : 0));
          }
          break;
        case 'Enter':
          e.preventDefault();
          if (isOpen && options[highlightedIndex]) {
            handleSelect(options[highlightedIndex]);
          } else if (!isOpen) {
            setIsOpen(true);
          }
          break;
        case 'Tab':
          setIsOpen(false);
          onSearchChange('');
          break;
        case 'Escape':
          setIsOpen(false);
          onSearchChange('');
          break;
      }
    },
    [isOpen, options, highlightedIndex, handleSelect, onSearchChange]
  );

  const defaultRenderSelected = (item: T) => (
    <div className="flex-1 flex items-center gap-2 px-3 min-w-0">
      {icon && <span className="text-text-tertiary shrink-0">{icon}</span>}
      <span className="text-sm text-text-primary truncate">{item.label}</span>
      {item.description && (
        <span className="text-xs text-text-muted truncate hidden sm:inline">
          ({item.description})
        </span>
      )}
    </div>
  );

  const defaultRenderOption = (item: T, isHighlighted: boolean, isSelected: boolean) => (
    <div
      className={cn(
        'px-3 py-2.5 cursor-pointer transition-colors flex items-center gap-3',
        isHighlighted && 'bg-background-tertiary',
        isSelected && 'text-oak-primary',
        !isHighlighted && !isSelected && 'hover:bg-background-secondary'
      )}
    >
      {icon && <span className="text-text-tertiary shrink-0">{icon}</span>}
      <div className="flex-1 min-w-0">
        <div className="text-sm font-medium truncate">{item.label}</div>
        {item.description && (
          <div className="text-xs text-text-muted truncate">{item.description}</div>
        )}
      </div>
      {isSelected && <Check className="w-4 h-4 text-oak-primary shrink-0" />}
    </div>
  );

  return (
    <div className={cn('relative', className)}>
      {label && (
        <label className="block text-sm font-medium text-text-primary mb-1.5">
          {label}
        </label>
      )}

      {/* Selected Item Display or Search Input */}
      <div
        ref={containerRef}
        className={cn(
          'w-full flex items-center gap-2 rounded-lg border h-9',
          'bg-background-secondary/30 border-border-primary',
          'hover:border-oak-primary/50 focus-within:ring-2 focus-within:ring-oak-primary/30',
          'transition-colors',
          disabled && 'opacity-50 cursor-not-allowed',
          isOpen && 'ring-2 ring-oak-primary/30 border-oak-primary'
        )}
      >
        {selectedItem ? (
          // Show selected item
          renderSelected ? renderSelected(selectedItem) : defaultRenderSelected(selectedItem)
        ) : (
          // Show search input
          <>
            <Search className="w-4 h-4 text-text-muted ml-3 shrink-0" />
            <input
              ref={inputRef}
              type="text"
              value={searchQuery}
              onChange={(e) => {
                onSearchChange(e.target.value);
                if (!isOpen) setIsOpen(true);
              }}
              onFocus={() => setIsOpen(true)}
              onKeyDown={handleKeyDown}
              placeholder={placeholder}
              disabled={disabled}
              className="flex-1 bg-transparent outline-none text-sm text-text-primary placeholder:text-text-muted min-w-0 pr-3"
            />
          </>
        )}

        {/* Clear button */}
        {selectedItem && !disabled && (
          <button
            type="button"
            onClick={handleClear}
            className="p-1 hover:bg-background-tertiary rounded transition-colors mr-2"
          >
            <X className="w-3.5 h-3.5 text-text-muted" />
          </button>
        )}
      </div>

      {/* Dropdown */}
      {isOpen &&
        !selectedItem &&
        mounted &&
        position.width > 0 &&
        createPortal(
          <div
            ref={popoverRef}
            className="fixed z-[100] bg-background-elevated rounded-xl border border-border-primary shadow-elevation-2 animate-fade-in"
            style={{
              top: position.top,
              left: position.left,
              width: position.width,
              maxHeight: 320,
            }}
          >
            {/* Results List */}
            <div ref={listRef} className="max-h-64 overflow-y-auto py-1">
              {isLoading ? (
                <div className="px-3 py-6 text-center">
                  <Loader2 className="w-5 h-5 animate-spin mx-auto text-text-muted" />
                  <p className="text-sm text-text-muted mt-2">Searching...</p>
                </div>
              ) : options.length === 0 ? (
                <div className="px-3 py-6 text-center text-sm text-text-muted">
                  {searchQuery ? noResultsText : emptySearchText}
                </div>
              ) : (
                options.map((item, index) => (
                  <div
                    key={item.id}
                    data-index={index}
                    onClick={() => handleSelect(item)}
                  >
                    {renderOption
                      ? renderOption(item, index === highlightedIndex, item.id === value)
                      : defaultRenderOption(item, index === highlightedIndex, item.id === value)}
                  </div>
                ))
              )}
            </div>

            {/* Footer hint */}
            <div className="px-3 py-2 bg-background-secondary border-t border-border-primary rounded-b-xl">
              <div className="flex items-center gap-3 text-xs text-text-muted">
                <span>
                  <kbd className="px-1.5 py-0.5 bg-background-tertiary rounded text-[10px]">
                    ↑↓
                  </kbd>{' '}
                  Navigate
                </span>
                <span>
                  <kbd className="px-1.5 py-0.5 bg-background-tertiary rounded text-[10px]">
                    Enter
                  </kbd>{' '}
                  Select
                </span>
                <span>
                  <kbd className="px-1.5 py-0.5 bg-background-tertiary rounded text-[10px]">
                    Esc
                  </kbd>{' '}
                  Close
                </span>
              </div>
            </div>
          </div>,
          document.body
        )}
    </div>
  );
}
