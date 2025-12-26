'use client';

import { forwardRef, useRef, useEffect, useState, useCallback } from 'react';
import { Box } from '@chakra-ui/react';
import { Calendar, AlertCircle, ChevronLeft, ChevronRight } from 'lucide-react';
import { format, startOfMonth, endOfMonth, eachDayOfInterval, isSameMonth, isSameDay, addMonths, subMonths, setYear, setMonth, getYear, getMonth } from 'date-fns';

export interface DateInputProps {
  label?: string;
  error?: string;
  hint?: string;
  value?: string; // YYYY-MM-DD format
  onChange?: (value: string) => void;
  onBlur?: () => void;
  disabled?: boolean;
  required?: boolean;
  id?: string;
  name?: string;
  placeholder?: string;
  size?: 'sm' | 'md';
}

// Calendar Picker Component
function CalendarPicker({
  selectedDate,
  onSelect,
  onClose,
}: {
  selectedDate: Date | null;
  onSelect: (date: Date) => void;
  onClose: () => void;
}) {
  const [viewDate, setViewDate] = useState(selectedDate || new Date());
  const [showYearMonth, setShowYearMonth] = useState(false);
  const calendarRef = useRef<HTMLDivElement>(null);

  // Close on outside click
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (calendarRef.current && !calendarRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [onClose]);

  const monthStart = startOfMonth(viewDate);
  const monthEnd = endOfMonth(viewDate);
  const days = eachDayOfInterval({ start: monthStart, end: monthEnd });

  // Pad start of month to align with day of week
  const startDay = monthStart.getDay();
  const paddedDays: (Date | null)[] = [
    ...Array(startDay).fill(null),
    ...days,
  ];

  const weekDays = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

  // Generate year options (100 years back, 10 years forward)
  const currentYear = new Date().getFullYear();
  const years = Array.from({ length: 111 }, (_, i) => currentYear - 100 + i);

  return (
    <div
      ref={calendarRef}
      className="absolute top-full left-0 mt-1 z-50 bg-background-primary dark:bg-background-secondary border border-border-primary rounded-lg shadow-lg p-3 w-[calc(100vw-2rem)] sm:w-auto sm:min-w-[260px] max-w-[300px]"
    >
      {/* Header */}
      <div className="flex items-center justify-between mb-2">
        <button
          type="button"
          onClick={() => setViewDate(subMonths(viewDate, 1))}
          className="p-2 sm:p-1 hover:bg-background-tertiary rounded transition-colors min-w-[44px] min-h-[44px] sm:min-w-0 sm:min-h-0 flex items-center justify-center"
        >
          <ChevronLeft className="w-4 h-4 text-text-secondary" />
        </button>
        <button
          type="button"
          onClick={() => setShowYearMonth(!showYearMonth)}
          className="text-sm font-medium text-text-primary hover:text-oak-light transition-colors px-2 py-2 sm:py-1 rounded hover:bg-background-tertiary min-h-[44px] sm:min-h-0"
        >
          {format(viewDate, 'MMMM yyyy')}
        </button>
        <button
          type="button"
          onClick={() => setViewDate(addMonths(viewDate, 1))}
          className="p-2 sm:p-1 hover:bg-background-tertiary rounded transition-colors min-w-[44px] min-h-[44px] sm:min-w-0 sm:min-h-0 flex items-center justify-center"
        >
          <ChevronRight className="w-4 h-4 text-text-secondary" />
        </button>
      </div>

      {/* Year/Month Selector */}
      {showYearMonth && (
        <div className="mb-3 flex gap-2">
          <select
            value={getMonth(viewDate)}
            onChange={(e) => setViewDate(setMonth(viewDate, parseInt(e.target.value)))}
            className="flex-1 text-xs bg-background-tertiary border border-border-primary rounded px-2 py-1 text-text-primary"
          >
            {months.map((m, i) => (
              <option key={m} value={i}>{m}</option>
            ))}
          </select>
          <select
            value={getYear(viewDate)}
            onChange={(e) => setViewDate(setYear(viewDate, parseInt(e.target.value)))}
            className="flex-1 text-xs bg-background-tertiary border border-border-primary rounded px-2 py-1 text-text-primary"
          >
            {years.map((y) => (
              <option key={y} value={y}>{y}</option>
            ))}
          </select>
        </div>
      )}

      {/* Weekday Headers */}
      <div className="grid grid-cols-7 gap-1 mb-1">
        {weekDays.map((day) => (
          <div key={day} className="text-center text-xs text-text-muted font-medium py-1">
            {day}
          </div>
        ))}
      </div>

      {/* Days Grid */}
      <div className="grid grid-cols-7 gap-1">
        {paddedDays.map((day, i) => {
          if (!day) {
            return <div key={`empty-${i}`} className="w-8 h-8 sm:w-8 sm:h-8" />;
          }

          const isSelected = selectedDate && isSameDay(day, selectedDate);
          const isToday = isSameDay(day, new Date());
          const isCurrentMonth = isSameMonth(day, viewDate);

          return (
            <button
              key={day.toISOString()}
              type="button"
              onClick={() => {
                onSelect(day);
                onClose();
              }}
              className={`
                w-full aspect-square min-h-[36px] sm:w-8 sm:h-8 sm:min-h-0 text-xs rounded transition-colors
                ${isSelected
                  ? 'bg-oak-primary text-white'
                  : isToday
                    ? 'bg-oak-primary/20 text-oak-light'
                    : isCurrentMonth
                      ? 'text-text-primary hover:bg-background-tertiary'
                      : 'text-text-muted hover:bg-background-tertiary'
                }
              `}
            >
              {format(day, 'd')}
            </button>
          );
        })}
      </div>

      {/* Today Button */}
      <div className="mt-2 pt-2 border-t border-border-secondary">
        <button
          type="button"
          onClick={() => {
            onSelect(new Date());
            onClose();
          }}
          className="w-full text-xs text-oak-light hover:text-oak-primary transition-colors py-1"
        >
          Today
        </button>
      </div>
    </div>
  );
}

