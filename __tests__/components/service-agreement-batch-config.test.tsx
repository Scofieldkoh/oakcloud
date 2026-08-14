import { describe, it, expect, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import {
  ServiceAgreementConfig,
  type ServiceAgreementConfigProps,
} from '@/components/documents/generation-batch/service-agreement-config';
import type { EditableBatchItem } from '@/components/documents/generation-batch/batch-workspace-state';

function saItem(): EditableBatchItem {
  return {
    key: 'item-1',
    id: 'item-1',
    templateId: 'template-sa',
    templateName: 'Service Agreement',
    templateKind: 'SERVICE_AGREEMENT',
    templateVersion: 1,
    status: 'NEEDS_INPUT',
    configuration: {
      version: 1,
      title: 'Service Agreement',
      contactIds: [],
      selectedDirectorId: null,
      selectedShareholderId: null,
      selectedContactId: null,
      itemValues: {},
      masterOverrides: {},
      useLetterhead: true,
      serviceAgreement: {
        authorizedContactId: null,
        entityIds: ['company-1'],
        agreementDate: '2026-08-12',
        effectiveDate: null,
        termMonths: 12,
        items: [],
      },
    },
    previewContent: null,
    editedContent: null,
    editedContentJson: null,
    previewFingerprint: null,
    reviewedFingerprint: null,
    validationDiagnostics: null,
    lastError: null,
  };
}

function props(overrides: Partial<ServiceAgreementConfigProps> = {}): ServiceAgreementConfigProps {
  return {
    item: saItem(),
    primaryCompany: { id: 'company-1', name: 'Acme Pte. Ltd.', uen: '202600001A', status: 'LIVE' },
    companies: [],
    contacts: [],
    masterFields: { fields: [], conflicts: [] },
    effectiveMasterValues: {},
    onPatch: vi.fn(),
    ...overrides,
  };
}

describe('ServiceAgreementConfig', () => {
  it('renders item-specific agreement sections without a nested stepper', () => {
    const { unmount } = render(<ServiceAgreementConfig {...props()} />);
    expect(screen.getByRole('heading', { name: /services and fees/i })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /entities and representative/i })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /agreement details/i })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: /setup/i })).not.toBeInTheDocument();
    unmount();
  });

  it('updates the resumable workspace state without touching relational rows', async () => {
    const p = props();
    const { unmount } = render(<ServiceAgreementConfig {...p} />);

    fireEvent.change(screen.getByLabelText('Agreement date'), {
      target: { value: '2026-09-01' },
    });
    expect(p.onPatch).toHaveBeenCalledWith(expect.objectContaining({
      serviceAgreement: expect.objectContaining({ agreementDate: '2026-09-01' }),
    }));
    unmount();
  });
});
