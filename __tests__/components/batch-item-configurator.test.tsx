import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {
  BatchItemConfigurator,
  type BatchItemConfiguratorProps,
} from '@/components/documents/generation-batch/batch-item-configurator';
import type { EditableBatchItem } from '@/components/documents/generation-batch/batch-workspace-state';
import type { MasterFieldCatalogue } from '@/types/document-generation-batch';

const masterFields: MasterFieldCatalogue = {
  fields: [
    {
      id: 'client_name::text',
      key: 'client_name',
      type: 'text',
      label: 'Client legal name',
      templateIds: ['template-a', 'template-b'],
      requiredTemplateIds: [],
      defaultsByTemplateId: {},
    },
  ],
  conflicts: [],
};

function item(kind: 'STANDARD' | 'SERVICE_AGREEMENT' = 'STANDARD'): EditableBatchItem {
  return {
    key: 'item-1',
    id: 'item-1',
    templateId: 'template-a',
    templateName: kind === 'SERVICE_AGREEMENT' ? 'Service Agreement' : 'Engagement Letter',
    templateKind: kind,
    templateVersion: 1,
    status: 'NEEDS_INPUT',
    configuration: {
      version: 1,
      title: 'Engagement Letter',
      contactIds: [],
      selectedDirectorId: null,
      selectedShareholderId: null,
      selectedContactId: null,
      itemValues: {},
      masterOverrides: {},
      useLetterhead: true,
      serviceAgreement: null,
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

function props(overrides: Partial<BatchItemConfiguratorProps> = {}): BatchItemConfiguratorProps {
  return {
    item: item(),
    primaryCompany: { id: 'company-1', name: 'Acme Pte. Ltd.', uen: '202600001A', status: 'LIVE' },
    companies: [],
    contacts: [],
    companyContacts: [],
    directors: [],
    shareholders: [],
    masterFields,
    effectiveMasterValues: { client_name: 'Acme Pte. Ltd.' },
    onPatch: vi.fn(),
    ...overrides,
  };
}

describe('BatchItemConfigurator', () => {
  it('shows effective shared values and records an explicit local override', async () => {
    const user = userEvent.setup();
    const p = props();
    const { unmount } = render(<BatchItemConfigurator {...p} />);
    expect(screen.getByLabelText('Client legal name')).toHaveValue('Acme Pte. Ltd.');
    expect(screen.getByText('Using shared value')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /override client legal name/i }));
    expect(p.onPatch).toHaveBeenCalledWith(expect.objectContaining({
      masterOverrides: expect.objectContaining({ 'client_name::text': 'Acme Pte. Ltd.' }),
    }));
    unmount();
  });

  it('keeps service agreement services, fees, terms, entities, and representative item-specific', () => {
    const p = props({ item: item('SERVICE_AGREEMENT') });
    const { unmount } = render(<BatchItemConfigurator {...p} />);
    expect(screen.getByRole('heading', { name: /services and fees/i })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /related entities/i })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /representative/i })).toBeInTheDocument();
    unmount();
  });

  it('is read-only for generated items', () => {
    const generated = item();
    generated.status = 'GENERATED';
    const { unmount } = render(<BatchItemConfigurator {...props({ item: generated })} />);
    expect(screen.getByText(/generated and read-only/i)).toBeInTheDocument();
    unmount();
  });

  it('filters the authorised representative to primary-company contacts', () => {
    const p = props({
      item: item('SERVICE_AGREEMENT'),
      companyContacts: [{ id: 'primary-contact', fullName: 'Primary Contact' }],
      contacts: [{ id: 'other-contact', fullName: 'Other Contact' }],
    });
    const { unmount } = render(<BatchItemConfigurator {...p} />);
    const fieldset = screen.getByRole('group', { name: /authorised representative/i });
    expect(fieldset).toHaveTextContent('Primary Contact');
    expect(fieldset).not.toHaveTextContent('Other Contact');
    unmount();
  });

  it('renders item-only custom fields from the template', () => {
    const p = props({
      templateFields: [{
        id: 'reference',
        key: 'custom.reference',
        label: 'Reference',
        type: 'text',
        required: false,
      }],
    });
    const { unmount } = render(<BatchItemConfigurator {...p} />);
    expect(screen.getByLabelText('Reference')).toBeInTheDocument();
    unmount();
  });
});
