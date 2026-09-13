import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { PlaceholderPanel } from '@/components/documents/template-editor/placeholder-panel';
import type { CustomPlaceholderDefinition } from '@/types/placeholders';

const existingField: CustomPlaceholderDefinition = {
  id: 'existing-field',
  key: 'reference_number',
  label: 'Reference number',
  type: 'text',
  required: true,
};

const defaultProps = {
  onInsert: vi.fn(),
  partials: [],
  isLoadingPartials: false,
  customPlaceholders: [] as CustomPlaceholderDefinition[],
  onCustomPlaceholdersChange: vi.fn(),
};

const partial = { id: 'letterhead', name: 'letterhead', displayName: 'Letterhead' };

function openCustomFieldForm() {
  fireEvent.click(screen.getByRole('button', { name: 'Add custom field' }));
}

function fillLabelAndKey(label: string, key: string) {
  fireEvent.change(screen.getByLabelText('Field label'), { target: { value: label } });
  fireEvent.change(screen.getByLabelText('Field key'), { target: { value: key } });
}

describe('PlaceholderPanel F3 field discovery UX', () => {
  it('offers selected party, letter address, and preparer placeholders', () => {
    const onInsert = vi.fn();
    render(<PlaceholderPanel {...defaultProps} onInsert={onInsert} />);

    expect(screen.getByText('Selected Director')).toBeVisible();
    expect(screen.getByText('Selected Shareholder')).toBeVisible();
    expect(screen.getByText('Selected Contact')).toBeVisible();
    expect(screen.getByText('Company Letter Address')).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: /^System,/ }));
    expect(screen.getByText('Preparer Name')).toBeVisible();

    fireEvent.click(screen.getByRole('button', { name: /^Selected Director,/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Insert Director Email' }));
    expect(onInsert).toHaveBeenCalledWith('{{selectedDirector.email}}');
  });

  it('shows business metadata while keeping technical keys in advanced details', () => {
    render(<PlaceholderPanel {...defaultProps} />);
    const companyName = screen.getByText('Company Name').closest('.group')!;
    expect(companyName).toHaveTextContent('Company');
    expect(companyName).toHaveTextContent('Text');
    expect(companyName).toHaveTextContent('supplied from the company document context');
    expect(screen.getAllByText('Advanced details').length).toBeGreaterThan(0);
  });

  it('wraps multiline examples and long labels for narrow panels', () => {
    render(<PlaceholderPanel {...defaultProps} />);
    const example = screen.getAllByText(/Example: Sample Building/).find((element) => element.textContent?.includes('123 Sample Street'))!;
    expect(example).toHaveClass('whitespace-pre-line', 'break-words');
    expect(screen.getByText('Company Letter Address')).toHaveClass('break-words');
  });

  it('offers collection fields only through their guided loop builders', () => {
    render(<PlaceholderPanel {...defaultProps} />);
    expect(screen.getByRole('button', { name: 'Build directors loop' })).toBeVisible();
    expect(screen.getByRole('button', { name: 'Build shareholders loop' })).toBeVisible();
    expect(screen.queryByRole('button', { name: 'Insert Director Name' })).not.toBeInTheDocument();
  });

  it('searches business labels/descriptions and inserts the selected placeholder', () => {
    const onInsert = vi.fn();
    render(<PlaceholderPanel {...defaultProps} onInsert={onInsert} />);
    fireEvent.change(screen.getByRole('searchbox', { name: 'Search fields' }), { target: { value: 'company name' } });
    fireEvent.click(screen.getByRole('button', { name: 'Insert Company Name' }));
    expect(onInsert).toHaveBeenCalledWith('{{company.name}}');
  });

  it('inserts a complete loop from the guided builder', () => {
    const onInsert = vi.fn();
    render(<PlaceholderPanel {...defaultProps} onInsert={onInsert} />);
    fireEvent.click(screen.getByRole('button', { name: 'Build directors loop' }));
    fireEvent.click(screen.getByLabelText('Director name'));
    fireEvent.click(screen.getByRole('button', { name: 'Insert loop' }));
    expect(onInsert.mock.calls[0][0]).toMatch(/#each directors[\s\S]*this\.name[\s\S]*\/each/);
  });

  it('inserts a keep-together signature block from the guided builder', () => {
    const onInsert = vi.fn();
    render(<PlaceholderPanel {...defaultProps} onInsert={onInsert} />);
    fireEvent.click(screen.getByRole('button', { name: 'Signature blocks, 1 result' }));
    fireEvent.click(screen.getByRole('button', { name: 'Build signature block' }));
    fireEvent.click(screen.getByRole('button', { name: 'Insert signature block' }));
    expect(onInsert.mock.calls[0][0]).toContain('data-flow-keep-together="true"');
  });

  it('explains duplicate custom keys inline', () => {
    render(<PlaceholderPanel {...defaultProps} customPlaceholders={[existingField]} />);
    openCustomFieldForm();
    fillLabelAndKey('Duplicate', existingField.key);
    expect(screen.getByText('This placeholder key already exists.')).toBeVisible();
  });

  it('continues generated-key authoring until the user intentionally edits the key', () => {
    render(<PlaceholderPanel {...defaultProps} />);
    openCustomFieldForm();
    fireEvent.change(screen.getByLabelText('Field label'), { target: { value: 'Reference Number' } });
    expect(screen.getByLabelText('Field key')).toHaveValue('reference_number');
    fireEvent.change(screen.getByLabelText('Field label'), { target: { value: 'Client Reference Number' } });
    expect(screen.getByLabelText('Field key')).toHaveValue('client_reference_number');
    fireEvent.change(screen.getByLabelText('Field key'), { target: { value: 'manual_ref' } });
    fireEvent.change(screen.getByLabelText('Field label'), { target: { value: 'Another Label' } });
    expect(screen.getByLabelText('Field key')).toHaveValue('manual_ref');
  });

  it('distinguishes Create from Create and insert', () => {
    const onInsert = vi.fn();
    const onCustomPlaceholdersChange = vi.fn();
    render(<PlaceholderPanel {...defaultProps} onInsert={onInsert} onCustomPlaceholdersChange={onCustomPlaceholdersChange} />);
    openCustomFieldForm();
    fireEvent.change(screen.getByLabelText('Field label'), { target: { value: 'Client Reference Number' } });
    fireEvent.click(screen.getByRole('button', { name: 'Create and insert field' }));
    expect(onCustomPlaceholdersChange).toHaveBeenCalledWith([
      expect.objectContaining({ key: 'client_reference_number', label: 'Client Reference Number' }),
    ]);
    expect(onInsert).toHaveBeenCalledWith('{{custom.client_reference_number}}');
  });

  it('searches custom fields and partials without exposing unrelated categories', () => {
    render(<PlaceholderPanel {...defaultProps} customPlaceholders={[existingField]} partials={[partial]} />);
    fireEvent.change(screen.getByRole('searchbox', { name: 'Search fields' }), { target: { value: 'reference number' } });
    expect(screen.getByRole('button', { name: 'Custom, 1 result' })).toBeVisible();
    expect(screen.getByText('Reference number')).toBeVisible();
    expect(screen.queryByRole('button', { name: /Company,/ })).not.toBeInTheDocument();

    fireEvent.change(screen.getByRole('searchbox', { name: 'Search fields' }), { target: { value: 'letterhead' } });
    expect(screen.getByRole('button', { name: 'Partials, 1 result' })).toBeVisible();
    expect(screen.getByRole('button', { name: 'Insert Letterhead' })).toBeVisible();
  });

  it('surfaces loops/conditions and explains why standalone modifiers are unavailable', () => {
    render(<PlaceholderPanel {...defaultProps} />);
    expect(screen.getByRole('button', { name: 'Loops, 2 results' })).toBeVisible();
    expect(screen.getByRole('button', { name: 'Conditions, 1 result' })).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'Modifiers, 4 results' }));
    expect(screen.getAllByText(/Select an existing valid field first/)).toHaveLength(4);
    expect(screen.queryByRole('button', { name: 'Insert Uppercase' })).not.toBeInTheDocument();
  });

  it('offers whole-token copy actions for normal/custom/partial fields but not builders', () => {
    render(<PlaceholderPanel {...defaultProps} customPlaceholders={[existingField]} partials={[partial]} />);
    expect(screen.getByRole('button', { name: 'Copy Company Name' })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Copy Reference number' })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Copy Letterhead' })).toBeEnabled();
    expect(screen.queryByRole('button', { name: 'Copy Directors loop' })).not.toBeInTheDocument();
  });

  it('edits a custom label without silently migrating its stable key', () => {
    const onCustomPlaceholdersChange = vi.fn();
    render(<PlaceholderPanel {...defaultProps} customPlaceholders={[existingField]} onCustomPlaceholdersChange={onCustomPlaceholdersChange} />);
    fireEvent.click(screen.getByRole('button', { name: 'Edit Reference number' }));
    expect(screen.getByLabelText('Field key')).toBeDisabled();
    fireEvent.change(screen.getByLabelText('Field label'), { target: { value: 'Updated reference' } });
    fireEvent.click(screen.getByRole('button', { name: 'Update field' }));
    expect(onCustomPlaceholdersChange).toHaveBeenCalledWith([
      expect.objectContaining({ id: existingField.id, key: existingField.key, label: 'Updated reference' }),
    ]);
  });

  it('requires explicit confirmation before deleting a custom field', () => {
    const onCustomPlaceholdersChange = vi.fn();
    render(<PlaceholderPanel {...defaultProps} customPlaceholders={[existingField]} onCustomPlaceholdersChange={onCustomPlaceholdersChange} />);
    fireEvent.click(screen.getByRole('button', { name: 'Delete Reference number' }));
    expect(onCustomPlaceholdersChange).not.toHaveBeenCalled();
    expect(screen.getByText(/Usage locations are not available/)).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'Delete field only' }));
    expect(onCustomPlaceholdersChange).toHaveBeenCalledWith([]);
  });

  it('shows usage count/locations and offers an atomic reference-removal handoff', () => {
    const onDeleteCustomField = vi.fn();
    const onNavigateToFieldOccurrence = vi.fn();
    render(
      <PlaceholderPanel
        {...defaultProps}
        customPlaceholders={[existingField]}
        sourceContent={'<p>{{custom.reference_number}}</p>\n<p>{{custom.reference_number}}</p>'}
        ownerScope={{ kind: 'template', id: 'template-f3' }}
        onDeleteCustomField={onDeleteCustomField}
        onNavigateToFieldOccurrence={onNavigateToFieldOccurrence}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Delete Reference number' }));
    expect(screen.getByText(/used 2 times/)).toBeVisible();
    const locations = screen.getAllByRole('button', { name: /Line [12], column/ });
    fireEvent.click(locations[0]);
    expect(onNavigateToFieldOccurrence).toHaveBeenCalledWith(expect.objectContaining({ line: 1 }));
    fireEvent.click(screen.getByRole('button', { name: 'Delete and remove references' }));
    expect(onDeleteCustomField).toHaveBeenCalledWith(expect.objectContaining({
      referenceAction: 'remove-references',
      usage: expect.objectContaining({ count: 2 }),
    }));
  });

  it('uses stable custom identity for recents and removes deleted fields from the recent projection', () => {
    const onInsert = vi.fn();
    const { rerender } = render(<PlaceholderPanel {...defaultProps} onInsert={onInsert} customPlaceholders={[existingField]} />);
    fireEvent.click(screen.getByRole('button', { name: 'Insert Reference number' }));
    expect(screen.getByRole('heading', { name: 'Recently used' })).toBeVisible();
    rerender(<PlaceholderPanel {...defaultProps} onInsert={onInsert} customPlaceholders={[]} />);
    expect(screen.queryByRole('heading', { name: 'Recently used' })).not.toBeInTheDocument();
  });

  it('inserts and copies stable service agreement blocks', async () => {
    const onInsert = vi.fn();
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } });
    render(<PlaceholderPanel {...defaultProps} onInsert={onInsert} />);
    fireEvent.click(screen.getByRole('button', { name: 'Insert Service sections' }));
    expect(onInsert).toHaveBeenCalledWith('{{@agreement.serviceSections}}');
    fireEvent.click(screen.getByRole('button', { name: 'Copy Fee table' }));
    await waitFor(() => expect(writeText).toHaveBeenCalledWith('{{@agreement.feeTable}}'));
  });

  it('keeps applicable persisted service fields separate and on their existing resolver path', () => {
    const onInsert = vi.fn();
    render(
      <PlaceholderPanel
        {...defaultProps}
        onInsert={onInsert}
        customPlaceholders={[{
          id: 'service-software',
          key: 'service.fields.software',
          label: 'Accounting software',
          type: 'textarea',
          required: true,
          storageSource: 'service',
          storagePath: 'service.fields.software',
          storageCategory: 'service-input',
        }]}
      />,
    );
    expect(screen.getByRole('button', { name: 'Service fields, 1 result' })).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'Insert Accounting software' }));
    expect(onInsert).toHaveBeenCalledWith('{{service.fields.software}}');
    expect(screen.queryByRole('button', { name: 'Edit Accounting software' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Delete Accounting software' })).not.toBeInTheDocument();
  });
});
