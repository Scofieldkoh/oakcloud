'use client';

import { cn } from '@/lib/utils';

interface ToggleProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
  label?: string;
  description?: string;
  size?: 'sm' | 'md';
  className?: string;
}

/**
 * Toggle switch component (iOS-style)
 *
 * Usage:
 * ```tsx
 * <Toggle
 *   label="Tax Applicable"
 *   description="Optional description text"
 *   checked={isTaxApplicable}
 *   onChange={setIsTaxApplicable}
 * />
 * ```
 */
export function Toggle({
  checked,
  onChange,
  disabled,
  label,
  description,
  size = 'md',
  className,
}: ToggleProps) {
  return (
    <div className={cn('flex items-center justify-between gap-4', className)}>
      {(label || description) && (
        <div className="flex flex-col min-w-0">
          {label && (
            <span className="text-sm font-medium text-text-primary">{label}</span>
          )}
          {description && (
            <span className="text-xs text-text-secondary">{description}</span>
          )}
        </div>
      )}
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={label}
        onClick={() => !disabled && onChange(!checked)}
        disabled={disabled}
        className={cn(
          'relative inline-flex shrink-0 cursor-pointer rounded-full transition-colors duration-200 ease-in-out focus:outline-none focus-visible:ring-2 focus-visible:ring-oak-primary focus-visible:ring-offset-2',
          size === 'sm' ? 'h-5 w-9' : 'h-6 w-11',
          checked
            ? 'bg-oak-primary'
            : 'bg-gray-300 dark:bg-gray-600',
          disabled && 'opacity-50 cursor-not-allowed'
        )}
      >
        <span
          className={cn(
            'pointer-events-none inline-block rounded-full bg-white shadow-lg transform transition-transform duration-200 ease-in-out',
            size === 'sm' ? 'h-4 w-4' : 'h-5 w-5',
            checked
              ? size === 'sm'
                ? 'translate-x-4'
                : 'translate-x-5'
              : 'translate-x-0.5',
            'mt-0.5'
          )}
        />
      </button>
    </div>
  );
}
