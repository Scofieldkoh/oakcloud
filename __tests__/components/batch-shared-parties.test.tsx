import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { BatchSharedParties } from '@/components/documents/generation-batch/batch-shared-parties';
import type { EditableBatchItem } from '@/components/documents/generation-batch/batch-workspace-state';
import { templatePartyNeeds } from '@/components/documents/generation-batch/template-party-needs';
import type { DocumentParty } from '@/lib/document-party';

function party(id: string, name: string): DocumentParty {
  return { id, contactId: null, name, detail: 'DIRECTOR', email: null, phone: null, address: { full: null, letter: null } };
}

function item(key: string, selectedDirectorIds?: string[]): EditableBatchItem {
  return {
    key,
    id: key,
    templateId: 'resolution',
    templateName: 'Director Resolution',
    templateKind: 'RESOLUTION',
    templateVersion: 1,
    templateEngine: 'OAKDOC',
    status: 'NEEDS_INPUT',
    configuration: {
      version: 1,
      title: 'Director Resolution',
      contactIds: [],
      selectedDirectorId: null,
      selectedDirectorIds,
      selectedShareholderId: null,
      selectedContactId: null,
      itemValues: {},
      masterOverrides: {},
      useLetterhead: false,
      serviceAgreement: null,
    },
    previewContent: null,
    editedContent: null,
    editedContentJson: null,
    previewFingerprint: null,
    reviewedFingerprint: null,
    validationDiagnostics: null,
    lastError: null,
  };
}

const directors = [party('d1', 'Alice Tan'), party('d2', 'Ben Lim')];
const resolutionNeeds = templatePartyNeeds('', ['repeat.directors', 'director.name']);
const letterNeeds = templatePartyNeeds('', []);

describe('BatchSharedParties', () => {
  it('sets the directors once for every document whose template signs by directors', async () => {
    const user = userEvent.setup();
    const onApply = vi.fn();
    render(
      <BatchSharedParties
        items={[item('a'), item('b'), item('c')]}
        needsByItemKey={{ a: resolutionNeeds, b: resolutionNeeds, c: letterNeeds }}
        directors={directors}
        shareholders={[]}
        contacts={[]}
        onApply={onApply}
      />,
    );

    expect(screen.getByRole('heading', { name: 'Shared parties' })).toBeInTheDocument();
    expect(screen.getByText('Used by 2 documents')).toBeInTheDocument();
    expect(screen.queryByRole('group', { name: /shareholders/i })).not.toBeInTheDocument();

    await user.click(screen.getByRole('checkbox', { name: /Alice Tan/ }));
    expect(onApply).toHaveBeenCalledWith(['a', 'b'], { selectedDirectorIds: ['d2'] });
  });

  it('notes when documents differ, and shows nothing for a choice only one document uses', () => {
    const { rerender } = render(
      <BatchSharedParties
        items={[item('a'), item('b', ['d1'])]}
        needsByItemKey={{ a: resolutionNeeds, b: resolutionNeeds }}
        directors={directors}
        shareholders={[]}
        contacts={[]}
        onApply={vi.fn()}
      />,
    );
    expect(screen.getByText(/they differ, so the first document is shown/)).toBeInTheDocument();

    rerender(
      <BatchSharedParties
        items={[item('a'), item('b')]}
        needsByItemKey={{ a: resolutionNeeds, b: letterNeeds }}
        directors={directors}
        shareholders={[]}
        contacts={[]}
        onApply={vi.fn()}
      />,
    );
    expect(screen.queryByRole('heading', { name: 'Shared parties' })).not.toBeInTheDocument();
  });

  it('offers officers of every role the documents print', async () => {
    const user = userEvent.setup();
    const onApply = vi.fn();
    const officer = (id: string, name: string, role: string): DocumentParty => ({ ...party(id, name), detail: role, role });
    const secretaryNeeds = templatePartyNeeds('', ['repeat.officers.secretary']);
    const ceoNeeds = templatePartyNeeds('', ['repeat.officers.ceo']);
    render(
      <BatchSharedParties
        items={[item('a'), item('b')]}
        needsByItemKey={{ a: secretaryNeeds, b: ceoNeeds }}
        officerRolesByItemKey={{ a: ['SECRETARY'], b: ['CEO'] }}
        directors={[]}
        shareholders={[]}
        officers={[officer('o1', 'Dana Director', 'DIRECTOR'), officer('o2', 'Sam Secretary', 'SECRETARY'), officer('o3', 'Carl Chief', 'CEO')]}
        contacts={[]}
        onApply={onApply}
      />,
    );

    expect(screen.getAllByRole('checkbox')).toHaveLength(2);
    expect(screen.queryByRole('checkbox', { name: /Dana Director/ })).not.toBeInTheDocument();
    await user.click(screen.getByRole('checkbox', { name: /Carl Chief/ }));
    expect(onApply).toHaveBeenCalledWith(['a', 'b'], { selectedOfficerIds: ['o3'] });
  });
});
