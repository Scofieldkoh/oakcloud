'use client';

import {
  useState,
  useRef,
  useEffect,
  useCallback,
} from 'react';
import { createPortal } from 'react-dom';
import { DayPicker, type DateRange } from 'react-day-picker';
import {
  format,
  subDays,
  subMonths,
  subYears,
  startOfMonth,
  endOfMonth,
  startOfYear,
} from 'date-fns';
import { Calendar, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from './button';

// Import react-day-picker styles
import 'react-day-picker/style.css';

// Types
type TabType = 'single' | 'range' | 'presets';

export interface DatePickerValue {
  mode: 'single' | 'range';
  date?: Date;
  range?: DateRange;
}

export interface DatePickerProps {
  /** The current value */
  value?: DatePickerValue;
  /** Callback when value changes */
  onChange: (value: DatePickerValue | undefined) => void;
  /** Placeholder text when no date selected */
  placeholder?: string;
  /** Additional class name */
  className?: string;
  /** Whether the picker is disabled */
  disabled?: boolean;
  /** Size variant */
  size?: 'sm' | 'md';
  /** Label for the input */
  label?: string;
  /** Default tab to show when opening the picker */
  defaultTab?: 'presets' | 'single' | 'range';
}

// Format date for display: "1 Dec 2025"
function formatDisplayDate(date: Date): string {
  return format(date, 'd MMM yyyy');
}

// Get display value for the input
function getDisplayValue(value?: DatePickerValue): string {
  if (!value) return '';

  if (value.mode === 'single' && value.date) {
    return formatDisplayDate(value.date);
  }

  if (value.mode === 'range' && value.range) {
    const { from, to } = value.range;
    if (from && to) {
      return `${formatDisplayDate(from)} - ${formatDisplayDate(to)}`;
    }
    if (from) {
      return `${formatDisplayDate(from)} - ...`;
    }
  }

  return '';
}

// Preset configurations
interface PresetOption {
  label: string;
  getValue: () => DateRange;
}

const QUICK_PRESETS: PresetOption[] = [
  {
    label: 'Today',
    getValue: () => {
      const today = new Date();
      return { from: today, to: today };
    },
  },
  {
    label: 'Last 7 days',
    getValue: () => ({
      from: subDays(new Date(), 7),
      to: new Date(),
    }),
  },
  {
    label: 'Last 30 days',
    getValue: () => ({
      from: subDays(new Date(), 30),
      to: new Date(),
    }),
  },
  {
    label: 'This month',
    getValue: () => ({
      from: startOfMonth(new Date()),
      to: new Date(),
    }),
  },
  {
    label: 'Last month',
    getValue: () => {
      const lastMonth = subMonths(new Date(), 1);
      return {
        from: startOfMonth(lastMonth),
        to: endOfMonth(lastMonth),
      };
    },
  },
  {
    label: 'This year',
    getValue: () => ({
      from: startOfYear(new Date()),
      to: new Date(),
    }),
  },
];

// Custom styles for react-day-picker v9 - using oak design system colors
// Override all default blue colors with oak-primary (#294d44)
const calendarStyles = `
  .rdp {
    --rdp-cell-size: 36px;
    --rdp-accent-color: #294d44;
    --rdp-accent-background-color: rgba(41, 77, 68, 0.15);
    --rdp-background-color: #294d44;
    --rdp-selected-color: #294d44;
    --rdp-selected-border: #294d44;
    --rdp-day-height: 36px;
    --rdp-day-width: 36px;
    --rdp-selected-font: 500;
    --rdp-outside-opacity: 0.4;
    margin: 0;
  }
  .rdp-root {
    --rdp-accent-color: #294d44;
    --rdp-accent-background-color: rgba(41, 77, 68, 0.15);
  }
  .rdp-months {
    display: flex;
    gap: 1.5rem;
  }
  .rdp-month {
    margin: 0;
  }
  .rdp-caption_label {
    font-size: 0.875rem;
    font-weight: 500;
    color: var(--text-primary);
  }
  .rdp-nav {
    display: flex;
    align-items: center;
  }
  .rdp-button_previous,
  .rdp-button_next {
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
  .rdp-button_previous:hover,
  .rdp-button_next:hover {
    background: var(--bg-tertiary, #f3f4f6);
    color: var(--text-primary);
  }
  .rdp-weekday {
    font-size: 0.75rem;
    font-weight: normal;
    color: var(--text-muted);
    width: var(--rdp-cell-size);
    height: 32px;
  }
  .rdp-day {
    width: var(--rdp-cell-size);
    height: var(--rdp-cell-size);
    font-size: 0.875rem;
    border-radius: 6px;
    cursor: pointer;
    transition: all 0.15s;
  }
  .rdp-day_button {
    border: none !important;
    outline: none !important;
  }
  .rdp-day_button:focus {
    outline: none !important;
    box-shadow: none !important;
  }
  .rdp-day:hover:not(.rdp-day_selected):not(.rdp-day_disabled) {
    background: var(--bg-tertiary, #f3f4f6);
  }
  .rdp-day_today:not(.rdp-day_selected):not(.rdp-range_start):not(.rdp-range_end):not(.rdp-range_middle) {
    font-weight: 600;
    color: #294d44;
  }
  .rdp-day_selected,
  .rdp-selected {
    background: rgba(41, 77, 68, 0.15) !important;
    color: #294d44 !important;
    font-weight: 500;
    border: none !important;
  }
  .rdp-day_outside {
    opacity: 0.4;
    color: var(--text-muted);
  }
  .rdp-day_disabled {
    opacity: 0.3;
    cursor: not-allowed;
  }
  .rdp-range_start,
  .rdp-range_end,
  .rdp-day.rdp-range_start,
  .rdp-day.rdp-range_end {
    background: rgba(41, 77, 68, 0.18) !important;
    color: #294d44 !important;
    font-weight: 600;
    border-radius: 6px !important;
    border: none !important;
  }
  .rdp-range_middle,
  .rdp-day.rdp-range_middle {
    background: rgba(41, 77, 68, 0.06) !important;
    border-radius: 0;
    color: var(--text-primary);
    border: none !important;
  }
  .rdp-range_middle:hover {
    background: rgba(41, 77, 68, 0.12) !important;
  }
  /* Override any focus/active states */
  .rdp-day:focus,
  .rdp-day:focus-visible,
  .rdp-day_button:focus,
  .rdp-day_button:focus-visible {
    outline: 2px solid rgba(41, 77, 68, 0.3) !important;
    outline-offset: -2px;
  }
  /* Override any blue borders/outlines from default styles */
  .rdp *:focus {
    outline-color: #294d44 !important;
  }
  .rdp button:focus-visible {
    outline: 2px solid rgba(41, 77, 68, 0.5) !important;
  }
`;

export function DatePicker({
  value,
  onChange,
  placeholder = 'Select date',
  className,
  disabled,
  size = 'sm',
  label,
  defaultTab = 'presets',
}: DatePickerProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<TabType>('presets');
  const [tempValue, setTempValue] = useState<DatePickerValue | undefined>(value);
  const [month, setMonth] = useState<Date>(new Date());
  const [selectionPhase, setSelectionPhase] = useState<'start' | 'end'>('start');

  // Custom preset inputs
  const [customDays, setCustomDays] = useState('');
  const [customMonths, setCustomMonths] = useState('');
  const [customYears, setCustomYears] = useState('');

  const triggerRef = useRef<HTMLDivElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState({ top: 0, left: 0 });
  const [mounted, setMounted] = useState(false);

  // Mount check for portal
  useEffect(() => {
    setMounted(true);
  }, []);

  // Sync temp value with prop value when opening
  useEffect(() => {
    if (isOpen) {
      setTempValue(value);
      // Reset selection phase based on current value state
      if (value?.mode === 'range' && value.range?.from && !value.range?.to) {
        // Partial range - continue to select end date
        setSelectionPhase('end');
      } else {
        // No selection or complete range - start fresh
        setSelectionPhase('start');
      }
      // Use defaultTab prop instead of auto-detecting from value mode
      setActiveTab(defaultTab);
    }
  }, [isOpen, value, defaultTab]);

  // Calculate position
  useEffect(() => {
    if (isOpen && triggerRef.current) {
      const rect = triggerRef.current.getBoundingClientRect();
      const popoverWidth = 580; // Approximate width
      const popoverHeight = 420; // Approximate height

      let left = rect.left;
      let top = rect.bottom + 4;

      // Adjust horizontal position
      if (left + popoverWidth > window.innerWidth - 16) {
        left = window.innerWidth - popoverWidth - 16;
      }
      if (left < 16) {
        left = 16;
      }

      // Adjust vertical position
      if (top + popoverHeight > window.innerHeight - 16) {
        top = rect.top - popoverHeight - 4;
        if (top < 16) {
          top = 16;
        }
      }

      setPosition({ top, left });
    }
  }, [isOpen]);

  // Handle click outside
  useEffect(() => {
    if (!isOpen) return;

    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Node;
      if (
        triggerRef.current &&
        !triggerRef.current.contains(target) &&
        popoverRef.current &&
        !popoverRef.current.contains(target)
      ) {
        setIsOpen(false);
      }
    };

    const handleEscape = (event: KeyboardEvent) => {
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

  const handleApply = useCallback(() => {
    onChange(tempValue);
    setIsOpen(false);
  }, [tempValue, onChange]);

  const handleClear = useCallback(() => {
    setTempValue(undefined);
    onChange(undefined);
    setIsOpen(false);
  }, [onChange]);

  const handlePresetClick = useCallback((preset: PresetOption) => {
    const range = preset.getValue();
    setTempValue({ mode: 'range', range });
  }, []);

  const handleCustomPreset = useCallback((type: 'days' | 'months' | 'years', valueStr: string) => {
    const num = parseInt(valueStr, 10);
    if (isNaN(num) || num <= 0) return;

    let from: Date;
    const to = new Date();

    switch (type) {
      case 'days':
        from = subDays(to, num);
        break;
      case 'months':
        from = subMonths(to, num);
        break;
      case 'years':
        from = subYears(to, num);
        break;
    }

    setTempValue({ mode: 'range', range: { from, to } });
  }, []);

  const handleSingleSelect = useCallback((date: Date | undefined) => {
    if (date) {
      setTempValue({ mode: 'single', date });
    }
  }, []);

  const handleRangeSelect = useCallback((range: DateRange | undefined) => {
    if (!range) return;

    // Determine which date was clicked by comparing with previous state
    // react-day-picker modifies the range internally, so we need to find the new date
    const prevFrom = tempValue?.mode === 'range' ? tempValue.range?.from : undefined;
    const prevTo = tempValue?.mode === 'range' ? tempValue.range?.to : undefined;

    let clickedDate: Date | undefined;

    // Find the date that changed (the one that was clicked)
    if (range.from && (!prevFrom || range.from.getTime() !== prevFrom.getTime())) {
      clickedDate = range.from;
    } else if (range.to && (!prevTo || range.to.getTime() !== prevTo.getTime())) {
      clickedDate = range.to;
    } else {
      // Fallback: use whatever is available
      clickedDate = range.to || range.from;
    }

    if (!clickedDate) return;

    if (selectionPhase === 'start') {
      // Starting a new selection - set this as the start date
      setTempValue({ mode: 'range', range: { from: clickedDate, to: undefined } });
      setSelectionPhase('end');
    } else {
      // Completing the selection - set this as the end date
      const startDate = tempValue?.mode === 'range' ? tempValue.range?.from : undefined;
      if (startDate) {
        // Ensure from is before to (auto-swap if needed)
        if (clickedDate < startDate) {
          setTempValue({ mode: 'range', range: { from: clickedDate, to: startDate } });
        } else {
          setTempValue({ mode: 'range', range: { from: startDate, to: clickedDate } });
        }
      } else {
        // Fallback: if no start date, use clicked date as start
        setTempValue({ mode: 'range', range: { from: clickedDate, to: undefined } });
      }
      setSelectionPhase('start'); // Reset for next selection
    }
  }, [selectionPhase, tempValue]);

  const displayValue = getDisplayValue(value);
  const tempDisplayValue = getDisplayValue(tempValue);

  const sizeClasses = {
    sm: 'h-9 text-sm px-3',
    md: 'h-10 text-base px-4',
  };

  const tabs: { key: TabType; label: string }[] = [
    { key: 'presets', label: 'Presets' },
    { key: 'single', label: 'Single Date' },
    { key: 'range', label: 'Date Range' },
  ];

  return (
    <div className={cn('relative', className)}>
      {/* Inject custom styles */}
      <style dangerouslySetInnerHTML={{ __html: calendarStyles }} />

      {label && (
        <label className="block text-sm font-medium text-text-primary mb-1.5">
          {label}
        </label>
      )}

      {/* Trigger */}
      <div
        ref={triggerRef}
        className={cn(
          'w-full flex items-center gap-2 rounded-lg border',
          'bg-background-primary border-border-primary',
          'hover:border-oak-primary/50 focus-within:ring-2 focus-within:ring-oak-primary/30',
          'transition-colors text-left cursor-pointer',
          sizeClasses[size],
          disabled && 'opacity-50 cursor-not-allowed',
          isOpen && 'ring-2 ring-oak-primary/30 border-oak-primary'
        )}
        onClick={() => !disabled && setIsOpen(!isOpen)}
      >
        <Calendar className="w-4 h-4 text-text-muted flex-shrink-0" />
        <span className={cn('flex-1 truncate', !displayValue && 'text-text-muted')}>
          {displayValue || placeholder}
        </span>
        {displayValue && !disabled && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onChange(undefined);
            }}
            className="p-0.5 hover:bg-background-tertiary rounded transition-colors"
          >
            <X className="w-3.5 h-3.5 text-text-muted" />
          </button>
        )}
      </div>

      {/* Popover */}
      {isOpen && mounted && createPortal(
        <div
          ref={popoverRef}
          data-datepicker-popover
          className={cn(
            'fixed z-[100] bg-background-elevated rounded-xl border border-border-primary shadow-elevation-2',
            'animate-fade-in'
          )}
          style={{ top: position.top, left: position.left }}
        >
          {/* Tabs */}
          <div className="flex border-b border-border-primary">
            {tabs.map((tab) => (
              <button
                key={tab.key}
                type="button"
                onClick={() => setActiveTab(tab.key)}
                className={cn(
                  'flex-1 px-4 py-3 text-sm font-medium transition-colors',
                  activeTab === tab.key
                    ? 'text-oak-primary border-b-2 border-oak-primary -mb-px'
                    : 'text-text-secondary hover:text-text-primary'
                )}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {/* Content */}
          <div className="p-4">
            {/* Single Date Tab */}
            {activeTab === 'single' && (
              <div className="flex justify-center w-[320px]">
                <DayPicker
                  mode="single"
                  selected={tempValue?.mode === 'single' ? tempValue.date : undefined}
                  onSelect={handleSingleSelect}
                  month={month}
                  onMonthChange={setMonth}
                  showOutsideDays
                />
              </div>
            )}

            {/* Date Range Tab */}
            {activeTab === 'range' && (
              <div className="px-2">
                <DayPicker
                  mode="range"
                  selected={tempValue?.mode === 'range' ? tempValue.range : undefined}
                  onSelect={handleRangeSelect}
                  numberOfMonths={2}
                  month={month}
                  onMonthChange={setMonth}
                  showOutsideDays
                />
                {/* Phase indicator */}
                <p className="text-xs text-text-muted text-center mt-2">
                  {selectionPhase === 'start'
                    ? 'Click to select start date'
                    : 'Click to select end date'}
                </p>
              </div>
            )}

            {/* Presets Tab */}
            {activeTab === 'presets' && (
              <div className="space-y-5 w-[320px]">
                {/* Quick Presets */}
                <div>
                  <h4 className="text-xs font-medium text-text-muted uppercase tracking-wider mb-2.5">
                    Quick Presets
                  </h4>
                  <div className="space-y-2">
                    {/* Row 1: Today, Last 7 days, Last 30 days */}
                    <div className="flex flex-wrap gap-2">
                      {QUICK_PRESETS.slice(0, 3).map((preset) => {
                        const presetRange = preset.getValue();
                        const isSelected = tempValue?.mode === 'range' &&
                          tempValue.range?.from?.toDateString() === presetRange.from?.toDateString() &&
                          tempValue.range?.to?.toDateString() === presetRange.to?.toDateString();
                        return (
                          <button
                            key={preset.label}
                            type="button"
                            onClick={() => handlePresetClick(preset)}
                            className={cn(
                              'px-3 py-1.5 text-sm rounded-lg border transition-all',
                              isSelected
                                ? 'border-oak-primary bg-oak-primary/10 text-oak-primary font-medium'
                                : 'border-border-primary hover:border-oak-primary/50 hover:bg-background-tertiary text-text-primary'
                            )}
                          >
                            {preset.label}
                          </button>
                        );
                      })}
                    </div>
                    {/* Row 2: This month, Last month, This year */}
                    <div className="flex flex-wrap gap-2">
                      {QUICK_PRESETS.slice(3).map((preset) => {
                        const presetRange = preset.getValue();
                        const isSelected = tempValue?.mode === 'range' &&
                          tempValue.range?.from?.toDateString() === presetRange.from?.toDateString() &&
                          tempValue.range?.to?.toDateString() === presetRange.to?.toDateString();
                        return (
                          <button
                            key={preset.label}
                            type="button"
                            onClick={() => handlePresetClick(preset)}
                            className={cn(
                              'px-3 py-1.5 text-sm rounded-lg border transition-all',
                              isSelected
                                ? 'border-oak-primary bg-oak-primary/10 text-oak-primary font-medium'
                                : 'border-border-primary hover:border-oak-primary/50 hover:bg-background-tertiary text-text-primary'
                            )}
                          >
                            {preset.label}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </div>

                {/* Custom Range */}
                <div>
                  <h4 className="text-xs font-medium text-text-muted uppercase tracking-wider mb-2.5">
                    Custom Range
                  </h4>
                  <div className="space-y-2.5">
                    {/* Days */}
                    <div className="flex items-center gap-2">
                      <span className="text-sm text-text-secondary w-10">Last</span>
                      <input
                        type="text"
                        inputMode="numeric"
                        pattern="[0-9]*"
                        value={customDays}
                        onChange={(e) => setCustomDays(e.target.value.replace(/\D/g, ''))}
                        placeholder="—"
                        className="input input-sm w-14 text-center"
                      />
                      <span className="text-sm text-text-secondary flex-1">days</span>
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={() => handleCustomPreset('days', customDays)}
                        disabled={!customDays || parseInt(customDays, 10) <= 0}
                      >
                        Apply
                      </Button>
                    </div>

                    {/* Months */}
                    <div className="flex items-center gap-2">
                      <span className="text-sm text-text-secondary w-10">Last</span>
                      <input
                        type="text"
                        inputMode="numeric"
                        pattern="[0-9]*"
                        value={customMonths}
                        onChange={(e) => setCustomMonths(e.target.value.replace(/\D/g, ''))}
                        placeholder="—"
                        className="input input-sm w-14 text-center"
                      />
                      <span className="text-sm text-text-secondary flex-1">months</span>
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={() => handleCustomPreset('months', customMonths)}
                        disabled={!customMonths || parseInt(customMonths, 10) <= 0}
                      >
                        Apply
                      </Button>
                    </div>

                    {/* Years */}
                    <div className="flex items-center gap-2">
                      <span className="text-sm text-text-secondary w-10">Last</span>
                      <input
                        type="text"
                        inputMode="numeric"
                        pattern="[0-9]*"
                        value={customYears}
                        onChange={(e) => setCustomYears(e.target.value.replace(/\D/g, ''))}
                        placeholder="—"
                        className="input input-sm w-14 text-center"
                      />
                      <span className="text-sm text-text-secondary flex-1">years</span>
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={() => handleCustomPreset('years', customYears)}
                        disabled={!customYears || parseInt(customYears, 10) <= 0}
                      >
                        Apply
                      </Button>
                    </div>
                  </div>
                </div>

                {/* Selected Preview */}
                {tempDisplayValue && (
                  <div className="pt-3 mt-1 border-t border-border-primary">
                    <p className="text-xs text-text-muted">
                      Selected: <span className="text-text-secondary">{tempDisplayValue}</span>
                    </p>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="flex items-center justify-end px-4 py-3 border-t border-border-primary bg-background-secondary rounded-b-xl">
            <div className="flex items-center gap-2">
              <Button variant="ghost" size="sm" onClick={handleClear}>
                Clear
              </Button>
              <Button variant="primary" size="sm" onClick={handleApply}>
                Apply
              </Button>
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}

export default DatePicker;
