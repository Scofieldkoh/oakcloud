import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {
  BatchTemplatePicker,
  type BatchTemplatePickerProps,
} from '@/components/documents/generation-batch/batch-template-picker';
import type {
  EditableBatchItem,
} from '@/components/documents/generation-batch/batch-workspace-state';
import type { DocumentTemplateSummary } from '@/types/document-generation';

function template(id: string, name: string, overrides: Partial<DocumentTemplateSummary> = {}): DocumentTemplateSummary {
  return {
    id,
    name,
    description: null,
    category: 'OTHER',
    compositionType: 'STANDARD',
    version: 1,
    isActive: true,
    content: '<p>x</p>',
    placeholders: [],
    createdAt: '2026-08-12T00:00:00.000Z',
    updatedAt: '2026-08-12T00:00:00.000Z',
    ...overrides,
  };
}

const engagement = template('template-a', 'Engagement Letter', { category: 'LETTER' });
const serviceAgreement = template('template-b', 'Service Agreement', {
  category: 'CONTRACT',
  compositionType: 'SERVICE_AGREEMENT',
});
const kyc = template('template-c', 'KYC Checklist');

function item(template: DocumentTemplateSummary): EditableBatchItem {
  return {
    key: template.id,
    templateId: template.id,
    templateName: template.name,
    templateKind: template.compositionType,
    templateVersion: template.version,
    status: 'NOT_STARTED',
    configuration: {
      version: 1,
      title: `Untitled - ${template.name}`,
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

function pickerProps(overrides: Partial<BatchTemplatePickerProps> = {}): BatchTemplatePickerProps {
  return {
    templates: [engagement, serviceAgreement, kyc],
    selected: [],
    onAdd: vi.fn(),
    onRemove: vi.fn(),
    onReorder: vi.fn(),
    ...overrides,
  };
}

describe('BatchTemplatePicker', () => {
  it('adds distinct templates and excludes already selected ones', async () => {
    const user = userEvent.setup();
    const props = pickerProps();
    const first = render(<BatchTemplatePicker {...props} />);

    await user.click(screen.getByRole('button', { name: 'Add Engagement Letter' }));
    expect(props.onAdd).toHaveBeenCalledWith(engagement);
    first.unmount();

    const { unmount } = render(<BatchTemplatePicker {...pickerProps({
      selected: [item(engagement)],
    })} />);
    expect(screen.queryByRole('button', { name: 'Add Engagement Letter' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Add Service Agreement' })).toBeInTheDocument();
    unmount();
  });

  it('enforces the 20 document maximum', async () => {
    const user = userEvent.setup();
    const selected = Array.from({ length: 19 }, (_, index) =>
      item(template(`template-${index}`, `Template ${index}`)));
    const props = pickerProps({
      selected,
      maxDocuments: 20,
    });
    const first = render(<BatchTemplatePicker {...props} />);

    expect(screen.getByText('19 of 20 documents selected')).toBeInTheDocument();
    expect(screen.queryByText('20 document maximum reached')).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Add Service Agreement' }));
    expect(props.onAdd).toHaveBeenCalledWith(serviceAgreement);
    first.unmount();

    const atLimit = pickerProps({
      selected: [...selected, item(serviceAgreement)],
      maxDocuments: 20,
      templates: [kyc],
    });
    const second = render(<BatchTemplatePicker {...atLimit} />);
    expect(screen.getByText('20 document maximum reached')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Add KYC Checklist' })).toBeDisabled();
    second.unmount();
  });

  it('supports keyboard reorder and removal with a single item guard', async () => {
    const user = userEvent.setup();
    const selected = [item(engagement), item(serviceAgreement)];
    const props = pickerProps({ selected });
    render(<BatchTemplatePicker {...props} />);

    await user.click(screen.getByRole('button', { name: 'Move Service Agreement up' }));
    expect(props.onReorder).toHaveBeenCalledWith('template-b', -1);

    await user.click(screen.getByRole('button', { name: 'Remove Engagement Letter' }));
    expect(props.onRemove).toHaveBeenCalledWith('template-a');
    expect(screen.getByRole('button', { name: 'Remove Service Agreement' })).not.toBeDisabled();
  });

  it('shows a no-match state and disables composition for partial batches', () => {
    render(<BatchTemplatePicker {...pickerProps({
      templates: [],
      disabled: true,
    })} />);
    expect(screen.getByText(/no templates match/i)).toBeInTheDocument();
  });
});
