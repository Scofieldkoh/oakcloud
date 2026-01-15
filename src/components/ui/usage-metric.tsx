'use client';

import { type LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface UsageMetricProps {
  /** Label for the metric */
  label: string;
  /** Current value */
  current: number;
  /** Maximum/limit value */
  max: number;
  /** Optional icon to display */
  icon?: LucideIcon;
  /** Size variant */
  size?: 'xs' | 'sm' | 'md';
  /** Whether to show the progress bar */
  showProgress?: boolean;
  /** Whether to show the label */
  showLabel?: boolean;
  /** Custom warning threshold percentage (default: 70) */
  warningThreshold?: number;
  /** Custom danger threshold percentage (default: 90) */
  dangerThreshold?: number;
  /** Custom formatter for displaying values */
  formatValue?: (current: number, max: number) => string;
  /** Additional class name */
  className?: string;
}

const SIZE_CONFIG = {
  xs: {
    container: 'space-y-0.5',
    label: 'text-xs gap-0.5',
    value: 'text-xs',
    progress: 'h-1',
    icon: 'w-2.5 h-2.5',
  },
  sm: {
    container: 'space-y-1',
    label: 'text-xs gap-1',
    value: 'text-xs',
    progress: 'h-1.5',
    icon: 'w-3 h-3',
  },
  md: {
    container: 'space-y-1.5',
    label: 'text-sm gap-1.5',
    value: 'text-sm',
    progress: 'h-2',
    icon: 'w-4 h-4',
  },
};

/**
 * UsageMetric - Display usage metrics with optional progress bar
 *
 * Features:
 * - Shows current/max values
 * - Optional progress bar with color thresholds
 * - Multiple size variants
 * - Customizable thresholds
 * - Optional icon display
 * - Dark mode support
 *
 * @example
 * ```tsx
 * // Simple usage
 * <UsageMetric label="Users" current={10} max={50} />
 *
 * // With icon
 * <UsageMetric label="Users" current={10} max={50} icon={Users} />
 *
 * // Without progress bar (value only)
 * <UsageMetric label="Storage" current={5} max={10} showProgress={false} />
 *
 * // Custom thresholds
 * <UsageMetric
 *   label="API Calls"
 *   current={800}
 *   max={1000}
 *   warningThreshold={60}
 *   dangerThreshold={80}
 * />
 *
 * // Custom value formatter
 * <UsageMetric
 *   label="Storage"
 *   current={5120}
 *   max={10240}
 *   formatValue={(c, m) => `${c / 1024}GB / ${m / 1024}GB`}
 * />
 * ```
 */
export function UsageMetric({
  label,
  current,
  max,
  icon: Icon,
  size = 'sm',
  showProgress = true,
  showLabel = true,
  warningThreshold = 70,
  dangerThreshold = 90,
  formatValue,
  className,
}: UsageMetricProps) {
  const sizeConfig = SIZE_CONFIG[size];
  const percent = max > 0 ? Math.min((current / max) * 100, 100) : 0;

  const progressColor =
    percent >= dangerThreshold
      ? 'bg-red-500'
      : percent >= warningThreshold
        ? 'bg-amber-500'
        : 'bg-oak-primary';

  const displayValue = formatValue
    ? formatValue(current, max)
    : `${current}/${max}`;

  return (
    <div className={cn(sizeConfig.container, className)}>
      <div className={cn('flex items-center justify-between', sizeConfig.label)}>
        {showLabel && (
          <span className="text-text-muted flex items-center gap-1">
            {Icon && <Icon className={sizeConfig.icon} />}
            {label}
          </span>
        )}
        <span className={cn('text-text-secondary font-medium', sizeConfig.value)}>
          {displayValue}
        </span>
      </div>
      {showProgress && (
        <div className={cn('bg-background-tertiary rounded-full overflow-hidden', sizeConfig.progress)}>
          <div
            className={cn('h-full rounded-full transition-all', progressColor)}
            style={{ width: `${percent}%` }}
          />
        </div>
      )}
    </div>
  );
}

/**
 * Compact usage display without progress bar
 */
export function UsageValue({
  current,
  max,
  icon: Icon,
  formatValue,
  className,
}: Pick<UsageMetricProps, 'current' | 'max' | 'icon' | 'formatValue' | 'className'>) {
  const displayValue = formatValue
    ? formatValue(current, max)
    : `${current}/${max}`;

  return (
    <span className={cn('inline-flex items-center gap-1 text-sm text-text-secondary', className)}>
      {Icon && <Icon className="w-3.5 h-3.5 text-text-muted" />}
      <span className="font-medium">{displayValue}</span>
    </span>
  );
}

export default UsageMetric;
