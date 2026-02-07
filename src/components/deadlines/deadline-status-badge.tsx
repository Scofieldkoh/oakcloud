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
import type { DeadlineBillingStatus, DeadlineStatus } from '@/generated/prisma';

// ============================================================================
// STATUS CONFIGURATION
// ============================================================================

export type DeadlineTimingStatus =
  | 'OVERDUE'
  | 'DUE_SOON'
  | 'UPCOMING'
  | 'COMPLETED'
  | 'CANCELLED'
  | 'WAIVED';

interface StatusConfig {
  icon: LucideIcon;
  color: string;
  bgColor: string;
  label: string;
}

const WORKFLOW_STATUS_CONFIG: Record<DeadlineStatus, StatusConfig> = {
  PENDING: {
    icon: Clock,
    color: 'text-blue-800 dark:text-blue-300',
    bgColor: 'bg-blue-100 dark:bg-blue-900/30',
    label: 'Pending',
  },
  PENDING_CLIENT: {
    icon: Clock,
    color: 'text-sky-800 dark:text-sky-300',
    bgColor: 'bg-sky-100 dark:bg-sky-900/30',
    label: 'Pending Client',
  },
  IN_PROGRESS: {
    icon: Loader2,
    color: 'text-purple-800 dark:text-purple-300',
    bgColor: 'bg-purple-100 dark:bg-purple-900/30',
    label: 'In Progress',
  },
  PENDING_REVIEW: {
    icon: AlertTriangle,
    color: 'text-amber-800 dark:text-amber-300',
    bgColor: 'bg-amber-100 dark:bg-amber-900/30',
    label: 'Pending Review',
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

const TIMING_STATUS_CONFIG: Record<DeadlineTimingStatus, StatusConfig> = {
  OVERDUE: {
    icon: AlertTriangle,
    color: 'text-red-800 dark:text-red-300',
    bgColor: 'bg-red-100 dark:bg-red-900/30',
    label: 'Overdue',
  },
  DUE_SOON: {
    icon: AlertTriangle,
    color: 'text-amber-800 dark:text-amber-300',
    bgColor: 'bg-amber-100 dark:bg-amber-900/30',
    label: 'Due Soon',
  },
  UPCOMING: {
    icon: Clock,
    color: 'text-blue-800 dark:text-blue-300',
    bgColor: 'bg-blue-100 dark:bg-blue-900/30',
    label: 'Upcoming',
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

const SIZE_CONFIG = {
  xs: { badge: 'px-1.5 py-0.5 text-xs gap-0.5', icon: 'w-2.5 h-2.5' },
  sm: { badge: 'px-2 py-0.5 text-xs gap-1', icon: 'w-3 h-3' },
  md: { badge: 'px-2.5 py-1 text-sm gap-1.5', icon: 'w-3.5 h-3.5' },
};

const DEFAULT_DUE_SOON_DAYS = 14;
const MS_PER_DAY = 1000 * 60 * 60 * 24;

function normalizeDate(date: Date | string): Date {
  const result = new Date(date);
  result.setHours(0, 0, 0, 0);
  return result;
}

export function getDeadlineTimingInfo({
  dueDate,
  extendedDueDate,
  status,
  dueSoonDays = DEFAULT_DUE_SOON_DAYS,
}: {
  dueDate: Date | string;
  extendedDueDate?: Date | string | null;
  status: DeadlineStatus;
  dueSoonDays?: number;
}): { status: DeadlineTimingStatus; label: string; days: number | null } {
  if (status === 'COMPLETED' || status === 'CANCELLED' || status === 'WAIVED') {
    return {
      status,
      label: TIMING_STATUS_CONFIG[status].label,
      days: null,
    };
  }

  const today = normalizeDate(new Date());
  const effectiveDue = normalizeDate(extendedDueDate ?? dueDate);
  const daysUntilDue = Math.round((effectiveDue.getTime() - today.getTime()) / MS_PER_DAY);

  if (daysUntilDue < 0) {
    const daysOverdue = Math.abs(daysUntilDue);
    return {
      status: 'OVERDUE',
      label: `Overdue ${daysOverdue} ${daysOverdue === 1 ? 'day' : 'days'}`,
      days: daysOverdue,
    };
  }

  if (daysUntilDue === 0) {
    return {
      status: 'DUE_SOON',
      label: 'Due today',
      days: 0,
    };
  }

  if (daysUntilDue <= dueSoonDays) {
    return {
      status: 'DUE_SOON',
      label: `Due in ${daysUntilDue} ${daysUntilDue === 1 ? 'day' : 'days'}`,
      days: daysUntilDue,
    };
  }

  return {
    status: 'UPCOMING',
    label: 'Upcoming',
    days: daysUntilDue,
  };
}

// ============================================================================
// WORKFLOW STATUS BADGE
// ============================================================================

interface DeadlineStatusBadgeProps {
  status: DeadlineStatus;
  size?: 'xs' | 'sm' | 'md';
  showIcon?: boolean;
  className?: string;
}

export function DeadlineStatusBadge({
  status,
  size = 'sm',
  showIcon = true,
  className,
}: DeadlineStatusBadgeProps) {
  const config = WORKFLOW_STATUS_CONFIG[status];
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
// TIMING STATUS BADGE
// ============================================================================

interface DeadlineTimingBadgeProps {
  dueDate: Date | string;
  extendedDueDate?: Date | string | null;
  status: DeadlineStatus;
  dueSoonDays?: number;
  size?: 'xs' | 'sm' | 'md';
  showIcon?: boolean;
  showDays?: boolean;
  className?: string;
}

export function DeadlineTimingBadge({
  dueDate,
  extendedDueDate,
  status,
  dueSoonDays = DEFAULT_DUE_SOON_DAYS,
  size = 'sm',
  showIcon = true,
  showDays = true,
  className,
}: DeadlineTimingBadgeProps) {
  const timing = getDeadlineTimingInfo({
    dueDate,
    extendedDueDate,
    status,
    dueSoonDays,
  });
  const config = TIMING_STATUS_CONFIG[timing.status];
  const Icon = config.icon;
  const sizeConfig = SIZE_CONFIG[size];
  let displayLabel = timing.label || config.label;

  if (!showDays) {
    if (timing.status === 'OVERDUE') {
      displayLabel = 'Overdue';
    } else if (timing.status === 'DUE_SOON') {
      displayLabel = timing.days === 0 ? 'Due Today' : 'Due Soon';
    } else {
      displayLabel = config.label;
    }
  }

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
      {displayLabel}
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
// BILLING BADGE
// ============================================================================

const BILLING_STATUS_CONFIG: Record<DeadlineBillingStatus, { label: string; color: string; bgColor: string }> = {
  NOT_APPLICABLE: {
    label: 'Not Applicable',
    color: 'text-gray-600 dark:text-gray-400',
    bgColor: 'bg-gray-100 dark:bg-gray-800',
  },
  PENDING: {
    label: 'Pending',
    color: 'text-amber-800 dark:text-amber-300',
    bgColor: 'bg-amber-100 dark:bg-amber-900/30',
  },
  TO_BE_BILLED: {
    label: 'To be billed',
    color: 'text-blue-800 dark:text-blue-300',
    bgColor: 'bg-blue-100 dark:bg-blue-900/30',
  },
  INVOICED: {
    label: 'Invoiced',
    color: 'text-purple-800 dark:text-purple-300',
    bgColor: 'bg-purple-100 dark:bg-purple-900/30',
  },
  PAID: {
    label: 'Paid',
    color: 'text-green-800 dark:text-green-300',
    bgColor: 'bg-green-100 dark:bg-green-900/30',
  },
};

interface DeadlineBillingBadgeProps {
  status?: DeadlineBillingStatus | null;
  deadlineStatus?: DeadlineStatus;
  size?: 'xs' | 'sm' | 'md';
  className?: string;
}

export function DeadlineBillingBadge({
  status,
  deadlineStatus,
  size = 'sm',
  className,
}: DeadlineBillingBadgeProps) {
  if (!status) return null;

  const effectiveStatus =
    deadlineStatus === 'COMPLETED' && (status === 'TO_BE_BILLED' || status === 'PENDING')
      ? 'TO_BE_BILLED'
      : status;

  const config = BILLING_STATUS_CONFIG[effectiveStatus];
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
  dueSoonDays?: number;
  className?: string;
}

export function UrgencyIndicator({
  dueDate,
  status,
  extendedDueDate,
  dueSoonDays = DEFAULT_DUE_SOON_DAYS,
  className,
}: UrgencyIndicatorProps) {
  if (status === 'COMPLETED' || status === 'CANCELLED' || status === 'WAIVED') {
    return null;
  }

  const timing = getDeadlineTimingInfo({
    dueDate,
    extendedDueDate,
    status,
    dueSoonDays,
  });

  if (timing.status === 'OVERDUE') {
    return (
      <span
        className={cn(
          'inline-flex items-center gap-1 px-2 py-0.5 text-xs font-medium rounded-full',
          'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300',
          className
        )}
      >
        <AlertTriangle className="w-3 h-3" />
        {timing.label}
      </span>
    );
  }

  if (timing.status === 'DUE_SOON') {
    return (
      <span
        className={cn(
          'inline-flex items-center gap-1 px-2 py-0.5 text-xs font-medium rounded-full',
          'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300',
          className
        )}
      >
        {timing.label}
      </span>
    );
  }

  return null;
}

export default DeadlineStatusBadge;
