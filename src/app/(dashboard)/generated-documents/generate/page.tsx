'use client';

import { Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DocumentGenerationBatchWorkspace,
  type EditableDocumentGenerationBatch,
  type EditableBatchItem,
} from '@/components/documents/generation-batch';
import {
  mapCompanyOption,
  mapContactOption,
  mapTemplateSummary,
} from '@/lib/document-generation-option-mappers';
import { readTaskLaunchContext } from '@/lib/task-launch-context';
import type {
  DocumentGenerationBatchDto,
} from '@/types/document-generation-batch';
import type {
  Company,
  DocumentContact,
  DocumentTemplateSummary,
} from '@/types/document-generation';
import type { GenerationSessionEnvelope } from '@/lib/document-generation-session';

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** First page of options; the workspace searches the server from there. */
const OPTION_SEED_LIMIT = 25;

function dtoToEditableBatch(dto: DocumentGenerationBatchDto): EditableDocumentGenerationBatch {
  return {
    ...dto,
    company: dto.company,
    items: dto.items.map((item) => ({
      key: item.id,
      id: item.id,
      templateId: item.templateId,
      templateName: item.templateName,
      templateKind: item.templateKind,
      templateVersion: item.templateVersion,
      status: item.status,
      configuration: item.configuration,
      previewContent: item.previewContent,
      editedContent: item.editedContent,
      editedContentJson: item.editedContentJson,
      previewFingerprint: item.previewFingerprint,
      reviewedFingerprint: item.reviewedFingerprint,
      validationDiagnostics: item.validationDiagnostics,
      lastError: item.lastError,
      generatedDocumentId: item.generatedDocumentId,
      generatedDocumentTitle: item.generatedDocumentTitle,
      serviceAgreement: item.serviceAgreement ?? null,
    })),
  };
}

function sessionToEditableItem(
  envelope: GenerationSessionEnvelope,
  template: DocumentTemplateSummary,
): EditableBatchItem {
  const state = envelope.state;
  return {
    key: template.id,
    templateId: template.id,
    templateName: template.name,
    templateKind: template.compositionType,
    templateVersion: template.version,
    status: 'NOT_STARTED',
    configuration: {
      version: 1,
      title: state.title || `Untitled - ${template.name}`,
      contactIds: state.contactIds,
      selectedDirectorId: state.selectedDirectorId,
      selectedShareholderId: state.selectedShareholderId,
      selectedContactId: state.selectedContactId,
      itemValues: state.customData ?? {},
      masterOverrides: {},
      useLetterhead: state.useLetterhead,
      serviceAgreement: envelope.agreement
        ? {
            authorizedContactId:
              envelope.agreement.authorizedContactId
              ?? envelope.agreement.authorizedRepresentativeSnapshot.id,
            entityIds: envelope.agreement.entities.map((entity) => entity.companyId),
            agreementDate: envelope.agreement.agreementDate,
            effectiveDate: envelope.agreement.effectiveDate,
            termMonths: envelope.agreement.termMonths,
            items: envelope.agreement.items.map((item) => ({
              id: item.id,
              clientKey: item.id,
              variantId: item.serviceVariantId,
              entityIds: item.entityIds
                .map((entityId) =>
                  envelope.agreement?.entities.find((entity) => entity.id === entityId)?.companyId)
                .filter((id): id is string => Boolean(id)),
              startDate: item.startDate,
              endDate: item.endDate,
              fieldValues: item.fieldValues,
              displayOrder: item.displayOrder,
              feeLines: item.feeLines.map((fee) => ({
                id: fee.id,
                clientKey: fee.id,
                companyId: fee.companyId,
                description: fee.description,
                amount: fee.amount,
                currency: fee.currency,
                billingFrequency: fee.billingFrequency,
                customFrequencyLabel: fee.customFrequencyLabel ?? null,
                billingStartDate: fee.billingStartDate,
                displayOrder: fee.displayOrder,
              })),
            })),
          }
        : null,
    },
    previewContent: state.previewContent,
    editedContent: state.editedContent,
    editedContentJson: state.editedContentJson,
    previewFingerprint: null,
    reviewedFingerprint: null,
    validationDiagnostics: null,
    lastError: null,
  };
}

