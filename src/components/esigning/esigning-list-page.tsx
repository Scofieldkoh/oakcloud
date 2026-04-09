'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import {
  CheckCircle2,
  Circle,
  Clock,
  Download,
  ExternalLink,
  FilePenLine,
  FileSignature,
  Minus,
  MoreHorizontal,
  Plus,
  RefreshCw,
  Search,
  Send,
  Trash2,
  XCircle,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { FormInput } from '@/components/ui/form-input';
import { Alert } from '@/components/ui/alert';
import { Pagination } from '@/components/ui/pagination';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { Modal, ModalBody, ModalFooter } from '@/components/ui/modal';
import { Dropdown, DropdownItem, DropdownMenu, DropdownSeparator, DropdownTrigger } from '@/components/ui/dropdown';
import { useToast } from '@/components/ui/toast';
import { usePermissions } from '@/hooks/use-permissions';
import {
  useCreateEsigningEnvelope,
  useDeleteEsigningEnvelope,
  useEsigningEnvelopes,
  useResendEsigningEnvelope,
  useRetryEsigningEnvelopeProcessing,
  useVoidEsigningEnvelope,
} from '@/hooks/use-esigning';
import type { EsigningEnvelopeListItem, EsigningManualLinkDto } from '@/types/esigning';
import {
  EnvelopeStatusBadge,
  ESIGNING_SIGNING_ORDER_LABELS,
  formatEsigningDateTime,
} from '@/components/esigning/esigning-shared';
import { cn } from '@/lib/utils';

type StatusFilter =
  | 'DRAFT'
  | 'SENT'
  | 'IN_PROGRESS'
  | 'COMPLETED'
  | 'VOIDED'
  | 'DECLINED'
  | 'EXPIRED';

type TabKey = 'all' | 'attention' | 'waiting' | 'completed' | 'voided';

const TAB_LABELS: Record<TabKey, string> = {
  all: 'All',
  attention: 'Needs Attention',
  waiting: 'Waiting',
  completed: 'Completed',
  voided: 'Voided / Expired',
};

const TAB_STATUSES: Record<TabKey, StatusFilter[]> = {
  all: [],
  attention: ['DRAFT', 'DECLINED'],
  waiting: ['SENT', 'IN_PROGRESS'],
  completed: ['COMPLETED'],
  voided: ['VOIDED', 'EXPIRED'],
};

interface EnvelopeActionsDropdownProps {
  envelope: EsigningEnvelopeListItem;
  onResend: (envelope: EsigningEnvelopeListItem) => void;
  onDelete: (envelope: EsigningEnvelopeListItem) => void;
  onVoid: (envelope: EsigningEnvelopeListItem) => void;
  onRetryPdf: (envelopeId: string) => void;
  onDownload: (
    envelopeId: string,
    tenantId: string,
    variant: 'documents' | 'documents_with_certificates' | 'certificates'
  ) => void;
}

