import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { OakDocRepeaterPanel } from '@/components/documents/oakdoc/oakdoc-repeater-panel';
import type { OakDocRepeaterSections } from '@/lib/document-editor/oakdoc-custom-fields';

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

    await user.click(screen.getByRole('button', { name: 'Officers' }));
    await user.click(screen.getByRole('button', { name: 'Add Officers section' }));
    expect(props.onAdd).toHaveBeenLastCalledWith(expect.objectContaining({ tag: 'repeat.officers', label: 'Officers' }));

    // Adding opens the new section; open the Officers kind again for a limited one.
    await user.click(screen.getAllByRole('button', { name: 'Officers' }).at(-1)!);
    const roles = screen.getByRole('group', { name: 'Officer roles' });
    await user.click(within(roles).getByRole('button', { name: 'CEO' }));
    await user.click(within(roles).getByRole('button', { name: 'Secretary' }));
    expect(within(roles).getByRole('button', { name: 'Secretary' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByText('repeat.officers.secretary+ceo')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Add Officers (Secretary, CEO) section' }));
    expect(props.onAdd).toHaveBeenLastCalledWith(expect.objectContaining({
      kind: 'officers',
      tag: 'repeat.officers.secretary+ceo',
      label: 'Officers (Secretary, CEO)',
    }));
  });

  it('shows the officers repeaters in the document with their roles', () => {
    panel({ repeaterTags: ['repeat.officers', 'repeat.officers.secretary'] });
    const sections = screen.getByRole('list', { name: 'Officers sections' });
    expect(within(sections).getByText('Officers (any role)')).toBeInTheDocument();
    expect(within(sections).getByText('Officers (Secretary)')).toBeInTheDocument();
  });

  it('opens a section in the document to add its fields', async () => {
    const user = userEvent.setup();
    const props = panel({ repeaterTags: ['repeat.directors'], fieldTags: ['director.name'] });
    const sections = screen.getByRole('list', { name: 'Directors sections' });
    await user.click(within(sections).getByRole('button', { name: 'Directors' }));
    await user.click(within(sections).getByRole('button', { name: 'Director Role' }));
    await user.click(within(sections).getByRole('button', { name: 'Add Director Role' }));
    expect(props.onAssignField).toHaveBeenLastCalledWith(expect.objectContaining({ tag: 'director.role' }));
  });

  it('edits the contacts repeater shortlist', async () => {
    const user = userEvent.setup();
    function Harness() {
      const [sections, setSections] = useState<OakDocRepeaterSections>({
        names: {},
        shortlists: { 'repeat.contacts': [{ id: 'c1', name: 'Alex Lim' }] },
      });
      return (
        <OakDocRepeaterPanel
          repeaterTags={['repeat.contacts']}
          fieldTags={[]}
          onAdd={vi.fn()}
          onRemoveAtCaret={vi.fn()}
          onAssignField={vi.fn()}
          sections={sections}
          onSectionsChange={setSections}
        />
      );
    }
    render(<Harness />);

    await user.click(within(screen.getByRole('list', { name: 'Contacts sections' })).getByRole('button', { name: 'Contacts' }));
    expect(screen.getByText('Configure offers 1 shortlisted contact.')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Shortlist' }));
    const dialog = screen.getByRole('dialog');
    await user.click(within(dialog).getByRole('button', { name: /add Bea Tan/ }));
    expect(within(dialog).getByRole('list', { name: 'Contact shortlist' })).toHaveTextContent('Alex LimBea Tan');
    await user.click(within(dialog).getByRole('button', { name: 'Remove Alex Lim' }));
    await user.click(within(dialog).getByRole('button', { name: 'Done' }));
    expect(screen.getByText('Configure offers 1 shortlisted contact.')).toBeInTheDocument();
  });

  it('does not offer a shortlist without the contacts repeater or an editor for it', async () => {
    const user = userEvent.setup();
    panel({ repeaterTags: ['repeat.contacts'] });
    await user.click(within(screen.getByRole('list', { name: 'Contacts sections' })).getByRole('button', { name: 'Contacts' }));
    expect(screen.queryByRole('button', { name: 'Shortlist' })).not.toBeInTheDocument();
  });

  describe('named sections', () => {
    function Harness({ tags, initial, onAdd, onChange }: {
      tags: string[];
      initial?: OakDocRepeaterSections;
      onAdd?: (definition: unknown) => void;
      onChange?: (sections: OakDocRepeaterSections) => void;
    }) {
      const [sections, setSections] = useState<OakDocRepeaterSections>(initial ?? { names: {}, shortlists: {} });
      return (
        <OakDocRepeaterPanel
          repeaterTags={tags}
          fieldTags={[]}
          onAdd={onAdd ?? vi.fn()}
          onRemoveAtCaret={vi.fn()}
          onAssignField={vi.fn()}
          sections={sections}
          onSectionsChange={(next) => {
            setSections(next);
            onChange?.(next);
          }}
        />
      );
    }

    it('inserts a named Contacts section as its own list', async () => {
      const user = userEvent.setup();
      const onAdd = vi.fn();
      const onChange = vi.fn();
      render(<Harness tags={[]} onAdd={onAdd} onChange={onChange} />);

      await user.click(screen.getByRole('button', { name: 'Contacts' }));
      await user.type(screen.getByLabelText('List name on Configure'), 'Corporate secretary to be appointed');
      await user.click(screen.getByRole('button', { name: 'Add Contacts (Corporate secretary to be appointed) section' }));
      expect(onAdd).toHaveBeenLastCalledWith(expect.objectContaining({
        kind: 'contacts',
        tag: 'repeat.contacts.corporate-secretary-to-be-appointed',
        label: 'Contacts (Corporate secretary to be appointed)',
      }));
      expect(onChange).toHaveBeenLastCalledWith({
        names: { 'repeat.contacts.corporate-secretary-to-be-appointed': 'Corporate secretary to be appointed' },
        shortlists: {},
      });
      // The name box is cleared for the next section.
      await user.click(screen.getByRole('button', { name: 'Contacts' }));
      expect(screen.getByLabelText('List name on Configure')).toHaveValue('');
      expect(screen.getByRole('button', { name: 'Add Contacts section' })).toBeInTheDocument();
    });

    it('names any other section as a label, keeping its tag', async () => {
      const user = userEvent.setup();
      const onAdd = vi.fn();
      const onChange = vi.fn();
      render(<Harness tags={[]} onAdd={onAdd} onChange={onChange} />);

      await user.click(screen.getByRole('button', { name: 'Directors' }));
      await user.type(screen.getByLabelText('Name on Configure'), 'Signers for the resolution(s)');
      await user.click(screen.getByRole('button', { name: 'Add Directors section' }));
      expect(onAdd).toHaveBeenLastCalledWith(expect.objectContaining({ tag: 'repeat.directors' }));
      expect(onChange).toHaveBeenLastCalledWith({
        names: { 'repeat.directors': 'Signers for the resolution(s)' },
        shortlists: {},
      });
    });

    it('renames a section in the document', async () => {
      const user = userEvent.setup();
      const onChange = vi.fn();
      render(
        <Harness
          tags={['repeat.directors', 'repeat.contacts.corp-sec']}
          initial={{ names: { 'repeat.directors': 'Signers', 'repeat.contacts.corp-sec': 'Corp sec' }, shortlists: {} }}
          onChange={onChange}
        />,
      );

      expect(screen.getByText('Corp sec · Contacts list')).toBeInTheDocument();
      await user.click(screen.getByRole('button', { name: 'Signers · Directors' }));
      const name = screen.getByRole('textbox', { name: 'Name on Configure' });
      await user.clear(name);
      await user.type(name, 'Approving directors');
      expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({
        names: { 'repeat.directors': 'Approving directors', 'repeat.contacts.corp-sec': 'Corp sec' },
      }));
    });

    it('needs letters or numbers in a Contacts list name', async () => {
      const user = userEvent.setup();
      render(<Harness tags={[]} />);
      await user.click(screen.getByRole('button', { name: 'Contacts' }));
      await user.type(screen.getByLabelText('List name on Configure'), '!!!');
      expect(screen.getByText('A Contacts list name needs letters or numbers.')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Add Contacts section' })).toBeDisabled();
    });

    it("edits each contacts list's own shortlist", async () => {
      const user = userEvent.setup();
      const onChange = vi.fn();
      render(
        <Harness
          tags={['repeat.contacts', 'repeat.contacts.corp-sec']}
          initial={{
            names: { 'repeat.contacts.corp-sec': 'Corp sec' },
            shortlists: { 'repeat.contacts': [{ id: 'c1', name: 'Alex Lim' }] },
          }}
          onChange={onChange}
        />,
      );

      await user.click(screen.getByRole('button', { name: 'Corp sec · Contacts list' }));
      await user.click(screen.getByRole('button', { name: 'Shortlist for Corp sec' }));
      const dialog = screen.getByRole('dialog', { name: 'Corp sec shortlist' });
      await user.click(within(dialog).getByRole('button', { name: /add Bea Tan/ }));
      expect(onChange).toHaveBeenLastCalledWith({
        names: { 'repeat.contacts.corp-sec': 'Corp sec' },
        shortlists: {
          'repeat.contacts': [{ id: 'c1', name: 'Alex Lim' }],
          'repeat.contacts.corp-sec': [{ id: 'c2', name: 'Bea Tan' }],
        },
      });
    });
  });
});
