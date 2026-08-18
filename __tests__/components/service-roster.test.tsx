import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { ServiceRosterItem } from '@/services/service-roster';

const hooks = vi.hoisted(() => ({
  useServiceRoster: vi.fn(),
  useUserPreference: vi.fn(),
  useUpsertUserPreference: vi.fn(),
  useServiceCatalog: vi.fn(),
}));

vi.mock('@/hooks/use-service-roster', () => ({ useServiceRoster: hooks.useServiceRoster }));
vi.mock('@/hooks/use-user-preferences', () => ({
  useUserPreference: hooks.useUserPreference,
  useUpsertUserPreference: hooks.useUpsertUserPreference,
}));
vi.mock('@/hooks/use-service-catalog', () => ({ useServiceCatalog: hooks.useServiceCatalog }));
vi.mock('@/hooks/use-all-company-options', () => ({
  useAllCompanyOptions: () => ({ data: [], isLoading: false, error: null }),
}));
vi.mock('@/components/companies/company-detail/client-service-creator', () => ({
  ClientServiceCreator: () => null,
}));
vi.mock('@/components/companies/company-detail/client-service-editor', () => ({
  ClientServiceEditor: () => null,
}));

import { ServiceRoster } from '@/components/services/roster/service-roster';

const family = {
  id: '33333333-3333-4333-8333-333333333333',
  name: 'Accounting',
  displayColor: '#3F6DA8',
};

const rosterItem: ServiceRosterItem = {
  id: '44444444-4444-4444-8444-444444444444',
  companyId: '22222222-2222-4222-8222-222222222222',
  agreementId: null,
  agreementItemId: null,
  serviceVariantId: '55555555-5555-4555-8555-555555555555',
  company: {
    id: '22222222-2222-4222-8222-222222222222',
    name: 'Oaktree Accounting & Corporate Solution Pte. Ltd.',
    displayAlias: null,
    displayLabel: 'OACS',
    uen: '202600001A',
  },
  family,
  familyName: family.name,
  familyDisplayColor: family.displayColor,
  variant: {
    id: '55555555-5555-4555-8555-555555555555',
    code: 'ACCT-001',
    name: 'Monthly accounting',
    version: 1,
    serviceCadence: 'MONTHLY',
    customCadenceLabel: null,
  },
  serviceVariant: {
    id: '55555555-5555-4555-8555-555555555555',
    code: 'ACCT-001',
    name: 'Monthly accounting',
    version: 1,
    serviceCadence: 'MONTHLY',
    customCadenceLabel: null,
  },
  service: {
    id: '44444444-4444-4444-8444-444444444444',
    name: 'Monthly accounting',
    source: 'MANUAL',
    status: 'ACTIVE',
    cadence: 'MONTHLY',
    serviceCadence: 'MONTHLY',
    customCadenceLabel: null,
    startDate: '2026-01-01',
    endDate: null,
  },
  serviceName: 'Monthly accounting',
  status: 'ACTIVE',
  cadence: 'MONTHLY',
  serviceCadence: 'MONTHLY',
  customCadenceLabel: null,
  startDate: '2026-01-01',
  endDate: null,
  source: 'MANUAL',
  hasRuleWarning: false,
  nextDeadline: null,
  applicability: {
    state: null,
    applicabilityState: null,
    hasWarning: false,
    ruleCount: 0,
    applicableCount: 0,
    notApplicableCount: 0,
    missingInputCount: 0,
    reasons: [],
  },
  applicabilityState: null,
  ruleWarning: {
    state: null,
    applicabilityState: null,
    hasWarning: false,
    ruleCount: 0,
    applicableCount: 0,
    notApplicableCount: 0,
    missingInputCount: 0,
    reasons: [],
  },
  warning: {
    state: null,
    applicabilityState: null,
    hasWarning: false,
    ruleCount: 0,
    applicableCount: 0,
    notApplicableCount: 0,
    missingInputCount: 0,
    reasons: [],
  },
  updatedAt: '2026-08-18T00:00:00.000Z',
};

function setup() {
  hooks.useServiceRoster.mockReturnValue({
    data: { items: [rosterItem], total: 1, page: 1, limit: 20, totalPages: 1 },
    isLoading: false,
    isFetching: false,
    error: null,
  });
  hooks.useUserPreference.mockReturnValue({ data: { value: null }, isLoading: false });
  hooks.useUpsertUserPreference.mockReturnValue({ mutate: vi.fn(), isPending: false });
  hooks.useServiceCatalog.mockReturnValue({ data: { families: [{ ...family, variants: [] }], total: 1 }, isLoading: false });
}

describe('ServiceRoster', () => {
  it('places family filters beside Active, Paused, and Ended in one Service filters group', () => {
    setup();
    render(<ServiceRoster workspaceId="workspace-1" />);

    const toolbar = screen.getByRole('group', { name: 'Service filters' });
    expect(within(toolbar).getByRole('button', { name: 'Active' })).toBeVisible();
    expect(within(toolbar).getByRole('button', { name: 'Paused' })).toBeVisible();
    expect(within(toolbar).getByRole('button', { name: 'Ended' })).toBeVisible();
    expect(within(toolbar).getByRole('button', { name: 'Accounting' })).toBeVisible();
    expect(screen.queryByText('Filter families')).not.toBeInTheDocument();
  });

  it('uses alternating rows and full company names with display labels', () => {
    setup();
    render(<ServiceRoster workspaceId="workspace-1" />);

    expect(screen.getAllByText('OACS')[0]).toBeVisible();
    expect(screen.getAllByText('Oaktree Accounting & Corporate Solution Pte. Ltd.')[0]).toBeVisible();
    expect(screen.getAllByRole('row')[2]).toHaveClass('bg-oak-row-alt');
  });

  it('shows text and an accent cue for a selected family chip', () => {
    setup();
    render(<ServiceRoster workspaceId="workspace-1" />);

    const familyChip = screen.getByRole('button', { name: 'Accounting' });
    expect(familyChip).toHaveAttribute('aria-pressed', 'false');
    expect(familyChip.querySelector('[aria-hidden="true"]')).toBeTruthy();
    expect(familyChip).toHaveStyle({ '--family-color': '#3F6DA8' });
    fireEvent.click(familyChip);
    expect(hooks.useServiceRoster).toHaveBeenLastCalledWith(
      expect.objectContaining({ familyIds: [family.id] }),
    );
  });
});
