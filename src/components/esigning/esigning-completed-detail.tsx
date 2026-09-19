'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import {
  AlertTriangle,
  ArrowLeft,
  Copy,
  Download,
  FileSignature,
  MoreHorizontal,
  Trash2,
} from 'lucide-react';
import type { EsigningEnvelopeEventAction } from '@/generated/prisma';
import type {
  EsigningEnvelopeDetailDto,
  EsigningEnvelopeEventDto,
} from '@/types/esigning';
import { Alert } from '@/components/ui/alert';
import {
  Dropdown,
  DropdownItem,
  DropdownMenu,
  DropdownSeparator,
  DropdownTrigger,
} from '@/components/ui/dropdown';
import {
  CopyDeliveryStatusBadge,
  EnvelopeStatusBadge,
  ESIGNING_ACCESS_MODE_LABELS,
  ESIGNING_RECIPIENT_TYPE_LABELS,
  ESIGNING_SIGNING_ORDER_LABELS,
  formatEsigningDateTime,
  formatEsigningFileSize,
  PdfGenerationBadge,
  RecipientStatusBadge,
} from '@/components/esigning/esigning-shared';
import { cn } from '@/lib/utils';

type EnvelopeDownloadVariant =
  | 'documents'
  | 'documents_with_certificates'
  | 'certificates';
type DocumentDownloadVariant =
  | 'original'
  | 'signed'
  | 'signed_with_certificate';

interface Props {
  envelope: EsigningEnvelopeDetailDto;
  returnHref: string;
  canCreateEsigning: boolean;
  isDuplicating: boolean;
  onDuplicate: () => void;
  onDelete: () => void;
  onRetryProcessing: () => void;
  onEnvelopeDownload: (variant: EnvelopeDownloadVariant) => void;
  onDocumentDownload: (
    document: EsigningEnvelopeDetailDto['documents'][number],
    variant: DocumentDownloadVariant
  ) => void;
}

function formatEventAction(event: EsigningEnvelopeEventDto): string {
  const name = event.recipientName ?? 'Unknown';
  const metadata = event.metadata;
  if (event.action === 'REMINDER_SENT' && metadata?.kind === 'expiry_warning') {
    return 'Expiry warning sent to sender';
  }

  const labels: Partial<Record<EsigningEnvelopeEventAction, string>> = {
    CREATED: 'Envelope created',
    SENT: 'Sent for signing',
    VIEWED: `Viewed by ${name}`,
    CONSENTED: `Consent given by ${name}`,
    SIGNED: `Signed by ${name}`,
    COMPLETED: 'Envelope completed',
    DECLINED: `Declined by ${name}`,
    VOIDED: 'Envelope voided',
    CORRECTED: `Recipient corrected: ${name}`,
    EXPIRED: 'Envelope expired',
    REMINDER_SENT: `Reminder sent to ${name}`,
    PDF_GENERATION_FAILED: 'Document processing failed',
  };
  return labels[event.action] ?? event.action.replace(/_/g, ' ');
}

