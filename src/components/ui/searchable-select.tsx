'use client';

import {
  useState,
  useRef,
  useEffect,
  useLayoutEffect,
  useCallback,
  useMemo,
  useId,
  type KeyboardEvent,
  type ChangeEvent,
} from 'react';
import { createPortal } from 'react-dom';
import { ChevronDown, Check, X } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface SelectOption {
  value: string;
  label: string;
  description?: string;
  group?: string;
}

export interface SearchableSelectProps {
  /** Available options */
  options: SelectOption[];
  /** Currently selected value */
  value: string;
  /** Callback when value changes */
  onChange: (value: string) => void;
  /** Placeholder text when no value selected */
  placeholder?: string;
  /** Whether the select is disabled */
  disabled?: boolean;
  /** Size variant */
  size?: 'sm' | 'md';
  /** Additional class name */
  className?: string;
  /** Label for the select */
  label?: string;
  /** Allow clearing the selection */
  clearable?: boolean;
  /** Show keyboard hints footer */
  showKeyboardHints?: boolean;
  /** Show chevron icon */
  showChevron?: boolean;
  /** Whether options are loading */
  loading?: boolean;
  /** Group options by this field (must match option.group) */
  groupBy?: string;
}

export function SearchableSelect({
  options,
  value,
  onChange,
  placeholder = 'Select...',
  disabled = false,
  size = 'sm',
  className,
  label,
  clearable = true,
  showKeyboardHints = true,
  showChevron = true,
  loading = false,
  groupBy,
}: SearchableSelectProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [highlightedIndex, setHighlightedIndex] = useState(-1);

  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState({ top: 0, left: 0, width: 0, inputTop: 0 });
  const [openAbove, setOpenAbove] = useState(false);
  const [mounted, setMounted] = useState(false);

  // Generate unique IDs for ARIA relationships
  const baseId = useId();
  const listboxId = `${baseId}-listbox`;
  const labelId = label ? `${baseId}-label` : undefined;

  // Mount check for portal
  useEffect(() => {
    setMounted(true);
  }, []);

  // Filter options based on search
  const filteredOptions = useMemo(() => {
    if (!search.trim()) return options;
    const searchLower = search.toLowerCase();
    return options.filter(
      (opt) =>
        opt.value.toLowerCase().includes(searchLower) ||
        opt.label.toLowerCase().includes(searchLower) ||
        opt.description?.toLowerCase().includes(searchLower)
    );
  }, [options, search]);

  // Get selected option
  const selectedOption = useMemo(
    () => options.find((opt) => opt.value === value),
    [options, value]
  );

  // Reset highlighted index when filtered options change
  useEffect(() => {
    setHighlightedIndex(-1);
  }, [filteredOptions.length]);

  // Focus input when opening
  useEffect(() => {
    if (isOpen && inputRef.current) {
      inputRef.current.focus();
      // Select all text when opening with existing value
      if (selectedOption) {
        inputRef.current.select();
      }
    }
  }, [isOpen, selectedOption]);

  // Reset search when closing
  useEffect(() => {
    if (!isOpen) {
      setSearch('');
      setHighlightedIndex(-1);
    }
  }, [isOpen]);

  // Calculate position using RAF for smooth updates
  const updatePosition = useCallback(() => {
    if (!containerRef.current) return;

    requestAnimationFrame(() => {
      if (!containerRef.current) return;

      const rect = containerRef.current.getBoundingClientRect();
      const popoverHeight = 280; // Max height

      const top = rect.bottom + 4;
      const left = rect.left;
      const width = rect.width;
      const inputTop = rect.top;
      const above = top + popoverHeight > window.innerHeight - 16;

      setPosition({ top, left, width, inputTop });
      setOpenAbove(above);
    });
  }, []);

  // Update position immediately when opening (useLayoutEffect for sync update before paint)
  useLayoutEffect(() => {
    if (isOpen && containerRef.current) {
      const rect = containerRef.current.getBoundingClientRect();
      const popoverHeight = 280;

      const top = rect.bottom + 4;
      const left = rect.left;
      const width = rect.width;
      const inputTop = rect.top;
      const above = top + popoverHeight > window.innerHeight - 16;

      setPosition({ top, left, width, inputTop });
      setOpenAbove(above);
    }
  }, [isOpen]);

  // Update position on scroll and resize
  useEffect(() => {
    if (!isOpen) return;

    const handleScrollOrResize = () => {
      updatePosition();
    };

    // Listen to scroll on all ancestors
    window.addEventListener('scroll', handleScrollOrResize, true);
    window.addEventListener('resize', handleScrollOrResize);

    return () => {
      window.removeEventListener('scroll', handleScrollOrResize, true);
      window.removeEventListener('resize', handleScrollOrResize);
    };
  }, [isOpen, updatePosition]);

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
      }
    };

    const handleEscape = (event: globalThis.KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleEscape);

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [isOpen]);

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
    (optionValue: string) => {
      onChange(optionValue);
      setIsOpen(false);
    },
    [onChange]
  );

  const handleClear = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      onChange('');
      setSearch('');
    },
    [onChange]
  );

  const handleInputChange = useCallback((e: ChangeEvent<HTMLInputElement>) => {
    setSearch(e.target.value);
    if (!isOpen) {
      setIsOpen(true);
    }
  }, [isOpen]);

  const handleInputFocus = useCallback(() => {
    if (!isOpen) {
      setIsOpen(true);
    }
  }, [isOpen]);

  const handleKeyDown = useCallback(
    (e: KeyboardEvent<HTMLInputElement>) => {
      switch (e.key) {
        case 'ArrowDown':
          e.preventDefault();
          if (!isOpen) {
            setIsOpen(true);
          } else {
            setHighlightedIndex((prev) =>
              prev < filteredOptions.length - 1 ? prev + 1 : prev
            );
          }
          break;
        case 'ArrowUp':
          e.preventDefault();
          if (isOpen) {
            setHighlightedIndex((prev) => (prev > 0 ? prev - 1 : -1));
          }
          break;
        case 'Enter':
          e.preventDefault();
          if (isOpen && filteredOptions[highlightedIndex]) {
            handleSelect(filteredOptions[highlightedIndex].value);
          } else if (!isOpen) {
            setIsOpen(true);
          }
          break;
        case 'Tab':
          setIsOpen(false);
          break;
        case 'Escape':
          setIsOpen(false);
          break;
      }
    },
    [isOpen, filteredOptions, highlightedIndex, handleSelect]
  );

  const sizeClasses = {
    sm: 'h-9 text-sm',
    md: 'h-10 text-base',
  };

  // Display value in input: show search when typing, otherwise show selected label
  const inputValue = isOpen ? search : (selectedOption?.label || '');

  // Get the active option ID for aria-activedescendant
  const activeOptionId = filteredOptions[highlightedIndex]
    ? `${baseId}-option-${filteredOptions[highlightedIndex].value}`
    : undefined;

  return (
    <div className={cn('relative', className)}>
      {label && (
        <label id={labelId} className="block text-sm font-medium text-text-primary mb-1.5">
          {label}
        </label>
      )}

      {/* Trigger / Input */}
      <div
        ref={containerRef}
        className={cn(
          'w-full flex items-center gap-2 rounded-lg border',
          'bg-background-secondary/30 border-border-primary',
          'hover:border-oak-primary/50 focus-within:ring-2 focus-within:ring-oak-primary/30',
          'transition-colors',
          sizeClasses[size],
          disabled && 'opacity-50 cursor-not-allowed',
          isOpen && 'ring-2 ring-oak-primary/30 border-oak-primary'
        )}
      >
        <input
          ref={inputRef}
          type="text"
          role="combobox"
          aria-expanded={isOpen}
          aria-haspopup="listbox"
          aria-controls={isOpen ? listboxId : undefined}
          aria-activedescendant={isOpen ? activeOptionId : undefined}
          aria-autocomplete="list"
          aria-labelledby={labelId}
          aria-label={!label ? placeholder : undefined}
          value={inputValue}
          onChange={handleInputChange}
          onFocus={handleInputFocus}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          disabled={disabled}
          className={cn(
            'flex-1 bg-transparent outline-none px-3 min-w-0',
            'text-text-primary placeholder:text-text-secondary',
            sizeClasses[size]
          )}
        />
        {clearable && value && !disabled && (
          <button
            type="button"
            onClick={handleClear}
            aria-label="Clear selection"
            className="p-0.5 hover:bg-background-tertiary rounded transition-colors mr-1"
          >
            <X className="w-3.5 h-3.5 text-text-muted" aria-hidden="true" />
          </button>
        )}
        {showChevron && (
          <button
            type="button"
            onClick={() => !disabled && setIsOpen(!isOpen)}
            className="pr-3 flex items-center"
            tabIndex={-1}
            aria-hidden="true"
          >
            <ChevronDown
              className={cn(
                'w-4 h-4 text-text-muted transition-transform flex-shrink-0',
                isOpen && 'rotate-180'
              )}
            />
          </button>
        )}
      </div>

      {/* Popover */}
      {isOpen &&
        mounted &&
        position.width > 0 &&
        createPortal(
          <div
            ref={popoverRef}
            data-searchable-select-popover
            className={cn(
              'fixed z-[100] bg-background-elevated rounded-xl border border-border-primary shadow-elevation-2',
              'animate-fade-in flex',
              openAbove ? 'flex-col-reverse' : 'flex-col'
            )}
            style={{
              ...(openAbove
                ? { bottom: window.innerHeight - position.inputTop + 4 }
                : { top: position.top }
              ),
              left: position.left,
              width: position.width,
              maxHeight: 280,
            }}
          >
            {/* Options List */}
            <div
              ref={listRef}
              id={listboxId}
              role="listbox"
              aria-label={label || placeholder}
              className="flex-1 overflow-y-auto py-1"
            >
              {loading ? (
                <div className="px-3 py-6 text-center text-sm text-text-muted" role="status">
                  Loading...
                </div>
              ) : options.length === 0 ? (
                <div className="px-3 py-6 text-center text-sm text-text-muted">
                  No options available
                </div>
              ) : filteredOptions.length === 0 ? (
                <div className="px-3 py-6 text-center text-sm text-text-muted">
                  No matches found
                </div>
              ) : (
                (() => {
                  // Group options if groupBy is specified
                  if (groupBy) {
                    const groups = new Map<string, SelectOption[]>();
                    filteredOptions.forEach((opt) => {
                      const groupName = opt.group || 'Other';
                      if (!groups.has(groupName)) {
                        groups.set(groupName, []);
                      }
                      groups.get(groupName)!.push(opt);
                    });

                    let flatIndex = 0;
                    return Array.from(groups.entries()).map(([groupName, groupOptions]) => (
                      <div key={groupName}>
                        <div className="px-3 py-1.5 text-xs font-medium text-white uppercase tracking-wide bg-oak-light">
                          {groupName}
                        </div>
                        {groupOptions.map((option) => {
                          const currentIndex = flatIndex++;
                          return (
                            <div
                              key={option.value}
                              id={`${baseId}-option-${option.value}`}
                              role="option"
                              aria-selected={option.value === value}
                              data-index={currentIndex}
                              onClick={() => handleSelect(option.value)}
                              className={cn(
                                'px-3 py-2 cursor-pointer transition-colors flex items-center gap-2',
                                currentIndex === highlightedIndex && 'bg-background-tertiary',
                                option.value === value && 'text-oak-primary',
                                currentIndex !== highlightedIndex &&
                                option.value !== value &&
                                'hover:bg-background-secondary'
                              )}
                            >
                              <div className="flex-1 min-w-0">
                                <div className="text-sm truncate">{option.label}</div>
                                {option.description && (
                                  <div className="text-xs text-text-muted truncate">
                                    {option.description}
                                  </div>
                                )}
                              </div>
                              {option.value === value && (
                                <Check className="w-4 h-4 text-oak-primary flex-shrink-0" aria-hidden="true" />
                              )}
                            </div>
                          );
                        })}
                      </div>
                    ));
                  }

                  // Regular ungrouped rendering
                  return filteredOptions.map((option, index) => (
                    <div
                      key={option.value}
                      id={`${baseId}-option-${option.value}`}
                      role="option"
                      aria-selected={option.value === value}
                      data-index={index}
                      onClick={() => handleSelect(option.value)}
                      className={cn(
                        'px-3 py-2 cursor-pointer transition-colors flex items-center gap-2',
                        index === highlightedIndex && 'bg-background-tertiary',
                        option.value === value && 'text-oak-primary',
                        index !== highlightedIndex &&
                        option.value !== value &&
                        'hover:bg-background-secondary'
                      )}
                    >
                      <div className="flex-1 min-w-0">
                        <div className="text-sm truncate">{option.label}</div>
                        {option.description && (
                          <div className="text-xs text-text-muted truncate">
                            {option.description}
                          </div>
                        )}
                      </div>
                      {option.value === value && (
                        <Check className="w-4 h-4 text-oak-primary flex-shrink-0" aria-hidden="true" />
                      )}
                    </div>
                  ));
                })()
              )}
            </div>

            {/* Footer hint */}
            {showKeyboardHints && (
              <div
                className={cn(
                  'px-3 py-2 bg-background-secondary',
                  openAbove
                    ? 'border-b border-border-primary rounded-t-xl'
                    : 'border-t border-border-primary rounded-b-xl'
                )}
              >
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
            )}
          </div>,
          document.body
        )}
    </div>
  );
}

export default SearchableSelect;