/**
 * Mirrors the workspace chrome so the first paint does not shift layout once
 * templates resolve.
 */
function WorkspaceSkeleton() {
  return (
    <div
      className="mx-auto w-full max-w-[2200px] animate-pulse p-3 sm:p-5"
      role="status"
      aria-label="Loading document generation workspace"
    >
      <div className="flex items-center justify-between gap-3 border-b border-border-secondary pb-3">
        <div className="flex items-center gap-3">
          <div className="h-9 w-9 rounded-lg bg-background-tertiary" />
          <div className="space-y-2">
            <div className="h-4 w-48 rounded bg-background-tertiary" />
            <div className="h-3 w-32 rounded bg-background-tertiary" />
          </div>
        </div>
        <div className="h-9 w-28 rounded-lg bg-background-tertiary" />
      </div>
      <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
        {[0, 1, 2, 3].map((index) => (
          <div key={index} className="h-14 rounded-lg bg-background-tertiary" />
        ))}
      </div>
      <div className="mt-4 grid gap-4 lg:grid-cols-[minmax(0,1fr)_360px]">
        <div className="space-y-2">
          <div className="h-11 rounded-lg bg-background-tertiary" />
          <div className="grid gap-2 sm:grid-cols-2">
            {[0, 1, 2, 3, 4, 5].map((index) => (
              <div key={index} className="h-20 rounded-lg bg-background-tertiary" />
            ))}
          </div>
        </div>
        <div className="h-64 rounded-lg bg-background-tertiary" />
      </div>
    </div>
  );
}

