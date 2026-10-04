import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { OakDocFieldRow } from '@/components/documents/oakdoc/oakdoc-field-row';

const field = { tag: 'company.registeredAddress', label: 'Full Address', category: 'Company' };

describe('OakDocFieldRow text case', () => {
  it('adds the field in the case chosen for it, as stored by default', async () => {
    // The dropdown's popover renders once its trigger has a width, which jsdom lacks.
    vi.spyOn(Element.prototype, 'getBoundingClientRect').mockReturnValue({
      width: 160, height: 32, top: 0, left: 0, bottom: 32, right: 160, x: 0, y: 0, toJSON: () => undefined,
    } as unknown as DOMRect);
    const user = userEvent.setup();
    const onAdd = vi.fn();
    render(<OakDocFieldRow field={field} selected onSelect={vi.fn()} onAdd={onAdd} />);

    await user.click(screen.getByRole('button', { name: 'Add Full Address' }));
    expect(onAdd).toHaveBeenLastCalledWith(field);

    await user.click(screen.getByRole('combobox', { name: 'Text case' }));
    await user.click(screen.getByRole('option', { name: 'UPPERCASE' }));
    await user.click(screen.getByRole('button', { name: 'Add Full Address' }));
    expect(onAdd).toHaveBeenLastCalledWith({ ...field, textCase: 'upper' });
    vi.restoreAllMocks();
  });
});
