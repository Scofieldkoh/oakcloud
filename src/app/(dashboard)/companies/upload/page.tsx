'use client';

import { useState, useCallback, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { useDropzone } from 'react-dropzone';
import {
  ArrowLeft,
  FileUp,
  File,
  X,
  AlertCircle,
  CheckCircle,
  Loader2,
  Building2,
  Sparkles,
  RefreshCw,
} from 'lucide-react';
import { useSession } from '@/hooks/use-auth';
import { useCompany } from '@/hooks/use-companies';
import { TenantSelector, useActiveTenantId } from '@/components/ui/tenant-selector';
import { AIModelSelector, buildFullContext } from '@/components/ui/ai-model-selector';

type UploadStep = 'upload' | 'extracting' | 'preview' | 'diff-preview' | 'saving' | 'complete';

interface DiffEntry {
  field: string;
  label: string;
  oldValue: string | number | null | undefined;
  newValue: string | number | null | undefined;
  category: 'entity' | 'ssic' | 'address' | 'compliance' | 'capital';
}

interface DiffResult {
  hasDifferences: boolean;
  differences: DiffEntry[];
  existingCompany: { name: string; uen: string };
}

interface ExtractedData {
  entityDetails: {
    uen: string;
    name: string;
    entityType: string;
    status: string;
    incorporationDate?: string;
  };
  ssicActivities?: {
    primary?: { code: string; description: string };
    secondary?: { code: string; description: string };
  };
  officers?: Array<{
    name: string;
    role: string;
    appointmentDate?: string;
  }>;
  shareholders?: Array<{
    name: string;
    numberOfShares: number;
    percentageHeld?: number;
  }>;
  registeredAddress?: {
    fullAddress?: string;
    postalCode: string;
    streetName: string;
  };
}

// AI metadata from extraction
interface AIMetadata {
  modelUsed: string;
  modelName?: string;
  providerUsed: string;
  usage?: {
    inputTokens: number;
    outputTokens: number;
    totalTokens: number;
  };
  estimatedCost?: number;
  formattedCost?: string;
}

export default function UploadBizFilePage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { data: session } = useSession();
  const [file, setFile] = useState<File | null>(null);
  const [step, setStep] = useState<UploadStep>('upload');
  const [error, setError] = useState<string | null>(null);
  const [extractedData, setExtractedData] = useState<ExtractedData | null>(null);
  const [documentId, setDocumentId] = useState<string | null>(null);
  const [companyId, setCompanyId] = useState<string | null>(null);
  const [aiMetadata, setAiMetadata] = useState<AIMetadata | null>(null);
  const [diffResult, setDiffResult] = useState<DiffResult | null>(null);
  const [updatedFields, setUpdatedFields] = useState<string[]>([]);

  // Check if updating an existing company
  const existingCompanyId = searchParams.get('companyId');
  const { data: existingCompany } = useCompany(existingCompanyId || '');
  const isUpdateMode = !!existingCompanyId;

  // SUPER_ADMIN tenant selection
  const isSuperAdmin = session?.isSuperAdmin ?? false;
  const [selectedTenantId, setSelectedTenantId] = useState('');
  const activeTenantId = useActiveTenantId(isSuperAdmin, selectedTenantId, session?.tenantId);

  // AI model selection and context
  const [selectedModelId, setSelectedModelId] = useState('');
  const [aiContext, setAiContext] = useState('');
  const [selectedStandardContexts, setSelectedStandardContexts] = useState<string[]>([]);

  const onDrop = useCallback((acceptedFiles: File[]) => {
    if (acceptedFiles.length > 0) {
      setFile(acceptedFiles[0]);
      setError(null);
    }
  }, []);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      'application/pdf': ['.pdf'],
      'image/png': ['.png'],
      'image/jpeg': ['.jpg', '.jpeg'],
      'image/webp': ['.webp'],
    },
    maxSize: 10 * 1024 * 1024, // 10MB
    multiple: false,
  });

  const handleUploadAndExtract = async () => {
    if (!file) return;

    // SUPER_ADMIN must select a tenant
    if (isSuperAdmin && !activeTenantId) {
      setError('Please select a tenant before uploading');
      return;
    }

    setError(null);
    setStep('extracting');

    try {
      // First, create a temporary company or use existing flow
      // For now, we'll upload to a "pending" endpoint and extract
      const formData = new FormData();
      formData.append('file', file);
      formData.append('documentType', 'BIZFILE');
      // Include tenantId for SUPER_ADMIN
      if (isSuperAdmin && activeTenantId) {
        formData.append('tenantId', activeTenantId);
      }

      // Upload and get document ID
      const uploadResponse = await fetch('/api/documents/upload', {
        method: 'POST',
        body: formData,
      });

      if (!uploadResponse.ok) {
        const err = await uploadResponse.json();
        throw new Error(err.error || 'Failed to upload file');
      }

      const { documentId: docId } = await uploadResponse.json();
      setDocumentId(docId);

      // Build full context from standard contexts and custom text
      const fullContext = buildFullContext(selectedStandardContexts, aiContext);

      // For update mode, use the diff preview endpoint
      if (isUpdateMode && existingCompanyId) {
        const diffResponse = await fetch(`/api/documents/${docId}/preview-diff`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            companyId: existingCompanyId,
            modelId: selectedModelId || undefined,
            additionalContext: fullContext || undefined,
          }),
        });

        if (!diffResponse.ok) {
          const err = await diffResponse.json();
          throw new Error(err.error || 'Failed to extract and compare data');
        }

        const { extractedData: data, diff, aiMetadata: metadata } = await diffResponse.json();
        setExtractedData(data);
        setDiffResult(diff);
        setCompanyId(existingCompanyId);
        setAiMetadata(metadata);
        setStep('diff-preview');
      } else {
        // Normal create mode - extract and save
        const extractResponse = await fetch(`/api/documents/${docId}/extract`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            modelId: selectedModelId || undefined,
            additionalContext: fullContext || undefined,
          }),
        });

        if (!extractResponse.ok) {
          const err = await extractResponse.json();
          throw new Error(err.error || 'Failed to extract data');
        }

        const { extractedData: data, companyId: cId, aiMetadata: metadata } = await extractResponse.json();
        setExtractedData(data);
        setCompanyId(cId);
        setAiMetadata(metadata);
        setStep('preview');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
      setStep('upload');
    }
  };

  const handleConfirm = async () => {
    if (!documentId) return;

    setStep('saving');
    setError(null);

    try {
      // Confirm and save the extracted data
      const response = await fetch(`/api/documents/${documentId}/confirm`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ extractedData }),
      });

      if (!response.ok) {
        const err = await response.json();
        throw new Error(err.error || 'Failed to save data');
      }

      const { companyId: cId } = await response.json();
      setCompanyId(cId);
      setStep('complete');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
      setStep('preview');
    }
  };

  const handleApplyUpdate = async () => {
    if (!documentId || !companyId || !extractedData) return;

    setStep('saving');
    setError(null);

    try {
      // Apply selective update with only changed fields
      const response = await fetch(`/api/documents/${documentId}/apply-update`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          companyId,
          extractedData,
        }),
      });

      if (!response.ok) {
        const err = await response.json();
        throw new Error(err.error || 'Failed to apply update');
      }

      const { updatedFields: fields } = await response.json();
      setUpdatedFields(fields || []);
      setStep('complete');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
      setStep('diff-preview');
    }
  };

  const handleReset = () => {
    setFile(null);
    setStep('upload');
    setError(null);
    setExtractedData(null);
    setDocumentId(null);
    setCompanyId(null);
    setAiMetadata(null);
    setAiContext('');
    setSelectedStandardContexts([]);
    setDiffResult(null);
    setUpdatedFields([]);
  };

  return (
    <div className="p-4 sm:p-6 max-w-4xl">
      {/* Header */}
      <div className="mb-6">
        <Link
          href={isUpdateMode ? `/companies/${existingCompanyId}` : '/companies'}
          className="inline-flex items-center gap-2 text-sm text-text-secondary hover:text-text-primary mb-3 transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          {isUpdateMode ? 'Back to Company' : 'Back to Companies'}
        </Link>
        <h1 className="text-xl sm:text-2xl font-semibold text-text-primary flex items-center gap-3">
          {isUpdateMode ? (
            <>
              <RefreshCw className="w-6 h-6 text-oak-primary" />
              Update via BizFile
            </>
          ) : (
            'Upload BizFile'
          )}
        </h1>
        <p className="text-sm text-text-secondary mt-1">
          {isUpdateMode ? (
            <>Upload a new BizFile to update company information. Existing data will be overwritten with extracted data.</>
          ) : (
            <>Upload an ACRA BizFile document (PDF or image) to automatically extract company information using AI vision.</>
          )}
        </p>
      </div>

      {/* Update Mode Notice */}
      {isUpdateMode && existingCompany && (
        <div className="card p-4 border-oak-primary/50 bg-oak-primary/5 mb-6">
          <div className="flex items-start gap-3">
            <Building2 className="w-5 h-5 text-oak-primary flex-shrink-0 mt-0.5" />
            <div>
              <p className="font-medium text-text-primary">
                Updating: {existingCompany.name}
              </p>
              <p className="text-sm text-text-secondary mt-1">
                UEN: {existingCompany.uen} • This upload will update the existing company record and its related data (officers, shareholders, addresses).
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Tenant Selector for SUPER_ADMIN */}
      {isSuperAdmin && (
        <TenantSelector
          value={selectedTenantId}
          onChange={setSelectedTenantId}
          helpText="As a Super Admin, please select a tenant to upload the BizFile under."
        />
      )}

      {/* Error */}
      {error && (
        <div className="card p-4 border-status-error bg-status-error/5 mb-6">
          <div className="flex items-center gap-3 text-status-error">
            <AlertCircle className="w-5 h-5" />
            <p>{error}</p>
          </div>
        </div>
      )}

      {/* Step: Upload */}
      {step === 'upload' && (
        <div className="space-y-6">
          <div
            {...getRootProps()}
            className={`card p-12 text-center border-2 border-dashed cursor-pointer transition-colors ${
              isDragActive
                ? 'border-oak-primary bg-oak-primary/5'
                : 'border-border-secondary hover:border-oak-primary/50'
            }`}
          >
            <input {...getInputProps()} />
            <FileUp className="w-12 h-12 text-text-muted mx-auto mb-4" />
            <h3 className="text-lg font-medium text-text-primary mb-2">
              {isDragActive ? 'Drop the file here' : 'Drag & drop your BizFile document'}
            </h3>
            <p className="text-text-secondary mb-4">
              or click to browse your files
            </p>
            <p className="text-sm text-text-tertiary">PDF or image files (PNG, JPG), max 10MB</p>
          </div>

          {file && (
            <div className="card p-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <File className="w-8 h-8 text-oak-light" />
                  <div>
                    <p className="font-medium text-text-primary">{file.name}</p>
                    <p className="text-sm text-text-tertiary">
                      {(file.size / 1024 / 1024).toFixed(2)} MB
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => setFile(null)}
                  className="p-2 hover:bg-background-elevated rounded text-text-tertiary hover:text-text-primary"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}

          {/* AI Model Selector with Context */}
          <AIModelSelector
            value={selectedModelId}
            onChange={setSelectedModelId}
            label="AI Model for Extraction"
            helpText="Select the AI model to use for extracting data from the BizFile."
            jsonModeOnly
            showContextInput
            contextValue={aiContext}
            onContextChange={setAiContext}
            contextLabel="Additional Context (Optional)"
            contextPlaceholder="E.g., 'Focus on shareholder details' or 'This is a newly incorporated company'"
            contextHelpText="Provide hints to help the AI extract data more accurately."
            showStandardContexts
            selectedStandardContexts={selectedStandardContexts}
            onStandardContextsChange={setSelectedStandardContexts}
          />

          <div className="flex items-center justify-end gap-3">
            <Link href="/companies" className="btn-secondary btn-sm">
              Cancel
            </Link>
            <button
              onClick={handleUploadAndExtract}
              disabled={!file || (isSuperAdmin && !activeTenantId)}
              className="btn-primary btn-sm flex items-center gap-2"
            >
              <FileUp className="w-4 h-4" />
              Upload & Extract
            </button>
          </div>
        </div>
      )}

      {/* Step: Extracting */}
      {step === 'extracting' && (
        <div className="card p-12 text-center">
          <Loader2 className="w-12 h-12 text-oak-primary mx-auto mb-4 animate-spin" />
          <h3 className="text-lg font-medium text-text-primary mb-2">
            Extracting Information...
          </h3>
          <p className="text-text-secondary">
            AI is analyzing your BizFile document. This may take a moment.
          </p>
        </div>
      )}

      {/* Step: Preview */}
      {step === 'preview' && extractedData && (
        <div className="space-y-6">
          <div className="card p-4 bg-status-success/5 border-status-success">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3 text-status-success">
                <CheckCircle className="w-5 h-5" />
                <p className="font-medium">Successfully extracted data from BizFile</p>
              </div>
              {aiMetadata && (
                <div className="flex items-center gap-2 text-xs text-text-secondary">
                  <Sparkles className="w-3 h-3" />
                  <span>
                    {aiMetadata.modelName || aiMetadata.modelUsed} ({aiMetadata.providerUsed})
                    {aiMetadata.usage && (
                      <span className="ml-1 text-text-muted">
                        • {aiMetadata.usage.totalTokens.toLocaleString()} tokens
                      </span>
                    )}
                    {aiMetadata.formattedCost && (
                      <span className="ml-1 text-text-muted">
                        • Est. {aiMetadata.formattedCost}
                      </span>
                    )}
                  </span>
                </div>
              )}
            </div>
          </div>

          <div className="card">
            <div className="p-4 border-b border-border-primary">
              <h2 className="font-medium text-text-primary">Extracted Company Information</h2>
              <p className="text-sm text-text-tertiary mt-1">
                Review the extracted data before saving
              </p>
            </div>

            <div className="divide-y divide-border-primary">
              {/* Entity Details */}
              <div className="p-4">
                <h3 className="text-sm font-medium text-text-tertiary uppercase mb-3">
                  Entity Details
                </h3>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <p className="text-xs text-text-muted">UEN</p>
                    <p className="text-text-primary">{extractedData.entityDetails.uen}</p>
                  </div>
                  <div>
                    <p className="text-xs text-text-muted">Name</p>
                    <p className="text-text-primary">{extractedData.entityDetails.name}</p>
                  </div>
                  <div>
                    <p className="text-xs text-text-muted">Entity Type</p>
                    <p className="text-text-primary">
                      {extractedData.entityDetails.entityType?.replace(/_/g, ' ')}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-text-muted">Status</p>
                    <p className="text-text-primary">
                      {extractedData.entityDetails.status?.replace(/_/g, ' ')}
                    </p>
                  </div>
                </div>
              </div>

              {/* Business Activity */}
              {extractedData.ssicActivities?.primary && (
                <div className="p-4">
                  <h3 className="text-sm font-medium text-text-tertiary uppercase mb-3">
                    Business Activity
                  </h3>
                  <div className="space-y-2">
                    <div>
                      <p className="text-xs text-text-muted">Primary</p>
                      <p className="text-text-primary">
                        <code className="text-xs bg-background-elevated px-1.5 py-0.5 rounded mr-2">
                          {extractedData.ssicActivities.primary.code}
                        </code>
                        {extractedData.ssicActivities.primary.description}
                      </p>
                    </div>
                    {extractedData.ssicActivities.secondary && (
                      <div>
                        <p className="text-xs text-text-muted">Secondary</p>
                        <p className="text-text-primary">
                          <code className="text-xs bg-background-elevated px-1.5 py-0.5 rounded mr-2">
                            {extractedData.ssicActivities.secondary.code}
                          </code>
                          {extractedData.ssicActivities.secondary.description}
                        </p>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Officers */}
              {extractedData.officers && extractedData.officers.length > 0 && (
                <div className="p-4">
                  <h3 className="text-sm font-medium text-text-tertiary uppercase mb-3">
                    Officers ({extractedData.officers.length})
                  </h3>
                  <div className="space-y-2">
                    {extractedData.officers.slice(0, 5).map((officer, i) => (
                      <div key={i} className="flex items-center justify-between">
                        <p className="text-text-primary">{officer.name}</p>
                        <span className="text-sm text-text-tertiary">
                          {officer.role?.replace(/_/g, ' ')}
                        </span>
                      </div>
                    ))}
                    {extractedData.officers.length > 5 && (
                      <p className="text-sm text-text-muted">
                        +{extractedData.officers.length - 5} more
                      </p>
                    )}
                  </div>
                </div>
              )}

              {/* Shareholders */}
              {extractedData.shareholders && extractedData.shareholders.length > 0 && (
                <div className="p-4">
                  <h3 className="text-sm font-medium text-text-tertiary uppercase mb-3">
                    Shareholders ({extractedData.shareholders.length})
                  </h3>
                  <div className="space-y-2">
                    {extractedData.shareholders.slice(0, 5).map((sh, i) => (
                      <div key={i} className="flex items-center justify-between">
                        <p className="text-text-primary">{sh.name}</p>
                        <span className="text-sm text-text-tertiary">
                          {sh.numberOfShares?.toLocaleString()} shares
                          {sh.percentageHeld && ` (${sh.percentageHeld}%)`}
                        </span>
                      </div>
                    ))}
                    {extractedData.shareholders.length > 5 && (
                      <p className="text-sm text-text-muted">
                        +{extractedData.shareholders.length - 5} more
                      </p>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>

          <div className="flex items-center justify-between">
            <button onClick={handleReset} className="btn-ghost btn-sm">
              Upload Different File
            </button>
            <div className="flex items-center gap-3">
              <Link href="/companies" className="btn-secondary btn-sm">
                Cancel
              </Link>
              <button onClick={handleConfirm} className="btn-primary btn-sm flex items-center gap-2">
                <CheckCircle className="w-4 h-4" />
                Confirm & Save
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Step: Diff Preview (Update Mode) */}
      {step === 'diff-preview' && extractedData && diffResult && (
        <div className="space-y-6">
          <div className="card p-4 bg-status-success/5 border-status-success">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3 text-status-success">
                <CheckCircle className="w-5 h-5" />
                <p className="font-medium">Successfully extracted data from BizFile</p>
              </div>
              {aiMetadata && (
                <div className="flex items-center gap-2 text-xs text-text-secondary">
                  <Sparkles className="w-3 h-3" />
                  <span>
                    {aiMetadata.modelName || aiMetadata.modelUsed} ({aiMetadata.providerUsed})
                    {aiMetadata.usage && (
                      <span className="ml-1 text-text-muted">
                        • {aiMetadata.usage.totalTokens.toLocaleString()} tokens
                      </span>
                    )}
                    {aiMetadata.formattedCost && (
                      <span className="ml-1 text-text-muted">
                        • Est. {aiMetadata.formattedCost}
                      </span>
                    )}
                  </span>
                </div>
              )}
            </div>
          </div>

          <div className="card">
            <div className="p-4 border-b border-border-primary">
              <h2 className="font-medium text-text-primary flex items-center gap-2">
                <RefreshCw className="w-4 h-4 text-oak-primary" />
                Changes to Apply
              </h2>
              <p className="text-sm text-text-tertiary mt-1">
                Comparing extracted data with {diffResult.existingCompany.name} ({diffResult.existingCompany.uen})
              </p>
            </div>

            {diffResult.hasDifferences ? (
              <div className="divide-y divide-border-primary">
                {/* Group differences by category */}
                {(['entity', 'ssic', 'address', 'compliance', 'capital'] as const).map((category) => {
                  const categoryDiffs = diffResult.differences.filter((d) => d.category === category);
                  if (categoryDiffs.length === 0) return null;

                  const categoryLabels = {
                    entity: 'Entity Details',
                    ssic: 'Business Activity',
                    address: 'Address',
                    compliance: 'Compliance',
                    capital: 'Share Capital',
                  };

                  return (
                    <div key={category} className="p-4">
                      <h3 className="text-xs font-medium text-text-tertiary uppercase mb-3">
                        {categoryLabels[category]}
                      </h3>
                      <div className="space-y-3">
                        {categoryDiffs.map((diff, idx) => (
                          <div key={idx} className="grid grid-cols-3 gap-4 text-sm">
                            <div className="text-text-secondary font-medium">{diff.label}</div>
                            <div className="text-status-error bg-status-error/5 px-2 py-1 rounded line-through">
                              {diff.oldValue || <span className="text-text-muted italic">Not set</span>}
                            </div>
                            <div className="text-status-success bg-status-success/5 px-2 py-1 rounded">
                              {diff.newValue || <span className="text-text-muted italic">Not set</span>}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="p-8 text-center">
                <CheckCircle className="w-10 h-10 text-status-success mx-auto mb-3" />
                <p className="text-text-primary font-medium">No changes detected</p>
                <p className="text-sm text-text-secondary mt-1">
                  The company data is already up to date with this BizFile.
                </p>
              </div>
            )}
          </div>

          {/* Officers and Shareholders info */}
          {(extractedData.officers?.length || extractedData.shareholders?.length) && (
            <div className="card p-4 bg-status-info/5 border-status-info/30">
              <div className="flex items-start gap-3">
                <AlertCircle className="w-5 h-5 text-status-info flex-shrink-0 mt-0.5" />
                <div className="text-sm">
                  <p className="font-medium text-text-primary">Note about Officers and Shareholders</p>
                  <p className="text-text-secondary mt-1">
                    This update focuses on company-level data. Officer and shareholder changes are handled separately
                    and will not be modified by this update. Use the company detail page to manage officers and shareholders.
                  </p>
                </div>
              </div>
            </div>
          )}

          <div className="flex items-center justify-between">
            <button onClick={handleReset} className="btn-ghost btn-sm">
              Upload Different File
            </button>
            <div className="flex items-center gap-3">
              <Link href={`/companies/${companyId}`} className="btn-secondary btn-sm">
                Cancel
              </Link>
              <button
                onClick={handleApplyUpdate}
                disabled={!diffResult.hasDifferences}
                className="btn-primary btn-sm flex items-center gap-2"
              >
                <CheckCircle className="w-4 h-4" />
                {diffResult.hasDifferences
                  ? `Apply ${diffResult.differences.length} Change${diffResult.differences.length > 1 ? 's' : ''}`
                  : 'No Changes to Apply'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Step: Saving */}
      {step === 'saving' && (
        <div className="card p-12 text-center">
          <Loader2 className="w-12 h-12 text-oak-primary mx-auto mb-4 animate-spin" />
          <h3 className="text-lg font-medium text-text-primary mb-2">
            {isUpdateMode ? 'Updating Company...' : 'Saving Data...'}
          </h3>
          <p className="text-text-secondary">
            {isUpdateMode
              ? 'Applying changes to company record.'
              : 'Creating company record and linking contacts.'}
          </p>
        </div>
      )}

      {/* Step: Complete */}
      {step === 'complete' && (
        <div className="card p-12 text-center">
          <CheckCircle className="w-12 h-12 text-status-success mx-auto mb-4" />
          <h3 className="text-lg font-medium text-text-primary mb-2">
            {isUpdateMode ? 'Company Updated Successfully!' : 'Company Created Successfully!'}
          </h3>
          <p className="text-text-secondary mb-6">
            {isUpdateMode ? (
              updatedFields.length > 0 ? (
                <>Updated {updatedFields.length} field{updatedFields.length > 1 ? 's' : ''}: {updatedFields.join(', ')}</>
              ) : (
                <>No changes were needed - company data was already up to date.</>
              )
            ) : (
              <>The company and all related data have been saved.</>
            )}
          </p>
          <div className="flex items-center justify-center gap-3">
            <button onClick={handleReset} className="btn-secondary btn-sm">
              Upload Another
            </button>
            {companyId && (
              <Link
                href={`/companies/${companyId}`}
                className="btn-primary btn-sm flex items-center gap-2"
              >
                <Building2 className="w-4 h-4" />
                View Company
              </Link>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