function EnvelopeActionsDropdown({
  envelope,
  onResend,
  onDelete,
  onVoid,
  onRetryPdf,
  onDownload,
}: EnvelopeActionsDropdownProps) {
  const hasActions =
    envelope.canResend ||
    envelope.canDelete ||
    envelope.canVoid ||
    envelope.canRetryPdf ||
    envelope.status === 'COMPLETED';

  if (!hasActions) {
    return null;
  }

  return (
    <Dropdown>
      <DropdownTrigger asChild aria-label={`Actions for ${envelope.title}`}>
        <button className="rounded-lg p-2 text-text-tertiary transition-colors hover:bg-background-tertiary hover:text-text-primary">
          <MoreHorizontal className="h-4 w-4" aria-hidden="true" />
        </button>
      </DropdownTrigger>
      <DropdownMenu>
        <Link href={`/esigning/${envelope.id}`}>
          <DropdownItem icon={<ExternalLink className="h-4 w-4" />}>Open envelope</DropdownItem>
        </Link>

        {envelope.status === 'COMPLETED' ? (
          <>
            <DropdownItem
              icon={<Download className="h-4 w-4" />}
              onClick={() => onDownload(envelope.id, envelope.tenantId, 'documents')}
            >
              Document only
            </DropdownItem>
            <DropdownItem
              icon={<Download className="h-4 w-4" />}
              onClick={() => onDownload(envelope.id, envelope.tenantId, 'documents_with_certificates')}
            >
              Document + Certificate
            </DropdownItem>
            <DropdownItem
              icon={<Download className="h-4 w-4" />}
              onClick={() => onDownload(envelope.id, envelope.tenantId, 'certificates')}
            >
              Certificate only
            </DropdownItem>
          </>
        ) : null}

        {envelope.canResend ? (
          <DropdownItem
            icon={<Send className="h-4 w-4" />}
            onClick={() => onResend(envelope)}
          >
            Resend active requests
          </DropdownItem>
        ) : null}

        {envelope.canRetryPdf ? (
          <DropdownItem
            icon={<RefreshCw className="h-4 w-4" />}
            onClick={() => onRetryPdf(envelope.id)}
          >
            {envelope.pdfGenerationStatus === 'FAILED' ? 'Retry PDF generation' : 'Generate PDF now'}
          </DropdownItem>
        ) : null}

        {envelope.canVoid || envelope.canDelete ? <DropdownSeparator /> : null}

        {envelope.canVoid ? (
          <DropdownItem
            destructive
            icon={<XCircle className="h-4 w-4" />}
            onClick={() => onVoid(envelope)}
          >
            Void envelope
          </DropdownItem>
        ) : null}

        {envelope.canDelete ? (
          <DropdownItem
            destructive
            icon={<Trash2 className="h-4 w-4" />}
            onClick={() => onDelete(envelope)}
          >
            Delete draft
          </DropdownItem>
        ) : null}
      </DropdownMenu>
    </Dropdown>
  );
}

