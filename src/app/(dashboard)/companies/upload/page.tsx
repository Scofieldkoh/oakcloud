'use client';

import { useState, useCallback } from 'react';
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
  Users,
  UserPlus,
  UserMinus,
  UserCheck,
  Calendar,
  Briefcase,
  PieChart,
} from 'lucide-react';
import { useSession } from '@/hooks/use-auth';
import { useCompany } from '@/hooks/use-companies';
import { useActiveTenantId } from '@/components/ui/tenant-selector';
import { AIModelSelector, buildFullContext } from '@/components/ui/ai-model-selector';

type UploadStep = 'upload' | 'extracting' | 'preview' | 'diff-preview' | 'saving' | 'complete';

interface DiffEntry {
  field: string;
  label: string;
  oldValue: string | number | null | undefined;
  newValue: string | number | null | undefined;
  category: 'entity' | 'ssic' | 'address' | 'compliance' | 'capital';
}

interface OfficerDiffEntry {
  type: 'added' | 'updated' | 'potentially_ceased';
  officerId?: string;
  name: string;
  role: string;
  changes?: Array<{ field: string; label: string; oldValue: string | null; newValue: string | null }>;
  extractedData?: {
    name: string;
    role: string;
    appointmentDate?: string;
  };
  matchConfidence?: 'high' | 'medium' | 'low';
}

interface ShareholderDiffEntry {
  type: 'added' | 'removed' | 'updated';
  shareholderId?: string;
  name: string;
  shareholderType: 'INDIVIDUAL' | 'CORPORATE';
  changes?: Array<{ field: string; label: string; oldValue: string | number | null; newValue: string | number | null }>;
  shareholdingChanges?: {
    shareClass?: { old: string; new: string };
    numberOfShares?: { old: number; new: number };
  };
  extractedData?: {
    name: string;
    type: 'INDIVIDUAL' | 'CORPORATE';
    shareClass: string;
    numberOfShares: number;
    percentageHeld?: number;
  };
  matchConfidence?: 'high' | 'medium' | 'low';
}

interface OfficerAction {
  officerId: string;
  action: 'cease' | 'follow_up';
  cessationDate?: string;
}

interface DiffResult {
  hasDifferences: boolean;
  differences: DiffEntry[];
  existingCompany: { name: string; uen: string };
  officerDiffs?: OfficerDiffEntry[];
  shareholderDiffs?: ShareholderDiffEntry[];
  summary?: {
    officersAdded: number;
    officersUpdated: number;
    officersPotentiallyCeased: number;
    shareholdersAdded: number;
    shareholdersUpdated: number;
    shareholdersRemoved: number;
  };
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
  const _router = useRouter();
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
  const [officerActions, setOfficerActions] = useState<OfficerAction[]>([]);
  const [officerChanges, setOfficerChanges] = useState<{ added: number; updated: number; ceased: number; followUp: number } | null>(null);
  const [shareholderChanges, setShareholderChanges] = useState<{ added: number; updated: number; removed: number } | null>(null);
  const [companyUpdatedAt, setCompanyUpdatedAt] = useState<string | null>(null); // For concurrent update detection
  const [concurrentUpdateWarning, setConcurrentUpdateWarning] = useState<string | null>(null);

  // Check if updating an existing company
  const existingCompanyId = searchParams.get('companyId');
  const { data: existingCompany } = useCompany(existingCompanyId || '');
  const isUpdateMode = !!existingCompanyId;

  // SUPER_ADMIN tenant selection (from centralized store)
  const isSuperAdmin = session?.isSuperAdmin ?? false;
  const activeTenantId = useActiveTenantId(isSuperAdmin, session?.tenantId);

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

