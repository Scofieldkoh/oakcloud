import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { PersonShareholdingsEditor } from '@/components/forms/person-shareholdings-editor';

describe('nested shareholding rows in a person card', () => {
  it('allows adding the first share-class row without inventing a shareholding', () => {
    const onChange = vi.fn();
    render(<PersonShareholdingsEditor value={[]} onChange={onChange}
      label="Shareholdings by class" idPrefix="person-a"
      options={[{ label: 'ORDINARY', value: 'ORDINARY' }]} />);
    expect(screen.getByText('No shares recorded for this person.')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Add share class' }));
    expect(onChange).toHaveBeenCalledWith([{ shareClass: '', shares: '' }]);
  });

  it('allows updating a quantity and removing a class', () => {
    const onChange = vi.fn();
    render(<PersonShareholdingsEditor
      value={[{ shareClass: 'ORDINARY', shares: '100' }]}
      onChange={onChange} label="Shareholdings by class"
      idPrefix="person-a" options={[{ label: 'ORDINARY', value: 'ORDINARY' }]} />);
    fireEvent.change(screen.getByRole('textbox', { name: 'Number of shares for class 1' }), {
      target: { value: '200' },
    });
    expect(onChange).toHaveBeenCalledWith([{ shareClass: 'ORDINARY', shares: '200' }]);
    fireEvent.click(screen.getByRole('button', { name: 'Remove shareholding row 1' }));
    expect(onChange).toHaveBeenLastCalledWith([]);
  });

  it('prevents adding beyond the maximum number of classes', () => {
    const rows = Array.from({ length: 20 }, (_, i) => ({ shareClass: String(i), shares: '1' }));
    render(<PersonShareholdingsEditor value={rows} onChange={vi.fn()}
      label="Shareholdings by class" idPrefix="person-a" options={[]} />);
    expect(screen.getByRole('button', { name: 'Add share class' })).toBeDisabled();
  });
});
