import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { BillingFilters, type BillingFilterState } from '@/components/services/billing/billing-filters';

const filteredValue: BillingFilterState = {
  query: '',
  statuses: [],
  timing: [],
  from: '2026-08-01',
  to: '2026-08-31',
  familyIds: [],
};

describe('BillingFilters', () => {
  it('keeps the reset action touch-safe on mobile and compact on desktop', () => {
    const onReset = vi.fn();

    render(
      <BillingFilters
        value={filteredValue}
        families={[]}
        onChange={vi.fn()}
        onReset={onReset}
      />,
    );

    const reset = screen.getByRole('button', { name: 'Reset filters' });
    expect(reset).toHaveClass('min-h-11', 'sm:min-h-8');
    fireEvent.click(reset);
    expect(onReset).toHaveBeenCalledTimes(1);
  });
});
