import { render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { page } from 'vitest/browser';
import type { BillingOccurrenceDto } from '@/services/billing';

const hooks = vi.hoisted(() => ({
  useBillingOccurrences: vi.fn(),
  useUpdateBillingOccurrence: vi.fn(),
  useResetBillingOverride: vi.fn(),
  useServiceRosterFamilies: vi.fn(),
  useBillingCoverage: vi.fn(),
  useUserPreference: vi.fn(),
  useUpsertUserPreference: vi.fn(),
}));

vi.mock('@/hooks/use-billing-occurrences', () => ({
  useBillingOccurrences: hooks.useBillingOccurrences,
  useUpdateBillingOccurrence: hooks.useUpdateBillingOccurrence,
  useResetBillingOverride: hooks.useResetBillingOverride,
}));
vi.mock('@/hooks/use-service-roster-families', () => ({ useServiceRosterFamilies: hooks.useServiceRosterFamilies }));
vi.mock('@/hooks/use-billing-coverage', () => ({ useBillingCoverage: hooks.useBillingCoverage }));
vi.mock('@/hooks/use-user-preferences', () => ({
  useUserPreference: hooks.useUserPreference,
  useUpsertUserPreference: hooks.useUpsertUserPreference,
}));

import { BillingWorkspace } from '@/components/services/billing/billing-workspace';

const occurrence: BillingOccurrenceDto = {
  id: '44444444-4444-4444-8444-444444444444',
  tenantId: '11111111-1111-4111-8111-111111111111',
  companyId: '22222222-2222-4222-8222-222222222222',
  clientServiceId: '55555555-5555-4555-8555-555555555555',
  feeLineId: '66666666-6666-4666-8666-666666666666',
  billingPeriodKey: '2026-08',
  scheduleEntryKey: 'entry-1',
  generationKey: 'billing-v1-1',
  calculatedExpectedDate: '2026-08-31',
  operativeExpectedDate: '2026-08-31',
  dateOverridden: false,
  dateOverrideReason: null,
  dateOverriddenAt: null,
  dateOverriddenById: null,
  baseAmount: '480.00',
  baseCurrency: 'SGD',
  operativeAmount: '480.00',
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
  company: {
    id: '22222222-2222-4222-8222-222222222222',
    name: 'Fieldstone Consulting Pte. Ltd.',
    displayAlias: null,
    displayLabel: 'Fieldstone',
    uen: null,
  },
  family: { id: '77777777-7777-4777-8777-777777777777', name: 'Payroll', displayColor: '#715DA8' },
  service: { id: '55555555-5555-4555-8555-555555555555', name: 'Monthly Payroll', familyName: 'Payroll', variantId: null, variantName: null },
  feeLine: { id: '66666666-6666-4666-8666-666666666666', description: 'Monthly payroll fee', amount: '480.00', currency: 'SGD' },
};

function setup() {
  hooks.useBillingOccurrences.mockReturnValue({ data: { mode: 'TABLE', items: [occurrence], total: 1, page: 1, limit: 20, totalPages: 1 }, isLoading: false, isFetching: false, error: null });
  hooks.useUpdateBillingOccurrence.mockReturnValue({ mutate: vi.fn(), isPending: false });
  hooks.useResetBillingOverride.mockReturnValue({ mutate: vi.fn(), isPending: false });
  hooks.useServiceRosterFamilies.mockReturnValue({ data: [{ id: occurrence.family.id!, name: 'Payroll', displayColor: '#715DA8' }], isLoading: false, error: null });
  hooks.useBillingCoverage.mockReturnValue({ data: { openIssueCount: 0, affectedServiceCount: 0, healthyActiveServiceCount: 1, issues: [] }, isLoading: false, error: null });
  hooks.useUserPreference.mockReturnValue({ data: { value: null }, isLoading: false });
  hooks.useUpsertUserPreference.mockReturnValue({ mutate: vi.fn(), isPending: false });
}

describe('Services billing responsive browser surface', () => {
  afterEach(() => {
    document.body.replaceChildren();
    vi.clearAllMocks();
  });

  it('keeps the desktop table readable and lets users toggle billing state filters', async () => {
    setup();
    await page.viewport(1440, 900);
    render(<BillingWorkspace />);

    await expect.element(screen.getByRole('heading', { name: 'Manual billing tracking' })).toBeVisible();
    await expect.element(screen.getByRole('table', { name: 'Billing occurrences table' })).toBeVisible();
    await expect.element(screen.getAllByText('Fieldstone')[0]).toBeVisible();
    const billed = screen.getByRole('button', { name: 'Billed' });
    expect(billed).toHaveAttribute('aria-pressed', 'false');
    await billed.click();
    expect(billed).toHaveAttribute('aria-pressed', 'true');
  });

  it('uses mobile occurrence cards at compact widths without losing the filters', async () => {
    setup();
    await page.viewport(390, 844);
    render(<BillingWorkspace />);

    await expect.element(screen.getByRole('searchbox', { name: 'Search company or fee line' })).toBeVisible();
    await expect.element(screen.getByRole('region', { name: 'Billing occurrence cards' })).toBeVisible();
    await expect.element(screen.getByText('Monthly payroll fee')).toBeVisible();
  });
});
