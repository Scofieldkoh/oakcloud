'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, FilePlus2, Loader2, AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/toast';
import {
  DocumentGenerationWizard,
  type GenerateDocumentData,
  type GeneratedDocumentResult,
  type DocumentContact,
  type TemplatePartial,
} from '@/components/documents/document-generation-wizard';
import type { DocumentTemplate } from '@/components/documents/template-selector';
import type { GenerationSessionEnvelope } from '@/lib/document-generation-session';
import type { GenerationSessionState } from '@/lib/validations/generated-document';
import {
  readTaskLaunchContext,
  withTaskLaunchContext,
} from '@/lib/task-launch-context';

// ============================================================================
// Types
// ============================================================================

interface Company {
  id: string;
  name: string;
  uen: string;
  status: string;
  registeredAddress?: string | null;
  incorporationDate?: string | null;
}

// ============================================================================
// Main Page Component
// ============================================================================

export default function GenerateDocumentPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { success } = useToast();
  const requestedDraftId = searchParams.get('draft');
  const requestedTemplateId = searchParams.get('templateId') ?? undefined;
  const requestedCompanyId = searchParams.get('companyId') ?? undefined;
  const taskContext = useMemo(
    () => readTaskLaunchContext(searchParams),
    [searchParams],
  );
  const backHref = taskContext?.returnTo ?? '/generated-documents';

  // State
  const [templates, setTemplates] = useState<DocumentTemplate[]>([]);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [contacts, setContacts] = useState<DocumentContact[]>([]);
  const [partials, setPartials] = useState<TemplatePartial[]>([]);
  const [initialSession, setInitialSession] = useState<GenerationSessionEnvelope | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const mapCompanyOption = (company: {
    id: string;
    name: string;
    uen?: string | null;
  }): Company => ({
    id: company.id,
    name: company.name,
    uen: company.uen || '',
    status: '',
  });

  const mapContactOption = (contact: {
    id: string;
    name: string;
  }): DocumentContact => ({
    id: contact.id,
    fullName: contact.name,
    email: null,
    phone: null,
    designation: null,
  });

  const searchTemplates = useCallback(async (query: string) => {
    const params = new URLSearchParams({ isActive: 'true', limit: '100' });
    if (query.trim()) params.set('query', query.trim());

    const response = await fetch(`/api/document-templates?${params}`);
    if (!response.ok) return;

    const data = await response.json();
    setTemplates(data.templates || []);
  }, []);

  const searchCompanies = useCallback(async (query: string) => {
    const params = new URLSearchParams({ limit: '50' });
    if (query.trim()) params.set('q', query.trim());

    const response = await fetch(`/api/companies/options?${params}`);
    if (!response.ok) return;

    const data = await response.json();
    setCompanies((data.options || []).map(mapCompanyOption));
  }, []);

  const searchContacts = useCallback(async (query: string) => {
    const params = new URLSearchParams({ limit: '50' });
    if (query.trim()) params.set('q', query.trim());

    const response = await fetch(`/api/contacts/options?${params}`);
    if (!response.ok) return;

    const data = await response.json();
    setContacts((data.options || []).map(mapContactOption));
  }, []);

  // Fetch templates, companies, contacts, and partials
  useEffect(() => {
    const fetchData = async () => {
      setIsLoading(true);
      setError(null);

      try {
        const templatesParams = new URLSearchParams({ isActive: 'true', limit: '100' });
        const companiesParams = new URLSearchParams({ limit: '50' });
        const contactsParams = new URLSearchParams({ limit: '50' });
        const partialsParams = new URLSearchParams({ all: 'true' });

        if (requestedDraftId && !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(requestedDraftId)) {
          throw new Error('The saved draft link is invalid.');
        }

        const sessionRequest = requestedDraftId
          ? fetch(`/api/generated-documents/generation-sessions/${encodeURIComponent(requestedDraftId)}`)
          : Promise.resolve(null);
        const requestedCompanyRequest = requestedCompanyId
          ? fetch(`/api/companies/${encodeURIComponent(requestedCompanyId)}`)
          : Promise.resolve(null);
        const [
          templatesRes,
          companiesRes,
          contactsRes,
          partialsRes,
          sessionRes,
          requestedCompanyRes,
        ] = await Promise.all([
          fetch(`/api/document-templates?${templatesParams}`),
          fetch(`/api/companies/options?${companiesParams}`),
          fetch(`/api/contacts/options?${contactsParams}`),
          fetch(`/api/template-partials?${partialsParams}`),
          sessionRequest,
          requestedCompanyRequest,
        ]);

        if (!templatesRes.ok) {
          throw new Error('Failed to fetch templates');
        }
        if (!companiesRes.ok) {
          throw new Error('Failed to fetch companies');
        }
        if (!contactsRes.ok) {
          throw new Error('Failed to fetch contacts');
        }
        if (sessionRes && !sessionRes.ok) {
          throw new Error('The saved draft is unavailable or you no longer have access to it.');
        }
        if (requestedCompanyRes && !requestedCompanyRes.ok) {
          throw new Error('The linked company is unavailable or you no longer have access to it.');
        }

        const templatesData = await templatesRes.json();
        const companiesData = await companiesRes.json();
        const contactsData = await contactsRes.json();
        const partialsData = partialsRes.ok ? await partialsRes.json() : { partials: [] };
        const sessionData = sessionRes ? await sessionRes.json() : null;
        const requestedCompanyData = requestedCompanyRes
          ? mapCompanyOption(await requestedCompanyRes.json())
          : null;
        const companyOptions = (companiesData.options || []).map(mapCompanyOption);
        if (
          requestedCompanyData
          && !companyOptions.some((company: Company) => company.id === requestedCompanyData.id)
        ) {
          companyOptions.unshift(requestedCompanyData);
        }

        setTemplates(templatesData.templates || []);
        setCompanies(companyOptions);
        setContacts((contactsData.options || []).map(mapContactOption));
        setPartials(partialsData.partials || []);
        setInitialSession(sessionData);
      } catch (err) {
        console.error('Fetch error:', err);
        setError(err instanceof Error ? err.message : 'Failed to load data');
      } finally {
        setIsLoading(false);
      }
    };

    fetchData();
  }, [requestedCompanyId, requestedDraftId]);

  const handleSaveDraft = useCallback(async (
    draftId: string | null,
    state: GenerationSessionState,
  ): Promise<GenerationSessionEnvelope> => {
    const response = await fetch(
      draftId
        ? `/api/generated-documents/generation-sessions/${encodeURIComponent(draftId)}`
        : '/api/generated-documents/generation-sessions',
      {
        method: draftId ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...state, taskContext }),
      },
    );
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.error || 'Failed to save draft');
    }
    return response.json();
  }, [taskContext]);

  // Handle document generation
  const handleGenerate = useCallback(
    async (data: GenerateDocumentData): Promise<GeneratedDocumentResult> => {
      const requestBody: Record<string, unknown> = {
        draftId: data.draftId,
        templateId: data.templateId,
        companyId: data.companyId,
        contactIds: data.contactIds || [],
        selectedDirectorId: data.selectedDirectorId,
        selectedShareholderId: data.selectedShareholderId,
        selectedContactId: data.selectedContactId,
        title: data.title,
        customData: data.customData,
        useLetterhead: data.useLetterhead,
        editedContent: data.editedContent,
        taskContext,
      };

      const response = await fetch('/api/generated-documents', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || 'Failed to generate document');
      }

      const result = await response.json();
      success('Document generated successfully');

      return {
        id: result.id,
        title: result.title,
        content: result.content,
        status: result.status,
        missingPlaceholders: result.metadata?.missingPlaceholders,
      };
    },
    [success, taskContext]
  );

  // Handle template preview
  const handlePreviewTemplate = useCallback((template: DocumentTemplate) => {
    // Open template preview in modal or new tab
    window.open(`/api/document-templates/${template.id}/preview`, '_blank');
  }, []);

  // Handle validation
  const handleValidate = useCallback(
    async (
      templateId: string,
      companyId: string | undefined,
      customData: Record<string, string>,
      contactIds: string[] = [],
      selectedDirectorId?: string,
      selectedShareholderId?: string,
      selectedContactId?: string,
    ) => {
      try {
        const requestBody: Record<string, unknown> = {
          templateId,
          companyId,
          contactIds,
          selectedDirectorId,
          selectedShareholderId,
          selectedContactId,
          customData,
        };

        const response = await fetch('/api/generated-documents/validate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(requestBody),
        });

        if (!response.ok) {
          throw new Error('Validation failed');
        }

        return await response.json();
      } catch (err) {
        console.error('Validation error:', err);
        return {
          isValid: true,
          errors: [],
          warnings: [],
        };
      }
    },
    []
  );

  return (
    <div className="mx-auto w-full max-w-[1800px] p-4 sm:p-6">
      <header className="mb-5 rounded-2xl border border-oak-primary/20 bg-gradient-to-br from-oak-primary/[0.06] to-background-secondary p-4 shadow-sm sm:rounded-3xl sm:p-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <Link
              href={backHref}
              className="inline-flex min-h-11 items-center gap-1.5 text-sm text-text-secondary transition-colors hover:text-text-primary sm:min-h-0"
            >
              <ArrowLeft className="h-4 w-4" aria-hidden="true" />
              Back to Documents
            </Link>
            <div className="mt-2 flex items-center gap-3">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-oak-primary/10 text-oak-primary">
                <FilePlus2 className="h-5 w-5" aria-hidden="true" />
              </span>
              <div className="min-w-0">
                <h1 className="text-xl font-semibold text-text-primary sm:text-2xl">
                  Create document
                </h1>
              </div>
            </div>
          </div>
        </div>
      </header>

      {/* Content */}
      <main>
        {/* Loading state */}
        {isLoading && (
          <div className="flex flex-col items-center justify-center py-16">
            <Loader2 className="w-10 h-10 animate-spin text-accent-primary mb-4" />
            <p className="text-text-muted">Loading templates and companies...</p>
          </div>
        )}

        {/* Error state */}
        {error && (
          <div className="card border-status-error bg-status-error/5 mb-4">
            <div className="flex items-center gap-3 text-status-error">
              <AlertCircle className="w-5 h-5 flex-shrink-0" />
              <div className="flex-1">
                <p className="font-medium">Failed to Load Data</p>
                <p className="text-sm opacity-80">{error}</p>
              </div>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => window.location.reload()}
              >
                Retry
              </Button>
              {requestedDraftId && (
                <Link href="/generated-documents/generate">
                  <Button variant="primary" size="sm">Start a new document</Button>
                </Link>
              )}
            </div>
          </div>
        )}

        {/* No templates */}
        {!isLoading && !error && templates.length === 0 && (
          <div className="py-16 text-center">
            <AlertCircle className="w-12 h-12 mx-auto text-amber-500 mb-4" />
            <h3 className="text-lg font-medium text-text-primary mb-2">
              No Templates Available
            </h3>
            <p className="text-text-muted mb-4">
              There are no document templates available. Please contact your administrator to set up templates.
            </p>
            <Link href="/generated-documents">
              <Button variant="secondary">Back to Documents</Button>
            </Link>
          </div>
        )}

        {/* Wizard */}
        {!isLoading && !error && templates.length > 0 && (
          <DocumentGenerationWizard
            templates={templates}
            companies={companies}
            contacts={contacts}
            partials={partials}
            initialSession={initialSession}
            initialTemplateId={requestedTemplateId}
            initialCompanyId={requestedCompanyId}
            onSaveDraft={handleSaveDraft}
            onGenerate={handleGenerate}
            onGenerationComplete={(result) => router.push(withTaskLaunchContext(
              `/generated-documents/${result.id}`,
              taskContext,
            ))}
            onPreviewTemplate={handlePreviewTemplate}
            onSearchTemplates={searchTemplates}
            onSearchCompanies={searchCompanies}
            onSearchContacts={searchContacts}
            onValidate={handleValidate}
            isLoading={isLoading}
          />
        )}
      </main>
    </div>
  );
}
