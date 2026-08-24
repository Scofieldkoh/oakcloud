import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { BillingOccurrenceDto } from '@/services/billing';
import { BillingTable } from '@/components/services/billing/billing-table';
import { BILLING_COLUMN_IDS, defaultBillingTablePreference } from '@/lib/validations/services-preferences';

const occurrence = {
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
  baseAmount: '100.00',
  baseCurrency: 'SGD',
  operativeAmount: '100.00',
  operativeCurrency: 'SGD',
  valueOverridden: false,
  valueOverrideReason: null,
  valueOverriddenAt: null,
  valueOverriddenById: null,
  status: 'OPEN',
  timingState: 'UPCOMING',
  billedDate: null,
  markedBilledAt: null,
  markedBilledById: null,
  externalReference: null,
  notes: null,
  waivedAt: null,
  waivedById: null,
  waiverReason: null,
  cancelledAt: null,
  cancelledById: null,
  cancellationReason: null,
  cancellationReconciliationRequestId: null,
  createdAt: '2026-08-01T00:00:00.000Z',
  updatedAt: '2026-08-01T00:00:00.000Z',
  company: { id: 'company-1', name: 'Northstar Holdings', displayAlias: null, displayLabel: 'Northstar', uen: null },
  family: { id: 'family-1', name: 'Payroll', displayColor: '#715DA8' },
  service: { id: 'service-1', name: 'Monthly payroll', familyName: 'Payroll', variantId: null, variantName: null },
  feeLine: { id: 'fee-1', description: 'Monthly fee', amount: '100.00', currency: 'SGD' },
} satisfies BillingOccurrenceDto;

describe('BillingTable', () => {
  it('exposes aria-sort on sortable owning headers', () => {
    render(
      <BillingTable
        items={[occurrence]}
        columnWidths={defaultBillingTablePreference.columnWidths}
        columnOrder={[...BILLING_COLUMN_IDS]}
        columnVisibility={defaultBillingTablePreference.columnVisibility}
        sortBy="expectedDate"
        sortOrder="asc"
        onSort={() => undefined}
        onColumnWidthChange={() => undefined}
        onColumnResizeEnd={() => undefined}
      />,
    );

    expect(screen.getByRole('columnheader', { name: /Expected date/ })).toHaveAttribute('aria-sort', 'ascending');
    expect(screen.getByRole('columnheader', { name: /Company/ })).toHaveAttribute('aria-sort', 'none');
  });
});
