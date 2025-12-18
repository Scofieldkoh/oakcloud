'use client';

import { useState, useCallback, useEffect } from 'react';
import { useRouter } from 'next/navigation';
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
  Files,
  RotateCcw,
} from 'lucide-react';
import { useSession } from '@/hooks/use-auth';
import { useCompanies } from '@/hooks/use-companies';
import { useActiveTenantId } from '@/components/ui/tenant-selector';
import { useActiveCompanyId } from '@/components/ui/company-selector';
import { useToast } from '@/components/ui/toast';

type UploadStatus = 'pending' | 'uploading' | 'success' | 'error';

interface QueuedFile {
  file: File;
  id: string;
  status: UploadStatus;
  error?: string;
  processingDocumentId?: string;
}

const MAX_FILES = 20;
const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50MB to match API

export default function ProcessingUploadPage() {
  const router = useRouter();
  const { data: session } = useSession();
  const { success, error: toastError } = useToast();

  // Get active tenant and company
  const isSuperAdmin = session?.isSuperAdmin ?? false;
  const activeTenantId = useActiveTenantId(isSuperAdmin, session?.tenantId);
  const activeCompanyId = useActiveCompanyId();

  // Fetch companies for selection
  const { data: companiesData, isLoading: isLoadingCompanies } = useCompanies({ tenantId: activeTenantId });
  const companies = companiesData?.companies || [];

  // State
  const [selectedCompanyId, setSelectedCompanyId] = useState<string>('');
  const [queuedFiles, setQueuedFiles] = useState<QueuedFile[]>([]);
  const [isUploading, setIsUploading] = useState(false);

  // Update selected company when activeCompanyId changes or companies load
  useEffect(() => {
    if (activeCompanyId && companies.some(c => c.id === activeCompanyId)) {
      setSelectedCompanyId(activeCompanyId);
    } else if (companies.length === 1) {
      // Auto-select if only one company
      setSelectedCompanyId(companies[0].id);
    }
  }, [activeCompanyId, companies]);

  const onDrop = useCallback((acceptedFiles: File[]) => {
    const newFiles: QueuedFile[] = acceptedFiles.map((file) => ({
      file,
      id: `${file.name}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      status: 'pending' as UploadStatus,
    }));

    setQueuedFiles((prev) => {
      const combined = [...prev, ...newFiles];
      if (combined.length > MAX_FILES) {
        toastError(`Maximum ${MAX_FILES} files allowed. Some files were not added.`);
        return combined.slice(0, MAX_FILES);
      }
      return combined;
    });
  }, [toastError]);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      'application/pdf': ['.pdf'],
      'image/png': ['.png'],
      'image/jpeg': ['.jpg', '.jpeg'],
      'image/tiff': ['.tif', '.tiff'],
    },
    maxSize: MAX_FILE_SIZE,
    disabled: isUploading,
    onDropRejected: (rejections) => {
      rejections.forEach((rejection) => {
        const fileName = rejection.file.name;
        const errors = rejection.errors.map((e) => e.message).join(', ');
        toastError(`${fileName}: ${errors}`);
      });
    },
  });

  const removeFile = (id: string) => {
    setQueuedFiles((prev) => prev.filter((f) => f.id !== id));
  };

  const clearAllFiles = () => {
    setQueuedFiles([]);
  };

  const retryFile = (id: string) => {
    setQueuedFiles((prev) =>
      prev.map((f) =>
        f.id === id ? { ...f, status: 'pending' as UploadStatus, error: undefined } : f
      )
    );
  };

  const retryAllFailed = () => {
    setQueuedFiles((prev) =>
      prev.map((f) =>
        f.status === 'error' ? { ...f, status: 'pending' as UploadStatus, error: undefined } : f
      )
    );
  };

  const uploadFiles = async () => {
    if (!selectedCompanyId) {
      toastError('Please select a company');
      return;
    }

    if (queuedFiles.length === 0) {
      toastError('Please add files to upload');
      return;
    }

    setIsUploading(true);
    let successCount = 0;
    let errorCount = 0;

    for (const queuedFile of queuedFiles) {
      if (queuedFile.status === 'success') {
        successCount++;
        continue;
      }

      // Update status to uploading
      setQueuedFiles((prev) =>
        prev.map((f) =>
          f.id === queuedFile.id ? { ...f, status: 'uploading' as UploadStatus } : f
        )
      );

      try {
        const formData = new FormData();
        formData.append('file', queuedFile.file);
        formData.append('companyId', selectedCompanyId);
        formData.append('priority', 'NORMAL');
        formData.append('uploadSource', 'WEB');

        const response = await fetch('/api/processing-documents', {
          method: 'POST',
          body: formData,
        });

        if (!response.ok) {
          const err = await response.json();
          throw new Error(err.error?.message || 'Upload failed');
        }

        const result = await response.json();

        // Update status to success
        setQueuedFiles((prev) =>
          prev.map((f) =>
            f.id === queuedFile.id
              ? {
                  ...f,
                  status: 'success' as UploadStatus,
                  processingDocumentId: result.data?.document?.id,
                }
              : f
          )
        );
        successCount++;
      } catch (err) {
        // Update status to error
        setQueuedFiles((prev) =>
          prev.map((f) =>
            f.id === queuedFile.id
              ? {
                  ...f,
                  status: 'error' as UploadStatus,
                  error: err instanceof Error ? err.message : 'Upload failed',
                }
              : f
          )
        );
        errorCount++;
      }
    }

    setIsUploading(false);

    if (successCount > 0 && errorCount === 0) {
      success(`Successfully uploaded ${successCount} document${successCount > 1 ? 's' : ''}`);
    } else if (successCount > 0 && errorCount > 0) {
      toastError(`Uploaded ${successCount} document${successCount > 1 ? 's' : ''}, ${errorCount} failed`);
    } else {
      toastError('All uploads failed');
    }
  };

  const completedCount = queuedFiles.filter((f) => f.status === 'success').length;
  const pendingCount = queuedFiles.filter((f) => f.status === 'pending').length;
  const errorCount = queuedFiles.filter((f) => f.status === 'error').length;
  const allComplete = queuedFiles.length > 0 && completedCount === queuedFiles.length;

  return (
    <div className="p-4 sm:p-6 max-w-4xl">
      {/* Header */}
      <div className="mb-6">
        <Link
          href="/processing"
          className="inline-flex items-center gap-2 text-sm text-text-secondary hover:text-text-primary mb-3 transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to Processing
        </Link>
        <h1 className="text-xl sm:text-2xl font-semibold text-text-primary flex items-center gap-3">
          <Files className="w-6 h-6 text-oak-primary" />
          Upload Documents for Processing
        </h1>
        <p className="text-sm text-text-secondary mt-1">
          Upload invoices, receipts, credit notes, purchase orders, and other business documents for AI-powered extraction.
        </p>
      </div>

      {/* Tenant/Company Selection Warning */}
      {isSuperAdmin && !activeTenantId && (
        <div className="mb-4 p-3 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg">
          <p className="text-sm text-amber-800 dark:text-amber-200">
            Please select a tenant from the sidebar before uploading documents.
          </p>
        </div>
      )}

      {/* Company Selection */}
      <div className="card p-4 mb-6">
        <label className="block text-sm font-medium text-text-primary mb-2">
          <Building2 className="w-4 h-4 inline-block mr-2" />
          Select Company <span className="text-status-error">*</span>
        </label>
        {isLoadingCompanies ? (
          <div className="flex items-center gap-2 text-text-secondary text-sm py-2">
            <Loader2 className="w-4 h-4 animate-spin" />
            Loading companies...
          </div>
        ) : (
          <>
            <select
              value={selectedCompanyId}
              onChange={(e) => setSelectedCompanyId(e.target.value)}
              disabled={isUploading || companies.length === 0}
              className={`input w-full max-w-md ${!selectedCompanyId && 'border-status-warning'}`}
            >
              <option value="">Select a company...</option>
              {companies.map((company) => (
                <option key={company.id} value={company.id}>
                  {company.name} {company.uen ? `(${company.uen})` : ''}
                </option>
              ))}
            </select>
            {!selectedCompanyId && companies.length > 0 && (
              <p className="text-xs text-status-warning mt-1.5">
                Please select a company to upload documents
              </p>
            )}
            {companies.length === 0 && activeTenantId && (
              <p className="text-sm text-text-tertiary mt-2">
                No companies found.{' '}
                <Link href="/companies/new" className="text-oak-light hover:underline">
                  Create a company
                </Link>{' '}
                first.
              </p>
            )}
          </>
        )}
      </div>

      {/* Dropzone */}
      <div
        {...getRootProps()}
        className={`card p-8 text-center border-2 border-dashed cursor-pointer transition-colors mb-6 ${
          isDragActive
            ? 'border-oak-primary bg-oak-primary/5'
            : isUploading
            ? 'border-border-secondary bg-background-tertiary cursor-not-allowed'
            : 'border-border-secondary hover:border-oak-primary/50'
        }`}
      >
        <input {...getInputProps()} />
        <FileUp className="w-10 h-10 text-text-muted mx-auto mb-3" />
        <h3 className="text-base font-medium text-text-primary mb-1">
          {isDragActive ? 'Drop files here' : 'Drag & drop documents'}
        </h3>
        <p className="text-text-secondary text-sm mb-2">
          or click to browse your files
        </p>
        <p className="text-xs text-text-tertiary">
          PDF, PNG, JPG, TIFF • Max {MAX_FILE_SIZE / 1024 / 1024}MB per file • Up to {MAX_FILES} files
        </p>
      </div>

      {/* File Queue */}
      {queuedFiles.length > 0 && (
        <div className="card mb-6">
          <div className="p-4 border-b border-border-primary flex items-center justify-between">
            <div>
              <h2 className="font-medium text-text-primary">
                Queued Files ({queuedFiles.length})
              </h2>
              <p className="text-xs text-text-tertiary mt-0.5">
                {completedCount} completed, {pendingCount} pending
                {errorCount > 0 && `, ${errorCount} failed`}
              </p>
            </div>
            <div className="flex items-center gap-2">
              {errorCount > 0 && !isUploading && (
                <button
                  onClick={retryAllFailed}
                  className="btn-ghost btn-xs text-status-warning hover:text-status-warning flex items-center gap-1"
                >
                  <RotateCcw className="w-3 h-3" />
                  Retry Failed
                </button>
              )}
              {!isUploading && !allComplete && (
                <button
                  onClick={clearAllFiles}
                  className="btn-ghost btn-xs text-text-muted hover:text-status-error"
                >
                  Clear All
                </button>
              )}
            </div>
          </div>
          <div className="divide-y divide-border-primary max-h-80 overflow-y-auto">
            {queuedFiles.map((qf) => (
              <div key={qf.id} className="p-3 flex items-center gap-3">
                <div className="flex-shrink-0">
                  {qf.status === 'pending' && (
                    <File className="w-5 h-5 text-text-muted" />
                  )}
                  {qf.status === 'uploading' && (
                    <Loader2 className="w-5 h-5 text-oak-primary animate-spin" />
                  )}
                  {qf.status === 'success' && (
                    <CheckCircle className="w-5 h-5 text-status-success" />
                  )}
                  {qf.status === 'error' && (
                    <AlertCircle className="w-5 h-5 text-status-error" />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-text-primary truncate">{qf.file.name}</p>
                  <p className="text-xs text-text-tertiary">
                    {qf.file.size >= 1024 * 1024
                      ? `${(qf.file.size / 1024 / 1024).toFixed(1)} MB`
                      : `${(qf.file.size / 1024).toFixed(1)} KB`}
                    {qf.error && (
                      <span className="text-status-error ml-2">• {qf.error}</span>
                    )}
                    {qf.processingDocumentId && (
                      <Link
                        href={`/processing/${qf.processingDocumentId}`}
                        className="text-oak-light ml-2 hover:underline"
                      >
                        • View
                      </Link>
                    )}
                  </p>
                </div>
                <div className="flex items-center gap-1">
                  {qf.status === 'error' && !isUploading && (
                    <button
                      onClick={() => retryFile(qf.id)}
                      className="p-1 hover:bg-background-tertiary rounded text-status-warning hover:text-status-warning"
                      title="Retry upload"
                    >
                      <RotateCcw className="w-4 h-4" />
                    </button>
                  )}
                  {(qf.status === 'pending' || qf.status === 'error') && !isUploading && (
                    <button
                      onClick={() => removeFile(qf.id)}
                      className="p-1 hover:bg-background-tertiary rounded text-text-muted hover:text-text-primary"
                      title="Remove file"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Actions */}
      <div className="flex items-center justify-between">
        <Link href="/processing" className="btn-secondary btn-sm">
          Cancel
        </Link>
        <div className="flex items-center gap-3">
          {allComplete ? (
            <Link href="/processing?pipelineStatus=QUEUED" className="btn-primary btn-sm flex items-center gap-2">
              <CheckCircle className="w-4 h-4" />
              View Processing Queue
            </Link>
          ) : (
            <button
              onClick={uploadFiles}
              disabled={isUploading || queuedFiles.length === 0 || !selectedCompanyId}
              className="btn-primary btn-sm flex items-center gap-2"
            >
              {isUploading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Uploading...
                </>
              ) : (
                <>
                  <FileUp className="w-4 h-4" />
                  Upload {queuedFiles.length > 0 ? `${queuedFiles.length} File${queuedFiles.length > 1 ? 's' : ''}` : 'Files'}
                </>
              )}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
