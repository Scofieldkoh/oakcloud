import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { SearchableSelect } from '@/components/ui/searchable-select';

describe('SearchableSelect custom value', () => {
  it('accepts a typed custom value only when configured', () => {
    const changed = vi.fn();
    render(<SearchableSelect
      options={[{ value: 'ORDINARY', label: 'Ordinary' }]}
      value=""
      onChange={changed}
      allowCustomValue
    />);
    const input = screen.getByRole('combobox');
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: 'FOUNDERS' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(changed).toHaveBeenCalledWith('FOUNDERS');
  });

  it('shows previously entered custom values on a closed select', () => {
    render(<SearchableSelect
      options={[{ value: 'ORDINARY', label: 'Ordinary' }]}
      value="SPECIAL CLASS"
      onChange={vi.fn()}
      allowCustomValue
    />);
    expect(screen.getByRole('combobox')).toHaveValue('SPECIAL CLASS');
  });
});
