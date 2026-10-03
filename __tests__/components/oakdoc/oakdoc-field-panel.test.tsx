import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { OakDocFieldPanel } from '@/components/documents/oakdoc/oakdoc-field-panel';
import type { OakDocCustomField, OakDocRepeaterSections } from '@/lib/document-editor/oakdoc-custom-fields';

vi.mock('@/components/ui/contact-search-select', () => ({
  ContactSearchSelect: () => null,
}));

function Harness({ onInsert, onSections = vi.fn() }: {
  onInsert: (tag: string) => void;
  onSections?: (sections: OakDocRepeaterSections) => void;
}) {
  const [fields, setFields] = useState<OakDocCustomField[]>([
    { key: 'meeting_date', label: 'Meeting date', type: 'date', required: true },
  ]);
  const [sections, setSections] = useState<OakDocRepeaterSections>({ names: {}, shortlists: {} });
  return (
    <OakDocFieldPanel
      presentTags={['company.name', 'director.name']}
      onInsert={(field) => onInsert(field.tag)}
      customFields={fields}
      onCustomFieldsChange={setFields}
      repeaterTags={['repeat.directors']}
      onAddRepeater={vi.fn()}
      onRemoveRepeaterAtCaret={vi.fn()}
      sections={sections}
      onSectionsChange={(next) => {
        setSections(next);
        onSections(next);
      }}
    />
  );
}

describe('OakDocFieldPanel', () => {
  it('opens a field on click and adds it with its Add button, one open at a time', async () => {
    const user = userEvent.setup();
    const onInsert = vi.fn();
    render(<Harness onInsert={onInsert} />);

    await user.click(screen.getByRole('button', { name: 'Company Name' }));
    expect(screen.getByText('{{company.name}}')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Add Company Name' }));
    expect(onInsert).toHaveBeenLastCalledWith('company.name');

    await user.click(screen.getByRole('button', { name: /Meeting date/ }));
    expect(screen.queryByText('{{company.name}}')).not.toBeInTheDocument();
    expect(screen.getByText('Date · required')).toBeInTheDocument();
  });

  it('adds a field at once on double click', async () => {
    const user = userEvent.setup();
    const onInsert = vi.fn();
    render(<Harness onInsert={onInsert} />);
    await user.dblClick(screen.getByRole('button', { name: 'Company Name' }));
    expect(onInsert).toHaveBeenLastCalledWith('company.name');
  });

  it('searches every group, including the fields of sections in the document', async () => {
    const user = userEvent.setup();
    render(<Harness onInsert={vi.fn()} />);
    await user.type(screen.getByRole('searchbox', { name: 'Search fields' }), 'director name');
    // The selected director's and the repeating section's, each in its own group.
    expect(screen.getAllByRole('button', { name: 'Director Name' })).toHaveLength(2);
    expect(within(screen.getByRole('region', { name: 'Repeating sections' })).getByRole('button', { name: 'Director Name' }))
      .toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Company Name' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Meeting date/ })).not.toBeInTheDocument();

    await user.clear(screen.getByRole('searchbox', { name: 'Search fields' }));
    await user.type(screen.getByRole('searchbox', { name: 'Search fields' }), 'zzz');
    expect(screen.getByText('No Oakcloud fields match.')).toBeInTheDocument();
  });

  it('names the selected director picker for Configure from any of its fields', async () => {
    const user = userEvent.setup();
    const onSections = vi.fn();
    render(<Harness onInsert={vi.fn()} onSections={onSections} />);

    const group = screen.getByRole('button', { name: /^Selected Director/ });
    await user.click(group);
    await user.click(screen.getAllByRole('button', { name: /^Director Name$/ }).at(-1)!);
    const name = screen.getByRole('textbox', { name: 'Name on Configure' });
    expect(name).toHaveAttribute('placeholder', 'Director');
    await user.type(name, 'Signer of the resolution(s)');
    expect(onSections).toHaveBeenLastCalledWith({
      names: { selectedDirector: 'Signer of the resolution(s)' },
      shortlists: {},
    });
    expect(within(group).getByText('Selected Director · Signer of the resolution(s)')).toBeInTheDocument();
  });
});
