import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { OakDocRepeaterPanel } from '@/components/documents/oakdoc/oakdoc-repeater-panel';
import type { OakDocCustomFieldContact } from '@/lib/document-editor/oakdoc-custom-fields';

vi.mock('@/components/ui/contact-search-select', () => ({
  ContactSearchSelect: ({ label, onChange }: {
    label?: string;
    onChange: (id: string, contact: { id: string; fullName: string } | null) => void;
  }) => (
    <button type="button" onClick={() => onChange('c2', { id: 'c2', fullName: 'Bea Tan' })}>
      {label}: add Bea Tan
    </button>
  ),
}));

function panel(overrides: Partial<Parameters<typeof OakDocRepeaterPanel>[0]> = {}) {
  const props = {
    repeaterTags: [] as string[],
    fieldTags: [] as string[],
    onAdd: vi.fn(),
    onRemoveAtCaret: vi.fn(),
    onAssignField: vi.fn(),
    ...overrides,
  };
  render(<OakDocRepeaterPanel {...props} />);
  return props;
}

describe('OakDocRepeaterPanel', () => {
  it('inserts an Officers section for any role, or limited to the ticked roles', async () => {
    const user = userEvent.setup();
    const props = panel();

    await user.click(screen.getByRole('button', { name: /^Officers\s*repeat\.officers$/ }));
    expect(props.onAdd).toHaveBeenLastCalledWith(expect.objectContaining({ tag: 'repeat.officers', label: 'Officers' }));

    const roles = screen.getByRole('group', { name: 'Officer roles' });
    await user.click(within(roles).getByRole('button', { name: 'CEO' }));
    await user.click(within(roles).getByRole('button', { name: 'Secretary' }));
    expect(within(roles).getByRole('button', { name: 'Secretary' })).toHaveAttribute('aria-pressed', 'true');
    await user.click(screen.getByRole('button', { name: /repeat\.officers\.secretary\+ceo/ }));
    expect(props.onAdd).toHaveBeenLastCalledWith(expect.objectContaining({
      kind: 'officers',
      tag: 'repeat.officers.secretary+ceo',
      label: 'Officers (Secretary, CEO)',
    }));
  });

  it('shows the officers repeaters in the document with their roles', () => {
    panel({ repeaterTags: ['repeat.officers', 'repeat.officers.secretary'] });
    expect(screen.getByText('Officer fields')).toBeInTheDocument();
    expect(screen.getByText('In this document: Officers (any role), Officers (Secretary)')).toBeInTheDocument();
  });

  it('edits the contacts repeater shortlist', async () => {
    const user = userEvent.setup();
    function Harness() {
      const [contacts, setContacts] = useState<OakDocCustomFieldContact[]>([{ id: 'c1', name: 'Alex Lim' }]);
      return (
        <OakDocRepeaterPanel
          repeaterTags={['repeat.contacts']}
          fieldTags={[]}
          onAdd={vi.fn()}
          onRemoveAtCaret={vi.fn()}
          onAssignField={vi.fn()}
          contactShortlist={contacts}
          onContactShortlistChange={setContacts}
        />
      );
    }
    render(<Harness />);

    expect(screen.getByText('Configure offers 1 shortlisted contact.')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Shortlist' }));
    const dialog = screen.getByRole('dialog');
    await user.click(within(dialog).getByRole('button', { name: /add Bea Tan/ }));
    expect(within(dialog).getByRole('list', { name: 'Contact shortlist' })).toHaveTextContent('Alex LimBea Tan');
    await user.click(within(dialog).getByRole('button', { name: 'Remove Alex Lim' }));
    await user.click(within(dialog).getByRole('button', { name: 'Done' }));
    expect(screen.getByText('Configure offers 1 shortlisted contact.')).toBeInTheDocument();
  });

  it('does not offer a shortlist without the contacts repeater or an editor for it', () => {
    panel({ repeaterTags: ['repeat.contacts'] });
    expect(screen.queryByRole('button', { name: 'Shortlist' })).not.toBeInTheDocument();
  });
});
