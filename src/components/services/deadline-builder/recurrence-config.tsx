'use client';

import type { DeadlineFrequency } from '@/generated/prisma';
import { cn } from '@/lib/utils';

export interface RecurrenceConfigProps {
  isRecurring: boolean;
  frequency: DeadlineFrequency | null;
  generateOccurrences: number | null;
  generateUntilDate: string | null;
  onUpdate: (updates: {
    isRecurring?: boolean;
    frequency?: DeadlineFrequency | null;
    generateOccurrences?: number | null;
    generateUntilDate?: string | null;
  }) => void;
}

export function RecurrenceConfig({
  frequency,
  onUpdate,
}: RecurrenceConfigProps) {
  return (
    <select
      value={frequency || 'ONE_TIME'}
      onChange={(e) => {
        const newFrequency = e.target.value as DeadlineFrequency;
        const newIsRecurring = newFrequency !== 'ONE_TIME';

        onUpdate({
          frequency: newFrequency,
          isRecurring: newIsRecurring,
          // Default to null (inherit from service schedule)
          generateOccurrences: null,
          generateUntilDate: null,
        });
      }}
      className={cn(
        'w-full h-6 px-1 text-xs rounded appearance-none cursor-pointer',
        'bg-background-primary border border-border-primary',
        'hover:border-border-secondary focus:border-oak-primary focus:ring-1 focus:ring-oak-primary/30',
        'outline-none transition-colors text-text-primary'
      )}
    >
      <option value="ONE_TIME">One-off</option>
      <option value="MONTHLY">Monthly</option>
      <option value="QUARTERLY">Quarterly</option>
      <option value="ANNUALLY">Annually</option>
    </select>
  );
}
