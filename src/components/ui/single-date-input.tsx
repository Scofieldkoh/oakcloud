'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { DayPicker } from 'react-day-picker';
import { format, parse, isValid } from 'date-fns';
import { Calendar, AlertCircle } from 'lucide-react';
import { cn } from '@/lib/utils';

// Import react-day-picker styles
import 'react-day-picker/style.css';

export interface SingleDateInputProps {
  /** The current value as ISO date string (YYYY-MM-DD) or empty string */
  value?: string;
  /** Callback when value changes - returns ISO date string or empty string */
  onChange: (value: string) => void;
  /** Placeholder text when no date selected */
  placeholder?: string;
  /** Additional class name */
  className?: string;
  /** Whether the input is disabled */
  disabled?: boolean;
  /** Label for the input */
  label?: string;
  /** Error message */
  error?: string;
  /** Hint text */
  hint?: string;
  /** Whether the field is required */
  required?: boolean;
}

// Custom styles for react-day-picker v9 - using oak design system colors
const calendarStyles = `
  .rdp-single {
    --rdp-cell-size: 36px;
    --rdp-accent-color: #294d44;
    --rdp-accent-background-color: rgba(41, 77, 68, 0.15);
    --rdp-day-height: 36px;
    --rdp-day-width: 36px;
    --rdp-selected-font: 500;
    --rdp-outside-opacity: 0.4;
    margin: 0;
  }
  .rdp-single .rdp-root {
    --rdp-accent-color: #294d44;
    --rdp-accent-background-color: rgba(41, 77, 68, 0.15);
  }
  .rdp-single .rdp-month {
    margin: 0;
  }
  .rdp-single .rdp-caption_label {
    font-size: 0.875rem;
    font-weight: 500;
    color: var(--text-primary);
  }
  .rdp-single .rdp-nav {
    display: flex;
    align-items: center;
  }
  .rdp-single .rdp-button_previous,
  .rdp-single .rdp-button_next {
    width: 28px;
    height: 28px;
    padding: 0;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    border-radius: 6px;
    background: transparent;
    border: none;
    cursor: pointer;
    color: var(--text-secondary);
  }
  .rdp-single .rdp-button_previous:hover,
  .rdp-single .rdp-button_next:hover {
    background: var(--bg-tertiary, #f3f4f6);
    color: var(--text-primary);
  }
  .rdp-single .rdp-weekday {
    font-size: 0.75rem;
    font-weight: normal;
    color: var(--text-muted);
    width: var(--rdp-cell-size);
    height: 32px;
  }
  .rdp-single .rdp-day {
    width: var(--rdp-cell-size);
    height: var(--rdp-cell-size);
    font-size: 0.875rem;
    border-radius: 6px;
    cursor: pointer;
    transition: all 0.15s;
  }
  .rdp-single .rdp-day_button {
    border: none !important;
    outline: none !important;
  }
  .rdp-single .rdp-day_button:focus {
    outline: none !important;
    box-shadow: none !important;
  }
  .rdp-single .rdp-day:hover:not(.rdp-day_selected):not(.rdp-day_disabled) {
    background: var(--bg-tertiary, #f3f4f6);
  }
  .rdp-single .rdp-day_today:not(.rdp-day_selected) {
    font-weight: 600;
    color: #294d44;
  }
  .rdp-single .rdp-day_selected,
  .rdp-single .rdp-selected {
    background: rgba(41, 77, 68, 0.15) !important;
    color: #294d44 !important;
    font-weight: 500;
    border: none !important;
  }
  .rdp-single .rdp-day_outside {
    opacity: 0.4;
    color: var(--text-muted);
  }
  .rdp-single .rdp-day_disabled {
    opacity: 0.3;
    cursor: not-allowed;
  }
  .rdp-single .rdp-day:focus,
  .rdp-single .rdp-day:focus-visible,
  .rdp-single .rdp-day_button:focus,
  .rdp-single .rdp-day_button:focus-visible {
    outline: 2px solid rgba(41, 77, 68, 0.3) !important;
    outline-offset: -2px;
  }
  .rdp-single *:focus {
    outline-color: #294d44 !important;
  }
  .rdp-single button:focus-visible {
    outline: 2px solid rgba(41, 77, 68, 0.5) !important;
  }
`;

