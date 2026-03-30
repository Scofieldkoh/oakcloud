'use client';

import { useEffect, useRef, useState, type DragEvent, type FormEvent } from 'react';
import { useParams } from 'next/navigation';
import {
  CheckCircle2,
  Circle,
  ClipboardCopy,
  FileText,
  Loader2,
  SearchCheck,
  ShieldAlert,
  ShieldCheck,
  Upload,
  XCircle,
} from 'lucide-react';
import type { EsigningEnvelopeStatus, EsigningRecipientStatus, EsigningRecipientType } from '@/generated/prisma';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import {
  EnvelopeStatusBadge,
  ESIGNING_RECIPIENT_TYPE_LABELS,
  formatEsigningDateTime,
} from '@/components/esigning/esigning-shared';
import { cn } from '@/lib/utils';

interface VerificationResponse {
  certificateId: string;
  envelopeId: string;
  title: string;
  status: EsigningEnvelopeStatus;
  completedAt: string | null;
  tenantName: string;
  companyName: string | null;
  documents: Array<{
    id: string;
    fileName: string;
    hash: string;
    hasSignedCopy: boolean;
  }>;
  recipients: Array<{
    id: string;
    name: string;
    emailMasked: string;
    type: EsigningRecipientType;
    status: EsigningRecipientStatus;
    signingOrder: number | null;
    signedAt: string | null;
  }>;
}

interface VerificationMatchResponse {
  matched: boolean;
  fileHash: string;
  document: VerificationResponse['documents'][number] | null;
}

interface TimelineEvent {
  id: string;
  timestamp: string | null;
  label: string;
  isPositive: boolean;
}

function buildTimeline(data: VerificationResponse): TimelineEvent[] {
  const events: TimelineEvent[] = [
    { id: 'sent', timestamp: null, label: 'Envelope sent for signature', isPositive: true },
  ];

  const signedRecipients = data.recipients
    .filter((r) => r.signedAt)
    .sort((a, b) => new Date(a.signedAt!).getTime() - new Date(b.signedAt!).getTime());

  for (const recipient of signedRecipients) {
    events.push({
      id: `signed-${recipient.id}`,
      timestamp: recipient.signedAt,
      label: `Signed by ${recipient.name} (${recipient.emailMasked})`,
      isPositive: true,
    });
  }

  const declinedRecipients = data.recipients.filter((r) => r.status === 'DECLINED');
  for (const recipient of declinedRecipients) {
    events.push({
      id: `declined-${recipient.id}`,
      timestamp: null,
      label: `Declined by ${recipient.name}`,
      isPositive: false,
    });
  }

  if (data.completedAt) {
    events.push({
      id: 'completed',
      timestamp: data.completedAt,
      label: 'All parties signed — envelope completed',
      isPositive: true,
    });
  }

  return events;
}

