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
  it('uses the Companies-style header for every standard Configure section', () => {
    render(<BatchItemConfigurator {...props()} />);

    const headers = document.querySelectorAll('section > header');
    expect(headers.length).toBeGreaterThan(1);
    for (const header of headers) {
      expect(header).toHaveClass('bg-oak-primary');
    }
  });

  it('does not expose letterhead controls', () => {
    render(<BatchItemConfigurator {...props()} />);

    expect(screen.queryByText('Output options')).not.toBeInTheDocument();
    expect(screen.queryByText('Use company letterhead')).not.toBeInTheDocument();
  });

  it('shows effective shared values and records an explicit local override', async () => {
    const user = userEvent.setup();
    const p = props();
    const { unmount } = render(<BatchItemConfigurator {...p} />);
    expect(screen.getByLabelText('Client legal name')).toHaveValue('Acme Pte. Ltd.');
    expect(screen.getByText('Shared')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /override for this document/i }));
    expect(p.onPatch).toHaveBeenCalledWith(expect.objectContaining({
      masterOverrides: expect.objectContaining({ 'client_name::text': 'Acme Pte. Ltd.' }),
    }));
    unmount();
  });

  it('keeps service agreement services, fees, terms, entities, and representative item-specific', () => {
    const p = props({ item: item('SERVICE_AGREEMENT') });
    const { unmount } = render(<BatchItemConfigurator {...p} />);
    expect(screen.getByRole('heading', { name: /services and fees/i })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /entities and representative/i })).toBeInTheDocument();
    expect(screen.getByRole('group', { name: /authorised representative/i })).toBeInTheDocument();
    unmount();
  });

  it('is read-only for generated items', () => {
    const generated = item();
    generated.status = 'GENERATED';
    const { unmount } = render(<BatchItemConfigurator {...props({ item: generated })} />);
    expect(screen.getByText(/generated and locked/i)).toBeInTheDocument();
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

  it('shows only the party controls used by the template and defaults director loops to all directors', async () => {
    const user = userEvent.setup();
    const p = props({
      templateContent: '<p>{{#each directors}}{{this.name}}{{/each}}</p>',
      directors: [
        { id: 'director-1', contactId: null, name: 'Alice Tan', detail: 'DIRECTOR', email: null, phone: null, address: { full: null, letter: null } },
        { id: 'director-2', contactId: null, name: 'Ben Lim', detail: 'DIRECTOR', email: null, phone: null, address: { full: null, letter: null } },
      ],
      shareholders: [
        { id: 'shareholder-1', contactId: null, name: 'Shareholder', detail: 'ORDINARY', email: null, phone: null, address: { full: null, letter: null } },
      ],
      companyContacts: [{ id: 'contact-1', fullName: 'Company Contact' }],
    });
    render(<BatchItemConfigurator {...p} />);

    expect(screen.getByRole('group', { name: /directors/i })).toBeInTheDocument();
    expect(screen.queryByRole('group', { name: /^director$/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('group', { name: /shareholder/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('group', { name: /company contact/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Contacts' })).not.toBeInTheDocument();
    expect(screen.getAllByRole('checkbox')).toHaveLength(2);
    expect(screen.getAllByRole('checkbox').every((checkbox) => (
      (checkbox as HTMLInputElement).checked
    ))).toBe(true);

    await user.click(screen.getByRole('checkbox', { name: /Alice Tan/ }));
    expect(p.onPatch).toHaveBeenCalledWith({ selectedDirectorIds: ['director-2'] });
  });
});