export function EsigningCompletedDetail({
  envelope,
  returnHref,
  canCreateEsigning,
  isDuplicating,
  onDuplicate,
  onDelete,
  onRetryProcessing,
  onEnvelopeDownload,
  onDocumentDownload,
}: Props) {
  const [showAllActivity, setShowAllActivity] = useState(false);
  const visibleEvents = useMemo(
    () => (showAllActivity ? envelope.events : envelope.events.slice(0, 6)),
    [envelope.events, showAllActivity]
  );
  const latestEmailFailure = envelope.emailDelivery.failures[0] ?? null;
  const signingModeLabel = `${ESIGNING_SIGNING_ORDER_LABELS[envelope.signingOrder]} signing`;
  const downloadsReady = envelope.pdfGenerationStatus === 'COMPLETED';
  const hasEnvelopeActions =
    (envelope.canDuplicate && canCreateEsigning) ||
    envelope.canDelete ||
    envelope.canRetryCompletionProcessing;

  return (
    <div className="min-h-screen bg-background-primary">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-5 p-4 sm:p-6">
        <div>
          <Link
            href={returnHref}
            className="inline-flex items-center gap-2 rounded-full border border-border-primary bg-background-secondary px-3 py-1.5 text-sm text-text-secondary hover:bg-background-tertiary"
          >
            <ArrowLeft className="h-4 w-4" />
            Back
          </Link>
        </div>

        <section
          data-testid="completed-envelope-header"
          className="rounded-2xl border border-border-primary bg-background-secondary p-5 shadow-sm sm:p-6"
        >
          <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
            <div className="min-w-0 flex-1">
              <div className="flex min-w-0 items-start gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-oak-primary/10 text-oak-primary">
                  <FileSignature className="h-5 w-5" />
                </div>
                <div className="min-w-0">
                  <h1
                    className="truncate text-xl font-semibold text-text-primary sm:text-2xl"
                    title={envelope.title}
                  >
                    {envelope.title}
                  </h1>
                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    <EnvelopeStatusBadge status={envelope.status} />
                    <span className="inline-flex items-center rounded-full border border-border-primary bg-background-primary px-2.5 py-1 text-xs font-medium text-text-secondary">
                      {signingModeLabel}
                    </span>
                    {envelope.emailDelivery.status === 'failed' ? (
                      <span className="inline-flex items-center gap-1 rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1 text-xs font-medium text-amber-800">
                        <AlertTriangle className="h-3.5 w-3.5" aria-hidden="true" />
                        Email failed
                      </span>
                    ) : null}
                    {envelope.pdfGenerationStatus &&
                    envelope.pdfGenerationStatus !== 'COMPLETED' ? (
                      <PdfGenerationBadge status={envelope.pdfGenerationStatus} />
                    ) : null}
                  </div>
                  <div className="mt-3 space-y-1 text-xs text-text-secondary sm:text-sm">
                    <p>
                      Certificate{' '}
                      <span className="font-medium text-text-primary">
                        {envelope.certificateId}
                      </span>
                    </p>
                    <p>Updated {formatEsigningDateTime(envelope.updatedAt)}</p>
                  </div>
                </div>
              </div>

              {envelope.pdfGenerationError ? (
                <Alert variant="warning" className="mt-4">
                  {envelope.pdfGenerationError}
                </Alert>
              ) : null}
              {latestEmailFailure ? (
                <Alert
                  variant="warning"
                  title="Some e-signing emails failed to send"
                  className="mt-4"
                >
                  Last failure: {latestEmailFailure.to} - {latestEmailFailure.error}
                </Alert>
              ) : null}
            </div>

            <div className="flex shrink-0 items-center gap-2">
              {downloadsReady ? (
                <Dropdown>
                  <DropdownTrigger
                    className="whitespace-nowrap"
                    aria-label="Envelope download options"
                  >
                    <Download className="h-4 w-4" aria-hidden="true" />
                    Download
                  </DropdownTrigger>
                  <DropdownMenu align="right">
                    <DropdownItem onClick={() => onEnvelopeDownload('documents')}>
                      Document only
                    </DropdownItem>
                    <DropdownItem
                      onClick={() =>
                        onEnvelopeDownload('documents_with_certificates')
                      }
                    >
                      Document + Certificate
                    </DropdownItem>
                    <DropdownItem onClick={() => onEnvelopeDownload('certificates')}>
                      Certificate only
                    </DropdownItem>
                  </DropdownMenu>
                </Dropdown>
              ) : null}

              {hasEnvelopeActions ? (
                <Dropdown>
                  <DropdownTrigger asChild aria-label="More envelope actions">
                    <span className="flex h-9 w-9 items-center justify-center rounded-lg border border-border-primary bg-background-elevated text-text-secondary hover:bg-background-tertiary hover:text-text-primary">
                      <MoreHorizontal className="h-4 w-4" />
                    </span>
                  </DropdownTrigger>
                  <DropdownMenu align="right">
                    {envelope.canRetryCompletionProcessing ? (
                      <DropdownItem onClick={onRetryProcessing}>
                        {envelope.pdfGenerationStatus === 'FAILED'
                          ? 'Retry processing'
                          : 'Resume processing'}
                      </DropdownItem>
                    ) : null}
                    {envelope.canRetryCompletionProcessing &&
                    ((envelope.canDuplicate && canCreateEsigning) ||
                      envelope.canDelete) ? (
                      <DropdownSeparator />
                    ) : null}
                    {envelope.canDuplicate && canCreateEsigning ? (
                      <DropdownItem
                        icon={<Copy className="h-4 w-4" />}
                        disabled={isDuplicating}
                        onClick={onDuplicate}
                      >
                        Duplicate
                      </DropdownItem>
                    ) : null}
                    {envelope.canDelete ? (
                      <DropdownItem
                        destructive
                        icon={<Trash2 className="h-4 w-4" />}
                        onClick={onDelete}
                      >
                        Delete envelope
                      </DropdownItem>
                    ) : null}
                  </DropdownMenu>
                </Dropdown>
              ) : null}
            </div>
          </div>
        </section>

        <div className="grid gap-5 lg:grid-cols-[minmax(0,1.65fr)_minmax(320px,1fr)] lg:items-start">
          <div className="space-y-5">
            <section
              data-testid="completed-recipients-section"
              className="rounded-2xl border border-border-primary bg-background-secondary p-5 shadow-sm sm:p-6"
            >
              <div className="flex items-center justify-between gap-3">
                <h2 className="text-lg font-semibold text-text-primary">Recipients</h2>
                <span className="text-sm tabular-nums text-text-muted">
                  {envelope.recipientCount}
                </span>
              </div>

              <div className="mt-3 divide-y divide-border-primary">
                {envelope.recipients.map((recipient) => (
                  <div
                    key={recipient.id}
                    data-testid="completed-recipient-row"
                    className="flex flex-col gap-2 py-3 first:pt-1 last:pb-0 sm:flex-row sm:items-start sm:justify-between"
                  >
                    <div className="flex min-w-0 items-start gap-3">
                      <span
                        className="mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full"
                        style={{ backgroundColor: recipient.colorTag }}
                        aria-hidden="true"
                      />
                      <div className="min-w-0">
                        <div className="font-medium text-text-primary">
                          {recipient.name}
                        </div>
                        <div className="mt-1 break-all text-sm text-text-secondary">
                          {recipient.email || 'No email'}
                        </div>
                        <div className="mt-1 text-xs text-text-muted">
                          {ESIGNING_ACCESS_MODE_LABELS[recipient.accessMode]}
                          {envelope.signingOrder !== 'PARALLEL' &&
                          recipient.type === 'SIGNER' &&
                          recipient.signingOrder
                            ? ` · Signing order ${recipient.signingOrder}`
                            : ''}
                        </div>
                      </div>
                    </div>
                    <div className="flex flex-wrap items-center gap-1.5 pl-5 sm:justify-end sm:pl-0">
                      {recipient.type === 'CC' ? (
                        <CopyDeliveryStatusBadge
                          status={recipient.copyDeliveryStatus}
                        />
                      ) : (
                        <RecipientStatusBadge
                          status={recipient.status}
                          accessMode={recipient.accessMode}
                        />
                      )}
                      <span
                        className={cn(
                          'inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-medium',
                          recipient.type === 'SIGNER'
                            ? 'border-oak-primary/20 bg-oak-primary/10 text-oak-primary'
                            : 'border-border-primary bg-background-primary text-text-secondary'
                        )}
                      >
                        {ESIGNING_RECIPIENT_TYPE_LABELS[recipient.type]}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </section>

            <section
              data-testid="completed-documents-section"
              className="rounded-2xl border border-border-primary bg-background-secondary p-5 shadow-sm sm:p-6"
            >
              <div className="flex items-center justify-between gap-3">
                <h2 className="text-lg font-semibold text-text-primary">Documents</h2>
                <span className="text-sm tabular-nums text-text-muted">
                  {envelope.documentCount}
                </span>
              </div>

              <div className="mt-3 divide-y divide-border-primary">
                {envelope.documents.map((doc) => (
                  <div
                    key={doc.id}
                    data-testid="completed-document-row"
                    className="flex items-center justify-between gap-4 py-3 first:pt-1 last:pb-0"
                  >
                    <div className="min-w-0">
                      <div
                        className="truncate font-medium text-text-primary"
                        title={doc.fileName}
                      >
                        {doc.fileName}
                      </div>
                      <div className="mt-1 text-xs text-text-secondary">
                        {doc.pageCount}{' '}
                        {doc.pageCount === 1 ? 'page' : 'pages'} ·{' '}
                        {formatEsigningFileSize(doc.fileSize)}
                      </div>
                    </div>

                    <Dropdown className="shrink-0">
                      <DropdownTrigger
                        className="whitespace-nowrap"
                        aria-label={`Download options for ${doc.fileName}`}
                      >
                        <Download className="h-4 w-4" aria-hidden="true" />
                        Download
                      </DropdownTrigger>
                      <DropdownMenu align="right">
                        <DropdownItem
                          onClick={() => onDocumentDownload(doc, 'original')}
                        >
                          Original
                        </DropdownItem>
                        <DropdownItem
                          disabled={!doc.signedPdfUrl || !downloadsReady}
                          onClick={() => onDocumentDownload(doc, 'signed')}
                        >
                          Document only
                        </DropdownItem>
                        <DropdownItem
                          disabled={!doc.signedPdfUrl || !downloadsReady}
                          onClick={() =>
                            onDocumentDownload(doc, 'signed_with_certificate')
                          }
                        >
                          Document + Certificate
                        </DropdownItem>
                      </DropdownMenu>
                    </Dropdown>
                  </div>
                ))}
              </div>
            </section>
          </div>

          <aside className="lg:sticky lg:top-6">
            <section
              data-testid="completed-activity-section"
              className="rounded-2xl border border-border-primary bg-background-secondary p-5 shadow-sm sm:p-6"
            >
              <div className="flex items-center justify-between gap-3">
                <h2 className="text-lg font-semibold text-text-primary">Activity</h2>
                {envelope.events.length > 6 ? (
                  <button
                    type="button"
                    onClick={() => setShowAllActivity((current) => !current)}
                    className="text-xs font-medium text-oak-primary hover:underline"
                  >
                    {showAllActivity
                      ? 'Collapse activity ↑'
                      : 'Show all activity →'}
                  </button>
                ) : null}
              </div>

              <div className="relative mt-4">
                <div className="absolute bottom-2 left-[7px] top-2 w-px bg-border-primary/70" />
                <div className="space-y-2.5">
                  {visibleEvents.map((event) => {
                    const isCompletion = event.action === 'COMPLETED';
                    return (
                      <div key={event.id} className="relative flex gap-3">
                        <div className="relative z-10 flex w-4 shrink-0 justify-center pt-1">
                          <div
                            className={cn(
                              'rounded-full border',
                              isCompletion
                                ? 'h-3.5 w-3.5 border-oak-primary bg-oak-primary ring-2 ring-oak-primary/10'
                                : 'h-2.5 w-2.5 border-border-secondary bg-background-secondary'
                            )}
                          />
                        </div>
                        <div
                          className={cn(
                            'min-w-0 flex-1 pb-2',
                            isCompletion && 'pb-3'
                          )}
                        >
                          <div
                            className={cn(
                              'text-sm text-text-primary',
                              isCompletion ? 'font-semibold' : 'font-normal'
                            )}
                          >
                            {formatEventAction(event)}
                          </div>
                          <div className="mt-0.5 text-xs text-text-muted">
                            {formatEsigningDateTime(event.createdAt)}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                  {envelope.events.length === 0 ? (
                    <p className="pl-5 text-sm text-text-muted">
                      No activity yet.
                    </p>
                  ) : null}
                </div>
              </div>
            </section>
          </aside>
        </div>
      </div>
    </div>
  );
}
