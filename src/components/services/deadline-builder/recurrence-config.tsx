'use client';

import type { DeadlineFrequency } from '@/generated/prisma';
import { cn } from '@/lib/utils';

export interface RecurrenceConfigProps {
  isRecurring: boolean;
  frequency: DeadlineFrequency | null;
  generateOccurrences: number | null;
  generateUntilDate: string | null;
  size?: 'sm' | 'md';
  onUpdate: (updates: {
    isRecurring?: boolean;
    frequency?: DeadlineFrequency | null;
    generateOccurrences?: number | null;
    generateUntilDate?: string | null;
  }) => void;
}

export function RecurrenceConfig({
  frequency,
  size = 'sm',
  onUpdate,
}: RecurrenceConfigProps) {
  const sizeClass = size === 'md' ? 'h-9 text-sm' : 'h-8 text-sm';

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
        'w-full px-2.5 rounded-lg appearance-none cursor-pointer',
        sizeClass,
        'bg-background-primary border border-border-primary',
        'hover:border-border-secondary focus:border-oak-primary focus:ring-2 focus:ring-oak-primary/30',
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