// Format date for display in input: "11 Jan 2026"
function formatDisplayDate(date: Date): string {
  return format(date, 'd MMM yyyy');
}

// Parse ISO date string to Date object
function parseISODate(dateString: string): Date | undefined {
  if (!dateString) return undefined;
  const parsed = parse(dateString, 'yyyy-MM-dd', new Date());
  return isValid(parsed) ? parsed : undefined;
}

// Format Date to ISO string (YYYY-MM-DD)
function formatISODate(date: Date): string {
  return format(date, 'yyyy-MM-dd');
}

// Try to parse various date formats from user input
function parseUserInput(input: string): Date | undefined {
  if (!input.trim()) return undefined;

  const trimmed = input.trim();

  // Try various formats
  const formats = [
    'yyyy-MM-dd',    // ISO: 2026-01-11
    'd/M/yyyy',      // 11/1/2026
    'd-M-yyyy',      // 11-1-2026
    'd MMM yyyy',    // 11 Jan 2026
    'd MMMM yyyy',   // 11 January 2026
    'dd/MM/yyyy',    // 11/01/2026
    'dd-MM-yyyy',    // 11-01-2026
    'MM/dd/yyyy',    // 01/11/2026 (US format)
    'd/M/yy',        // 11/1/26
    'd-M-yy',        // 11-1-26
  ];

  for (const fmt of formats) {
    try {
      const parsed = parse(trimmed, fmt, new Date());
      if (isValid(parsed)) {
        // Sanity check: year should be reasonable (1900-2100)
        const year = parsed.getFullYear();
        if (year >= 1900 && year <= 2100) {
          return parsed;
        }
      }
    } catch {
      // Continue to next format
    }
  }

  return undefined;
}

