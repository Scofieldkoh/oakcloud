'use client';

import { forwardRef, useRef, useEffect, useState, useCallback } from 'react';
import { Box } from '@chakra-ui/react';
import { Calendar, AlertCircle } from 'lucide-react';

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
}

export const DateInput = forwardRef<HTMLInputElement, DateInputProps>(
  ({ label, error, hint, value, onChange, onBlur, disabled, required, id, name, placeholder }, ref) => {
    const inputId = id || name || label?.toLowerCase().replace(/\s+/g, '-');

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

    const dayRef = useRef<HTMLInputElement>(null);
    const monthRef = useRef<HTMLInputElement>(null);
    const yearRef = useRef<HTMLInputElement>(null);
    const hiddenRef = useRef<HTMLInputElement>(null);

    // Sync external value changes
    useEffect(() => {
      const parsed = parseDate(value);
      setDateState(parsed);
    }, [value, parseDate]);

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

    const inputBaseClass = `
      w-full text-center bg-transparent border-none outline-none
      text-text-primary placeholder:text-text-muted
      focus:outline-none
    `;

    const containerClass = `
      flex items-center gap-1 h-8 px-3 rounded-lg
      bg-background-primary dark:bg-background-secondary
      border border-border-primary
      hover:border-border-secondary
      focus-within:border-oak-primary focus-within:ring-1 focus-within:ring-oak-primary
      transition-colors
      ${error ? 'border-red-500 hover:border-red-500 focus-within:border-red-500 focus-within:ring-red-500' : ''}
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

        <div className={containerClass}>
          <Calendar className="w-4 h-4 text-text-muted flex-shrink-0" />

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
            onBlur={onBlur}
            disabled={disabled}
            className={`${inputBaseClass} w-8 text-sm`}
            aria-label="Day"
          />

          <span className="text-text-muted">/</span>

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
            onBlur={onBlur}
            disabled={disabled}
            className={`${inputBaseClass} w-8 text-sm`}
            aria-label="Month"
          />

          <span className="text-text-muted">/</span>

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
            onBlur={onBlur}
            disabled={disabled}
            className={`${inputBaseClass} w-12 text-sm`}
            aria-label="Year"
          />
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
