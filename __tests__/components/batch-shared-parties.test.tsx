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
});
