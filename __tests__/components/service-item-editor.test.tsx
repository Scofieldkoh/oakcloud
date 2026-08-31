import { describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { ServiceItemEditor } from '@/components/documents/service-agreement/service-item-editor';
import type { ServiceVariantDto } from '@/services/service-catalog/types';
import type { ServiceAgreementItemInput } from '@/services/service-agreement';

const company = {
  id: 'company-1',
  name: 'Acme Pte. Ltd.',
  uen: '202600001A',
  status: 'LIVE' as const,
};

const variant: ServiceVariantDto = {
  id: 'variant-1',
  familyId: 'family-1',
  code: 'CORP_SECRETARIAL',
  name: 'Corporate Secretarial Services',
  description: null,
  serviceCadence: 'ANNUALLY',
  customCadenceLabel: null,
  displayOrder: 0,
  version: 1,
  isActive: true,
  sowPartial: {
    id: 'partial-1',
    name: 'sow',
    displayName: null,
    version: 1,
    placeholders: [],
  },
  feeTemplates: [],
};

const item: ServiceAgreementItemInput = {
  clientKey: 'item-1',
  variantId: variant.id,
  entityIds: [company.id],
  startDate: '2026-08-29',
  endDate: null,
  fieldValues: {},
  displayOrder: 0,
  feeLines: [{
    clientKey: 'fee-1',
    companyId: company.id,
    description: 'Annual secretarial service',
    amount: '500',
    currency: 'SGD',
    billingFrequency: 'ANNUALLY',
    customFrequencyLabel: null,
    billingStartDate: '2026-08-29',
    displayOrder: 0,
  }],
};

describe('ServiceItemEditor', () => {
  it('renders applies-to tiles and an expanded fee table without version metadata', () => {
    render(
      <ServiceItemEditor
        item={item}
        variant={variant}
        entities={[company]}
        onChange={vi.fn()}
        onRemove={vi.fn()}
        onCopy={vi.fn()}
        onMoveUp={vi.fn()}
        onMoveDown={vi.fn()}
        canMoveUp={false}
        canMoveDown={false}
      />,
    );

    expect(screen.queryByText(/Pinned from version/i)).not.toBeInTheDocument();
    expect(screen.getByRole('checkbox', { name: 'Applies to Acme Pte. Ltd.' })).toBeChecked();
    expect(screen.getByRole('table')).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: 'Description' })).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: 'Company applied' })).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: 'Amount' })).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: 'Currency' })).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: 'Frequency' })).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: 'Billing start date' })).toBeInTheDocument();
    expect(within(screen.getByRole('table')).getByRole('button', { name: 'Remove' }))
      .toHaveClass('bg-red-600');
    expect(screen.queryByRole('button', { name: 'Remove fee' })).not.toBeInTheDocument();
    expect(screen.getByText('Fees').closest('details')).toHaveAttribute('open');
  });
});
