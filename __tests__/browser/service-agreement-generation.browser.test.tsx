import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';
import React from 'react';
import { DocumentGenerationWizard } from '@/components/documents/document-generation-wizard';
import { ServiceAgreementWarning } from '@/components/documents/service-agreement/service-agreement-warning';
import type { GenerationSessionEnvelope } from '@/lib/document-generation-session';
import '@/app/globals.css';

vi.mock('@/components/documents/a4-page-editor', () => ({
  A4PageEditor: React.forwardRef(function BrowserA4Editor(
    props: { value?: string; onChange?: (value: string) => void },
    _ref,
  ) {
    return (
      <textarea
        aria-label="Document content"
        value={props.value ?? ''}
        onChange={(event) => props.onChange?.(event.target.value)}
      />
    );
  }),
}));

vi.mock('@/hooks/use-unsaved-navigation-guard', () => ({
  useUnsavedNavigationGuard: () => ({ disarm: vi.fn() }),
}));

async function waitUntil(check: () => boolean, timeout = 3000) {
  const started = Date.now();
  while (!check()) {
    if (Date.now() - started > timeout) throw new Error('Timed out waiting for browser state');
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
}

function button(host: HTMLElement, label: string) {
  const match = Array.from(host.querySelectorAll('button')).find(
    (candidate) => candidate.textContent?.trim().includes(label),
  );
  if (!match) throw new Error(`Button not found: ${label}`);
  return match;
}

function clickableText(host: HTMLElement, label: string) {
  const match = Array.from(
    host.querySelectorAll<HTMLElement>('button, button *, [role="button"], [role="button"] *'),
  ).find(
    (candidate) => candidate.textContent?.trim() === label,
  );
  const clickable = match?.closest<HTMLElement>('button, [role="button"]');
  if (!clickable) throw new Error(`Clickable text not found: ${label}`);
  return clickable;
}

describe('Service Agreement generation browser workflow', () => {
  let host: HTMLDivElement;
  let root: Root;
  const actEnvironment = globalThis as typeof globalThis & {
    IS_REACT_ACT_ENVIRONMENT?: boolean;
  };
  const previousActEnvironment = actEnvironment.IS_REACT_ACT_ENVIRONMENT;

  beforeAll(() => {
    actEnvironment.IS_REACT_ACT_ENVIRONMENT = true;
  });

  afterAll(() => {
    actEnvironment.IS_REACT_ACT_ENVIRONMENT = previousActEnvironment;
  });

  beforeEach(() => {
    host = document.createElement('div');
    document.body.appendChild(host);
    root = createRoot(host);
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    host.remove();
    vi.unstubAllGlobals();
  });

  it('keeps the structured-data divergence warning and return action visible', async () => {
    const onBackToServices = vi.fn();
    await act(async () => {
      root.render(<ServiceAgreementWarning onBackToServices={onBackToServices} />);
    });

    const warning = host.querySelector<HTMLElement>('[role="alert"]');
    const button = Array.from(host.querySelectorAll('button')).find(
      (candidate) => candidate.textContent === 'Back to Services',
    );
    expect(warning?.textContent).toContain(
      'Client Services will use the structured values from the Services step',
    );
    expect(button).toBeTruthy();
    button!.click();
    expect(onBackToServices).toHaveBeenCalledOnce();
  });

  it('traverses Setup, Services, Agreement details, Review, and generation', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);
    const companyId = '11111111-1111-4111-8111-111111111111';
    const contactId = '22222222-2222-4222-8222-222222222222';
    const variantId = '33333333-3333-4333-8333-333333333333';
    const templateId = '44444444-4444-4444-8444-444444444444';
    const agreementId = '55555555-5555-4555-8555-555555555555';
    const draftId = '66666666-6666-4666-8666-666666666666';
    const onGenerationComplete = vi.fn();
    const onGenerate = vi.fn().mockResolvedValue({
      id: 'document-result',
      title: 'Browser Service Agreement',
      content: '<p>Generated</p>',
      status: 'DRAFT',
    });
    let previewAttempts = 0;
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes('/document-parties')) {
        return {
          ok: true,
          json: async () => ({
            directors: [],
            shareholders: [],
            contacts: [{
              id: contactId,
              contactId,
              name: 'Browser Representative',
              detail: 'Director',
              email: 'browser@example.com',
              phone: '+65 6123 4567',
              address: { full: null, letter: null },
            }],
          }),
        } as Response;
      }
      if (url.includes('/api/service-catalog')) {
        return {
          ok: true,
          json: async () => ({
            variants: [{
              id: variantId,
              familyId: 'family-1',
              code: 'BROWSER_SERVICE',
              name: 'Browser annual service',
              description: null,
              serviceCadence: 'ANNUALLY',
              customCadenceLabel: null,
              displayOrder: 0,
              version: 1,
              isActive: true,
              sowPartial: {
                id: 'partial-1',
                name: 'browser-service',
                displayName: 'Browser service',
                version: 1,
                placeholders: [],
              },
              feeTemplates: [{
                id: 'fee-template-1',
                description: 'Annual fee',
                defaultAmount: '500.00',
                currency: 'SGD',
                billingFrequency: 'ANNUALLY',
                customFrequencyLabel: null,
                displayOrder: 0,
              }],
            }],
          }),
        } as Response;
      }
      previewAttempts += 1;
      if (previewAttempts === 1) {
        return {
          ok: false,
          json: async () => ({ error: 'Browser preview unavailable' }),
        } as Response;
      }
      return {
        ok: true,
        json: async () => ({
          preview: {
            content: '<p>Browser generated preview</p>',
            unresolvedPlaceholders: [],
            missingPartials: [],
            blockingErrors: [],
          },
        }),
      } as Response;
    });
    vi.stubGlobal('fetch', fetchMock);
    const onSaveDraft = vi.fn(async (_id: string | null, input: any) => {
      const agreementInput = input.serviceAgreement;
      const item = agreementInput.items[0];
      return {
        id: draftId,
        savedAt: '2026-07-30T02:00:00.000Z',
        state: {
          ...input,
          serviceAgreement: undefined,
          serviceAgreementId: agreementId,
        },
        agreement: {
          id: agreementId,
          generatedDocumentId: draftId,
          primaryCompanyId: companyId,
          authorizedContactId: contactId,
          authorizedRepresentativeSnapshot: {
            id: contactId,
            name: 'Browser Representative',
            role: 'Director',
            email: 'browser@example.com',
            phone: '+65 6123 4567',
          },
          agreementDate: agreementInput.agreementDate,
          effectiveDate: agreementInput.effectiveDate,
          termMonths: agreementInput.termMonths,
          status: 'DRAFT' as const,
          entities: [{
            id: 'entity-1',
            companyId,
            nameSnapshot: 'Browser Company',
            uenSnapshot: '202600001A',
            displayOrder: 0,
          }],
          items: [{
            id: 'item-1',
            serviceVariantId: variantId,
            variantVersion: 1,
            familyNameSnapshot: 'Browser family',
            variantNameSnapshot: 'Browser annual service',
            serviceCadence: 'ANNUALLY',
            customCadenceLabel: null,
            sowPartialId: 'partial-1',
            partialVersion: 1,
            partialContentSnapshot: '<p>Browser wording</p>',
            partialPlaceholdersSnapshot: [],
            partialDependencySnapshot: [],
            startDate: item.startDate,
            endDate: item.endDate,
            fieldValues: item.fieldValues,
            displayOrder: 0,
            entityIds: ['entity-1'],
            feeLines: [{
              id: 'fee-1',
              agreementEntityId: 'entity-1',
              ...item.feeLines[0],
              billingStartDate: item.feeLines[0].billingStartDate,
            }],
            staleVariantVersion: false,
            stalePartialVersion: false,
          }],
          createdAt: '2026-07-30T01:00:00.000Z',
          updatedAt: '2026-07-30T02:00:00.000Z',
        },
      } as GenerationSessionEnvelope;
    });

    await act(async () => {
      root.render(
        <DocumentGenerationWizard
          templates={[{
            id: templateId,
            name: 'Browser Service Agreement',
            description: null,
            category: 'CONTRACT',
            compositionType: 'SERVICE_AGREEMENT',
            content: '{{selectedContact.name}}{{@agreement.serviceSections}}{{@agreement.feeTable}}{{@agreement.entityAppendix}}',
            placeholders: [],
            isActive: true,
            version: 1,
            createdAt: '2026-07-30T00:00:00.000Z',
            updatedAt: '2026-07-30T00:00:00.000Z',
          }]}
          companies={[{
            id: companyId,
            name: 'Browser Company',
            uen: '202600001A',
            status: 'ACTIVE',
          }, {
            id: '77777777-7777-4777-8777-777777777777',
            name: 'Alternative Company',
            uen: '202600002B',
            status: 'ACTIVE',
          }]}
          initialTemplateId={templateId}
          onSaveDraft={onSaveDraft}
          onGenerate={onGenerate}
          onGenerationComplete={onGenerationComplete}
        />,
      );
    });

    await waitUntil(() => host.textContent?.includes('Browser Company') ?? false);
    await act(async () => clickableText(host, 'Browser Company').click());
    await waitUntil(() => Boolean(host.querySelector('select[aria-label="Authorised representative"] option[value]')));
    const representative = host.querySelector<HTMLSelectElement>(
      'select[aria-label="Authorised representative"]',
    )!;
    representative.value = contactId;
    await act(async () => representative.dispatchEvent(new Event('change', { bubbles: true })));
    await act(async () => button(host, 'Continue to Services').click());

    await waitUntil(() => Boolean(host.querySelector(`option[value="${variantId}"]`)));
    const serviceSelect = host.querySelector<HTMLSelectElement>(
      'select[aria-label="Service variant"]',
    )!;
    serviceSelect.value = variantId;
    await act(async () => serviceSelect.dispatchEvent(new Event('change', { bubbles: true })));
    await act(async () => button(host, 'Add service').click());
    await waitUntil(() => host.textContent?.includes('Browser annual service') ?? false);
    const setupStep = host.querySelector<HTMLButtonElement>(
      'nav[aria-label="Progress"] button',
    );
    if (!setupStep) throw new Error('Setup step button not found');
    await act(async () => setupStep.click());
    await act(async () => clickableText(host, 'Alternative Company').click());
    expect(confirm).toHaveBeenCalledWith(
      'Changing the primary company will remove 1 service assignment and 1 fee line. Continue?',
    );
    expect(host.querySelector('[aria-label="Selected company"]')?.textContent)
      .toContain('Browser Company');
    await act(async () => button(host, 'Continue to Services').click());
    await act(async () => button(host, 'Continue to Agreement details').click());

    const title = host.querySelector<HTMLInputElement>(
      'input[placeholder="Enter document title..."]',
    )!;
    title.value = 'Browser Service Agreement';
    await act(async () => title.dispatchEvent(new Event('input', { bubbles: true })));
    await act(async () => title.dispatchEvent(new Event('change', { bubbles: true })));
    await act(async () => button(host, 'Continue to Review').click());

    await waitUntil(() => host.textContent?.includes('Browser preview unavailable') ?? false);
    expect(host.querySelector('textarea[aria-label="Document content"]')).toBeNull();
    await act(async () => button(host, 'Continue to Review').click());

    await waitUntil(() => Boolean(host.querySelector('textarea[aria-label="Document content"]')));
    expect(host.querySelector<HTMLTextAreaElement>(
      'textarea[aria-label="Document content"]',
    )?.value).toContain('Browser generated preview');
    await act(async () => button(host, 'Generate Document').click());
    await waitUntil(() => onGenerationComplete.mock.calls.length === 1);
    expect(onGenerate).toHaveBeenCalledOnce();
    expect(onGenerationComplete).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'document-result' }),
    );
  });
});
