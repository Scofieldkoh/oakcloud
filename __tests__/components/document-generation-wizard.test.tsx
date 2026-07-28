import React from 'react';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  DocumentGenerationWizard,
  type DocumentContact,
} from '@/components/documents/document-generation-wizard';
import type { DocumentTemplate } from '@/components/documents/template-selector';
import type { GenerationSessionEnvelope } from '@/lib/document-generation-session';

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

function generationSession(
  overrides: Partial<GenerationSessionEnvelope['state']> = {},
): GenerationSessionEnvelope {
  return {
    id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    savedAt: '2026-07-18T01:00:00.000Z',
    state: {
      version: 1,
      currentStep: 0,
      templateId: template.id,
      companyId: null,
      contactIds: [],
      selectedDirectorId: null,
      selectedShareholderId: null,
      selectedContactId: null,
      title: 'Restored resolution',
      customData: {},
      useLetterhead: true,
      previewContent: null,
      editedContent: null,
      editedContentJson: null,
      ...overrides,
    },
  };
}

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

describe('DocumentGenerationWizard', () => {
  beforeEach(() => window.localStorage.clear());

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    window.localStorage.clear();
  });

  it('starts clean and clears the obsolete browser draft', () => {
    window.localStorage.setItem(
      'oakcloud:document-generation-wizard-draft',
      JSON.stringify({ templateId: template.id, title: 'Old local draft' }),
    );

    render(
      <DocumentGenerationWizard
        templates={[template]}
        companies={[]}
        onGenerate={vi.fn()}
        onSaveDraft={vi.fn()}
      />,
    );

    expect(screen.queryByText('Old local draft')).not.toBeInTheDocument();
    expect(window.localStorage.getItem('oakcloud:document-generation-wizard-draft')).toBeNull();
  });

  it('shows the current template and company in the Setup selection summaries', () => {
    render(
      <DocumentGenerationWizard
        templates={[template]}
        companies={[company]}
        onGenerate={vi.fn()}
      />,
    );

    const templateSummary = screen.getByRole('status', { name: 'Selected template' });
    const companySummary = screen.getByRole('status', { name: 'Selected company' });

    expect(within(templateSummary).getByText('No template selected')).toBeVisible();
    expect(within(companySummary).getByText('No company selected')).toBeVisible();

    fireEvent.click(screen.getByRole('button', { name: /Resolution Board resolution/ }));
    fireEvent.click(screen.getByRole('button', { name: /Sample Company 202600001A/ }));

    expect(within(templateSummary).getByText(template.name)).toBeVisible();
    expect(within(templateSummary).getByText(template.category)).toBeVisible();
    expect(within(companySummary).getByText(company.name)).toBeVisible();
    expect(within(companySummary).getByText(company.uen)).toBeVisible();
  });

  it('defaults a task-linked company for a new generation session', async () => {
    const onSaveDraft = vi.fn(async (_draftId, state) => ({
      id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      savedAt: '2026-07-18T02:00:00.000Z',
      state,
    }));

    render(
      <DocumentGenerationWizard
        templates={[template]}
        companies={[company]}
        initialCompanyId={company.id}
        onGenerate={vi.fn()}
        onSaveDraft={onSaveDraft}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Save Draft' }));

    await waitFor(() => expect(onSaveDraft).toHaveBeenCalledWith(
      null,
      expect.objectContaining({ companyId: company.id }),
    ));
  });

  it('saves at the initial step and reuses the returned draft id', async () => {
    const onSaveDraft = vi.fn(async (_draftId, state) => ({
      id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      savedAt: '2026-07-18T02:00:00.000Z',
      state,
    }));
    render(
      <DocumentGenerationWizard
        templates={[template]}
        companies={[]}
        onGenerate={vi.fn()}
        onSaveDraft={onSaveDraft}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Save Draft' }));
    await waitFor(() => expect(onSaveDraft).toHaveBeenCalledWith(null, expect.objectContaining({
      currentStep: 0,
      templateId: null,
    })));

    fireEvent.click(screen.getAllByText('Resolution').at(-1)!);
    fireEvent.click(screen.getByRole('button', { name: 'Save Draft' }));
    await waitFor(() => expect(onSaveDraft).toHaveBeenLastCalledWith(
      'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      expect.objectContaining({ templateId: template.id }),
    ));
  });

  it('resumes only the explicitly supplied server session', async () => {
    render(
      <DocumentGenerationWizard
        templates={[template]}
        companies={[]}
        initialSession={generationSession({ currentStep: 3 })}
        onGenerate={vi.fn()}
        onSaveDraft={vi.fn()}
      />,
    );

    expect(await screen.findByDisplayValue('Restored resolution')).toBeVisible();
    expect(screen.getByText('Saved draft resumed')).toBeVisible();
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

    fireEvent.click(screen.getAllByText('Resolution').at(-1)!);
    fireEvent.click(screen.getByRole('button', { name: 'Continue to Details' }));

    expect(screen.getByText('Jane Tan')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('checkbox', { name: /Jane Tan/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Continue to Review' }));

    expect(screen.getByText('Resolution Number is required')).toBeInTheDocument();
    expect(onGenerate).not.toHaveBeenCalled();
  });

  it('shows only required independent party selectors and submits their IDs', async () => {
    mockPartyFetch();
    const onGenerate = vi.fn().mockResolvedValue({ id: 'document-1', title: 'Resolution', content: '<p>Resolved</p>', status: 'DRAFT' });
    const selectedTemplate = { ...template, content: '{{selectedDirector.name}}{{selectedShareholder.email}}{{selectedContact.phone}}', placeholders: [] };
    render(<DocumentGenerationWizard templates={[selectedTemplate]} companies={[company]} onGenerate={onGenerate} />);
    fireEvent.click(screen.getAllByText('Resolution').at(-1)!);
    fireEvent.click(screen.getByText(company.name));
    fireEvent.click(screen.getByRole('button', { name: 'Continue to Details' }));
    fireEvent.click(await screen.findByRole('radio', { name: /Alice/ }));
    fireEvent.click(screen.getByRole('radio', { name: /Ben/ }));
    fireEvent.click(screen.getByRole('radio', { name: /Cara/ }));
    expect(screen.queryByText('Jane Tan')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Continue to Review' }));
    await screen.findByLabelText('Document content');
    fireEvent.click(screen.getByRole('button', { name: 'Generate Document' }));
    await waitFor(() => expect(onGenerate).toHaveBeenCalledWith(expect.objectContaining({
      selectedDirectorId: 'officer-1', selectedShareholderId: 'shareholder-1', selectedContactId: 'contact-1', contactIds: [],
    })));
  });

  it('shows singular and legacy contact selectors together when both roots are required', async () => {
    mockPartyFetch();
    render(<DocumentGenerationWizard templates={[{ ...template, content: '{{selectedContact.name}}{{contact.name}}', placeholders: [] }]} companies={[company]} contacts={contacts} onGenerate={vi.fn()} />);
    fireEvent.click(screen.getAllByText('Resolution').at(-1)!);
    fireEvent.click(screen.getByText(company.name));
    fireEvent.click(screen.getByRole('button', { name: 'Continue to Details' }));
    expect(await screen.findByRole('radio', { name: /Cara/ })).toBeInTheDocument();
    expect(screen.getByText('Jane Tan')).toBeInTheDocument();
  });

  it('detects a legacy contact requirement through partials', () => {
    render(<DocumentGenerationWizard templates={[{ ...template, content: '{{> signatory}}', placeholders: [] }]} companies={[]} contacts={contacts} partials={[{ id: 'partial-1', name: 'signatory', content: '{{contact.name}}' }]} onGenerate={vi.fn()} />);
    fireEvent.click(screen.getAllByText('Resolution').at(-1)!);
    fireEvent.click(screen.getByRole('button', { name: 'Continue to Details' }));
    expect(screen.getByText('Jane Tan')).toBeInTheDocument();
  });

  it('clears singular party selections but preserves legacy contacts when the company changes', async () => {
    mockPartyFetch();
    render(<DocumentGenerationWizard templates={[{ ...template, content: '{{selectedDirector.name}}{{contact.name}}', placeholders: [] }]} companies={[company, { ...company, id: 'company-2', name: 'Second Company' }]} contacts={contacts} onGenerate={vi.fn()} />);
    fireEvent.click(screen.getAllByText('Resolution').at(-1)!);
    fireEvent.click(screen.getByText(company.name));
    fireEvent.click(screen.getByRole('button', { name: 'Continue to Details' }));
    fireEvent.click(await screen.findByRole('radio', { name: /Alice/ }));
    fireEvent.click(screen.getByRole('checkbox', { name: /Jane Tan/ }));
    fireEvent.click(screen.getByText('Back'));
    fireEvent.click(screen.getByText('Second Company'));
    fireEvent.click(screen.getByRole('button', { name: 'Continue to Details' }));
    expect(await screen.findByRole('radio', { name: /Alice/ })).not.toBeChecked();
    expect(screen.getByRole('checkbox', { name: /Jane Tan/ })).toBeChecked();
  });

  it('blocks preview with a direct message when a required party is missing', async () => {
    mockPartyFetch();
    render(<DocumentGenerationWizard templates={[{ ...template, content: '{{selectedDirector.name}}', placeholders: [] }]} companies={[company]} onGenerate={vi.fn()} />);
    fireEvent.click(screen.getAllByText('Resolution').at(-1)!);
    fireEvent.click(screen.getByText(company.name));
    fireEvent.click(screen.getByRole('button', { name: 'Continue to Details' }));
    await screen.findByRole('radio', { name: /Alice/ });
    fireEvent.click(screen.getByRole('button', { name: 'Continue to Review' }));
    expect(screen.getByText('Select a director for this template.')).toBeVisible();
  });

  it('requires a company before leaving Company for a singular party template', () => {
    render(<DocumentGenerationWizard
      templates={[{ ...template, content: '{{selectedDirector.name}}', placeholders: [] }]}
      companies={[]}
      onGenerate={vi.fn()}
    />);
    fireEvent.click(screen.getAllByText('Resolution').at(-1)!);
    fireEvent.click(screen.getByRole('button', { name: 'Continue to Details' }));

    expect(screen.getByRole('alert')).toHaveTextContent('Select a company for this template.');
    expect(screen.getByRole('button', { name: /No company selected/ })).toBeVisible();
    expect(screen.queryByRole('radio', { name: /Director/ })).not.toBeInTheDocument();
  });

  it('allows no company selection for a legacy-only contact template', () => {
    render(<DocumentGenerationWizard
      templates={[{ ...template, content: '{{contact.name}}{{#each contacts}}{{name}}{{/each}}', placeholders: [] }]}
      companies={[]}
      contacts={contacts}
      onGenerate={vi.fn()}
    />);
    fireEvent.click(screen.getAllByText('Resolution').at(-1)!);
    fireEvent.click(screen.getByRole('button', { name: 'Continue to Details' }));

    expect(screen.getByText('Jane Tan')).toBeVisible();
    expect(screen.queryByText('Select a company for this template.')).not.toBeInTheDocument();
  });

  it('restores a saved singular selection only after it matches loaded company options', async () => {
    mockPartyFetch();
    const selectedTemplate = { ...template, content: '{{selectedDirector.name}}', placeholders: [] };
    render(<DocumentGenerationWizard
      templates={[selectedTemplate]}
      companies={[company]}
      initialSession={generationSession({
        currentStep: 2,
        companyId: company.id,
        selectedDirectorId: 'officer-1',
      })}
      onGenerate={vi.fn()}
    />);

    await waitFor(() => expect(screen.getByRole('radio', { name: /Alice/ })).toBeChecked());
    expect(screen.getByText('Saved draft resumed')).toBeVisible();
  });

  it('gates a valid Edit-step draft on People until saved party eligibility resolves', async () => {
    const response = deferred<Response>();
    vi.stubGlobal('fetch', vi.fn(() => response.promise));
    const selectedTemplate = { ...template, content: '{{selectedDirector.name}}', placeholders: [] };
    render(<DocumentGenerationWizard
      templates={[selectedTemplate]}
      companies={[company]}
      initialSession={generationSession({
        currentStep: 4,
        companyId: company.id,
        selectedDirectorId: 'officer-1',
        previewContent: '<p>Saved preview</p>',
        editedContent: '<p>Saved edit</p>',
      })}
      onGenerate={vi.fn()}
    />);

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
    render(<DocumentGenerationWizard
      templates={[selectedTemplate]}
      companies={[company]}
      initialSession={generationSession({
        currentStep: 4,
        companyId: company.id,
        selectedDirectorId: 'stale-officer',
        previewContent: '<p>Saved preview</p>',
        editedContent: '<p>Saved edit</p>',
      })}
      onGenerate={vi.fn()}
    />);
    expect(await screen.findByText('Loading director options...')).toBeVisible();

    await act(async () => response.resolve({ ok: true, json: async () => partyOptions } as Response));

    await waitFor(() => expect(screen.getByRole('radio', { name: /Alice/ })).not.toBeChecked());
    expect(screen.queryByLabelText('Document content')).not.toBeInTheDocument();
    expect(screen.queryByText('Generate Document')).not.toBeInTheDocument();
    expect(screen.getByText('A saved party selection is no longer available. Select it again to continue.')).toBeVisible();
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
    fireEvent.click(screen.getByText(company.name));
    fireEvent.click(screen.getByRole('button', { name: 'Continue to Details' }));
    fireEvent.click(await screen.findByRole('radio', { name: /Alice/ }));
    fireEvent.click(screen.getByRole('checkbox', { name: /Jane Tan/ }));
    fireEvent.click(screen.getByText('Back'));

    fireEvent.click(screen.getByText('Second Company'));
    fireEvent.click(screen.getByRole('button', { name: 'Continue to Details' }));

    expect(await screen.findByText('Loading director options...')).toBeVisible();
    expect(screen.queryByRole('radio', { name: /Alice/ })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Continue to Review' }));
    expect(screen.getByText('Select a director for this template.')).toBeVisible();

    await act(async () => secondResponse.resolve({
      ok: true,
      json: async () => ({ ...partyOptions, directors: [{ ...partyOptions.directors[0], id: 'officer-2', name: 'Dina' }] }),
    } as Response));

    await waitFor(() => expect(screen.getByRole('radio', { name: /Dina/ })).not.toBeChecked());
    expect(screen.queryByRole('radio', { name: /Alice/ })).not.toBeInTheDocument();
    expect(screen.getByRole('checkbox', { name: /Jane Tan/ })).toBeChecked();
  });

  it('invalidates an Edit-step draft whose saved company is no longer eligible', async () => {
    const selectedTemplate = { ...template, content: '{{selectedDirector.name}}', placeholders: [] };
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    render(<DocumentGenerationWizard
      templates={[selectedTemplate]}
      companies={[company]}
      initialSession={generationSession({
        currentStep: 4,
        companyId: 'deleted-company',
        selectedDirectorId: 'officer-1',
        previewContent: '<p>Saved preview</p>',
        editedContent: '<p>Saved edit</p>',
      })}
      onGenerate={vi.fn()}
    />);

    expect(await screen.findByRole('button', { name: /No company selected/ })).toBeVisible();
    expect(screen.queryByLabelText('Document content')).not.toBeInTheDocument();
    expect(screen.queryByText('Generate Document')).not.toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
    expect(screen.getByText('The saved company is no longer available.')).toBeVisible();
  });

  it('does not fetch or gate legacy-only contacts when a company is selected', () => {
    const fetchMock = vi.fn(() => Promise.reject(new Error('party endpoint unavailable')));
    vi.stubGlobal('fetch', fetchMock);
    const selectedTemplate = { ...template, content: '{{contact.name}}{{#each contacts}}{{email}}{{/each}}', placeholders: [] };
    render(<DocumentGenerationWizard templates={[selectedTemplate]} companies={[company]} contacts={contacts} onGenerate={vi.fn()} />);
    fireEvent.click(screen.getAllByText('Resolution').at(-1)!);
    fireEvent.click(screen.getByText(company.name));
    fireEvent.click(screen.getByRole('button', { name: 'Continue to Details' }));

    expect(screen.getByText('Jane Tan')).toBeVisible();
    expect(fetchMock).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('checkbox', { name: /Jane Tan/ }));
    expect(screen.getByPlaceholderText('Enter document title...')).toBeVisible();
  });

  it('shows a retry action when singular party options fail to load', async () => {
    const fetchMock = vi.fn(() => Promise.reject(new Error('party endpoint unavailable')));
    vi.stubGlobal('fetch', fetchMock);
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const selectedTemplate = { ...template, content: '{{selectedDirector.name}}', placeholders: [] };
    render(<DocumentGenerationWizard templates={[selectedTemplate]} companies={[company]} onGenerate={vi.fn()} />);
    fireEvent.click(screen.getAllByText('Resolution').at(-1)!);
    fireEvent.click(screen.getByText(company.name));
    fireEvent.click(screen.getByRole('button', { name: 'Continue to Details' }));

    expect(await screen.findByText('Failed to load company party options.')).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'Retry party options' }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    expect(await screen.findByText('Failed to load company party options.')).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'Continue to Review' }));
    expect(screen.getByText('Select a director for this template.')).toBeVisible();
  });

  it('treats re-selecting the current company as a no-op with current party data', async () => {
    mockPartyFetch();
    const selectedTemplate = { ...template, content: '{{selectedDirector.name}}{{contact.name}}', placeholders: [] };
    render(<DocumentGenerationWizard templates={[selectedTemplate]} companies={[company]} contacts={contacts} onGenerate={vi.fn()} />);
    fireEvent.click(screen.getAllByText('Resolution').at(-1)!);
    fireEvent.click(screen.getByText(company.name));
    fireEvent.click(screen.getByRole('button', { name: 'Continue to Details' }));
    fireEvent.click(await screen.findByRole('radio', { name: /Alice/ }));
    fireEvent.click(screen.getByRole('checkbox', { name: /Jane Tan/ }));
    fireEvent.click(screen.getByText('Back'));

    fireEvent.click(screen.getAllByText(company.name).at(-1)!);
    fireEvent.click(screen.getByRole('button', { name: 'Continue to Details' }));

    expect(screen.queryByText('Loading director options...')).not.toBeInTheDocument();
    expect(screen.getByRole('radio', { name: /Alice/ })).toBeChecked();
    expect(screen.getByRole('checkbox', { name: /Jane Tan/ })).toBeChecked();
  });

  it('renders exactly the approved three stages', () => {
    render(
      <DocumentGenerationWizard templates={[template]} companies={[]} onGenerate={vi.fn()} />,
    );

    const progress = screen.getByRole('navigation', { name: 'Progress' });
    expect(progress).toHaveTextContent('Setup');
    expect(progress).toHaveTextContent('Details');
    expect(progress).toHaveTextContent('Review & Generate');
    expect(progress).not.toHaveTextContent('People');
    expect(progress).not.toHaveTextContent('Custom Fields');
  });

  it('restores legacy edit-step drafts into Review & Generate', async () => {
    render(
      <DocumentGenerationWizard
        templates={[template]}
        companies={[]}
        initialSession={generationSession({
          currentStep: 4,
          previewContent: '<p>Saved preview</p>',
        })}
        onGenerate={vi.fn()}
      />,
    );

    expect(await screen.findByLabelText('Document content')).toBeVisible();
    expect(screen.getByRole('button', { name: 'Generate Document' })).toBeVisible();
  });

  it('uses radio cards for singular parties and checkbox cards for contacts', async () => {
    mockPartyFetch();
    const selectedTemplate = {
      ...template,
      content: '{{selectedDirector.name}}{{contact.name}}',
      placeholders: [],
    };
    render(
      <DocumentGenerationWizard
        templates={[selectedTemplate]}
        companies={[company]}
        contacts={contacts}
        onGenerate={vi.fn()}
      />,
    );

    fireEvent.click(screen.getAllByText('Resolution').at(-1)!);
    fireEvent.click(screen.getByText(company.name));
    fireEvent.click(screen.getByRole('button', { name: 'Continue to Details' }));

    expect(await screen.findByRole('radio', { name: /Alice/ })).toBeVisible();
    expect(screen.getByRole('checkbox', { name: /Jane Tan/ })).toBeVisible();
  });
});
