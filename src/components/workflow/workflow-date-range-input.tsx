'use client';

import { SingleDateInput } from '@/components/ui/single-date-input';
import { cn } from '@/lib/utils';

interface WorkflowDateRangeInputProps {
  fromValue?: string;
  toValue?: string;
  onFromChange: (value: string) => void;
  onToChange: (value: string) => void;
  fromLabel?: string;
  toLabel?: string;
  fromPlaceholder?: string;
  toPlaceholder?: string;
  fromAriaLabel: string;
  toAriaLabel: string;
  className?: string;
}

export function WorkflowDateRangeInput({
  fromValue = '',
  toValue = '',
  onFromChange,
  onToChange,
  fromLabel,
  toLabel,
  fromPlaceholder = 'From',
  toPlaceholder = 'To',
  fromAriaLabel,
  toAriaLabel,
  className,
}: WorkflowDateRangeInputProps) {
  return (
    <div className={cn('grid grid-cols-1 gap-2', className)}>
      <SingleDateInput
        value={fromValue}
        onChange={onFromChange}
        label={fromLabel}
        placeholder={fromPlaceholder}
        ariaLabel={fromAriaLabel}
        maxDate={toValue || undefined}
      />
      <SingleDateInput
        value={toValue}
        onChange={onToChange}
        label={toLabel}
        placeholder={toPlaceholder}
        ariaLabel={toAriaLabel}
        minDate={fromValue || undefined}
      />
    </div>
  );
}

export default WorkflowDateRangeInput;
