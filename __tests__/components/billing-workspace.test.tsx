import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

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

describe('BillingWorkspace', () => {
  beforeEach(() => {
    hooks.useBillingOccurrences.mockReturnValue({ data: { mode: 'TABLE', items: [], total: 0, page: 1, limit: 20, totalPages: 0 }, isLoading: false, isFetching: false, error: null });
    hooks.useUpdateBillingOccurrence.mockReturnValue({ mutate: vi.fn(), isPending: false });
    hooks.useResetBillingOverride.mockReturnValue({ mutate: vi.fn(), isPending: false });
    hooks.useServiceRosterFamilies.mockReturnValue({ data: [], isLoading: false, error: null });
    hooks.useBillingCoverage.mockReturnValue({ data: { openIssueCount: 0, affectedServiceCount: 0, healthyActiveServiceCount: 0, issues: [] }, isLoading: false, error: null });
    hooks.useUserPreference.mockReturnValue({ data: { value: null }, isLoading: false });
    hooks.useUpsertUserPreference.mockReturnValue({ mutate: vi.fn(), isPending: false });
  });

  it('uses manual tracking language and exposes the Billing workspace controls', () => {
    render(<BillingWorkspace />);

    expect(screen.getByText(/manual billing tracking/i)).toBeVisible();
    expect(screen.getByRole('searchbox', { name: 'Search company or fee line' })).toBeVisible();
    expect(screen.getByRole('button', { name: 'Open' })).toBeVisible();
    expect(screen.getByRole('button', { name: 'Billed' })).toBeVisible();
    expect(screen.getByRole('button', { name: 'Waived' })).toBeVisible();
    expect(screen.queryByText(/create invoice|collect payment/i)).not.toBeInTheDocument();
  });
});
