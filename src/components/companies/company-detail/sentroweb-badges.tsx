'use client';

import { AlertCircle, AlertTriangle, CheckCircle2, CircleHelp, Loader2, MinusCircle, type LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import type {
  SentrowebCategoryCounts,
  SentrowebResultStatusValue,
  SentrowebRunDto,
} from '@/lib/sentroweb/types';

/**
 * Badges for Sentroweb results. Every badge has a text label and an icon as well as a colour,
 * so the status never depends on colour alone. The green "Clear" badge is produced only for
 * the exact status CLEAR; anything unknown, missing or failed falls back to a non-green badge.
 */

export interface SentrowebBadgeSpec {
  label: string;
  /** `badge-success`, `badge-error`, `badge-warning` or `badge-neutral`. */
  className: string;
  icon: LucideIcon;
  spin?: boolean;
}

const CLEAR_BADGE: SentrowebBadgeSpec = { label: 'Clear', className: 'badge-success', icon: CheckCircle2 };
const POSSIBLE_MATCH_BADGE: SentrowebBadgeSpec = { label: 'Possible match', className: 'badge-error', icon: AlertTriangle };

/** Badge for one person or company's result. Only the exact status CLEAR is green. */
export function sentrowebResultBadge(status: SentrowebResultStatusValue | string | null | undefined): SentrowebBadgeSpec {
  switch (status) {
    case 'CLEAR':
      return CLEAR_BADGE;
    case 'POSSIBLE_MATCH':
      return POSSIBLE_MATCH_BADGE;
    case 'ERROR':
      return { label: 'Error', className: 'badge-warning', icon: AlertCircle };
    case 'NOT_RUN':
      return { label: 'Not run', className: 'badge-neutral', icon: MinusCircle };
    default:
      return { label: 'Unknown', className: 'badge-warning', icon: CircleHelp };
  }
}

/**
 * Badge for a whole run. Green "Clear" only when the run COMPLETED and its overall result is
 * CLEAR. A FAILED run, or one with no overall result, is "Incomplete" at best.
 */
export function sentrowebOverallBadge(
  run: Pick<SentrowebRunDto, 'status' | 'overallResult'>,
): SentrowebBadgeSpec {
  if (run.status === 'QUEUED' || run.status === 'RUNNING') {
    return { label: 'In progress', className: 'badge-neutral', icon: Loader2, spin: true };
  }
  if (run.overallResult === 'POSSIBLE_MATCH') return POSSIBLE_MATCH_BADGE;
  if (run.status === 'COMPLETED' && run.overallResult === 'CLEAR') return CLEAR_BADGE;
  return { label: 'Incomplete', className: 'badge-warning', icon: AlertCircle };
}

function BadgeView({ spec, className }: { spec: SentrowebBadgeSpec; className?: string }) {
  const Icon = spec.icon;
  return (
    <span className={cn('badge inline-flex items-center gap-1 whitespace-nowrap', spec.className, className)}>
      <Icon className={cn('h-3 w-3', spec.spin && 'animate-spin')} aria-hidden="true" />
      {spec.label}
    </span>
  );
}

export function SentrowebResultBadge({ status, className }: { status: SentrowebResultStatusValue | string | null | undefined; className?: string }) {
  return <BadgeView spec={sentrowebResultBadge(status)} className={className} />;
}

export function SentrowebOverallBadge({
  run,
  className,
}: {
  run: Pick<SentrowebRunDto, 'status' | 'overallResult'>;
  className?: string;
}) {
  return <BadgeView spec={sentrowebOverallBadge(run)} className={className} />;
}

// --- Labels -----------------------------------------------------------------------------------

const ROLE_LABELS: Record<string, string> = {
  COMPANY: 'Company',
  DIRECTOR: 'Director',
  MANAGING_DIRECTOR: 'Managing director',
  ALTERNATE_DIRECTOR: 'Alternate director',
  NOMINEE_DIRECTOR: 'Nominee director',
  SHAREHOLDER: 'Shareholder',
};

/** A readable label for a role code. Unknown codes are shown as sentence-case words. */
export function sentrowebRoleLabel(role: string): string {
  const known = ROLE_LABELS[role];
  if (known) return known;
  const words = role.toLowerCase().replaceAll('_', ' ').trim();
  return words ? words.charAt(0).toUpperCase() + words.slice(1) : role;
}

export function sentrowebSearchTypeLabel(searchType: string): string {
  return searchType === 'INDIVIDUAL' ? 'Individual' : 'Entity';
}

export const SENTROWEB_CATEGORY_LABELS: Record<string, string> = {
  FATF: 'FATF',
  PEP: 'PEP',
  SIP: 'SIP',
  SIE: 'SIE',
};

const CATEGORY_ORDER = ['FATF', 'PEP', 'SIP', 'SIE'] as const;

/** "PEP 2 · SIP 1", or "None" when no category has a hit. */
export function formatSentrowebCategoryCounts(counts: SentrowebCategoryCounts | null | undefined): string {
  const parts = CATEGORY_ORDER.filter((category) => (counts?.[category] ?? 0) > 0).map(
    (category) => `${SENTROWEB_CATEGORY_LABELS[category]} ${counts?.[category]}`,
  );
  return parts.length > 0 ? parts.join(' \u00b7 ') : 'None';
}
