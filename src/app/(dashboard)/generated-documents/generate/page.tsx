'use client';

import { Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { AlertCircle, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DocumentGenerationBatchWorkspace,
  type EditableDocumentGenerationBatch,
  type EditableBatchItem,
} from '@/components/documents/generation-batch';
import {
  normalizeStoredPlaceholders,
  storageFormatToCustomPlaceholders,
} from '@/lib/template-analysis';
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

function mapTemplate(raw: Record<string, unknown>): DocumentTemplateSummary {
  return {
    id: String(raw.id),
    name: String(raw.name),
    description: raw.description ? String(raw.description) : null,
    category: String(raw.category ?? 'OTHER'),
    compositionType: raw.compositionType === 'SERVICE_AGREEMENT'
      ? 'SERVICE_AGREEMENT'
      : 'STANDARD',
    version: Number(raw.version ?? 1),
    isActive: raw.isActive !== false,
    content: String(raw.content ?? ''),
    contentJson: raw.contentJson ?? undefined,
    placeholders: storageFormatToCustomPlaceholders(
      normalizeStoredPlaceholders(raw.placeholders),
    ),
    createdAt: String(raw.createdAt ?? ''),
    updatedAt: String(raw.updatedAt ?? ''),
  };
}

function mapCompany(raw: Record<string, unknown>): Company {
  return {
    id: String(raw.id),
    name: String(raw.name ?? ''),
    uen: String(raw.uen ?? ''),
    status: String(raw.status ?? ''),
    registeredAddress: raw.registeredAddress ? String(raw.registeredAddress) : null,
    incorporationDate: raw.incorporationDate ? String(raw.incorporationDate) : null,
  };
}

function mapContact(raw: Record<string, unknown>): DocumentContact {
  return {
    id: String(raw.id),
    fullName: String(raw.name ?? raw.fullName ?? ''),
    email: raw.email ? String(raw.email) : null,
    phone: raw.phone ? String(raw.phone) : null,
    designation: raw.designation ? String(raw.designation) : null,
  };
}

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
        const companiesParams = new URLSearchParams({ limit: '50' });
        const contactsParams = new URLSearchParams({ limit: '50' });
        const [templatesData, companiesData, contactsData] = await Promise.all([
          fetchJson(`/api/document-templates?${templatesParams}`),
          fetchJson(`/api/companies/options?${companiesParams}`),
          fetchJson(`/api/contacts/options?${contactsParams}`),
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
        const templateList = rawTemplates.map(mapTemplate);
        const companyList = rawCompanies.map(mapCompany);
        const contactList = rawContacts.map(mapContact);
        setTemplates(templateList);
        setCompanies(companyList);
        setContacts(contactList);

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
          const company = envelope.state.companyId
            ? companyList.find((candidate) => candidate.id === envelope.state.companyId) ?? null
            : null;
          setCompanies((current) => {
            if (!company || current.some((entry) => entry.id === company.id)) return current;
            return [...current, company];
          });
          setInitialBatch({
            legacyDraftId: requestedDraftId,
            primaryCompanyId: envelope.state.companyId,
            company,
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
          const company = requestedCompanyId
            ? companyList.find((candidate) => candidate.id === requestedCompanyId) ?? null
            : null;
          setCompanies((current) => {
            if (!company || current.some((entry) => entry.id === company.id)) return current;
            return [...current, company];
          });
          setInitialBatch({
            primaryCompanyId: company?.id ?? null,
            company,
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

  return (
    <div className="min-h-screen">
      {isLoading && (
        <div className="flex flex-col items-center justify-center py-20" role="status">
          <Loader2 className="h-8 w-8 animate-spin text-oak-primary" aria-hidden="true" />
          <p className="mt-3 text-sm text-text-secondary">Loading templates and companies...</p>
        </div>
      )}
      {!isLoading && error && (
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
      )}
      {!isLoading && !error && (
        <DocumentGenerationBatchWorkspace
          initialBatch={initialBatch}
          templates={templates}
          companies={companies}
          contacts={contacts}
          backHref={backHref}
        />
      )}
    </div>
  );
}

export default function GenerateDocumentPage() {
  return (
    <Suspense
      fallback={
        <div className="flex flex-col items-center justify-center py-20" role="status">
          <Loader2 className="h-8 w-8 animate-spin text-oak-primary" aria-hidden="true" />
        </div>
      }
    >
      <GenerateDocumentContent />
    </Suspense>
  );
}
