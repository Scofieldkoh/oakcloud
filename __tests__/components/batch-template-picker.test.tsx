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

function catalogueCard(name: string) {
  return screen.getByRole('button', { name: new RegExp(`^${name}`, 'i') });
}

describe('BatchTemplatePicker', () => {
  it('toggles a template from its whole card and marks the selection', async () => {
    const user = userEvent.setup();
    const props = pickerProps();
    const first = render(<BatchTemplatePicker {...props} />);

    await user.click(catalogueCard('Engagement Letter'));
    expect(props.onAdd).toHaveBeenCalledWith(engagement);
    first.unmount();

    const { unmount } = render(<BatchTemplatePicker {...pickerProps({
      selected: [item(engagement)],
    })} />);
    // Selected templates stay in the catalogue so the mapping is obvious.
    expect(catalogueCard('Engagement Letter')).toHaveAttribute('aria-pressed', 'true');
    expect(catalogueCard('Service Agreement')).toHaveAttribute('aria-pressed', 'false');
    unmount();
  });

  it('enforces the document maximum using the configured limit', async () => {
    const user = userEvent.setup();
    const selected = Array.from({ length: 19 }, (_, index) =>
      item(template(`template-${index}`, `Template ${index}`)));
    const props = pickerProps({
      selected,
      maxDocuments: 20,
    });
    const first = render(<BatchTemplatePicker {...props} />);

    expect(screen.getByText('19 of 20')).toBeInTheDocument();
    expect(screen.queryByText(/maximum of 20 documents reached/i)).not.toBeInTheDocument();
    await user.click(catalogueCard('Service Agreement'));
    expect(props.onAdd).toHaveBeenCalledWith(serviceAgreement);
    first.unmount();

    const atLimit = pickerProps({
      selected: [...selected, item(serviceAgreement)],
      maxDocuments: 20,
      templates: [kyc],
    });
    const second = render(<BatchTemplatePicker {...atLimit} />);
    expect(screen.getByText(/maximum of 20 documents reached/i)).toBeInTheDocument();
    expect(catalogueCard('KYC Checklist')).toBeDisabled();
    second.unmount();
  });

  it('supports keyboard reorder, drag reorder, and removing the last document', async () => {
    const user = userEvent.setup();
    const selected = [item(engagement), item(serviceAgreement)];
    const props = pickerProps({ selected, onMove: vi.fn() });
    const { unmount } = render(<BatchTemplatePicker {...props} />);

    await user.click(screen.getByRole('button', { name: 'Move Service Agreement up' }));
    expect(props.onReorder).toHaveBeenCalledWith('template-b', -1);

    await user.click(screen.getByRole('button', { name: 'Remove Engagement Letter' }));
    expect(props.onRemove).toHaveBeenCalledWith('template-a');
    // The last remaining document is removable; the empty state explains what to do.
    expect(screen.getByRole('button', { name: 'Remove Service Agreement' })).not.toBeDisabled();
    unmount();

    const single = pickerProps({ selected: [item(engagement)] });
    render(<BatchTemplatePicker {...single} />);
    await user.click(screen.getByRole('button', { name: 'Remove Engagement Letter' }));
    expect(single.onRemove).toHaveBeenCalledWith('template-a');
  });

  it('confirms before discarding a document that already has draft data', async () => {
    const user = userEvent.setup();
    const dirty = item(engagement);
    dirty.configuration.itemValues = { 'custom.reference': 'REF-1' };
    const props = pickerProps({ selected: [dirty] });
    render(<BatchTemplatePicker {...props} />);

    await user.click(screen.getByRole('button', { name: 'Remove Engagement Letter' }));
    expect(props.onRemove).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: /remove document/i })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /remove document/i }));
    expect(props.onRemove).toHaveBeenCalledWith('template-a');
  });

  it('shows a no-match state and an empty batch state', () => {
    render(<BatchTemplatePicker {...pickerProps({
      templates: [],
      disabled: true,
    })} />);
    expect(screen.getByText(/no templates match/i)).toBeInTheDocument();
    expect(screen.getByText(/no documents yet/i)).toBeInTheDocument();
  });
});
