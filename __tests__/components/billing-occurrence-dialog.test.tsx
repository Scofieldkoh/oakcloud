import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { BillingOccurrenceDto } from '@/services/billing';

import { BillingOccurrenceDialog } from '@/components/services/billing/billing-occurrence-dialog';

const billedOccurrence: BillingOccurrenceDto = {
  id: 'occurrence-1',
  tenantId: 'tenant-1',
  companyId: 'company-1',
  clientServiceId: 'service-1',
  feeLineId: 'fee-1',
  billingPeriodKey: '2026-08',
  scheduleEntryKey: 'entry-1',
  generationKey: 'generation-1',
  calculatedExpectedDate: '2026-08-31',
  operativeExpectedDate: '2026-08-31',
  dateOverridden: false,
  dateOverrideReason: null,
  dateOverriddenAt: null,
  dateOverriddenById: null,
  baseAmount: '1200.00',
  baseCurrency: 'SGD',
  operativeAmount: '1200.00',
  operativeCurrency: 'SGD',
  valueOverridden: false,
  valueOverrideReason: null,
  valueOverriddenAt: null,
  valueOverriddenById: null,
  status: 'BILLED',
  timingState: null,
  billedDate: '2026-08-31',
  markedBilledAt: '2026-08-31T08:00:00.000Z',
  markedBilledById: 'user-1',
  externalReference: 'EXT-2048',
  notes: 'Recorded from external billing run',
  waivedAt: null,
  waivedById: null,
  waiverReason: null,
  cancelledAt: null,
  cancelledById: null,
  cancellationReason: null,
  cancellationReconciliationRequestId: null,
  createdAt: '2026-08-01T00:00:00.000Z',
  updatedAt: '2026-08-31T08:00:00.000Z',
  company: { id: 'company-1', name: 'Northstar Holdings Pte. Ltd.', displayAlias: 'Northstar', displayLabel: 'Northstar', uen: null },
  family: { id: 'family-1', name: 'Corp Sec', displayColor: '#3C7768' },
  service: { id: 'service-1', name: 'Corporate Secretary', familyName: 'Corp Sec', variantId: null, variantName: null },
  feeLine: { id: 'fee-1', description: 'Annual retainer', amount: '1200.00', currency: 'SGD' },
};

describe('BillingOccurrenceDialog', () => {
  it('asks update scope whenever amount or currency changes', () => {
    render(<BillingOccurrenceDialog occurrence={billedOccurrence} />);

    fireEvent.change(screen.getByLabelText('Amount'), { target: { value: '1500.00' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save tracking update' }));

    expect(screen.getByRole('dialog', { name: 'Apply amount change' })).toBeVisible();
    expect(screen.getByRole('button', { name: 'This occurrence' })).toBeVisible();
    expect(screen.getByRole('button', { name: 'This and future' })).toBeVisible();
  });

  it('submits a non-value tracking update without opening a scope prompt', () => {
    const onSave = vi.fn();
    render(<BillingOccurrenceDialog occurrence={billedOccurrence} onSave={onSave} />);

    fireEvent.change(screen.getByLabelText('Status'), { target: { value: 'WAIVED' } });
    fireEvent.change(screen.getByLabelText('Reason'), { target: { value: 'Client requested waiver' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save tracking update' }));

    expect(screen.queryByRole('dialog', { name: 'Apply amount change' })).not.toBeInTheDocument();
    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ status: 'WAIVED', updateScope: 'THIS_OCCURRENCE' }));
  });

  it('offers a reset lifecycle for overridden expected values', () => {
    const onReset = vi.fn();
    render(
      <BillingOccurrenceDialog
        occurrence={{ ...billedOccurrence, valueOverridden: true, valueOverrideReason: 'Legacy amount correction' }}
        onReset={onReset}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Reset tracked overrides' }));
    expect(screen.getByRole('dialog', { name: 'Reset tracking override' })).toBeVisible();
    fireEvent.change(screen.getByLabelText('Reset reason'), { target: { value: 'Use configured fee line amount' } });
    fireEvent.click(screen.getByRole('button', { name: 'Reset all overrides' }));

    expect(onReset).toHaveBeenCalledWith(expect.objectContaining({ target: 'ALL', reason: 'Use configured fee line amount' }));
  });
});
