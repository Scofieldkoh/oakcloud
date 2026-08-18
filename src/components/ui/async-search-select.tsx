'use client';

import { useState, useEffect, useRef, useCallback, useId, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { Search, Loader2, Check, X, ChevronLeft, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface AsyncSearchSelectOption {
  id: string;
  label: string;
  description?: string;
}

export interface AsyncSearchSelectPagination {
  /** Current page index (0-based). */
  page: number;
  hasPreviousPage: boolean;
  hasNextPage: boolean;
  onPreviousPage: () => void;
  onNextPage: () => void;
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
  /** Whether to render the magnifying-glass icon in the search input */
  showSearchIcon?: boolean;
  /** Additional classes for the search input text (font size/colour) */
  inputClassName?: string;
  /** Text to show when there's no search query */
  emptySearchText?: string;
  /** Text to show when search returns no results */
  noResultsText?: string;
  /** Optional server-side pagination controls for the results list. */
  pagination?: AsyncSearchSelectPagination;
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
  showSearchIcon = true,
  inputClassName = 'text-sm text-text-primary placeholder:text-text-muted',
  emptySearchText = 'Type to search',
  noResultsText = 'No results found',
  pagination,
}: AsyncSearchSelectProps<T>) {
  const [isOpen, setIsOpen] = useState(false);
  const [highlightedIndex, setHighlightedIndex] = useState(0);
  const [selectedItem, setSelectedItem] = useState<T | null>(null);
  const [mounted, setMounted] = useState(false);
  const [position, setPosition] = useState({ top: 0, left: 0, width: 0 });
  const inputId = useId();
  const labelId = `${inputId}-label`;
  const listboxId = `${inputId}-listbox`;
  const optionId = (index: number) => `${listboxId}-option-${index}`;

  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const selectedControlRef = useRef<HTMLDivElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const focusTargetRef = useRef<'selected' | 'input' | null>(null);

  // Mount check for portal
  useEffect(() => {
    setMounted(true);
  }, []);

  // Reset highlighted index when results change
  useEffect(() => {
    setHighlightedIndex(0);
  }, [options.length]);

  // Keep the displayed selected item in sync when the parent controls value
  // from query results or default selections.
  useEffect(() => {
    if (!value) {
      setSelectedItem(null);
      return;
    }

    if (selectedItem?.id === value) {
      return;
    }

    const matchingOption = options.find((item) => item.id === value);
    if (matchingOption) {
      setSelectedItem(matchingOption);
    }
  }, [options, selectedItem?.id, value]);

  useEffect(() => {
    if (focusTargetRef.current === 'selected' && selectedItem) {
      selectedControlRef.current?.focus();
      focusTargetRef.current = null;
    } else if (focusTargetRef.current === 'input' && !selectedItem) {
      inputRef.current?.focus();
      focusTargetRef.current = null;
    }
  }, [selectedItem]);

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
      focusTargetRef.current = 'selected';
      setSelectedItem(item);
      onChange(item.id, item);
      setIsOpen(false);
      onSearchChange('');
    },
    [onChange, onSearchChange]
  );

  const handleClear = useCallback(() => {
    focusTargetRef.current = 'input';
    setSelectedItem(null);
    onChange('', null);
    onSearchChange('');
  }, [onChange, onSearchChange]);

  const handleSelectedKeyDown = useCallback((event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Backspace' || event.key === 'Delete') {
      event.preventDefault();
      handleClear();
    }
  }, [handleClear]);

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
        <label id={labelId} htmlFor={inputId} className="block text-sm font-medium text-text-primary mb-1.5">
          {label}
        </label>
      )}

      {/* Selected Item Display or Search Input */}
      <div
        ref={containerRef}
        className={cn(
          'w-full flex min-h-11 items-center gap-2 rounded-lg border',
          'bg-background-secondary/30 border-border-primary',
          'hover:border-oak-primary/50 focus-within:ring-2 focus-within:ring-oak-primary/30',
          'transition-colors',
          disabled && 'opacity-50 cursor-not-allowed',
          isOpen && 'ring-2 ring-oak-primary/30 border-oak-primary'
        )}
      >
        {selectedItem ? (
          // Show selected item
          <div
            ref={selectedControlRef}
            id={inputId}
            role="combobox"
            aria-labelledby={label ? labelId : undefined}
            aria-label={label ? undefined : selectedItem.label}
            aria-expanded="false"
            aria-controls={listboxId}
            aria-haspopup="listbox"
            aria-readonly="true"
            tabIndex={0}
            onKeyDown={handleSelectedKeyDown}
            className="flex min-h-11 min-w-0 flex-1 items-center rounded focus:outline-none focus-visible:ring-2 focus-visible:ring-oak-primary/30"
          >
            {renderSelected ? renderSelected(selectedItem) : defaultRenderSelected(selectedItem)}
          </div>
        ) : (
          // Show search input
          <>
            {showSearchIcon && (
              <Search className="w-4 h-4 text-text-muted ml-3 shrink-0" />
            )}
            <input
              ref={inputRef}
              id={inputId}
              role="combobox"
              aria-label={label ? undefined : placeholder}
              aria-expanded={isOpen}
              aria-controls={listboxId}
              aria-haspopup="listbox"
              aria-autocomplete="list"
              aria-activedescendant={isOpen && options[highlightedIndex] ? optionId(highlightedIndex) : undefined}
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
              className={cn(
                'flex-1 bg-transparent outline-none min-w-0',
                showSearchIcon ? 'pr-3' : 'px-3',
                inputClassName,
              )}
            />
          </>
        )}

        {/* Clear button */}
        {selectedItem && !disabled && (
          <button
            type="button"
            onClick={handleClear}
            aria-label={label ? `Clear ${label}` : 'Clear selection'}
            className="mr-2 flex min-h-11 min-w-11 items-center justify-center rounded p-1 transition-colors hover:bg-background-tertiary"
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
            <div
              ref={listRef}
              id={listboxId}
              role="listbox"
              aria-label={label ? `${label} options` : 'Options'}
              className="max-h-64 overflow-y-auto py-1"
            >
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
                    id={optionId(index)}
                    role="option"
                    aria-selected={item.id === value}
                    tabIndex={-1}
                    data-index={index}
                    onClick={() => handleSelect(item)}
                    className="min-h-11"
                  >
                    {renderOption
                      ? renderOption(item, index === highlightedIndex, item.id === value)
                      : defaultRenderOption(item, index === highlightedIndex, item.id === value)}
                  </div>
                ))
              )}
            </div>

            {/* Pagination controls */}
            {pagination && (
              <div className="flex items-center justify-between border-t border-border-primary px-1.5 py-1">
                <button
                  type="button"
                  onClick={pagination.onPreviousPage}
                  disabled={!pagination.hasPreviousPage || isLoading}
                  className="inline-flex min-h-11 min-w-11 items-center justify-center gap-1 rounded-md px-2 text-xs font-medium text-text-secondary transition-colors hover:bg-background-tertiary hover:text-text-primary disabled:pointer-events-none disabled:opacity-40"
                >
                  <ChevronLeft className="h-3.5 w-3.5" aria-hidden="true" />
                  Previous
                </button>
                <span className="text-xs text-text-muted">
                  Page {pagination.page + 1}
                </span>
                <button
                  type="button"
                  onClick={pagination.onNextPage}
                  disabled={!pagination.hasNextPage || isLoading}
                  className="inline-flex min-h-11 min-w-11 items-center justify-center gap-1 rounded-md px-2 text-xs font-medium text-text-secondary transition-colors hover:bg-background-tertiary hover:text-text-primary disabled:pointer-events-none disabled:opacity-40"
                >
                  Next
                  <ChevronRight className="h-3.5 w-3.5" aria-hidden="true" />
                </button>
              </div>
            )}

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
