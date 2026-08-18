import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { useState } from 'react';
import { AsyncSearchSelect, type AsyncSearchSelectOption } from '@/components/ui/async-search-select';

const options: AsyncSearchSelectOption[] = [
  { id: 'company-1', label: 'Acme Holdings', description: '202600001A' },
  { id: 'company-2', label: 'Beta Services', description: '202600002B' },
];

describe('AsyncSearchSelect', () => {
  it('exposes labelled combobox and listbox semantics with accessible paging and clear controls', async () => {
    const getBoundingClientRect = vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({
      top: 10,
      bottom: 54,
      left: 20,
      right: 340,
      width: 320,
      height: 44,
      x: 20,
      y: 10,
      toJSON: () => ({}),
    });
    const onChange = vi.fn();
    const onSearchChange = vi.fn();

    try {
      function Harness() {
        const [value, setValue] = useState('');
        return (
          <AsyncSearchSelect
            label="Company"
            value={value}
            options={options}
            isLoading={false}
            searchQuery=""
            onSearchChange={onSearchChange}
            onChange={(id, item) => {
              onChange(id, item);
              setValue(id);
            }}
            pagination={{
              page: 1,
              hasPreviousPage: true,
              hasNextPage: true,
              onPreviousPage: vi.fn(),
              onNextPage: vi.fn(),
            }}
          />
        );
      }

      render(
        <Harness />,
      );

      const input = screen.getByRole('combobox', { name: 'Company' });
      expect(screen.getByText('Company')).toHaveAttribute('for', input.id);
      expect(input).toHaveAttribute('aria-expanded', 'false');
      expect(input).toHaveAttribute('aria-haspopup', 'listbox');
      expect(input).toHaveAttribute('aria-controls');
      expect(input.parentElement).toHaveClass('min-h-11');

      fireEvent.focus(input);
      const listbox = await waitFor(() => screen.getByRole('listbox'));
      expect(listbox.id).toBe(input.getAttribute('aria-controls'));
      expect(input).toHaveAttribute('aria-expanded', 'true');

      const option = within(listbox).getByRole('option', { name: /Acme Holdings/ });
      expect(option).toHaveAttribute('aria-selected', 'false');
      expect(input).toHaveAttribute('aria-activedescendant', option.id);
      expect(within(listbox).getAllByRole('option')).toHaveLength(2);
      expect(screen.getByRole('button', { name: 'Previous' })).toHaveClass('min-h-11');
      expect(screen.getByRole('button', { name: 'Next' })).toHaveClass('min-h-11');

      fireEvent.click(option);
      expect(onChange).toHaveBeenCalledWith('company-1', options[0]);
      const selectedCombobox = screen.getByRole('combobox', { name: 'Company' });
      expect(selectedCombobox).toHaveAttribute('id', input.id);
      expect(selectedCombobox).toHaveAttribute('aria-expanded', 'false');
      expect(selectedCombobox).toHaveTextContent('Acme Holdings');
      const clear = screen.getByRole('button', { name: 'Clear Company' });
      expect(clear).toHaveClass('min-h-11', 'min-w-11');
      fireEvent.click(clear);
      expect(onChange).toHaveBeenLastCalledWith('', null);
    } finally {
      getBoundingClientRect.mockRestore();
    }
  });
});