export const DateInput = forwardRef<HTMLInputElement, DateInputProps>(
  ({ label, error, hint, value, onChange, onBlur, disabled, required, id, name, placeholder, size = 'md' }, ref) => {
    const inputId = id || name || label?.toLowerCase().replace(/\s+/g, '-');
    const [showCalendar, setShowCalendar] = useState(false);
    const containerRef = useRef<HTMLDivElement>(null);

    // Parse initial value
    const parseDate = useCallback((dateStr: string | undefined) => {
      if (!dateStr) return { day: '', month: '', year: '' };
      const parts = dateStr.split('-');
      if (parts.length === 3) {
        return {
          year: parts[0],
          month: parts[1],
          day: parts[2],
        };
      }
      return { day: '', month: '', year: '' };
    }, []);

    const [dateState, setDateState] = useState(() => parseDate(value));
    const [isFocused, setIsFocused] = useState(false);

    const dayRef = useRef<HTMLInputElement>(null);
    const monthRef = useRef<HTMLInputElement>(null);
    const yearRef = useRef<HTMLInputElement>(null);
    const hiddenRef = useRef<HTMLInputElement>(null);

    // Sync external value changes (only when not focused and values differ)
    useEffect(() => {
      // Don't sync while user is actively editing
      if (isFocused) return;

      const parsed = parseDate(value);
      // Check if current state would produce the same date string
      // This prevents overwriting user's unpadded input (e.g., "1" becoming "01")
      const currentDateStr = dateState.day && dateState.month && dateState.year.length === 4
        ? `${dateState.year}-${dateState.month.padStart(2, '0')}-${dateState.day.padStart(2, '0')}`
        : '';
      const incomingDateStr = parsed.day && parsed.month && parsed.year.length === 4
        ? `${parsed.year}-${parsed.month.padStart(2, '0')}-${parsed.day.padStart(2, '0')}`
        : '';

      // Only sync if the dates are actually different
      if (currentDateStr !== incomingDateStr) {
        setDateState(parsed);
      }
    }, [value, parseDate, dateState.day, dateState.month, dateState.year, isFocused]);

    // Handle focus tracking for the entire input group
    const handleFocus = () => setIsFocused(true);
    const handleBlur = (e: React.FocusEvent) => {
      // Check if focus is moving to another element within the same container
      const container = containerRef.current;
      if (container && !container.contains(e.relatedTarget as Node)) {
        setIsFocused(false);
        onBlur?.();
      }
    };

    // Combine and emit value
    const emitChange = useCallback((newState: { day: string; month: string; year: string }) => {
      const { day, month, year } = newState;
      if (day && month && year.length === 4) {
        const paddedDay = day.padStart(2, '0');
        const paddedMonth = month.padStart(2, '0');
        const dateStr = `${year}-${paddedMonth}-${paddedDay}`;
        onChange?.(dateStr);
      } else if (!day && !month && !year) {
        onChange?.('');
      }
    }, [onChange]);

    const handleDayChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      let val = e.target.value.replace(/\D/g, '').slice(0, 2);

      // Validate day range
      const numVal = parseInt(val, 10);
      if (numVal > 31) val = '31';

      const newState = { ...dateState, day: val };
      setDateState(newState);
      emitChange(newState);

      // Auto-advance to month when 2 digits entered
      if (val.length === 2) {
        monthRef.current?.focus();
        monthRef.current?.select();
      }
    };

    const handleMonthChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      let val = e.target.value.replace(/\D/g, '').slice(0, 2);

      // Validate month range
      const numVal = parseInt(val, 10);
      if (numVal > 12) val = '12';

      const newState = { ...dateState, month: val };
      setDateState(newState);
      emitChange(newState);

      // Auto-advance to year when 2 digits entered
      if (val.length === 2) {
        yearRef.current?.focus();
        yearRef.current?.select();
      }
    };

    const handleYearChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      const val = e.target.value.replace(/\D/g, '').slice(0, 4);
      const newState = { ...dateState, year: val };
      setDateState(newState);
      emitChange(newState);
    };

    const handleKeyDown = (
      e: React.KeyboardEvent<HTMLInputElement>,
      field: 'day' | 'month' | 'year'
    ) => {
      // Handle backspace navigation
      if (e.key === 'Backspace') {
        const target = e.target as HTMLInputElement;
        if (target.value === '' || target.selectionStart === 0) {
          if (field === 'month') {
            dayRef.current?.focus();
          } else if (field === 'year') {
            monthRef.current?.focus();
          }
        }
      }

      // Handle slash/dash for navigation
      if (e.key === '/' || e.key === '-') {
        e.preventDefault();
        if (field === 'day') {
          monthRef.current?.focus();
        } else if (field === 'month') {
          yearRef.current?.focus();
        }
      }
    };

    // Handle calendar date selection
    const handleCalendarSelect = (date: Date) => {
      const newState = {
        day: format(date, 'd'),
        month: format(date, 'M'),
        year: format(date, 'yyyy'),
      };
      setDateState(newState);
      emitChange(newState);
    };

    // Get selected date for calendar
    const getSelectedDate = (): Date | null => {
      if (dateState.day && dateState.month && dateState.year.length === 4) {
        const date = new Date(
          parseInt(dateState.year),
          parseInt(dateState.month) - 1,
          parseInt(dateState.day)
        );
        return isNaN(date.getTime()) ? null : date;
      }
      return null;
    };

    const inputBaseClass = `
      w-full text-center bg-transparent border-none outline-none
      text-text-primary placeholder:text-text-muted
      focus:outline-none
    `;

    const heightClass = size === 'sm' ? 'h-[26px]' : 'h-8';
    const textClass = size === 'sm' ? 'text-xs' : 'text-sm';
    const inputWidthDay = size === 'sm' ? 'w-6' : 'w-8';
    const inputWidthYear = size === 'sm' ? 'w-10' : 'w-12';
    const paddingClass = size === 'sm' ? 'px-2' : 'px-3';

    const containerClass = `
      flex items-center gap-1 ${heightClass} ${paddingClass} rounded-lg
      bg-background-primary dark:bg-background-secondary
      border border-border-primary
      hover:border-border-secondary
      focus-within:border-oak-primary focus-within:ring-2 focus-within:ring-oak-primary/30 focus-within:ring-offset-2
      transition-colors
      ${error ? 'border-status-error hover:border-status-error focus-within:border-status-error focus-within:ring-status-error/30' : ''}
      ${disabled ? 'opacity-50 cursor-not-allowed' : ''}
    `;

    return (
      <Box display="flex" flexDirection="column" gap="1.5">
        {label && (
          <label
            htmlFor={`${inputId}-day`}
            className="text-xs font-medium text-text-secondary block"
          >
            {label}
            {required && <span className="text-red-500 ml-0.5">*</span>}
          </label>
        )}

        {/* Hidden input for form submission */}
        <input
          ref={(node) => {
            // Handle both refs
            (hiddenRef as React.MutableRefObject<HTMLInputElement | null>).current = node;
            if (typeof ref === 'function') {
              ref(node);
            } else if (ref) {
              ref.current = node;
            }
          }}
          type="hidden"
          name={name}
          value={dateState.year && dateState.month && dateState.day
            ? `${dateState.year}-${dateState.month.padStart(2, '0')}-${dateState.day.padStart(2, '0')}`
            : ''
          }
        />

        <div ref={containerRef} className="relative">
          <div className={containerClass}>
            {/* Calendar Icon - Clickable */}
            <button
              type="button"
              onClick={() => !disabled && setShowCalendar(!showCalendar)}
              disabled={disabled}
              className="flex-shrink-0 hover:text-oak-light transition-colors disabled:cursor-not-allowed"
              aria-label="Open calendar"
            >
              <Calendar className={`${size === 'sm' ? 'w-3.5 h-3.5' : 'w-4 h-4'} text-text-muted`} />
            </button>

            {/* Day */}
            <input
              ref={dayRef}
              id={`${inputId}-day`}
              type="text"
              inputMode="numeric"
              placeholder="DD"
              value={dateState.day}
              onChange={handleDayChange}
              onKeyDown={(e) => handleKeyDown(e, 'day')}
              onFocus={handleFocus}
              onBlur={handleBlur}
              disabled={disabled}
              className={`${inputBaseClass} ${inputWidthDay} ${textClass}`}
              aria-label="Day"
            />

            <span className={`text-text-muted ${textClass}`}>/</span>

            {/* Month */}
            <input
              ref={monthRef}
              id={`${inputId}-month`}
              type="text"
              inputMode="numeric"
              placeholder="MM"
              value={dateState.month}
              onChange={handleMonthChange}
              onKeyDown={(e) => handleKeyDown(e, 'month')}
              onFocus={handleFocus}
              onBlur={handleBlur}
              disabled={disabled}
              className={`${inputBaseClass} ${inputWidthDay} ${textClass}`}
              aria-label="Month"
            />

            <span className={`text-text-muted ${textClass}`}>/</span>

            {/* Year */}
            <input
              ref={yearRef}
              id={`${inputId}-year`}
              type="text"
              inputMode="numeric"
              placeholder="YYYY"
              value={dateState.year}
              onChange={handleYearChange}
              onKeyDown={(e) => handleKeyDown(e, 'year')}
              onFocus={handleFocus}
              onBlur={handleBlur}
              disabled={disabled}
              className={`${inputBaseClass} ${inputWidthYear} ${textClass}`}
              aria-label="Year"
            />
          </div>

          {/* Calendar Popup */}
          {showCalendar && !disabled && (
            <CalendarPicker
              selectedDate={getSelectedDate()}
              onSelect={handleCalendarSelect}
              onClose={() => setShowCalendar(false)}
            />
          )}
        </div>

        {error && (
          <Box
            id={`${inputId}-error`}
            display="flex"
            alignItems="center"
            gap="1.5"
            fontSize="xs"
            color="red.400"
          >
            <AlertCircle size={14} style={{ flexShrink: 0 }} />
            {error}
          </Box>
        )}
        {hint && !error && (
          <Box id={`${inputId}-hint`} fontSize="xs" className="text-text-muted">
            {hint}
          </Box>
        )}
      </Box>
    );
  }
);

DateInput.displayName = 'DateInput';
