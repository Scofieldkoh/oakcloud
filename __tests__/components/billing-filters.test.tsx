import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { BillingFilters, type BillingFilterState } from '@/components/services/billing/billing-filters';

vi.mock('@/components/ui/date-picker', () => ({
  DatePicker: ({
    placeholder = 'Select date',
    onChange,
  }: {
    placeholder?: string;
    onChange: (value: unknown) => void;
  }) => (
    <div>
      <button type="button" aria-label={placeholder}>{placeholder}</button>
      <button
        type="button"
        onClick={() => onChange({
          mode: 'range',
          range: {
            from: new Date('2026-08-10T00:00:00'),
            to: new Date('2026-08-20T00:00:00'),
          },
        })}
      >
        Apply complete date range
      </button>
      <button
        type="button"
        onClick={() => onChange({ mode: 'range', range: { from: new Date('2026-08-10T00:00:00') } })}
      >
        Apply incomplete date range
      </button>
      <button type="button" onClick={() => onChange(undefined)}>Clear date range</button>
    </div>
  ),
}));

const filteredValue: BillingFilterState = {
  query: '',
  statuses: [],
  timing: [],
  from: '2026-08-01',
  to: '2026-08-31',
  familyIds: [],
};

describe('BillingFilters', () => {
  it('places one Date Range picker beside Families and removes split date inputs', () => {
    render(
      <BillingFilters
        value={filteredValue}
        families={[{ id: 'family-1', name: 'Accounting', displayColor: '#3F6DA8' }]}
        onChange={vi.fn()}
      />,
    );

    const toolbar = screen.getByRole('group', { name: 'Billing quick filters' });
    expect(within(toolbar).getByRole('button', { name: 'Families' })).toBeVisible();
    expect(within(toolbar).getByRole('button', { name: 'Date Range' })).toBeVisible();
    expect(screen.queryByLabelText('Billing date from')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Billing date to')).not.toBeInTheDocument();
  });

  it('maps complete ranges, ignores incomplete ranges, and clears both date values', () => {
    const onChange = vi.fn();
    render(<BillingFilters value={filteredValue} families={[]} onChange={onChange} />);

    fireEvent.click(screen.getByRole('button', { name: 'Apply complete date range' }));
    expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({ from: '2026-08-10', to: '2026-08-20' }));

    const callsAfterComplete = onChange.mock.calls.length;
    fireEvent.click(screen.getByRole('button', { name: 'Apply incomplete date range' }));
    expect(onChange).toHaveBeenCalledTimes(callsAfterComplete);

    fireEvent.click(screen.getByRole('button', { name: 'Clear date range' }));
    expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({ from: '', to: '' }));
  });

  it('matches the Vault toolbar and keeps zero selected statuses unfiltered', () => {
    render(<BillingFilters value={{ ...filteredValue, from: '', to: '' }} families={[]} onChange={vi.fn()} />);

    const toolbar = screen.getByRole('group', { name: 'Billing quick filters' });
    expect(toolbar).toHaveClass('border', 'rounded-lg', 'p-4');
    expect(screen.getByRole('button', { name: 'Open' })).toHaveAttribute('aria-pressed', 'false');
    expect(screen.queryByLabelText('Active filters')).not.toBeInTheDocument();
  });

  it('keeps the reset action touch-safe on mobile and compact on desktop', () => {
    const onReset = vi.fn();

    render(
      <BillingFilters
        value={{ ...filteredValue, statuses: ['OPEN'] }}
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
