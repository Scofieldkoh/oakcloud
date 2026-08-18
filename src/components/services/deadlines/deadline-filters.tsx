'use client';

import { FamilyFilterChips, type ServiceFamilyFilter } from '@/components/services/shared/family-filter-chips';
import { cn } from '@/lib/utils';

export type DeadlineFilterType = 'STATUTORY' | 'CLIENT' | 'INTERNAL';

interface DeadlineFiltersProps {
  families: ServiceFamilyFilter[];
  selectedTypes: readonly DeadlineFilterType[];
  selectedFamilyIds: readonly string[];
  allFamiliesSelected?: boolean;
  openOnly: boolean;
  onToggleType: (type: DeadlineFilterType) => void;
  onToggleFamily: (familyId: string) => void;
  onToggleOpenOnly: () => void;
  className?: string;
}
const typeLabels: Record<DeadlineFilterType, string> = {
  STATUTORY: 'Statutory',
  CLIENT: 'Client',
  INTERNAL: 'Internal',
};

/** Shared, intentionally unlabeled toolbar for table and calendar modes. */
export function DeadlineFilters({
  families,
  selectedTypes,
  selectedFamilyIds,
  allFamiliesSelected = false,
  openOnly,
  onToggleType,
  onToggleFamily,
  onToggleOpenOnly,
  className,
}: DeadlineFiltersProps) {
  const visibleFamilyIds = allFamiliesSelected ? families.map((family) => family.id) : selectedFamilyIds;

  return (
    <div
      role="group"
      aria-label="Deadline filters"
      className={cn('flex flex-wrap items-center gap-2', className)}
    >
      {(Object.keys(typeLabels) as DeadlineFilterType[]).map((type) => {
        const selected = selectedTypes.includes(type);
        return (
          <button
            key={type}
            type="button"
            aria-pressed={selected}
            onClick={() => onToggleType(type)}
            className={cn(
              'inline-flex min-h-11 items-center rounded-full border px-3 text-xs font-medium transition-colors',
              'focus:outline-none focus-visible:ring-2 focus-visible:ring-oak-primary/30 focus-visible:ring-offset-2',
              selected
                ? 'border-oak-primary bg-oak-primary text-white'
                : 'border-border-primary bg-background-secondary text-text-secondary hover:border-oak-primary/50 hover:text-text-primary',
            )}
          >
            {typeLabels[type]}
          </button>
        );
      })}
      <button
        type="button"
        aria-pressed={openOnly}
        onClick={onToggleOpenOnly}
        className={cn(
          'inline-flex min-h-11 items-center rounded-full border px-3 text-xs font-medium transition-colors',
          'focus:outline-none focus-visible:ring-2 focus-visible:ring-oak-primary/30 focus-visible:ring-offset-2',
          openOnly
            ? 'border-oak-primary bg-oak-primary text-white'
            : 'border-border-primary bg-background-secondary text-text-secondary hover:border-oak-primary/50 hover:text-text-primary',
        )}
      >
        Open only
      </button>
      {families.length > 0 ? (
        <FamilyFilterChips
          families={families}
          selectedIds={visibleFamilyIds}
          onToggle={onToggleFamily}
        />
      ) : null}
    </div>
  );
}