function CopyHashButton({ hash }: { hash: string }) {
  const [copied, setCopied] = useState(false);

  function copy() {
    void navigator.clipboard.writeText(hash).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  return (
    <button
      type="button"
      onClick={copy}
      className="ml-1.5 inline-flex items-center gap-1 rounded border border-border-primary px-1.5 py-0.5 text-[10px] text-text-muted transition-colors hover:bg-background-tertiary"
    >
      <ClipboardCopy className="h-2.5 w-2.5" />
      {copied ? 'Copied' : 'Copy'}
    </button>
  );
}

function DropZone({
  isChecking,
  onFile,
}: {
  isChecking: boolean;
  onFile: (file: File) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [isDragOver, setIsDragOver] = useState(false);

  function handleDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    setIsDragOver(false);
    const file = event.dataTransfer.files[0];
    if (file?.type === 'application/pdf') {
      onFile(file);
    }
  }

  function handleChange() {
    const file = inputRef.current?.files?.[0];
    if (file) onFile(file);
  }

  return (
    <div
      onDragOver={(e) => { e.preventDefault(); setIsDragOver(true); }}
      onDragLeave={() => setIsDragOver(false)}
      onDrop={handleDrop}
      onClick={() => inputRef.current?.click()}
      className={cn(
        'flex cursor-pointer flex-col items-center justify-center gap-3 rounded-2xl border-2 border-dashed p-8 text-center transition-colors',
        isDragOver
          ? 'border-oak-primary bg-oak-primary/5 text-oak-primary'
          : 'border-border-primary bg-background-primary text-text-muted hover:border-oak-primary/50 hover:text-text-secondary',
      )}
    >
      <Upload className={cn('h-8 w-8', isDragOver && 'text-oak-primary')} />
      <div>
        <p className="text-sm font-medium text-text-primary">
          {isChecking ? 'Verifying…' : 'Drop a PDF here, or click to browse'}
        </p>
        <p className="mt-0.5 text-xs text-text-muted">PDF files only</p>
      </div>
      <input
        ref={inputRef}
        type="file"
        name="verification-file"
        accept="application/pdf"
        className="hidden"
        onChange={handleChange}
      />
    </div>
  );
}

export function EsigningVerifyPage() {
  const params = useParams();
  const certificateId = params.certificateId as string;
  const [data, setData] = useState<VerificationResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [matchResult, setMatchResult] = useState<VerificationMatchResponse | null>(null);
  const [isChecking, setIsChecking] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function loadVerification() {
      try {
        setIsLoading(true);
        const response = await fetch(`/api/esigning/verify/${encodeURIComponent(certificateId)}`);
        const result = await response.json().catch(() => ({}));
        if (!response.ok) {
          throw new Error(result.error || 'Certificate not found');
        }
        if (!cancelled) {
          setData(result);
          setError(null);
        }
      } catch (loadError) {
        if (!cancelled) {
          setError(loadError instanceof Error ? loadError.message : 'Failed to load certificate');
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    }

    void loadVerification();
    return () => {
      cancelled = true;
    };
  }, [certificateId]);

  async function checkFile(file: File) {
    try {
      setIsChecking(true);
      setMatchResult(null);
      const formData = new FormData();
      formData.set('file', file);
      const response = await fetch(`/api/esigning/verify/${encodeURIComponent(certificateId)}/check`, {
        method: 'POST',
        body: formData,
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(result.error || 'Failed to verify file hash');
      }
      setMatchResult(result);
    } catch (checkError) {
      setError(checkError instanceof Error ? checkError.message : 'Failed to verify file hash');
    } finally {
      setIsChecking(false);
    }
  }

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background-primary">
        <Loader2 className="h-8 w-8 animate-spin text-oak-primary" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background-primary p-6">
        <div className="w-full max-w-lg rounded-3xl border border-border-primary bg-background-secondary p-8 shadow-sm">
          <ShieldAlert className="mx-auto h-10 w-10 text-rose-500" />
          <h1 className="mt-4 text-center text-2xl font-semibold text-text-primary">Certificate unavailable</h1>
          <p className="mt-2 text-center text-sm text-text-secondary">{error}</p>
        </div>
      </div>
    );
  }

  const timeline = buildTimeline(data);

  return (
    <div className="min-h-screen bg-background-primary">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 p-6">

        {/* Certificate Header */}
        <section className="rounded-3xl border border-border-primary bg-background-secondary p-6 shadow-sm">
          <div className="flex flex-col gap-5 sm:flex-row sm:items-start sm:justify-between">
            <div className="space-y-3">
              <div className="inline-flex items-center gap-2 rounded-full border border-border-primary bg-background-tertiary px-3 py-1 text-xs font-medium uppercase tracking-[0.18em] text-text-muted">
                <SearchCheck className="h-3.5 w-3.5" />
                Certificate of Completion
              </div>
              <h1 className="text-3xl font-semibold text-text-primary">{data.title}</h1>
              <p className="text-sm text-text-secondary">
                {data.tenantName}
                {data.companyName ? ` · ${data.companyName}` : ''}
              </p>
              <div className="flex flex-wrap items-center gap-2">
                <EnvelopeStatusBadge status={data.status} />
                {data.completedAt ? (
                  <span className="inline-flex items-center rounded-full border border-border-primary px-2.5 py-1 text-xs text-text-secondary">
                    Completed {formatEsigningDateTime(data.completedAt)}
                  </span>
                ) : null}
              </div>
            </div>
            <div className="flex-shrink-0 text-right">
              <div className="text-xs uppercase tracking-wide text-text-muted">Certificate ID</div>
              <div className="mt-1 font-mono text-sm font-semibold text-text-primary">{data.certificateId}</div>
            </div>
          </div>
        </section>

        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
          <div className="space-y-6">

            {/* Timeline */}
            <section className="rounded-3xl border border-border-primary bg-background-secondary p-6 shadow-sm">
              <h2 className="text-lg font-semibold text-text-primary">Audit trail</h2>
              <div className="mt-5 space-y-0">
                {timeline.map((event, index) => (
                  <div key={event.id} className="flex gap-4">
                    {/* Left: dot + connector line */}
                    <div className="flex flex-col items-center">
                      <div
                        className={cn(
                          'mt-0.5 flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full border-2',
                          event.isPositive
                            ? 'border-oak-primary bg-oak-primary/10 text-oak-primary'
                            : 'border-rose-400 bg-rose-50 text-rose-500',
                        )}
                      >
                        {event.isPositive ? (
                          <CheckCircle2 className="h-3 w-3" />
                        ) : (
                          <XCircle className="h-3 w-3" />
                        )}
                      </div>
                      {index < timeline.length - 1 ? (
                        <div className="my-1 w-px flex-1 bg-border-primary" />
                      ) : null}
                    </div>
                    {/* Right: content */}
                    <div className={cn('pb-5', index === timeline.length - 1 && 'pb-0')}>
                      <p className="text-sm font-medium text-text-primary">{event.label}</p>
                      {event.timestamp ? (
                        <p className="mt-0.5 text-xs text-text-muted">{formatEsigningDateTime(event.timestamp)}</p>
                      ) : (
                        <p className="mt-0.5 text-xs text-text-muted">—</p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </section>

            {/* Recipients */}
            <section className="rounded-3xl border border-border-primary bg-background-secondary p-6 shadow-sm">
              <h2 className="text-lg font-semibold text-text-primary">Recipients</h2>
              <div className="mt-5 grid gap-3">
                {data.recipients.map((recipient) => (
                  <div key={recipient.id} className="rounded-2xl border border-border-primary bg-background-primary p-4">
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                      <div>
                        <div className="text-sm font-semibold text-text-primary">{recipient.name}</div>
                        <div className="text-xs text-text-secondary">{recipient.emailMasked}</div>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <span className="inline-flex items-center rounded-full border border-border-primary px-2.5 py-1 text-xs text-text-secondary">
                          {ESIGNING_RECIPIENT_TYPE_LABELS[recipient.type]}
                        </span>
                      </div>
                    </div>
                    {recipient.signedAt ? (
                      <div className="mt-3 flex items-center gap-1.5 text-xs text-oak-primary">
                        <CheckCircle2 className="h-3.5 w-3.5" />
                        Signed {formatEsigningDateTime(recipient.signedAt)}
                      </div>
                    ) : (
                      <div className="mt-3 flex items-center gap-1.5 text-xs text-text-muted">
                        <Circle className="h-3.5 w-3.5" />
                        {recipient.status === 'DECLINED' ? 'Declined to sign' : 'Awaiting signature'}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </section>

            {/* Documents */}
            <section className="rounded-3xl border border-border-primary bg-background-secondary p-6 shadow-sm">
              <div className="flex items-center gap-2">
                <FileText className="h-5 w-5 text-oak-primary" />
                <h2 className="text-lg font-semibold text-text-primary">Documents</h2>
              </div>
              <div className="mt-5 grid gap-3">
                {data.documents.map((document) => (
                  <div
                    key={document.id}
                    className={cn(
                      'rounded-2xl border p-4',
                      document.hasSignedCopy
                        ? 'border-oak-primary/30 bg-oak-primary/5'
                        : 'border-border-primary bg-background-primary',
                    )}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="text-sm font-semibold text-text-primary">{document.fileName}</div>
                      <span
                        className={cn(
                          'flex-shrink-0 rounded-full border px-2.5 py-1 text-xs',
                          document.hasSignedCopy
                            ? 'border-oak-primary/30 text-oak-primary'
                            : 'border-border-primary text-text-secondary',
                        )}
                      >
                        {document.hasSignedCopy ? 'Signed artifact' : 'Original hash only'}
                      </span>
                    </div>
                    <div className="mt-2 flex items-start gap-1">
                      <code className="flex-1 break-all text-xs text-text-secondary">{document.hash}</code>
                      <CopyHashButton hash={document.hash} />
                    </div>
                  </div>
                ))}
              </div>
            </section>
          </div>

          {/* Verify a file */}
          <section className="rounded-3xl border border-border-primary bg-background-secondary p-6 shadow-sm">
            <div className="flex items-center gap-2">
              <ShieldCheck className="h-5 w-5 text-oak-primary" />
              <h2 className="text-lg font-semibold text-text-primary">Verify a file</h2>
            </div>
            <p className="mt-2 text-sm text-text-secondary">
              Upload a PDF to compare its SHA-256 hash against the documents registered under this certificate.
            </p>
            <div className="mt-5">
              <DropZone isChecking={isChecking} onFile={checkFile} />
            </div>

            {matchResult ? (
              <div className="mt-5">
                {matchResult.matched ? (
                  <div className="rounded-2xl border border-green-200 bg-green-50 p-4 dark:border-green-800/40 dark:bg-green-900/20">
                    <div className="flex items-center gap-2 text-green-700 dark:text-green-400">
                      <CheckCircle2 className="h-5 w-5 flex-shrink-0" />
                      <span className="text-sm font-semibold">Hash matched</span>
                    </div>
                    <p className="mt-2 text-sm text-green-700 dark:text-green-400">
                      This file matches <strong>{matchResult.document?.fileName}</strong> registered in the certificate.
                    </p>
                    <code className="mt-2 block break-all text-xs text-green-600 dark:text-green-500">
                      {matchResult.fileHash}
                    </code>
                  </div>
                ) : (
                  <div className="rounded-2xl border border-rose-200 bg-rose-50 p-4 dark:border-rose-800/40 dark:bg-rose-900/20">
                    <div className="flex items-center gap-2 text-rose-700 dark:text-rose-400">
                      <XCircle className="h-5 w-5 flex-shrink-0" />
                      <span className="text-sm font-semibold">Hash mismatch</span>
                    </div>
                    <p className="mt-2 text-sm text-rose-700 dark:text-rose-400">
                      The uploaded file does not match any document registered under this certificate.
                    </p>
                    <code className="mt-2 block break-all text-xs text-rose-500">
                      {matchResult.fileHash}
                    </code>
                  </div>
                )}
              </div>
            ) : null}

            {error ? (
              <Alert variant="error" title="Verification error" className="mt-5">
                {error}
              </Alert>
            ) : null}
          </section>
        </div>
      </div>
    </div>
  );
}
