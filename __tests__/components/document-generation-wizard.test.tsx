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
const additionalCompany = { id: 'company-2', name: 'Additional Company', uen: '202600002B', status: 'ACTIVE' };
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
      version: 2,
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
      serviceAgreementId: null,
      ...overrides,
    },
    agreement: null,
  };
}

function serviceAgreementSession(currentStep: number): GenerationSessionEnvelope {
  const serviceTemplate = {
    ...template,
    id: 'service-agreement-template',
    name: 'Service Agreement',
    compositionType: 'SERVICE_AGREEMENT' as const,
    content: '{{selectedContact.name}}{{@agreement.serviceSections}}{{@agreement.feeTable}}{{@agreement.entityAppendix}}',
    placeholders: [],
  };
  return {
    id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    savedAt: '2026-07-30T01:00:00.000Z',
    state: {
      ...generationSession().state,
      currentStep,
      templateId: serviceTemplate.id,
      companyId: company.id,
      selectedContactId: 'contact-1',
      title: 'Saved service agreement',
      serviceAgreementId: 'agreement-1',
      previewContent: currentStep === 3 ? '<p>Saved agreement preview</p>' : null,
    },
    agreement: {
      id: 'agreement-1',
      generatedDocumentId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      primaryCompanyId: company.id,
      authorizedContactId: 'contact-1',
      authorizedRepresentativeSnapshot: {
        id: 'contact-1',
        name: 'Cara',
        role: 'Representative',
        email: 'cara@example.com',
        phone: '+65 6000 0000',
      },
      agreementDate: '2026-07-30',
      effectiveDate: '2026-08-01',
      termMonths: 12,
      status: 'DRAFT',
      entities: [{
        id: 'entity-1',
        companyId: company.id,
        nameSnapshot: company.name,
        uenSnapshot: company.uen,
        displayOrder: 0,
      }],
      items: [{
        id: 'item-1',
        serviceVariantId: 'inactive-variant',
        variantVersion: 2,
        familyNameSnapshot: 'Pinned family',
        variantNameSnapshot: 'Pinned inactive service',
        serviceCadence: 'ANNUALLY',
        customCadenceLabel: null,
        sowPartialId: 'partial-1',
        partialVersion: 3,
        partialContentSnapshot: '<p>Pinned wording</p>',
        partialPlaceholdersSnapshot: [],
        partialDependencySnapshot: [],
        startDate: '2026-08-01',
        endDate: null,
        fieldValues: {},
        displayOrder: 0,
        entityIds: ['entity-1'],
        feeLines: [{
          id: 'fee-1',
          agreementEntityId: 'entity-1',
          companyId: company.id,
          description: 'Annual fee',
          amount: '500.00',
          currency: 'SGD',
          billingFrequency: 'ANNUALLY',
          customFrequencyLabel: null,
          billingStartDate: '2026-08-01',
          displayOrder: 0,
        }],
        staleVariantVersion: true,
        stalePartialVersion: true,
      }],
      createdAt: '2026-07-30T00:00:00.000Z',
      updatedAt: '2026-07-30T01:00:00.000Z',
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
  it('uses four stages for Service Agreement templates', async () => {
    const serviceAgreementTemplate = {
      ...template,
      id: 'service-agreement-template',
      name: 'Service Agreement',
      compositionType: 'SERVICE_AGREEMENT' as const,
    };

    render(
      <DocumentGenerationWizard
        templates={[serviceAgreementTemplate]}
        companies={[company]}
        initialTemplateId={serviceAgreementTemplate.id}
        onGenerate={vi.fn()}
      />,
    );

    expect(await screen.findByText('Services')).toBeVisible();
    expect(screen.getByText('Agreement details')).toBeVisible();
    expect(screen.getByText('Review & Generate')).toBeVisible();
  });

  it.each([
    [0, 'Agreement parties'],
    [1, 'Pinned inactive service'],
    [2, 'Agreement details'],
    [3, 'Saved agreement preview'],
  ])('resumes Service Agreement stage %i from pinned data', async (currentStep, visibleText) => {
    mockPartyFetch();
    const serviceTemplate = {
      ...template,
      id: 'service-agreement-template',
      name: 'Service Agreement',
      compositionType: 'SERVICE_AGREEMENT' as const,
      content: '{{selectedContact.name}}{{@agreement.serviceSections}}{{@agreement.feeTable}}{{@agreement.entityAppendix}}',
      placeholders: [],
    };

    render(
      <DocumentGenerationWizard
        templates={[serviceTemplate]}
        companies={[company]}
        initialSession={serviceAgreementSession(currentStep)}
        onGenerate={vi.fn()}
        onSaveDraft={vi.fn()}
      />,
    );

    if (currentStep === 3) {
      expect(await screen.findByLabelText('Document content')).toHaveValue(
        '<p>Saved agreement preview</p>',
      );
    } else {
      expect((await screen.findAllByText(visibleText)).at(-1)).toBeVisible();
    }
  });

  it('resumes a Service Agreement Review from its saved representative snapshot after contact deletion', async () => {
    const saved = serviceAgreementSession(3);
    saved.state.selectedContactId = 'deleted-contact';
    saved.agreement!.authorizedContactId = null;
    saved.agreement!.authorizedRepresentativeSnapshot.id = 'deleted-contact';
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      if (String(input).includes('/document-parties')) {
        return {
          ok: true,
          json: async () => ({ ...partyOptions, contacts: [] }),
        } as Response;
      }
      return { ok: true, json: async () => ({}) } as Response;
    });
    vi.stubGlobal('fetch', fetchMock);
    const onSaveDraft = vi.fn(async (_draftId: string | null, input: any) => ({
      ...saved,
      state: { ...input, serviceAgreement: undefined, serviceAgreementId: 'agreement-1' },
      agreement: saved.agreement,
    }));
    const onGenerate = vi.fn().mockResolvedValue({
      id: 'generated-1',
      title: 'Saved service agreement',
      content: '<p>Generated</p>',
      status: 'DRAFT',
    });
    render(
      <DocumentGenerationWizard
        templates={[{
          ...template,
          id: 'service-agreement-template',
          name: 'Service Agreement',
          compositionType: 'SERVICE_AGREEMENT',
          content: '{{selectedContact.name}}{{@agreement.serviceSections}}{{@agreement.feeTable}}{{@agreement.entityAppendix}}',
          placeholders: [],
        }]}
        companies={[company]}
        initialSession={saved}
        onGenerate={onGenerate}
        onSaveDraft={onSaveDraft}
      />,
    );

    expect(await screen.findByLabelText('Document content')).toHaveValue(
      '<p>Saved agreement preview</p>',
    );
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());

    fireEvent.click(screen.getByRole('button', { name: 'Save Draft' }));
    await waitFor(() => expect(onSaveDraft).toHaveBeenCalledWith(
      saved.id,
      expect.objectContaining({
        selectedContactId: 'deleted-contact',
        serviceAgreement: expect.objectContaining({
          authorizedContactId: 'deleted-contact',
        }),
      }),
    ));

    fireEvent.click(screen.getByRole('button', { name: 'Generate Document' }));
    await waitFor(() => expect(onGenerate).toHaveBeenCalledWith(
      expect.objectContaining({ selectedContactId: 'deleted-contact' }),
    ));
  });

  it('persists a Service Agreement preview after saving Review and keeps the session clean', async () => {
    mockPartyFetch();
    const saved = serviceAgreementSession(2);
    const onSaveDraft = vi.fn(async (_draftId: string | null, input) => ({
      ...saved,
      state: { ...input, serviceAgreementId: 'agreement-1' },
      agreement: saved.agreement,
    }));
    render(
      <DocumentGenerationWizard
        templates={[{
          ...template,
          id: 'service-agreement-template',
          name: 'Service Agreement',
          compositionType: 'SERVICE_AGREEMENT',
          content: '{{selectedContact.name}}{{@agreement.serviceSections}}{{@agreement.feeTable}}{{@agreement.entityAppendix}}',
          placeholders: [],
        }]}
        companies={[company]}
        initialSession={saved}
        onGenerate={vi.fn()}
        onSaveDraft={onSaveDraft}
      />,
    );

    fireEvent.click(await screen.findByRole('button', { name: 'Continue to Review' }));

    await waitFor(() => expect(onSaveDraft).toHaveBeenCalledTimes(2));
    expect(onSaveDraft).toHaveBeenLastCalledWith(
      saved.id,
      expect.objectContaining({
        currentStep: 3,
        previewContent: '<p>Resolved</p>',
      }),
    );
    expect(await screen.findByLabelText('Document content')).toHaveValue('<p>Resolved</p>');
    expect(screen.queryByText('Unsaved changes')).not.toBeInTheDocument();
  });

  it('keeps the persisted session on Agreement details when preview generation fails', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const saved = serviceAgreementSession(2);
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
      if (String(input).includes('/document-parties')) {
        return { ok: true, json: async () => partyOptions } as Response;
      }
      return {
        ok: false,
        json: async () => ({ error: 'Preview unavailable' }),
      } as Response;
    }));
    const onSaveDraft = vi.fn(async (_draftId: string | null, input: any) => ({
      ...saved,
      state: { ...input, serviceAgreement: undefined, serviceAgreementId: 'agreement-1' },
      agreement: saved.agreement,
    }));

    render(
      <DocumentGenerationWizard
        templates={[{
          ...template,
          id: 'service-agreement-template',
          name: 'Service Agreement',
          compositionType: 'SERVICE_AGREEMENT',
          content: '{{selectedContact.name}}{{@agreement.serviceSections}}{{@agreement.feeTable}}{{@agreement.entityAppendix}}',
          placeholders: [],
        }]}
        companies={[company]}
        initialSession={saved}
        onGenerate={vi.fn()}
        onSaveDraft={onSaveDraft}
      />,
    );

    fireEvent.click(await screen.findByRole('button', { name: 'Continue to Review' }));

    expect(await screen.findByText('Preview unavailable')).toBeVisible();
    expect(onSaveDraft).toHaveBeenNthCalledWith(
      1,
      saved.id,
      expect.objectContaining({ currentStep: 2 }),
    );
    expect(screen.getByPlaceholderText('Enter document title...')).toBeVisible();
    expect(screen.queryByLabelText('Document content')).not.toBeInTheDocument();
  });

  it('reports a failed preview persistence save without entering Review', async () => {
    const saved = serviceAgreementSession(2);
    mockPartyFetch();
    const onSaveDraft = vi.fn()
      .mockImplementationOnce(async (_draftId: string | null, input: any) => ({
        ...saved,
        state: { ...input, serviceAgreement: undefined, serviceAgreementId: 'agreement-1' },
        agreement: saved.agreement,
      }))
      .mockRejectedValueOnce(new Error('Failed to persist preview'));

    render(
      <DocumentGenerationWizard
        templates={[{
          ...template,
          id: 'service-agreement-template',
          name: 'Service Agreement',
          compositionType: 'SERVICE_AGREEMENT',
          content: '{{selectedContact.name}}{{@agreement.serviceSections}}{{@agreement.feeTable}}{{@agreement.entityAppendix}}',
          placeholders: [],
        }]}
        companies={[company]}
        initialSession={saved}
        onGenerate={vi.fn()}
        onSaveDraft={onSaveDraft}
      />,
    );

    fireEvent.click(await screen.findByRole('button', { name: 'Continue to Review' }));

    expect(await screen.findByText('Failed to persist preview')).toBeVisible();
    expect(onSaveDraft).toHaveBeenNthCalledWith(
      1,
      saved.id,
      expect.objectContaining({ currentStep: 2 }),
    );
    expect(screen.getByPlaceholderText('Enter document title...')).toBeVisible();
    expect(screen.queryByLabelText('Document content')).not.toBeInTheDocument();
  });

  it('moves an interrupted blank Service Agreement Review back to Agreement details', async () => {
    const saved = serviceAgreementSession(3);
    saved.state.previewContent = null;
    saved.state.editedContent = null;
    mockPartyFetch();

    render(
      <DocumentGenerationWizard
        templates={[{
          ...template,
          id: 'service-agreement-template',
          name: 'Service Agreement',
          compositionType: 'SERVICE_AGREEMENT',
          content: '{{selectedContact.name}}{{@agreement.serviceSections}}{{@agreement.feeTable}}{{@agreement.entityAppendix}}',
          placeholders: [],
        }]}
        companies={[company]}
        initialSession={saved}
        onGenerate={vi.fn()}
        onSaveDraft={vi.fn()}
      />,
    );

    expect(await screen.findByPlaceholderText('Enter document title...')).toBeVisible();
    expect(screen.queryByLabelText('Document content')).not.toBeInTheDocument();
  });

  it('keeps agreement entities and fees when a destructive removal is cancelled', async () => {
    const saved = serviceAgreementSession(0);
    saved.agreement!.entities.push({
      id: 'entity-2',
      companyId: additionalCompany.id,
      nameSnapshot: additionalCompany.name,
      uenSnapshot: additionalCompany.uen,
      displayOrder: 1,
    });
    saved.agreement!.items[0].entityIds.push('entity-2');
    saved.agreement!.items[0].feeLines.push({
      ...saved.agreement!.items[0].feeLines[0],
      id: 'fee-2',
      agreementEntityId: 'entity-2',
      companyId: additionalCompany.id,
    });
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);
    mockPartyFetch();
    render(
      <DocumentGenerationWizard
        templates={[{
          ...template,
          id: 'service-agreement-template',
          name: 'Service Agreement',
          compositionType: 'SERVICE_AGREEMENT',
          content: '{{@agreement.serviceSections}}{{@agreement.feeTable}}{{@agreement.entityAppendix}}',
          placeholders: [],
        }]}
        companies={[company, additionalCompany]}
        initialSession={saved}
        onGenerate={vi.fn()}
      />,
    );

    const checkbox = await screen.findByRole('checkbox', { name: /Additional Company/ });
    expect(checkbox).toBeChecked();
    fireEvent.click(checkbox);

    expect(confirm).toHaveBeenCalledWith(
      'Remove 1 service assignment and 1 fee line for Additional Company?',
    );
    expect(checkbox).toBeChecked();
  });

  it('keeps the primary company and agreement data when a company change is cancelled', async () => {
    const saved = serviceAgreementSession(0);
    saved.agreement!.entities.push({
      id: 'entity-2',
      companyId: additionalCompany.id,
      nameSnapshot: additionalCompany.name,
      uenSnapshot: additionalCompany.uen,
      displayOrder: 1,
    });
    saved.agreement!.items[0].entityIds.push('entity-2');
    saved.agreement!.items[0].feeLines.push({
      ...saved.agreement!.items[0].feeLines[0],
      id: 'fee-2',
      agreementEntityId: 'entity-2',
      companyId: additionalCompany.id,
    });
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);
    mockPartyFetch();
    render(
      <DocumentGenerationWizard
        templates={[{
          ...template,
          id: 'service-agreement-template',
          name: 'Service Agreement',
          compositionType: 'SERVICE_AGREEMENT',
          content: '{{@agreement.serviceSections}}{{@agreement.feeTable}}{{@agreement.entityAppendix}}',
          placeholders: [],
        }]}
        companies={[company, additionalCompany]}
        initialSession={saved}
        onGenerate={vi.fn()}
      />,
    );

    fireEvent.click(await screen.findByRole('button', {
      name: /Additional Company 202600002B ACTIVE/,
    }));

    expect(confirm).toHaveBeenCalledWith(
      'Changing the primary company will remove 1 service assignment and 1 fee line. Continue?',
    );
    expect(screen.getByLabelText('Selected company')).toHaveTextContent(company.name);
    expect(screen.getByRole('checkbox', { name: /Additional Company/ })).toBeChecked();
  });

  it('retains a draft agreement when switching to standard and back before saving', async () => {
    const saved = serviceAgreementSession(0);
    const serviceTemplate = {
      ...template,
      id: 'service-agreement-template',
      name: 'Service Agreement',
      compositionType: 'SERVICE_AGREEMENT' as const,
      content: '{{@agreement.serviceSections}}{{@agreement.feeTable}}{{@agreement.entityAppendix}}',
      placeholders: [],
    };
    const onSaveDraft = vi.fn(async (_draftId: string | null, input: any) => ({
      ...saved,
      state: { ...input, serviceAgreement: undefined },
      agreement: saved.agreement,
    }));
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    mockPartyFetch();
    render(
      <DocumentGenerationWizard
        templates={[serviceTemplate, template]}
        companies={[company]}
        initialSession={saved}
        onGenerate={vi.fn()}
        onSaveDraft={onSaveDraft}
      />,
    );

    const templateButtons = await screen.findAllByRole('button', {
      name: /Resolution Board resolution/,
    });
    fireEvent.click(templateButtons.find((button) =>
      button.textContent?.startsWith('Resolution'))!);
    fireEvent.click(screen.getAllByRole('button', {
      name: /Resolution Board resolution/,
    }).find((button) => button.textContent?.startsWith('Service Agreement'))!);
    fireEvent.click(screen.getByRole('button', { name: 'Save Draft' }));

    await waitFor(() => expect(onSaveDraft).toHaveBeenCalledWith(
      saved.id,
      expect.objectContaining({
        serviceAgreementId: 'agreement-1',
        serviceAgreement: expect.objectContaining({
          items: expect.arrayContaining([expect.objectContaining({ id: 'item-1' })]),
        }),
      }),
    ));
    expect(onSaveDraft.mock.calls[0][1]).not.toHaveProperty('discardServiceAgreement');
  });

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
      agreement: null,
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
      agreement: null,
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
