import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { SearchableSelect } from '@/components/ui/searchable-select';

const options = [
  { value: 'company-1', label: 'Aurion Holdings Pte Ltd' },
  { value: 'company-2', label: 'Aurion Capital Pte Ltd' },
];

describe('SearchableSelect text filter', () => {
  it('filters by the typed text on Enter instead of picking an option', () => {
    const onChange = vi.fn();
    const onSearchSubmit = vi.fn();
    render(<SearchableSelect options={options} value="" onChange={onChange} onSearchSubmit={onSearchSubmit} />);
    const input = screen.getByRole('combobox');
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: 'Aurion' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(onSearchSubmit).toHaveBeenCalledWith('Aurion');
    expect(onChange).not.toHaveBeenCalled();
  });

  it('shows the applied text and clears it with the clear button', () => {
    const onChange = vi.fn();
    const onSearchSubmit = vi.fn();
    render(
      <SearchableSelect
        options={options}
        value=""
        onChange={onChange}
        onSearchSubmit={onSearchSubmit}
        submittedSearch="Aurion"
        ariaLabel="Company"
      />,
    );
    expect(screen.getByRole('combobox', { name: 'Company' })).toHaveValue('Aurion');
    fireEvent.click(screen.getByRole('button', { name: 'Clear selection' }));
    expect(onSearchSubmit).toHaveBeenCalledWith('');
    expect(onChange).not.toHaveBeenCalled();
  });

  it('picks an option after arrow-key navigation', () => {
    const onChange = vi.fn();
    const onSearchSubmit = vi.fn();
    Element.prototype.scrollIntoView = vi.fn();
    render(<SearchableSelect options={options} value="" onChange={onChange} onSearchSubmit={onSearchSubmit} />);
    const input = screen.getByRole('combobox');
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: 'Aurion' } });
    fireEvent.keyDown(input, { key: 'ArrowDown' });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(onChange).toHaveBeenCalledWith('company-1');
    expect(onSearchSubmit).not.toHaveBeenCalled();
  });
});
