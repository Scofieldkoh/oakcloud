'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Loader2, AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/toast';
import {
  DocumentGenerationWizard,
  type GenerateDocumentData,
  type GeneratedDocumentResult,
  type TemplatePartial,
} from '@/components/documents/document-generation-wizard';
import type { DocumentTemplate } from '@/components/documents/template-selector';

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
  const { success } = useToast();

  // State
  const [templates, setTemplates] = useState<DocumentTemplate[]>([]);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [partials, setPartials] = useState<TemplatePartial[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Fetch templates, companies, and partials
  useEffect(() => {
    const fetchData = async () => {
      setIsLoading(true);
      setError(null);

      try {
        const templatesParams = new URLSearchParams({ isActive: 'true', limit: '100' });
        const companiesParams = new URLSearchParams({ limit: '50' });
        const partialsParams = new URLSearchParams({ all: 'true' });

        const [templatesRes, companiesRes, partialsRes] = await Promise.all([
          fetch(`/api/document-templates?${templatesParams}`),
          fetch(`/api/companies/options?${companiesParams}`),
          fetch(`/api/template-partials?${partialsParams}`),
        ]);

        if (!templatesRes.ok) {
          throw new Error('Failed to fetch templates');
        }
        if (!companiesRes.ok) {
          throw new Error('Failed to fetch companies');
        }

        const templatesData = await templatesRes.json();
        const companiesData = await companiesRes.json();
        const partialsData = partialsRes.ok ? await partialsRes.json() : { partials: [] };

        setTemplates(templatesData.templates || []);
        setCompanies((companiesData.options || []).map((company: {
          id: string;
          name: string;
          uen?: string | null;
        }) => ({
          id: company.id,
          name: company.name,
          uen: company.uen || '',
          status: '',
        })));
        setPartials(partialsData.partials || []);
      } catch (err) {
        console.error('Fetch error:', err);
        setError(err instanceof Error ? err.message : 'Failed to load data');
      } finally {
        setIsLoading(false);
      }
    };

    fetchData();
  }, []);

  // Handle document generation
  const handleGenerate = useCallback(
    async (data: GenerateDocumentData): Promise<GeneratedDocumentResult> => {
      const requestBody: Record<string, unknown> = {
        templateId: data.templateId,
        companyId: data.companyId,
        title: data.title,
        customData: data.customData,
        useLetterhead: data.useLetterhead,
        editedContent: data.editedContent,
        status: 'FINALIZED', // Set as finalized by default
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

      // Redirect to view page
      router.push(`/generated-documents/${result.id}`);

      return {
        id: result.id,
        title: result.title,
        content: result.content,
        status: result.status,
        missingPlaceholders: result.metadata?.missingPlaceholders,
      };
    },
    [success, router]
  );

  // Handle template preview
  const handlePreviewTemplate = useCallback((template: DocumentTemplate) => {
    // Open template preview in modal or new tab
    window.open(`/api/document-templates/${template.id}/preview`, '_blank');
  }, []);

  // Handle validation
  const handleValidate = useCallback(
    async (templateId: string, companyId: string | undefined, customData: Record<string, string>) => {
      try {
        const requestBody: Record<string, unknown> = {
          templateId,
          companyId,
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
    <div className="p-4 sm:p-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="text-xl sm:text-2xl font-semibold text-text-primary">
            Generate Document
          </h1>
          <p className="text-sm text-text-secondary mt-1">
            Create a new document from a template
          </p>
        </div>
      </div>

      {/* Content */}
      <div>
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
            partials={partials}
            onGenerate={handleGenerate}
            onPreviewTemplate={handlePreviewTemplate}
            onValidate={handleValidate}
            isLoading={isLoading}
          />
        )}
      </div>
    </div>
  );
}
