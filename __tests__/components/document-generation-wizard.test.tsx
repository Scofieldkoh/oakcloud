import React from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  DocumentGenerationWizard,
  type DocumentContact,
} from '@/components/documents/document-generation-wizard';
import type { DocumentTemplate } from '@/components/documents/template-selector';

vi.mock('@/components/documents/a4-page-editor', () => ({
  A4PageEditor: React.forwardRef(function MockA4PageEditor(
    props: { value?: string; onChange?: (value: string) => void },
    _ref
  ) {
    return (
      <textarea
        aria-label="Document content"
        value={props.value || ''}
        onChange={(event) => props.onChange?.(event.target.value)}
      />
    );
  }),
}));

const template: DocumentTemplate = {
  id: '33333333-3333-4333-8333-333333333333',
  name: 'Resolution',
  description: 'Board resolution',
  category: 'RESOLUTION',
  content: '<p>{{custom.resolutionNumber}}</p>',
  placeholders: [
    {
      key: 'custom.resolutionNumber',
      label: 'Resolution Number',
      category: 'custom',
      type: 'text',
      required: true,
    },
  ],
  isActive: true,
  version: 1,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
};

const contacts: DocumentContact[] = [
  {
    id: '44444444-4444-4444-8444-444444444444',
    fullName: 'Jane Tan',
    email: 'jane@example.com',
  },
];

const company = { id: 'company-1', name: 'Sample Company', uen: '202600001A', status: 'ACTIVE' };
const partyOptions = {
  directors: [{ id: 'officer-1', contactId: 'person-1', name: 'Alice', detail: 'Director', email: null, phone: null, address: { full: null, letter: null } }],
  shareholders: [{ id: 'shareholder-1', contactId: 'person-2', name: 'Ben', detail: 'Ordinary', email: null, phone: null, address: { full: null, letter: null } }],
  contacts: [{ id: 'contact-1', contactId: 'contact-1', name: 'Cara', detail: 'Representative', email: null, phone: null, address: { full: null, letter: null } }],
};

function mockPartyFetch() {
  vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
    if (String(input).includes('/document-parties')) {
      return { ok: true, json: async () => partyOptions } as Response;
    }
    return { ok: true, json: async () => ({ preview: { content: '<p>Resolved</p>', unresolvedPlaceholders: [], missingPartials: [], blockingErrors: [] } }) } as Response;
  }));
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((next) => { resolve = next; });
  return { promise, resolve };
}

function saveEditStepDraft(selectedDirectorId: string) {
  window.localStorage.setItem('oakcloud:document-generation-wizard-draft', JSON.stringify({
    templateId: template.id,
    companyId: company.id,
    contactIds: [],
    selectedDirectorId,
    selectedShareholderId: null,
    selectedContactId: null,
    title: 'Restored resolution',
    customData: {},
    useLetterhead: true,
    previewContent: '<p>Saved preview</p>',
    editedContent: '<p>Saved edit</p>',
    currentStep: 4,
    savedAt: new Date().toISOString(),
  }));
}

