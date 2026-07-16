import { fireEvent, render, screen } from '@testing-library/react';
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

const partial = {
  id: 'letterhead',
  name: 'letterhead',
  displayName: 'Letterhead',
};

function openCustomFieldForm() {
  fireEvent.click(screen.getByRole('button', { name: 'Add custom field' }));
}

function fillLabelAndKey(label: string, key: string) {
  fireEvent.change(screen.getByLabelText('Field label'), { target: { value: label } });
  fireEvent.change(screen.getByLabelText('Field key'), { target: { value: key } });
}

describe('PlaceholderPanel', () => {
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

  it('offers collection fields only through their guided loop builders', () => {
    render(<PlaceholderPanel {...defaultProps} />);
    expect(screen.getByRole('button', { name: 'Build directors loop' })).toBeVisible();
    expect(screen.getByRole('button', { name: 'Build shareholders loop' })).toBeVisible();
    expect(screen.queryByRole('button', { name: 'Insert Director Name' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Insert Shareholder Name' })).not.toBeInTheDocument();
  });
  it('searches labels and inserts the selected placeholder', () => {
    const onInsert = vi.fn();
    render(<PlaceholderPanel {...defaultProps} onInsert={onInsert} />);

    fireEvent.change(screen.getByRole('searchbox', { name: 'Search fields' }), {
      target: { value: 'company name' },
    });
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

  it('explains a duplicate custom placeholder key inline', () => {
    render(
      <PlaceholderPanel
        {...defaultProps}
        customPlaceholders={[existingField]}
      />,
    );

    openCustomFieldForm();
    fillLabelAndKey('Duplicate', existingField.key);

    expect(screen.getByText('This placeholder key already exists.')).toBeVisible();
  });

  it('searches each field source and exposes filtered category counts', () => {
    render(
      <PlaceholderPanel
        {...defaultProps}
        customPlaceholders={[existingField]}
        partials={[partial]}
      />,
    );

    fireEvent.change(screen.getByRole('searchbox', { name: 'Search fields' }), {
      target: { value: 'reference number' },
    });

    expect(screen.getByRole('button', { name: 'Custom, 1 result' })).toBeVisible();
    expect(screen.queryByRole('button', { name: /Company,/ })).not.toBeInTheDocument();

    fireEvent.change(screen.getByRole('searchbox', { name: 'Search fields' }), {
      target: { value: 'letterhead' },
    });
    expect(screen.getByRole('button', { name: 'Partials, 1 result' })).toBeVisible();
    expect(screen.getByRole('button', { name: 'Insert Letterhead' })).toBeVisible();
  });

  it('surfaces separate loops, conditions, and modifiers categories', () => {
    render(<PlaceholderPanel {...defaultProps} />);

    expect(screen.getByRole('button', { name: 'Loops, 2 results' })).toBeVisible();
    expect(screen.getByRole('button', { name: 'Conditions, 1 result' })).toBeVisible();
    expect(screen.getByRole('button', { name: 'Modifiers, 3 results' })).toBeVisible();
  });

  it('offers usable Copy actions for normal, custom, and partial fields but not builders', () => {
    render(
      <PlaceholderPanel
        {...defaultProps}
        customPlaceholders={[existingField]}
        partials={[partial]}
      />,
    );

    expect(screen.getByRole('button', { name: 'Copy Company Name' })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Copy Reference number' })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Copy Letterhead' })).toBeEnabled();
    expect(screen.queryByRole('button', { name: 'Copy Directors loop' })).not.toBeInTheDocument();
  });

  it('edits an existing custom field without replacing its identity', () => {
    const onCustomPlaceholdersChange = vi.fn();
    render(
      <PlaceholderPanel
        {...defaultProps}
        customPlaceholders={[existingField]}
        onCustomPlaceholdersChange={onCustomPlaceholdersChange}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Edit Reference number' }));
    fillLabelAndKey('Updated reference', 'updated_reference');
    fireEvent.click(screen.getByRole('button', { name: 'Update field' }));

    expect(onCustomPlaceholdersChange).toHaveBeenCalledWith([
      expect.objectContaining({
        id: existingField.id,
        key: 'updated_reference',
        label: 'Updated reference',
      }),
    ]);
  });

});
