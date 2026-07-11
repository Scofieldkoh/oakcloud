import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import {
  ReviewCheckbox,
  ReviewField,
  ReviewSelect,
  ReviewTextarea,
} from '@/components/companies/bizfile-review/bizfile-review-fields';
import { RepeatingRecordEditor } from '@/components/companies/bizfile-review/repeating-record-editor';

describe('BizFile review fields', () => {
  it('connects labels, hints, and issues to native controls', () => {
    render(
      <>
        <ReviewField id="name" label="Name" hint="Registered name" error={{ path: 'entityDetails.name', message: 'Required', section: 'entity' }} />
        <ReviewSelect id="status" label="Status" error="Choose a status"><option>Active</option></ReviewSelect>
        <ReviewTextarea id="notes" label="Notes" hint="Optional notes" />
        <ReviewCheckbox id="confirmed" label="Confirmed" error="Confirmation required" />
      </>,
    );

    expect(screen.getByLabelText('Name')).toHaveAttribute('aria-describedby', 'name-hint name-error');
    expect(screen.getByLabelText('Name')).toHaveAttribute('aria-invalid', 'true');
    expect(screen.getByText('Required')).toHaveAttribute('id', 'name-error');
    expect(screen.getByLabelText('Status')).toHaveAttribute('aria-describedby', 'status-error');
    expect(screen.getByLabelText('Notes')).toHaveAttribute('aria-describedby', 'notes-hint');
    expect(screen.getByLabelText('Notes')).toHaveAttribute('aria-invalid', 'false');
    expect(screen.getByLabelText('Confirmed')).toHaveAttribute('aria-invalid', 'true');
  });
});

describe('RepeatingRecordEditor', () => {
  it('adds, duplicates, removes, and restores records', () => {
    const onChange = vi.fn();
    const items = [{ name: 'Alice' }];
    const { rerender } = render(
      <RepeatingRecordEditor title="Officers" items={items} onChange={onChange}
        createItem={() => ({ name: '' })} getItemLabel={(item) => item.name || 'New officer'}
        renderItem={(item) => <input aria-label="Officer name" value={item.name} readOnly />} />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Add Officers' }));
    expect(onChange).toHaveBeenLastCalledWith([{ name: 'Alice' }, { name: '' }]);
    fireEvent.click(screen.getByRole('button', { name: 'Duplicate Alice' }));
    expect(onChange).toHaveBeenLastCalledWith([{ name: 'Alice' }, { name: 'Alice' }]);
    fireEvent.click(screen.getByRole('button', { name: 'Remove Alice' }));
    expect(onChange).toHaveBeenLastCalledWith([]);
    rerender(<RepeatingRecordEditor title="Officers" items={[]} onChange={onChange}
      createItem={() => ({ name: '' })} getItemLabel={(item) => item.name || 'New officer'}
      renderItem={() => null} />);
    fireEvent.click(screen.getByRole('button', { name: 'Undo remove Alice' }));
    expect(onChange).toHaveBeenLastCalledWith([{ name: 'Alice' }]);
  });

  it('updates a row immutably and focuses a newly duplicated row', async () => {
    const item = { name: 'Alice' };
    const onChange = vi.fn();
    const editor = (items: typeof item[]) => <RepeatingRecordEditor title="Officers" items={items} onChange={onChange}
      createItem={() => ({ name: '' })} getItemLabel={(row) => row.name}
      renderItem={(row, _index, update) => <input aria-label={`Edit ${row.name}`} value={row.name} onChange={(event) => update({ name: event.target.value })} />} />;
    const { rerender } = render(editor([item]));

    fireEvent.change(screen.getByLabelText('Edit Alice'), { target: { value: 'Alicia' } });
    expect(onChange).toHaveBeenLastCalledWith([{ name: 'Alicia' }]);
    expect(item).toEqual({ name: 'Alice' });
    fireEvent.click(screen.getByRole('button', { name: 'Duplicate Alice' }));
    rerender(editor([item, item]));
    await vi.waitFor(() => expect(screen.getAllByLabelText('Edit Alice')[1]).toHaveFocus());
  });
});