function GenerateDocumentContent() {
  const searchParams = useSearchParams();
  const requestedBatchId = searchParams.get('batch');
  const requestedDraftId = searchParams.get('draft');
  const requestedTemplateId = searchParams.get('templateId');
  const requestedCompanyId = searchParams.get('companyId');
  const taskContext = useMemo(
    () => readTaskLaunchContext(searchParams),
    [searchParams],
  );
  const backHref = taskContext?.returnTo ?? '/generated-documents';
  const [templates, setTemplates] = useState<DocumentTemplateSummary[]>([]);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [contacts, setContacts] = useState<DocumentContact[]>([]);
  const [initialBatch, setInitialBatch] = useState<EditableDocumentGenerationBatch | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchJson = useCallback(async (url: string): Promise<Record<string, unknown>> => {
    const response = await fetch(url);
    if (!response.ok) throw new Error(`Request failed: ${url}`);
    return response.json();
  }, []);

  useEffect(() => {
    const load = async () => {
      setIsLoading(true);
      setError(null);
      try {
        for (const id of [requestedBatchId, requestedDraftId, requestedTemplateId, requestedCompanyId]) {
          if (id && !UUID_PATTERN.test(id)) {
            throw new Error('The linked identifier is invalid.');
          }
        }
        const templatesParams = new URLSearchParams({ isActive: 'true', limit: '100' });
        const optionParams = new URLSearchParams({ limit: String(OPTION_SEED_LIMIT) });
        const [templatesData, companiesData, contactsData] = await Promise.all([
          fetchJson(`/api/document-templates?${templatesParams}`),
          fetchJson(`/api/companies/options?${optionParams}`),
          fetchJson(`/api/contacts/options?${optionParams}`),
        ]);
        const rawTemplates = Array.isArray(templatesData.templates)
          ? templatesData.templates as Array<Record<string, unknown>>
          : [];
        const rawCompanies = Array.isArray(companiesData.options)
          ? companiesData.options as Array<Record<string, unknown>>
          : [];
        const rawContacts = Array.isArray(contactsData.options)
          ? contactsData.options as Array<Record<string, unknown>>
          : [];
        const templateList = rawTemplates.map(mapTemplateSummary);
        setTemplates(templateList);
        setCompanies(rawCompanies.map(mapCompanyOption));
        setContacts(rawContacts.map(mapContactOption));

        if (requestedBatchId) {
          const dto = await fetchJson(
            `/api/document-generation-batches/${encodeURIComponent(requestedBatchId)}`,
          );
          setInitialBatch(dtoToEditableBatch(dto as unknown as DocumentGenerationBatchDto));
        } else if (requestedDraftId) {
          const envelope = await fetchJson(
            `/api/generated-documents/generation-sessions/${encodeURIComponent(requestedDraftId)}`,
          ) as unknown as GenerationSessionEnvelope;
          const template = templateList.find(
            (candidate) => candidate.id === envelope.state.templateId,
          );
          if (!template) throw new Error('The saved draft template is unavailable.');
          setInitialBatch({
            legacyDraftId: requestedDraftId,
            primaryCompanyId: envelope.state.companyId,
            company: null,
            activeItemId: template.id,
            currentStage: Math.min(envelope.state.currentStep, 3),
            status: 'DRAFT',
            masterFieldValues: {},
            masterFields: { fields: [], conflicts: [] },
            taskContext,
            items: [sessionToEditableItem(envelope, template)],
          });
        } else if (requestedTemplateId) {
          const template = templateList.find(
            (candidate) => candidate.id === requestedTemplateId,
          );
          if (!template) throw new Error('The linked template is unavailable.');
          setInitialBatch({
            primaryCompanyId: requestedCompanyId,
            company: null,
            activeItemId: template.id,
            currentStage: 0,
            status: 'DRAFT',
            masterFieldValues: {},
            masterFields: { fields: [], conflicts: [] },
            taskContext,
            items: [{
              key: template.id,
              templateId: template.id,
              templateName: template.name,
              templateKind: template.compositionType,
              templateVersion: template.version,
              status: 'NOT_STARTED',
              configuration: {
                version: 1,
                title: `Untitled - ${template.name}`,
                contactIds: [],
                selectedDirectorId: null,
                selectedShareholderId: null,
                selectedContactId: null,
                itemValues: {},
                masterOverrides: {},
                useLetterhead: true,
                serviceAgreement: null,
              },
              previewContent: null,
              editedContent: null,
              editedContentJson: null,
              previewFingerprint: null,
              reviewedFingerprint: null,
              validationDiagnostics: null,
              lastError: null,
            }],
          });
        } else {
          setInitialBatch(null);
        }
      } catch (caught) {
        console.error('Generate page load error:', caught);
        setError(caught instanceof Error ? caught.message : 'Failed to load data');
      } finally {
        setIsLoading(false);
      }
    };
    void load();
  }, [fetchJson, requestedBatchId, requestedDraftId, requestedTemplateId, requestedCompanyId, taskContext]);

  if (isLoading) return <WorkspaceSkeleton />;

  if (error) {
    return (
      <div className="mx-auto max-w-xl p-6" role="alert">
        <div className="flex items-start gap-3 rounded-lg border border-status-error/30 bg-status-error/5 p-4">
          <AlertCircle className="h-5 w-5 shrink-0 text-status-error" aria-hidden="true" />
          <div className="flex-1">
            <p className="font-medium text-status-error">Failed to load data</p>
            <p className="mt-1 text-sm text-text-secondary">{error}</p>
          </div>
          <Button variant="secondary" size="sm" onClick={() => window.location.reload()}>
            Retry
          </Button>
        </div>
      </div>
    );
  }

  return (
    <DocumentGenerationBatchWorkspace
      initialBatch={initialBatch}
      templates={templates}
      companies={companies}
      contacts={contacts}
      backHref={backHref}
    />
  );
}

export default function GenerateDocumentPage() {
  return (
    <Suspense fallback={<WorkspaceSkeleton />}>
      <GenerateDocumentContent />
    </Suspense>
  );
}
