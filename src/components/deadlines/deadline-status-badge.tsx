'use client';

import {
  Clock,
  AlertTriangle,
  Loader2,
  CheckCircle,
  XCircle,
  MinusCircle,
  type LucideIcon,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import type { DeadlineStatus } from '@/generated/prisma';

// ============================================================================
// STATUS CONFIGURATION
// ============================================================================

interface StatusConfig {
  icon: LucideIcon;
  color: string;
  bgColor: string;
  label: string;
}

const STATUS_CONFIG: Record<DeadlineStatus, StatusConfig> = {
  UPCOMING: {
    icon: Clock,
    color: 'text-blue-800 dark:text-blue-300',
    bgColor: 'bg-blue-100 dark:bg-blue-900/30',
    label: 'Upcoming',
  },
  DUE_SOON: {
    icon: AlertTriangle,
    color: 'text-amber-800 dark:text-amber-300',
    bgColor: 'bg-amber-100 dark:bg-amber-900/30',
    label: 'Due Soon',
  },
  IN_PROGRESS: {
    icon: Loader2,
    color: 'text-purple-800 dark:text-purple-300',
    bgColor: 'bg-purple-100 dark:bg-purple-900/30',
    label: 'In Progress',
  },
  COMPLETED: {
    icon: CheckCircle,
    color: 'text-green-800 dark:text-green-300',
    bgColor: 'bg-green-100 dark:bg-green-900/30',
    label: 'Completed',
  },
  CANCELLED: {
    icon: XCircle,
    color: 'text-gray-600 dark:text-gray-400',
    bgColor: 'bg-gray-100 dark:bg-gray-800',
    label: 'Cancelled',
  },
  WAIVED: {
    icon: MinusCircle,
    color: 'text-slate-600 dark:text-slate-400',
    bgColor: 'bg-slate-100 dark:bg-slate-800',
    label: 'Waived',
  },
};

// ============================================================================
// COMPONENT
// ============================================================================

interface DeadlineStatusBadgeProps {
  status: DeadlineStatus;
  size?: 'xs' | 'sm' | 'md';
  showIcon?: boolean;
  className?: string;
}

const SIZE_CONFIG = {
  xs: { badge: 'px-1.5 py-0.5 text-xs gap-0.5', icon: 'w-2.5 h-2.5' },
  sm: { badge: 'px-2 py-0.5 text-xs gap-1', icon: 'w-3 h-3' },
  md: { badge: 'px-2.5 py-1 text-sm gap-1.5', icon: 'w-3.5 h-3.5' },
};

export function DeadlineStatusBadge({
  status,
  size = 'sm',
  showIcon = true,
  className,
}: DeadlineStatusBadgeProps) {
  const config = STATUS_CONFIG[status];
  const Icon = config.icon;
  const sizeConfig = SIZE_CONFIG[size];

  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full font-medium',
        sizeConfig.badge,
        config.bgColor,
        config.color,
        className
      )}
    >
      {showIcon && <Icon className={sizeConfig.icon} />}
      {config.label}
    </span>
  );
}

// ============================================================================
// CATEGORY BADGE
// ============================================================================

import type { DeadlineCategory } from '@/generated/prisma';

const CATEGORY_CONFIG: Record<DeadlineCategory, { label: string; color: string; bgColor: string }> = {
  CORPORATE_SECRETARY: {
    label: 'Corp Sec',
    color: 'text-indigo-800 dark:text-indigo-300',
    bgColor: 'bg-indigo-100 dark:bg-indigo-900/30',
  },
  TAX: {
    label: 'Tax',
    color: 'text-red-800 dark:text-red-300',
    bgColor: 'bg-red-100 dark:bg-red-900/30',
  },
  ACCOUNTING: {
    label: 'Accounting',
    color: 'text-emerald-800 dark:text-emerald-300',
    bgColor: 'bg-emerald-100 dark:bg-emerald-900/30',
  },
  AUDIT: {
    label: 'Audit',
    color: 'text-orange-800 dark:text-orange-300',
    bgColor: 'bg-orange-100 dark:bg-orange-900/30',
  },
  COMPLIANCE: {
    label: 'Compliance',
    color: 'text-cyan-800 dark:text-cyan-300',
    bgColor: 'bg-cyan-100 dark:bg-cyan-900/30',
  },
  OTHER: {
    label: 'Other',
    color: 'text-gray-600 dark:text-gray-400',
    bgColor: 'bg-gray-100 dark:bg-gray-800',
  },
};

interface DeadlineCategoryBadgeProps {
  category: DeadlineCategory;
  size?: 'xs' | 'sm' | 'md';
  className?: string;
}

export function DeadlineCategoryBadge({
  category,
  size = 'sm',
  className,
}: DeadlineCategoryBadgeProps) {
  const config = CATEGORY_CONFIG[category];
  const sizeConfig = SIZE_CONFIG[size];

  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full font-medium',
        sizeConfig.badge,
        config.bgColor,
        config.color,
        className
      )}
    >
      {config.label}
    </span>
  );
}

// ============================================================================
// URGENCY INDICATOR
// ============================================================================

interface UrgencyIndicatorProps {
  dueDate: Date | string;
  status: DeadlineStatus;
  extendedDueDate?: Date | string | null;
  className?: string;
}

export function UrgencyIndicator({
  dueDate,
  status,
  extendedDueDate,
  className,
}: UrgencyIndicatorProps) {
  // Don't show urgency for completed/cancelled/waived
  if (['COMPLETED', 'CANCELLED', 'WAIVED'].includes(status)) {
    return null;
  }

  // Normalize dates to start of day for consistent comparison across timezones
  const effectiveDue = extendedDueDate ? new Date(extendedDueDate) : new Date(dueDate);
  effectiveDue.setHours(0, 0, 0, 0);

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  // Calculate days difference using normalized dates
  const daysUntilDue = Math.round((effectiveDue.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));

  if (daysUntilDue < 0) {
    // Overdue
    const daysOverdue = Math.abs(daysUntilDue);
    return (
      <span
        className={cn(
          'inline-flex items-center gap-1 px-2 py-0.5 text-xs font-medium rounded-full',
          'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300',
          className
        )}
      >
        <AlertTriangle className="w-3 h-3" />
        {daysOverdue} {daysOverdue === 1 ? 'day' : 'days'} overdue
      </span>
    );
  }

  if (daysUntilDue === 0) {
    return (
      <span
        className={cn(
          'inline-flex items-center gap-1 px-2 py-0.5 text-xs font-medium rounded-full',
          'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300',
          className
        )}
      >
        <AlertTriangle className="w-3 h-3" />
        Due today
      </span>
    );
  }

  if (daysUntilDue <= 7) {
    return (
      <span
        className={cn(
          'inline-flex items-center gap-1 px-2 py-0.5 text-xs font-medium rounded-full',
          'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300',
          className
        )}
      >
        {daysUntilDue} {daysUntilDue === 1 ? 'day' : 'days'} left
      </span>
    );
  }

  if (daysUntilDue <= 14) {
    return (
      <span
        className={cn(
          'inline-flex items-center px-2 py-0.5 text-xs font-medium rounded-full',
          'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300',
          className
        )}
      >
        {daysUntilDue} days left
      </span>
    );
  }

  return null;
}

export default DeadlineStatusBadge;
