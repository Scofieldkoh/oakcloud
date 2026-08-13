import { describe, it, expect, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {
  BatchSharedSetup,
  type BatchSharedSetupProps,
} from '@/components/documents/generation-batch/batch-shared-setup';
import type { MasterFieldCatalogue } from '@/types/document-generation-batch';

const catalogue: MasterFieldCatalogue = {
  fields: [
    {
      id: 'client_name::text',
      key: 'client_name',
      type: 'text',
      label: 'Client legal name',
      templateIds: ['template-a', 'template-b'],
      requiredTemplateIds: ['template-a'],
      defaultsByTemplateId: {},
    },
  ],
  conflicts: [{ key: 'engagement_date', types: ['date', 'text'] }],
};

function props(overrides: Partial<BatchSharedSetupProps> = {}): BatchSharedSetupProps {
  return {
    companies: [
      { id: 'company-1', name: 'Acme Pte. Ltd.', uen: '202600001A', status: 'LIVE' },
      { id: 'company-2', name: 'Beta Pte. Ltd.', uen: '202600002B', status: 'LIVE' },
    ],
    primaryCompanyId: null,
    masterFields: catalogue,
    masterFieldValues: {},
    onCompanyChange: vi.fn(),
    onMasterValueChange: vi.fn(),
    ...overrides,
  };
}

describe('BatchSharedSetup', () => {
  it('shows only compatible shared fields used by at least two templates', () => {
    const { unmount } = render(<BatchSharedSetup {...props()} />);
    expect(screen.getByLabelText('Client legal name')).toBeInTheDocument();
    expect(screen.queryByLabelText('Service fee')).not.toBeInTheDocument();
    expect(screen.getByText(/used by 2 documents/i)).toBeInTheDocument();
    expect(screen.getByText(/required by 1 document/i)).toBeInTheDocument();
    unmount();
  });

  it('selects the primary company and records master values', async () => {
    const user = userEvent.setup();
    const p = props();
    render(<BatchSharedSetup {...p} />);

    await user.selectOptions(
      screen.getByRole('combobox', { name: 'Primary company' }),
      'company-1',
    );
    expect(p.onCompanyChange).toHaveBeenCalledWith('company-1');

    fireEvent.change(screen.getByLabelText('Client legal name'), {
      target: { value: 'Acme Holdings' },
    });
    expect(p.onMasterValueChange).toHaveBeenCalledWith(
      'client_name::text',
      'Acme Holdings',
    );
  });

  it('explains type conflicts and links overridden documents', async () => {
    const user = userEvent.setup();
    const p = props({
      overriddenCountByField: { 'client_name::text': 2 },
      onSelectOverridden: vi.fn(),
    });
    render(<BatchSharedSetup {...p} />);

    expect(screen.getByText(/incompatible types/i)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /2 documents override this value/i }));
    expect(p.onSelectOverridden).toHaveBeenCalledWith('client_name::text');
  });
});
