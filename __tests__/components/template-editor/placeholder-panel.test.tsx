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

function openCustomFieldForm() {
  fireEvent.click(screen.getByRole('button', { name: 'Add custom field' }));
}

function fillLabelAndKey(label: string, key: string) {
  fireEvent.change(screen.getByLabelText('Field label'), { target: { value: label } });
  fireEvent.change(screen.getByLabelText('Field key'), { target: { value: key } });
}

describe('PlaceholderPanel', () => {
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
});
