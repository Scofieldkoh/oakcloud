'use client';

import type { CSSProperties } from 'react';
import { cn } from '@/lib/utils';

export interface ServiceFamilyFilter {
  id: string;
  name: string;
  displayColor: string;
}

interface FamilyFilterChipsProps {
  families: ServiceFamilyFilter[];
  selectedIds: readonly string[];
  onToggle: (familyId: string) => void;
  className?: string;
}

/**
 * Family filters deliberately expose both the configured color and the family
 * name. The color is an accent only; it is never the sole way to identify a
 * filter.
 */
export function FamilyFilterChips({
  families,
  selectedIds,
  onToggle,
  className,
}: FamilyFilterChipsProps) {
  if (families.length === 0) return null;

  return (
    <div className={cn('flex flex-wrap items-center gap-2', className)}>
      {families.map((family) => {
        const selected = selectedIds.includes(family.id);
        const style = { '--family-color': family.displayColor } as CSSProperties;

        return (
          <button
            key={family.id}
            type="button"
            aria-pressed={selected}
            onClick={() => onToggle(family.id)}
            style={style}
            className={cn(
              'inline-flex min-h-11 items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition-colors',
              'focus:outline-none focus-visible:ring-2 focus-visible:ring-oak-primary/30 focus-visible:ring-offset-2',
              selected
                ? 'border-[var(--family-color)] bg-[var(--family-color)]/10 text-text-primary'
                : 'border-border-primary bg-background-secondary text-text-secondary hover:border-[var(--family-color)] hover:text-text-primary',
            )}
          >
            <span
              aria-hidden="true"
              className="h-2.5 w-2.5 rounded-full border border-black/10 dark:border-white/20"
              style={{ backgroundColor: family.displayColor }}
            />
            <span>{family.name}</span>
          </button>
        );
      })}
    </div>
  );
}
