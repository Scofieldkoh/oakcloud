'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, Loader2, AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/toast';
import {
  DocumentGenerationWizard,
  type GenerateDocumentData,
  type GeneratedDocumentResult,
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
  const { success, error: toastError } = useToast();

  // State
  const [templates, setTemplates] = useState<DocumentTemplate[]>([]);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Fetch templates and companies
  useEffect(() => {
    const fetchData = async () => {
      setIsLoading(true);
      setError(null);

      try {
        const [templatesRes, companiesRes] = await Promise.all([
          fetch('/api/document-templates?isActive=true&limit=100'),
          fetch('/api/companies?limit=100&sortBy=name&sortOrder=asc'),
        ]);

        if (!templatesRes.ok) {
          throw new Error('Failed to fetch templates');
        }
        if (!companiesRes.ok) {
          throw new Error('Failed to fetch companies');
        }

        const templatesData = await templatesRes.json();
        const companiesData = await companiesRes.json();

        setTemplates(templatesData.templates || []);
        setCompanies(companiesData.companies || []);
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
      const response = await fetch('/api/generated-documents', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          templateId: data.templateId,
          companyId: data.companyId,
          title: data.title,
          customData: data.customData,
          useLetterhead: data.useLetterhead,
          shareExpiryHours: data.shareExpiryHours,
        }),
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
    [success]
  );

  // Handle template preview
  const handlePreviewTemplate = useCallback((template: DocumentTemplate) => {
    // Open template preview in modal or new tab
    window.open(`/api/document-templates/${template.id}/preview`, '_blank');
  }, []);

  // Handle validation
  const handleValidate = useCallback(
    async (templateId: string, companyId: string) => {
      try {
        const response = await fetch('/api/generated-documents/validate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ templateId, companyId }),
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
    <div className="min-h-screen bg-background-primary">
      {/* Header */}
      <div className="border-b border-border-primary bg-background-secondary">
        <div className="max-w-6xl mx-auto px-6 py-4">
          <div className="flex items-center gap-4">
            <Link href="/generated-documents">
              <Button variant="ghost" size="sm">
                <ArrowLeft className="w-4 h-4 mr-2" />
                Back
              </Button>
            </Link>
            <div className="h-6 w-px bg-border-secondary" />
            <div>
              <h1 className="text-xl font-semibold text-text-primary">
                Generate Document
              </h1>
              <p className="text-sm text-text-muted">
                Create a new document from a template
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-6xl mx-auto px-6 py-8">
        {/* Loading state */}
        {isLoading && (
          <div className="flex flex-col items-center justify-center py-16">
            <Loader2 className="w-10 h-10 animate-spin text-accent-primary mb-4" />
            <p className="text-text-muted">Loading templates and companies...</p>
          </div>
        )}

        {/* Error state */}
        {error && (
          <div className="max-w-md mx-auto py-16">
            <div className="p-6 bg-red-50 dark:bg-red-950 border border-red-200 dark:border-red-800 rounded-lg text-center">
              <AlertCircle className="w-12 h-12 mx-auto text-red-500 mb-4" />
              <h3 className="text-lg font-medium text-red-700 dark:text-red-400 mb-2">
                Failed to Load Data
              </h3>
              <p className="text-red-600 dark:text-red-400 mb-4">{error}</p>
              <Button
                variant="secondary"
                onClick={() => window.location.reload()}
              >
                Retry
              </Button>
            </div>
          </div>
        )}

        {/* No templates */}
        {!isLoading && !error && templates.length === 0 && (
          <div className="max-w-md mx-auto py-16 text-center">
            <AlertCircle className="w-12 h-12 mx-auto text-amber-500 mb-4" />
            <h3 className="text-lg font-medium text-text-primary mb-2">
              No Templates Available
            </h3>
            <p className="text-text-muted mb-4">
              You need to create document templates before generating documents.
            </p>
            <Link href="/document-templates/new">
              <Button variant="primary">Create Template</Button>
            </Link>
          </div>
        )}

        {/* Wizard */}
        {!isLoading && !error && templates.length > 0 && (
          <DocumentGenerationWizard
            templates={templates}
            companies={companies}
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