describe('DocumentGenerationWizard', () => {
  beforeEach(() => window.localStorage.clear());

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    window.localStorage.clear();
  });

  it('lets staff select contacts and blocks preview when required custom fields are empty', () => {
    const onGenerate = vi.fn();

    render(
      <DocumentGenerationWizard
        templates={[{ ...template, content: '<p>{{contact.name}} {{custom.resolutionNumber}}</p>' }]}
        companies={[]}
        contacts={contacts}
        onGenerate={onGenerate}
      />
    );

    const clickNext = () => fireEvent.click(screen.getByText('Next'));

    fireEvent.click(screen.getAllByText('Resolution').at(-1)!);
    clickNext();
    clickNext();

    expect(screen.getByText('Jane Tan')).toBeInTheDocument();
    fireEvent.click(screen.getByText('Jane Tan'));
    clickNext();

    clickNext();

    expect(screen.getByText('Resolution Number is required')).toBeInTheDocument();
    expect(onGenerate).not.toHaveBeenCalled();
  });

  it('shows only required independent party selectors and submits their IDs', async () => {
    mockPartyFetch();
    const onGenerate = vi.fn().mockResolvedValue({ id: 'document-1', title: 'Resolution', content: '<p>Resolved</p>', status: 'DRAFT' });
    const selectedTemplate = { ...template, content: '{{selectedDirector.name}}{{selectedShareholder.email}}{{selectedContact.phone}}', placeholders: [] };
    render(<DocumentGenerationWizard templates={[selectedTemplate]} companies={[company]} onGenerate={onGenerate} />);
    fireEvent.click(screen.getAllByText('Resolution').at(-1)!);
    fireEvent.click(screen.getByText('Next'));
    fireEvent.click(screen.getByText(company.name));
    fireEvent.click(screen.getByText('Next'));
    fireEvent.change(await screen.findByLabelText('Director'), { target: { value: 'officer-1' } });
    fireEvent.change(screen.getByLabelText('Shareholder'), { target: { value: 'shareholder-1' } });
    fireEvent.change(screen.getByLabelText('Company Contact'), { target: { value: 'contact-1' } });
    expect(screen.queryByText('Jane Tan')).not.toBeInTheDocument();
    fireEvent.click(screen.getByText('Next'));
    fireEvent.click(screen.getByText('Next'));
    await screen.findByLabelText('Document content');
    fireEvent.click(screen.getByText('Generate Document'));
    await waitFor(() => expect(onGenerate).toHaveBeenCalledWith(expect.objectContaining({
      selectedDirectorId: 'officer-1', selectedShareholderId: 'shareholder-1', selectedContactId: 'contact-1', contactIds: [],
    })));
  });

  it('shows singular and legacy contact selectors together when both roots are required', async () => {
    mockPartyFetch();
    render(<DocumentGenerationWizard templates={[{ ...template, content: '{{selectedContact.name}}{{contact.name}}', placeholders: [] }]} companies={[company]} contacts={contacts} onGenerate={vi.fn()} />);
    fireEvent.click(screen.getAllByText('Resolution').at(-1)!);
    fireEvent.click(screen.getByText('Next'));
    fireEvent.click(screen.getByText(company.name));
    fireEvent.click(screen.getByText('Next'));
    expect(await screen.findByLabelText('Company Contact')).toBeInTheDocument();
    expect(screen.getByText('Jane Tan')).toBeInTheDocument();
  });

  it('detects a legacy contact requirement through partials', () => {
    render(<DocumentGenerationWizard templates={[{ ...template, content: '{{> signatory}}', placeholders: [] }]} companies={[]} contacts={contacts} partials={[{ id: 'partial-1', name: 'signatory', content: '{{contact.name}}' }]} onGenerate={vi.fn()} />);
    fireEvent.click(screen.getAllByText('Resolution').at(-1)!);
    fireEvent.click(screen.getByText('Next'));
    fireEvent.click(screen.getByText('Next'));
    expect(screen.getByText('Jane Tan')).toBeInTheDocument();
  });

  it('clears singular party selections but preserves legacy contacts when the company changes', async () => {
    mockPartyFetch();
    render(<DocumentGenerationWizard templates={[{ ...template, content: '{{selectedDirector.name}}{{contact.name}}', placeholders: [] }]} companies={[company, { ...company, id: 'company-2', name: 'Second Company' }]} contacts={contacts} onGenerate={vi.fn()} />);
    fireEvent.click(screen.getAllByText('Resolution').at(-1)!);
    fireEvent.click(screen.getByText('Next'));
    fireEvent.click(screen.getByText(company.name));
    fireEvent.click(screen.getByText('Next'));
    fireEvent.change(await screen.findByLabelText('Director'), { target: { value: 'officer-1' } });
    fireEvent.click(screen.getByText('Jane Tan'));
    fireEvent.click(screen.getByText('Back'));
    fireEvent.click(screen.getByText('Second Company'));
    fireEvent.click(screen.getByText('Next'));
    expect(await screen.findByLabelText('Director')).toHaveValue('');
    expect(screen.getByRole('button', { name: /Jane Tan/ })).toHaveAttribute('aria-pressed', 'true');
  });

  it('blocks preview with a direct message when a required party is missing', async () => {
    mockPartyFetch();
    render(<DocumentGenerationWizard templates={[{ ...template, content: '{{selectedDirector.name}}', placeholders: [] }]} companies={[company]} onGenerate={vi.fn()} />);
    fireEvent.click(screen.getAllByText('Resolution').at(-1)!);
    fireEvent.click(screen.getByText('Next'));
    fireEvent.click(screen.getByText(company.name));
    fireEvent.click(screen.getByText('Next'));
    await screen.findByLabelText('Director');
    fireEvent.click(screen.getByText('Next'));
    expect(screen.getByText('Select a director for this template.')).toBeVisible();
  });

  it('restores a saved singular selection only after it matches loaded company options', async () => {
    mockPartyFetch();
    const selectedTemplate = { ...template, content: '{{selectedDirector.name}}', placeholders: [] };
    window.localStorage.setItem('oakcloud:document-generation-wizard-draft', JSON.stringify({
      templateId: selectedTemplate.id,
      companyId: company.id,
      contactIds: [],
      selectedDirectorId: 'officer-1',
      selectedShareholderId: null,
      selectedContactId: null,
      title: 'Restored resolution',
      customData: {},
      useLetterhead: true,
      previewContent: null,
      editedContent: null,
      currentStep: 2,
      savedAt: new Date().toISOString(),
    }));

    render(<DocumentGenerationWizard templates={[selectedTemplate]} companies={[company]} onGenerate={vi.fn()} />);

    await waitFor(() => expect(screen.getByLabelText('Director')).toHaveValue('officer-1'));
    expect(screen.getByText('Recovered your last unsaved document draft.')).toBeVisible();
  });

  it('gates a valid Edit-step draft on People until saved party eligibility resolves', async () => {
    const response = deferred<Response>();
    vi.stubGlobal('fetch', vi.fn(() => response.promise));
    const selectedTemplate = { ...template, content: '{{selectedDirector.name}}', placeholders: [] };
    saveEditStepDraft('officer-1');

    render(<DocumentGenerationWizard templates={[selectedTemplate]} companies={[company]} onGenerate={vi.fn()} />);

    expect(await screen.findByText('Loading director options...')).toBeVisible();
    expect(screen.queryByText('Generate Document')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Document content')).not.toBeInTheDocument();

    await act(async () => response.resolve({ ok: true, json: async () => partyOptions } as Response));

    expect(await screen.findByLabelText('Document content')).toHaveValue('<p>Saved preview</p>');
    expect(screen.getByText('Generate Document')).toBeEnabled();
  });

  it('keeps a stale Edit-step draft on People and invalidates saved content', async () => {
    const response = deferred<Response>();
    vi.stubGlobal('fetch', vi.fn(() => response.promise));
    const selectedTemplate = { ...template, content: '{{selectedDirector.name}}', placeholders: [] };
    saveEditStepDraft('stale-officer');

    render(<DocumentGenerationWizard templates={[selectedTemplate]} companies={[company]} onGenerate={vi.fn()} />);
    expect(await screen.findByText('Loading director options...')).toBeVisible();

    await act(async () => response.resolve({ ok: true, json: async () => partyOptions } as Response));

    await waitFor(() => expect(screen.getByLabelText('Director')).toHaveValue(''));
    expect(screen.queryByLabelText('Document content')).not.toBeInTheDocument();
    expect(screen.queryByText('Generate Document')).not.toBeInTheDocument();
    await waitFor(() => {
      const saved = JSON.parse(window.localStorage.getItem('oakcloud:document-generation-wizard-draft') || '{}');
      expect(saved.previewContent).toBeNull();
      expect(saved.editedContent).toBeNull();
      expect(saved.currentStep).toBe(2);
    });
  });

  it('clears old party options synchronously and rejects old IDs across a company race', async () => {
    const secondResponse = deferred<Response>();
    const fetchMock = vi.fn((input: RequestInfo | URL) => {
      if (String(input).includes('company-2')) return secondResponse.promise;
      return Promise.resolve({ ok: true, json: async () => partyOptions } as Response);
    });
    vi.stubGlobal('fetch', fetchMock);
    const selectedTemplate = { ...template, content: '{{selectedDirector.name}}{{contact.name}}', placeholders: [] };
    render(<DocumentGenerationWizard templates={[selectedTemplate]} companies={[company, { ...company, id: 'company-2', name: 'Second Company' }]} contacts={contacts} onGenerate={vi.fn()} />);
    fireEvent.click(screen.getAllByText('Resolution').at(-1)!);
    fireEvent.click(screen.getByText('Next'));
    fireEvent.click(screen.getByText(company.name));
    fireEvent.click(screen.getByText('Next'));
    fireEvent.change(await screen.findByLabelText('Director'), { target: { value: 'officer-1' } });
    fireEvent.click(screen.getByText('Jane Tan'));
    fireEvent.click(screen.getByText('Back'));

    fireEvent.click(screen.getByText('Second Company'));
    fireEvent.click(screen.getByText('Next'));

    expect(await screen.findByText('Loading director options...')).toBeVisible();
    expect(screen.queryByRole('option', { name: /Alice/ })).not.toBeInTheDocument();
    fireEvent.click(screen.getByText('Next'));
    expect(screen.getByText('Select a director for this template.')).toBeVisible();

    await act(async () => secondResponse.resolve({
      ok: true,
      json: async () => ({ ...partyOptions, directors: [{ ...partyOptions.directors[0], id: 'officer-2', name: 'Dina' }] }),
    } as Response));

    await waitFor(() => expect(screen.getByLabelText('Director')).toHaveValue(''));
    expect(screen.queryByRole('option', { name: /Alice/ })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Jane Tan/ })).toHaveAttribute('aria-pressed', 'true');
  });
});