export function EsigningListPage() {
  const { can } = usePermissions();
  const toast = useToast();
  const [query, setQuery] = useState('');
  const [activeTab, setActiveTab] = useState<TabKey>('all');
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(20);
  const [isStarting, setIsStarting] = useState(false);
  const [isDraggingOnHero, setIsDraggingOnHero] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<EsigningEnvelopeListItem | null>(null);
  const [voidTarget, setVoidTarget] = useState<EsigningEnvelopeListItem | null>(null);
  const [retryTargetId, setRetryTargetId] = useState<string | null>(null);
  const [manualLinks, setManualLinks] = useState<EsigningManualLinkDto[]>([]);
  const [isLinksModalOpen, setIsLinksModalOpen] = useState(false);

  const activeStatuses = TAB_STATUSES[activeTab];
  const envelopesQuery = useEsigningEnvelopes({
    query: query || undefined,
    statuses: activeStatuses.length > 0 ? activeStatuses : undefined,
    page,
    limit,
  });
  const createEnvelope = useCreateEsigningEnvelope();
  const deleteEnvelope = useDeleteEsigningEnvelope();
  const resendEnvelope = useResendEsigningEnvelope();
  const voidEnvelope = useVoidEsigningEnvelope(voidTarget?.id ?? '');
  const retryProcessing = useRetryEsigningEnvelopeProcessing(retryTargetId ?? '');

  const envelopes = useMemo(
    () => (envelopesQuery.data?.envelopes ?? []) as EsigningEnvelopeListItem[],
    [envelopesQuery.data?.envelopes]
  );

  const statusCounts = useMemo(
    () =>
      envelopesQuery.data?.statusCounts ?? {
        DRAFT: 0,
        SENT: 0,
        IN_PROGRESS: 0,
        COMPLETED: 0,
        VOIDED: 0,
        DECLINED: 0,
        EXPIRED: 0,
      },
    [envelopesQuery.data?.statusCounts]
  );

  useEffect(() => {
    setPage(1);
  }, [activeTab, query]);

  const tabCounts = useMemo<Record<TabKey, number>>(
    () => ({
      all: Object.values(statusCounts).reduce((sum, count) => sum + count, 0),
      attention: statusCounts.DRAFT + statusCounts.DECLINED,
      waiting: statusCounts.SENT + statusCounts.IN_PROGRESS,
      completed: statusCounts.COMPLETED,
      voided: statusCounts.VOIDED + statusCounts.EXPIRED,
    }),
    [statusCounts]
  );

  const totalResults = envelopesQuery.data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(totalResults / limit));

  async function handleStart(file?: File) {
    if (isStarting) {
      return;
    }

    try {
      setIsStarting(true);
      const title = file ? file.name.replace(/\.pdf$/i, '') : 'New Envelope';
      const envelope = await createEnvelope.mutateAsync({ title, signingOrder: 'PARALLEL' });
      const destination = `/esigning/${envelope.id}`;

      if (file) {
        const formData = new FormData();
        formData.set('file', file);
        await fetch(`/api/esigning/envelopes/${envelope.id}/documents`, {
          method: 'POST',
          body: formData,
        });
      }

      window.location.assign(destination);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to create envelope');
    } finally {
      setIsStarting(false);
    }
  }

  async function handleRetryPdf(envelopeId: string) {
    try {
      setRetryTargetId(envelopeId);
      const targetEnvelope = envelopes.find((envelope) => envelope.id === envelopeId);
      await retryProcessing.mutateAsync();
      toast.success(
        targetEnvelope?.pdfGenerationStatus === 'FAILED'
          ? 'PDF generation retried'
          : 'PDF generation triggered'
      );
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : 'Failed to trigger PDF generation'
      );
    } finally {
      setRetryTargetId(null);
    }
  }

  function handleDownload(
    envelopeId: string,
    tenantId: string,
    variant: 'documents' | 'documents_with_certificates' | 'certificates'
  ) {
    const queryParams = new URLSearchParams({ variant, tenantId });
    window.open(`/api/esigning/envelopes/${envelopeId}/download?${queryParams.toString()}`, '_blank', 'noreferrer');
  }

  async function handleResendEnvelope(envelope: EsigningEnvelopeListItem) {
    try {
      const result = await resendEnvelope.mutateAsync(envelope.id);
      if (result.manualLinks.length > 0) {
        setManualLinks(result.manualLinks);
        setIsLinksModalOpen(true);
      }

      const signerLabel =
        envelope.resendableRecipientCount === 1 ? '1 signer' : `${envelope.resendableRecipientCount} signers`;
      toast.success(`Resent active signing request to ${signerLabel}`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to resend active signing requests');
    }
  }

  if (!can.readEsigning) {
    return (
      <div className="p-6">
        <Alert variant="error" title="Access denied">
          You do not have permission to view e-signing envelopes.
        </Alert>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background-primary">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-4 p-4 sm:gap-6 sm:p-6">
        <section className="rounded-2xl border border-border-primary bg-background-secondary p-4 shadow-sm sm:rounded-3xl sm:p-6">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div className="space-y-2">
              <div className="inline-flex items-center gap-2 rounded-full border border-border-primary bg-background-tertiary px-3 py-1 text-xs font-medium uppercase tracking-[0.18em] text-text-muted">
                <FileSignature className="h-3.5 w-3.5" />
                E-Signing
              </div>
              <div>
                <h1 className="text-2xl font-semibold text-text-primary sm:text-3xl">Envelopes</h1>
                <p className="mt-1 max-w-2xl text-sm text-text-secondary">
                  Prepare signature packages, manage signer access, and track document completion from one queue.
                </p>
              </div>
            </div>
          </div>
        </section>

        {can.createEsigning ? (
          <section
            onDragOver={(event) => {
              event.preventDefault();
              setIsDraggingOnHero(true);
            }}
            onDragLeave={() => setIsDraggingOnHero(false)}
            onDrop={(event) => {
              event.preventDefault();
              setIsDraggingOnHero(false);
              const file = event.dataTransfer.files[0];
              if (file?.type === 'application/pdf') {
                void handleStart(file);
              }
            }}
            className={cn(
              'flex flex-col items-center justify-center gap-4 rounded-2xl border-2 border-dashed p-6 text-center transition-colors sm:rounded-3xl sm:p-10',
              isDraggingOnHero
                ? 'border-oak-primary bg-oak-primary/5'
                : 'border-border-primary bg-background-secondary hover:border-oak-primary/40 hover:bg-background-secondary/80'
            )}
          >
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-oak-primary/10 text-oak-primary">
              <FileSignature className="h-6 w-6" />
            </div>
            <div>
              <p className="text-base font-semibold text-text-primary">Sign or get signatures</p>
              <p className="mt-1 text-sm text-text-secondary">
                Drop a PDF here to start, or click the button below.
              </p>
            </div>
            <Button
              leftIcon={<Plus className="h-4 w-4" />}
              isLoading={isStarting}
              onClick={() => void handleStart()}
            >
              Start
            </Button>
          </section>
        ) : null}

        <section className="overflow-hidden rounded-2xl border border-border-primary bg-background-secondary shadow-sm sm:rounded-3xl">
          <div className="flex gap-0 overflow-x-auto border-b border-border-primary px-2 sm:px-4">
            {(Object.keys(TAB_LABELS) as TabKey[]).map((tab) => (
              <button
                key={tab}
                type="button"
                onClick={() => setActiveTab(tab)}
                className={cn(
                  'relative flex shrink-0 items-center gap-1.5 whitespace-nowrap px-3 py-3 text-sm font-medium transition-colors sm:px-4',
                  activeTab === tab
                    ? 'text-oak-primary after:absolute after:bottom-0 after:left-0 after:right-0 after:h-0.5 after:bg-oak-primary'
                    : 'text-text-secondary hover:text-text-primary'
                )}
              >
                {TAB_LABELS[tab]}
                <span
                  className={cn(
                    'rounded-full px-1.5 py-0.5 text-xs font-semibold',
                    activeTab === tab
                      ? 'bg-oak-primary/10 text-oak-primary'
                      : 'bg-background-tertiary text-text-muted'
                  )}
                >
                  {tabCounts[tab]}
                </span>
              </button>
            ))}
          </div>
          <div className="p-4">
            <FormInput
              placeholder="Search envelopes, senders, or recipients..."
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              leftIcon={<Search className="h-4 w-4" />}
            />
          </div>
        </section>

        {envelopesQuery.error ? (
          <Alert variant="error" title="Unable to load envelopes">
            {envelopesQuery.error instanceof Error ? envelopesQuery.error.message : 'Unknown error'}
          </Alert>
        ) : null}

        <section className="grid gap-4">
          {envelopes.map((envelope) => (
            <article
              key={envelope.id}
              className="overflow-hidden rounded-2xl border border-border-primary bg-background-secondary p-4 shadow-sm transition-colors hover:border-oak-primary/40 sm:rounded-3xl sm:p-5"
            >
              <div className="flex items-start justify-between gap-3 sm:gap-4">
                <Link href={`/esigning/${envelope.id}`} className="min-w-0 flex-1">
                  <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                    <div className="space-y-3">
                      <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
                        <EnvelopeStatusBadge status={envelope.status} />
                        <span className="inline-flex items-center rounded-full border border-border-primary px-2.5 py-1 text-xs text-text-secondary">
                          {ESIGNING_SIGNING_ORDER_LABELS[envelope.signingOrder]}
                        </span>
                        <span className="inline-flex items-center rounded-full border border-border-primary px-2.5 py-1 text-xs text-text-secondary">
                          {envelope.documentCount} docs
                        </span>
                        <span className="inline-flex items-center rounded-full border border-border-primary px-2.5 py-1 text-xs text-text-secondary">
                          {envelope.signerCount} signers
                        </span>
                      </div>

                      <div className="flex items-start gap-3">
                        <div className="rounded-2xl bg-oak-primary/10 p-3 text-oak-primary">
                          <FilePenLine className="h-5 w-5" />
                        </div>
                        <div className="min-w-0">
                          <h2 className="truncate text-lg font-semibold text-text-primary">
                            {envelope.title}
                          </h2>
                          <p className="mt-1 truncate text-sm text-text-secondary">
                            {envelope.companyName ?? 'No linked company'} · Created by {envelope.createdByName}
                          </p>
                        </div>
                      </div>
                    </div>

                    <div className="grid gap-1 text-xs text-text-secondary sm:text-sm lg:text-right">
                      <div>Updated {formatEsigningDateTime(envelope.updatedAt)}</div>
                      <div>Created {formatEsigningDateTime(envelope.createdAt)}</div>
                      <div className="truncate">Certificate {envelope.certificateId}</div>
                    </div>
                  </div>
                </Link>

                <EnvelopeActionsDropdown
                  envelope={envelope}
                  onResend={(target) => void handleResendEnvelope(target)}
                  onDelete={setDeleteTarget}
                  onVoid={setVoidTarget}
                  onRetryPdf={(envelopeId) => void handleRetryPdf(envelopeId)}
                  onDownload={handleDownload}
                />
              </div>

              <div className="mt-4 flex flex-wrap gap-2">
                {envelope.recipients.slice(0, 4).map((recipient) => {
                  const StatusIcon =
                    recipient.status === 'SIGNED'
                      ? CheckCircle2
                      : recipient.status === 'DECLINED'
                        ? XCircle
                        : recipient.status === 'VIEWED' || recipient.status === 'NOTIFIED'
                          ? Clock
                          : recipient.type === 'CC'
                            ? Minus
                            : Circle;

                  const iconColor =
                    recipient.status === 'SIGNED'
                      ? 'text-green-500'
                      : recipient.status === 'DECLINED'
                        ? 'text-rose-500'
                        : recipient.status === 'VIEWED' || recipient.status === 'NOTIFIED'
                          ? 'text-blue-500'
                          : 'text-text-muted';

                  return (
                    <span
                      key={recipient.id}
                      className="inline-flex items-center gap-1.5 rounded-full border border-border-primary bg-background-primary px-3 py-1 text-xs text-text-secondary"
                    >
                      <StatusIcon className={cn('h-3 w-3 flex-shrink-0', iconColor)} />
                      {recipient.name}
                    </span>
                  );
                })}

                {envelope.recipientCount > 4 ? (
                  <span className="inline-flex items-center rounded-full border border-border-primary bg-background-primary px-3 py-1 text-xs text-text-secondary">
                    +{envelope.recipientCount - 4} more
                  </span>
                ) : null}
              </div>

              <div className="mt-3 text-xs text-text-muted">
                {envelope.status === 'DRAFT'
                  ? `Draft · ${envelope.documentCount} doc${envelope.documentCount === 1 ? '' : 's'} · ${envelope.signerCount} signer${envelope.signerCount === 1 ? '' : 's'}`
                  : envelope.status === 'COMPLETED'
                    ? `Completed ${envelope.completedAt ? formatEsigningDateTime(envelope.completedAt) : ''}`
                    : envelope.status === 'DECLINED'
                      ? 'Declined - action required'
                      : envelope.status === 'VOIDED'
                        ? 'Voided'
                        : envelope.status === 'EXPIRED'
                          ? 'Expired'
                          : `Updated ${formatEsigningDateTime(envelope.updatedAt)}`}
              </div>
            </article>
          ))}

          {envelopesQuery.isLoading ? (
            <div className="rounded-2xl border border-dashed border-border-primary bg-background-secondary p-6 text-center text-sm text-text-secondary sm:rounded-3xl sm:p-10">
              Loading e-signing envelopes...
            </div>
          ) : null}

          {!envelopesQuery.isLoading && envelopes.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-border-primary bg-background-secondary p-6 text-center sm:rounded-3xl sm:p-10">
              <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-oak-primary/10 text-oak-primary">
                <FileSignature className="h-6 w-6" />
              </div>
              <h2 className="mt-4 text-lg font-semibold text-text-primary">
                {query || activeTab !== 'all' ? 'No matching envelopes' : 'No envelopes yet'}
              </h2>
              <p className="mt-2 text-sm text-text-secondary">
                {query || activeTab !== 'all'
                  ? 'Try a different search or tab to find the envelope you need.'
                  : 'Start with a draft envelope, upload PDFs, assign signers, and send for signature.'}
              </p>
            </div>
          ) : null}
        </section>

        {!envelopesQuery.isLoading && totalResults > 0 ? (
          <section className="rounded-2xl border border-border-primary bg-background-secondary p-3 shadow-sm sm:rounded-3xl sm:p-4">
            <Pagination
              page={page}
              totalPages={totalPages}
              total={totalResults}
              limit={limit}
              onPageChange={setPage}
              onLimitChange={(nextLimit) => {
                setLimit(nextLimit);
                setPage(1);
              }}
            />
          </section>
        ) : null}
      </div>

      <ConfirmDialog
        isOpen={Boolean(deleteTarget)}
        onClose={() => setDeleteTarget(null)}
        onConfirm={async () => {
          if (!deleteTarget) {
            return;
          }

          try {
            await deleteEnvelope.mutateAsync(deleteTarget.id);
            toast.success('Draft deleted');
            setDeleteTarget(null);
          } catch (error) {
            toast.error(error instanceof Error ? error.message : 'Failed to delete draft');
          }
        }}
        title="Delete draft envelope?"
        description={
          deleteTarget
            ? `This permanently removes "${deleteTarget.title}" and its uploaded source files.`
            : undefined
        }
        confirmLabel="Delete draft"
        isLoading={deleteEnvelope.isPending}
      />

      <ConfirmDialog
        isOpen={Boolean(voidTarget)}
        onClose={() => setVoidTarget(null)}
        onConfirm={async (reason) => {
          if (!voidTarget) {
            return;
          }

          try {
            await voidEnvelope.mutateAsync(reason ?? null);
            toast.success('Envelope voided');
            setVoidTarget(null);
          } catch (error) {
            toast.error(error instanceof Error ? error.message : 'Failed to void envelope');
          }
        }}
        title="Void envelope?"
        description={
          voidTarget
            ? `Signers will lose access to "${voidTarget.title}" immediately.`
            : undefined
        }
        confirmLabel="Void envelope"
        requireReason
        reasonLabel="Void reason"
        reasonPlaceholder="Explain why the envelope is being cancelled"
        reasonMinLength={3}
        isLoading={voidEnvelope.isPending}
      />

      <Modal
        isOpen={isLinksModalOpen}
        onClose={() => setIsLinksModalOpen(false)}
        title="Manual signing links"
        size="xl"
      >
        <ModalBody className="space-y-3">
          <Alert variant="info">
            Share these links securely with recipients whose access mode uses manual delivery.
          </Alert>
          {manualLinks.map((link) => (
            <div
              key={link.recipientId}
              className="rounded-2xl border border-border-primary bg-background-primary p-4"
            >
              <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                <div className="min-w-0">
                  <div className="font-medium text-text-primary">{link.recipientName}</div>
                  <div className="text-sm text-text-secondary">{link.recipientEmail}</div>
                  <div className="mt-2 break-all text-xs text-text-muted">{link.signingUrl}</div>
                </div>
                <Button
                  variant="secondary"
                  onClick={() =>
                    void navigator.clipboard
                      .writeText(link.signingUrl)
                      .then(() => toast.success('Manual link copied'))
                      .catch(() => toast.error('Clipboard access failed'))
                  }
                >
                  Copy
                </Button>
              </div>
            </div>
          ))}
        </ModalBody>
        <ModalFooter>
          <Button onClick={() => setIsLinksModalOpen(false)}>Done</Button>
        </ModalFooter>
      </Modal>
    </div>
  );
}