        const { extractedData: data, diff, aiMetadata: metadata, companyUpdatedAt: updatedAt } = await diffResponse.json();
        setExtractedData(data);
        setDiffResult(diff);
        setCompanyId(existingCompanyId);
        setAiMetadata(metadata);
        setCompanyUpdatedAt(updatedAt); // Store for concurrent update detection
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
          officerActions: officerActions.length > 0 ? officerActions : undefined,
          expectedUpdatedAt: companyUpdatedAt || undefined, // For concurrent update detection
        }),
      });

      if (!response.ok) {
        const err = await response.json();
        throw new Error(err.error || 'Failed to apply update');
      }

      const result = await response.json();
      setUpdatedFields(result.updatedFields || []);
      setOfficerChanges(result.officerChanges || null);
      setShareholderChanges(result.shareholderChanges || null);
      setConcurrentUpdateWarning(result.concurrentUpdateWarning || null);
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
    setOfficerActions([]);
    setOfficerChanges(null);
    setShareholderChanges(null);
    setCompanyUpdatedAt(null);
    setConcurrentUpdateWarning(null);
  };

  // Handle officer action change (for potentially ceased officers)
  const handleOfficerActionChange = (officerId: string, action: 'cease' | 'follow_up', cessationDate?: string) => {
    setOfficerActions((prev) => {
      const existing = prev.find((a) => a.officerId === officerId);
      if (existing) {
        return prev.map((a) =>
          a.officerId === officerId ? { ...a, action, cessationDate } : a
        );
      }
      return [...prev, { officerId, action, cessationDate }];
    });
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
        <h1 className="text-xl sm:text-2xl font-semibold text-text-primary">
          {isUpdateMode ? 'Update via BizFile' : 'Upload BizFile'}
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

      {/* Tenant context info for SUPER_ADMIN */}
      {isSuperAdmin && !activeTenantId && (
        <div className="mb-4 p-3 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg">
          <p className="text-sm text-amber-800 dark:text-amber-200">
            Please select a tenant from the sidebar to upload a BizFile.
          </p>
        </div>
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
            tenantId={activeTenantId || undefined}
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
              // Only show "no changes" if there are also no officer/shareholder diffs
              (!diffResult.officerDiffs?.length && !diffResult.shareholderDiffs?.length) && (
                <div className="p-8 text-center">
                  <CheckCircle className="w-10 h-10 text-status-success mx-auto mb-3" />
                  <p className="text-text-primary font-medium">No changes detected</p>
                  <p className="text-sm text-text-secondary mt-1">
                    The company data is already up to date with this BizFile.
                  </p>
                </div>
              )
            )}
          </div>

          {/* Officer Diffs */}
          {diffResult.officerDiffs && diffResult.officerDiffs.length > 0 && (
            <div className="card">
              <div className="p-4 border-b border-border-primary">
                <h2 className="font-medium text-text-primary flex items-center gap-2">
                  <Users className="w-4 h-4 text-oak-primary" />
                  Officer Changes
                </h2>
                <p className="text-sm text-text-tertiary mt-1">
                  {diffResult.summary?.officersAdded || 0} new, {diffResult.summary?.officersUpdated || 0} updated, {diffResult.summary?.officersPotentiallyCeased || 0} potentially ceased
                </p>
              </div>
              <div className="divide-y divide-border-primary">
                {diffResult.officerDiffs.map((officer, idx) => (
                  <div key={idx} className="p-4">
                    <div className="flex items-start justify-between">
                      <div className="flex items-center gap-3">
                        {officer.type === 'added' && (
                          <div className="w-8 h-8 rounded-full bg-status-success/10 flex items-center justify-center">
                            <UserPlus className="w-4 h-4 text-status-success" />
                          </div>
                        )}
                        {officer.type === 'updated' && (
                          <div className="w-8 h-8 rounded-full bg-status-info/10 flex items-center justify-center">
                            <UserCheck className="w-4 h-4 text-status-info" />
                          </div>
                        )}
                        {officer.type === 'potentially_ceased' && (
                          <div className="w-8 h-8 rounded-full bg-status-warning/10 flex items-center justify-center">
                            <UserMinus className="w-4 h-4 text-status-warning" />
                          </div>
                        )}
                        <div>
                          <p className="font-medium text-text-primary">{officer.name}</p>
                          <div className="flex items-center gap-2 text-sm text-text-secondary">
                            <Briefcase className="w-3 h-3" />
                            <span>{officer.role?.replace(/_/g, ' ')}</span>
                            {officer.matchConfidence && (
                              <span className={`text-xs px-1.5 py-0.5 rounded ${
                                officer.matchConfidence === 'high' ? 'bg-status-success/10 text-status-success' :
                                officer.matchConfidence === 'medium' ? 'bg-status-warning/10 text-status-warning' :
                                'bg-status-error/10 text-status-error'
                              }`}>
                                {officer.matchConfidence} match
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                      <span className={`text-xs font-medium px-2 py-1 rounded ${
                        officer.type === 'added' ? 'bg-status-success/10 text-status-success' :
                        officer.type === 'updated' ? 'bg-status-info/10 text-status-info' :
                        'bg-status-warning/10 text-status-warning'
                      }`}>
                        {officer.type === 'added' ? 'New' : officer.type === 'updated' ? 'Updated' : 'Not in BizFile'}
                      </span>
                    </div>

                    {/* Show changes for updated officers */}
                    {officer.type === 'updated' && officer.changes && officer.changes.length > 0 && (
                      <div className="mt-3 ml-11 space-y-2">
                        {officer.changes.map((change, cIdx) => (
                          <div key={cIdx} className="grid grid-cols-3 gap-4 text-sm">
                            <div className="text-text-secondary">{change.label}</div>
                            <div className="text-status-error bg-status-error/5 px-2 py-1 rounded line-through">
                              {change.oldValue || <span className="text-text-muted italic">Not set</span>}
                            </div>
                            <div className="text-status-success bg-status-success/5 px-2 py-1 rounded">
                              {change.newValue || <span className="text-text-muted italic">Not set</span>}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Action controls for potentially ceased officers */}
                    {officer.type === 'potentially_ceased' && officer.officerId && (
                      <div className="mt-3 ml-11 p-3 bg-background-elevated rounded-lg">
                        <p className="text-sm text-text-secondary mb-2">
                          This officer exists in the database but was not found in the BizFile. What would you like to do?
                        </p>
                        <div className="flex items-center gap-4">
                          <label className="flex items-center gap-2 cursor-pointer">
                            <input
                              type="radio"
                              name={`officer-action-${officer.officerId}`}
                              checked={officerActions.find(a => a.officerId === officer.officerId)?.action === 'cease'}
                              onChange={() => handleOfficerActionChange(officer.officerId!, 'cease')}
                              className="w-4 h-4 text-oak-primary"
                            />
                            <span className="text-sm text-text-primary">Mark as ceased</span>
                          </label>
                          <label className="flex items-center gap-2 cursor-pointer">
                            <input
                              type="radio"
                              name={`officer-action-${officer.officerId}`}
                              checked={officerActions.find(a => a.officerId === officer.officerId)?.action === 'follow_up'}
                              onChange={() => handleOfficerActionChange(officer.officerId!, 'follow_up')}
                              className="w-4 h-4 text-oak-primary"
                            />
                            <span className="text-sm text-text-primary">Follow up later</span>
                          </label>
                        </div>
                        {officerActions.find(a => a.officerId === officer.officerId)?.action === 'cease' && (
                          <div className="mt-2 flex items-center gap-2">
                            <Calendar className="w-4 h-4 text-text-muted" />
                            <input
                              type="date"
                              value={officerActions.find(a => a.officerId === officer.officerId)?.cessationDate || ''}
                              onChange={(e) => handleOfficerActionChange(officer.officerId!, 'cease', e.target.value)}
                              className="text-sm px-2 py-1 border border-border-primary rounded bg-background-primary text-text-primary"
                              placeholder="Cessation date"
                            />
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Shareholder Diffs */}
          {diffResult.shareholderDiffs && diffResult.shareholderDiffs.length > 0 && (
            <div className="card">
              <div className="p-4 border-b border-border-primary">
                <h2 className="font-medium text-text-primary flex items-center gap-2">
                  <PieChart className="w-4 h-4 text-oak-primary" />
                  Shareholder Changes
                </h2>
                <p className="text-sm text-text-tertiary mt-1">
                  {diffResult.summary?.shareholdersAdded || 0} new, {diffResult.summary?.shareholdersUpdated || 0} updated, {diffResult.summary?.shareholdersRemoved || 0} removed
                </p>
              </div>
              <div className="divide-y divide-border-primary">
                {diffResult.shareholderDiffs.map((shareholder, idx) => (
                  <div key={idx} className="p-4">
                    <div className="flex items-start justify-between">
                      <div className="flex items-center gap-3">
                        {shareholder.type === 'added' && (
                          <div className="w-8 h-8 rounded-full bg-status-success/10 flex items-center justify-center">
                            <UserPlus className="w-4 h-4 text-status-success" />
                          </div>
                        )}
                        {shareholder.type === 'updated' && (
                          <div className="w-8 h-8 rounded-full bg-status-info/10 flex items-center justify-center">
                            <UserCheck className="w-4 h-4 text-status-info" />
                          </div>
                        )}
                        {shareholder.type === 'removed' && (
                          <div className="w-8 h-8 rounded-full bg-status-error/10 flex items-center justify-center">
                            <UserMinus className="w-4 h-4 text-status-error" />
                          </div>
                        )}
                        <div>
                          <p className="font-medium text-text-primary">{shareholder.name}</p>
                          <div className="flex items-center gap-2 text-sm text-text-secondary">
                            <span className="capitalize">{shareholder.shareholderType?.toLowerCase()}</span>
                            {shareholder.matchConfidence && (
                              <span className={`text-xs px-1.5 py-0.5 rounded ${
                                shareholder.matchConfidence === 'high' ? 'bg-status-success/10 text-status-success' :
                                shareholder.matchConfidence === 'medium' ? 'bg-status-warning/10 text-status-warning' :
                                'bg-status-error/10 text-status-error'
                              }`}>
                                {shareholder.matchConfidence} match
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                      <span className={`text-xs font-medium px-2 py-1 rounded ${
                        shareholder.type === 'added' ? 'bg-status-success/10 text-status-success' :
                        shareholder.type === 'updated' ? 'bg-status-info/10 text-status-info' :
                        'bg-status-error/10 text-status-error'
                      }`}>
                        {shareholder.type === 'added' ? 'New' : shareholder.type === 'updated' ? 'Updated' : 'Removed'}
                      </span>
                    </div>

                    {/* Show shareholding changes */}
                    {shareholder.shareholdingChanges && (
                      <div className="mt-3 ml-11 space-y-2">
                        {shareholder.shareholdingChanges.shareClass && (
                          <div className="grid grid-cols-3 gap-4 text-sm">
                            <div className="text-text-secondary">Share Class</div>
                            <div className="text-status-error bg-status-error/5 px-2 py-1 rounded line-through">
                              {shareholder.shareholdingChanges.shareClass.old}
                            </div>
                            <div className="text-status-success bg-status-success/5 px-2 py-1 rounded">
                              {shareholder.shareholdingChanges.shareClass.new}
                            </div>
                          </div>
                        )}
                        {shareholder.shareholdingChanges.numberOfShares && (
                          <div className="grid grid-cols-3 gap-4 text-sm">
                            <div className="text-text-secondary">Number of Shares</div>
                            <div className="text-status-error bg-status-error/5 px-2 py-1 rounded line-through">
                              {shareholder.shareholdingChanges.numberOfShares.old.toLocaleString()}
                            </div>
                            <div className="text-status-success bg-status-success/5 px-2 py-1 rounded">
                              {shareholder.shareholdingChanges.numberOfShares.new.toLocaleString()}
                            </div>
                          </div>
                        )}
                      </div>
                    )}

                    {/* Show general changes for updated shareholders */}
                    {shareholder.type === 'updated' && shareholder.changes && shareholder.changes.length > 0 && (
                      <div className="mt-3 ml-11 space-y-2">
                        {shareholder.changes.map((change, cIdx) => (
                          <div key={cIdx} className="grid grid-cols-3 gap-4 text-sm">
                            <div className="text-text-secondary">{change.label}</div>
                            <div className="text-status-error bg-status-error/5 px-2 py-1 rounded line-through">
                              {change.oldValue ?? <span className="text-text-muted italic">Not set</span>}
                            </div>
                            <div className="text-status-success bg-status-success/5 px-2 py-1 rounded">
                              {change.newValue ?? <span className="text-text-muted italic">Not set</span>}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Show extracted data for new shareholders */}
                    {shareholder.type === 'added' && shareholder.extractedData && (
                      <div className="mt-3 ml-11 grid grid-cols-2 gap-2 text-sm">
                        <div>
                          <span className="text-text-muted">Shares:</span>{' '}
                          <span className="text-text-primary">{shareholder.extractedData.numberOfShares?.toLocaleString()}</span>
                        </div>
                        <div>
                          <span className="text-text-muted">Class:</span>{' '}
                          <span className="text-text-primary">{shareholder.extractedData.shareClass}</span>
                        </div>
                        {shareholder.extractedData.percentageHeld && (
                          <div>
                            <span className="text-text-muted">Percentage:</span>{' '}
                            <span className="text-text-primary">{shareholder.extractedData.percentageHeld}%</span>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                ))}
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
              {(() => {
                const companyChanges = diffResult.differences.length;
                const officerDiffCount = diffResult.officerDiffs?.length || 0;
                const shareholderDiffCount = diffResult.shareholderDiffs?.length || 0;
                const totalChanges = companyChanges + officerDiffCount + shareholderDiffCount;
                const hasAnyChanges = totalChanges > 0;

                return (
                  <button
                    onClick={handleApplyUpdate}
                    disabled={!hasAnyChanges}
                    className="btn-primary btn-sm flex items-center gap-2"
                  >
                    <CheckCircle className="w-4 h-4" />
                    {hasAnyChanges
                      ? `Apply ${totalChanges} Change${totalChanges > 1 ? 's' : ''}`
                      : 'No Changes to Apply'}
                  </button>
                );
              })()}
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
          {/* Concurrent update warning */}
          {concurrentUpdateWarning && (
            <div className="mb-6 p-4 bg-status-warning/10 border border-status-warning/30 rounded-lg text-left">
              <div className="flex items-start gap-3">
                <AlertCircle className="w-5 h-5 text-status-warning flex-shrink-0 mt-0.5" />
                <div>
                  <p className="font-medium text-status-warning">Concurrent Update Detected</p>
                  <p className="text-sm text-text-secondary mt-1">{concurrentUpdateWarning}</p>
                </div>
              </div>
            </div>
          )}
          <CheckCircle className="w-12 h-12 text-status-success mx-auto mb-4" />
          <h3 className="text-lg font-medium text-text-primary mb-2">
            {isUpdateMode ? 'Company Updated Successfully!' : 'Company Created Successfully!'}
          </h3>
          <div className="text-text-secondary mb-6 space-y-2">
            {isUpdateMode ? (
              <>
                {updatedFields.length > 0 && (
                  <p>Updated {updatedFields.length} field{updatedFields.length > 1 ? 's' : ''}: {updatedFields.join(', ')}</p>
                )}
                {officerChanges && (officerChanges.added > 0 || officerChanges.updated > 0 || officerChanges.ceased > 0 || officerChanges.followUp > 0) && (
                  <p className="flex items-center justify-center gap-2">
                    <Users className="w-4 h-4 text-oak-primary" />
                    Officers: {officerChanges.added > 0 && `${officerChanges.added} added`}
                    {officerChanges.updated > 0 && `${officerChanges.added > 0 ? ', ' : ''}${officerChanges.updated} updated`}
                    {officerChanges.ceased > 0 && `${(officerChanges.added > 0 || officerChanges.updated > 0) ? ', ' : ''}${officerChanges.ceased} ceased`}
                    {officerChanges.followUp > 0 && `${(officerChanges.added > 0 || officerChanges.updated > 0 || officerChanges.ceased > 0) ? ', ' : ''}${officerChanges.followUp} to follow up`}
                  </p>
                )}
                {shareholderChanges && (shareholderChanges.added > 0 || shareholderChanges.updated > 0 || shareholderChanges.removed > 0) && (
                  <p className="flex items-center justify-center gap-2">
                    <PieChart className="w-4 h-4 text-oak-primary" />
                    Shareholders: {shareholderChanges.added > 0 && `${shareholderChanges.added} added`}
                    {shareholderChanges.updated > 0 && `${shareholderChanges.added > 0 ? ', ' : ''}${shareholderChanges.updated} updated`}
                    {shareholderChanges.removed > 0 && `${(shareholderChanges.added > 0 || shareholderChanges.updated > 0) ? ', ' : ''}${shareholderChanges.removed} removed`}
                  </p>
                )}
                {updatedFields.length === 0 && !officerChanges && !shareholderChanges && (
                  <p>No changes were needed - company data was already up to date.</p>
                )}
              </>
            ) : (
              <p>The company and all related data have been saved.</p>
            )}
          </div>
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