export function SingleDateInput({
  value = '',
  onChange,
  placeholder = 'dd/mm/yyyy',
  className,
  disabled,
  label,
  error,
  hint,
  required,
}: SingleDateInputProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [month, setMonth] = useState<Date>(() => parseISODate(value) || new Date());
  const [inputValue, setInputValue] = useState('');
  const [isEditing, setIsEditing] = useState(false);

  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState({ top: 0, left: 0 });
  const [mounted, setMounted] = useState(false);

  const selectedDate = parseISODate(value);

  // Mount check for portal
  useEffect(() => {
    setMounted(true);
  }, []);

  // Sync input value with external value - only when not actively editing
  useEffect(() => {
    if (!isEditing) {
      if (selectedDate) {
        setInputValue(formatDisplayDate(selectedDate));
      } else {
        setInputValue('');
      }
    }
  }, [value, selectedDate, isEditing]);

  // Update month when value changes
  useEffect(() => {
    const date = parseISODate(value);
    if (date) {
      setMonth(date);
    }
  }, [value]);

  // Calculate position with scroll and resize handling
  useEffect(() => {
    const updatePosition = () => {
      if (isOpen && containerRef.current) {
        const rect = containerRef.current.getBoundingClientRect();
        const popoverWidth = 300;
        const popoverHeight = 340;
        const viewportWidth = window.innerWidth;
        const viewportHeight = window.innerHeight;

        // Calculate horizontal position
        let left = rect.left;
        if (left + popoverWidth > viewportWidth - 16) {
          left = rect.right - popoverWidth;
        }
        if (left < 16) {
          left = 16;
        }

        // Calculate vertical position
        let top = rect.bottom + 4;
        if (top + popoverHeight > viewportHeight - 16) {
          top = rect.top - popoverHeight - 4;
          if (top < 16) {
            top = 16;
          }
        }

        setPosition({ top, left });
      }
    };

    if (isOpen) {
      updatePosition();
      window.addEventListener('scroll', updatePosition, true);
      window.addEventListener('resize', updatePosition);
      return () => {
        window.removeEventListener('scroll', updatePosition, true);
        window.removeEventListener('resize', updatePosition);
      };
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
      }
    };

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsOpen(false);
        inputRef.current?.focus();
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleEscape);

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [isOpen]);

  const handleSelect = useCallback(
    (date: Date | undefined) => {
      if (date) {
        onChange(formatISODate(date));
        setIsOpen(false);
        inputRef.current?.focus();
      }
    },
    [onChange]
  );

  const handleInputFocus = useCallback(() => {
    setIsEditing(true);
  }, []);

  const handleInputChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const newValue = e.target.value;
      setInputValue(newValue);

      // Try to parse as user types - silently update the underlying value
      const parsed = parseUserInput(newValue);
      if (parsed) {
        onChange(formatISODate(parsed));
        setMonth(parsed);
      } else if (!newValue.trim()) {
        onChange('');
      }
    },
    [onChange]
  );

  const handleInputBlur = useCallback(() => {
    setIsEditing(false);

    // On blur, format the display to the standard format
    if (selectedDate) {
      setInputValue(formatDisplayDate(selectedDate));
    } else if (inputValue.trim()) {
      // Try one more parse attempt
      const parsed = parseUserInput(inputValue);
      if (parsed) {
        onChange(formatISODate(parsed));
        setInputValue(formatDisplayDate(parsed));
      } else {
        // Invalid input, clear it
        setInputValue('');
        onChange('');
      }
    }
  }, [inputValue, onChange, selectedDate]);

  const handleCalendarClick = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      if (!disabled) {
        setIsOpen(!isOpen);
      }
    },
    [disabled, isOpen]
  );

  const inputId = label?.toLowerCase().replace(/\s+/g, '-');

  return (
    <div className={cn('flex flex-col gap-1.5', className)}>
      {/* Inject custom styles */}
      <style dangerouslySetInnerHTML={{ __html: calendarStyles }} />

      {label && (
        <label htmlFor={inputId} className="text-xs font-medium text-text-secondary">
          {label}
          {required && <span className="text-status-error ml-0.5">*</span>}
        </label>
      )}

      {/* Input container */}
      <div
        ref={containerRef}
        className={cn(
          'h-8 w-full flex items-center rounded-lg border',
          'bg-background-primary dark:bg-background-secondary border-border-primary',
          'hover:border-border-secondary transition-colors',
          'focus-within:ring-2 focus-within:ring-oak-primary/30 focus-within:border-oak-primary',
          disabled && 'opacity-50 cursor-not-allowed',
          error && 'border-status-error hover:border-status-error focus-within:border-status-error focus-within:ring-status-error/30'
        )}
      >
        {/* Text input */}
        <input
          ref={inputRef}
          id={inputId}
          type="text"
          value={inputValue}
          onFocus={handleInputFocus}
          onChange={handleInputChange}
          onBlur={handleInputBlur}
          placeholder={placeholder}
          disabled={disabled}
          aria-describedby={error ? `${inputId}-error` : hint ? `${inputId}-hint` : undefined}
          className={cn(
            'flex-1 h-full px-3 bg-transparent text-sm text-text-primary placeholder-text-muted',
            'focus:outline-none',
            disabled && 'cursor-not-allowed'
          )}
        />

        {/* Calendar button */}
        <button
          type="button"
          onClick={handleCalendarClick}
          disabled={disabled}
          className={cn(
            'h-full px-2 flex items-center justify-center',
            'text-text-muted hover:text-text-secondary transition-colors',
            'focus:outline-none',
            disabled && 'cursor-not-allowed'
          )}
          aria-label="Open calendar"
          tabIndex={-1}
        >
          <Calendar className="w-4 h-4" />
        </button>
      </div>

      {/* Error message */}
      {error && (
        <div id={`${inputId}-error`} className="flex items-center gap-1.5 text-xs text-status-error">
          <AlertCircle size={14} className="flex-shrink-0" />
          {error}
        </div>
      )}

      {/* Hint text */}
      {hint && !error && (
        <div id={`${inputId}-hint`} className="text-xs text-text-muted">
          {hint}
        </div>
      )}

      {/* Popover */}
      {isOpen &&
        mounted &&
        createPortal(
          <div
            ref={popoverRef}
            data-single-date-popover
            className={cn(
              'fixed z-[100] bg-background-elevated rounded-xl border border-border-primary shadow-elevation-2',
              'animate-fade-in p-3'
            )}
            style={{ top: position.top, left: position.left }}
          >
            <div className="rdp-single">
              <DayPicker
                mode="single"
                selected={selectedDate}
                onSelect={handleSelect}
                month={month}
                onMonthChange={setMonth}
                showOutsideDays
              />
            </div>
          </div>,
          document.body
        )}
    </div>
  );
}

export default SingleDateInput;
