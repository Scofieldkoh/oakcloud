'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { CheckCircle2, Circle, Clock, FilePenLine, FileSignature, Minus, Plus, Search, XCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { FormInput } from '@/components/ui/form-input';
import { Alert } from '@/components/ui/alert';
import { useToast } from '@/components/ui/toast';
import { usePermissions } from '@/hooks/use-permissions';
import { useCreateEsigningEnvelope, useEsigningEnvelopes } from '@/hooks/use-esigning';
import type { EsigningEnvelopeListItem } from '@/types/esigning';
import {
  EnvelopeStatusBadge,
  ESIGNING_SIGNING_ORDER_LABELS,
  formatEsigningDateTime,
} from '@/components/esigning/esigning-shared';
import { cn } from '@/lib/utils';

type StatusFilter = '' | 'DRAFT' | 'SENT' | 'IN_PROGRESS' | 'COMPLETED' | 'VOIDED' | 'DECLINED' | 'EXPIRED';

type TabKey = 'all' | 'attention' | 'waiting' | 'completed' | 'voided';

const TAB_LABELS: Record<TabKey, string> = {
  all: 'All',
  attention: 'Needs Attention',
  waiting: 'Waiting',
  completed: 'Completed',
  voided: 'Voided / Expired',
};

// Maps tab key → one or more StatusFilter values for filtering
const TAB_STATUSES: Record<TabKey, StatusFilter[]> = {
  all: [],
  attention: ['DRAFT', 'DECLINED'],
  waiting: ['SENT', 'IN_PROGRESS'],
  completed: ['COMPLETED'],
  voided: ['VOIDED', 'EXPIRED'],
};

export function EsigningListPage() {
  const router = useRouter();
  const { can } = usePermissions();
  const toast = useToast();
  const [query, setQuery] = useState('');
  const [activeTab, setActiveTab] = useState<TabKey>('all');
  const [isStarting, setIsStarting] = useState(false);
  const [isDraggingOnHero, setIsDraggingOnHero] = useState(false);

  const envelopesQuery = useEsigningEnvelopes({
    query: query || undefined,
    page: 1,
    limit: 200,
  });
  const createEnvelope = useCreateEsigningEnvelope();

  const allEnvelopes = useMemo(
    () => (envelopesQuery.data?.envelopes ?? []) as EsigningEnvelopeListItem[],
    [envelopesQuery.data?.envelopes],
  );

  const tabCounts = useMemo<Record<TabKey, number>>(
    () => ({
      all: allEnvelopes.length,
      attention: allEnvelopes.filter((e) => TAB_STATUSES.attention.includes(e.status as StatusFilter)).length,
      waiting: allEnvelopes.filter((e) => TAB_STATUSES.waiting.includes(e.status as StatusFilter)).length,
      completed: allEnvelopes.filter((e) => TAB_STATUSES.completed.includes(e.status as StatusFilter)).length,
      voided: allEnvelopes.filter((e) => TAB_STATUSES.voided.includes(e.status as StatusFilter)).length,
    }),
    [allEnvelopes],
  );

  const filteredEnvelopes = useMemo(
    () =>
      activeTab === 'all'
        ? allEnvelopes
        : allEnvelopes.filter((e) => TAB_STATUSES[activeTab].includes(e.status as StatusFilter)),
    [allEnvelopes, activeTab],
  );

  async function handleStart(file?: File) {
    if (isStarting) return;
    try {
      setIsStarting(true);
      const title = file ? file.name.replace(/\.pdf$/i, '') : 'New Envelope';
      const envelope = await createEnvelope.mutateAsync({ title, signingOrder: 'PARALLEL' });
      if (file) {
        const formData = new FormData();
        formData.set('file', file);
        await fetch(`/api/esigning/envelopes/${envelope.id}/documents`, {
          method: 'POST',
          body: formData,
        });
      }
      router.push(`/esigning/${envelope.id}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to create envelope');
      setIsStarting(false);
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
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-6 p-6">
        <section className="rounded-3xl border border-border-primary bg-background-secondary p-6 shadow-sm">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div className="space-y-2">
              <div className="inline-flex items-center gap-2 rounded-full border border-border-primary bg-background-tertiary px-3 py-1 text-xs font-medium uppercase tracking-[0.18em] text-text-muted">
                <FileSignature className="h-3.5 w-3.5" />
                E-Signing
              </div>
              <div>
                <h1 className="text-3xl font-semibold text-text-primary">Envelopes</h1>
                <p className="mt-1 max-w-2xl text-sm text-text-secondary">
                  Prepare signature packages, manage signer access, and track document completion from one queue.
                </p>
              </div>
            </div>
          </div>
        </section>

        {can.createEsigning ? (
          <section
            onDragOver={(e) => { e.preventDefault(); setIsDraggingOnHero(true); }}
            onDragLeave={() => setIsDraggingOnHero(false)}
            onDrop={(e) => {
              e.preventDefault();
              setIsDraggingOnHero(false);
              const file = e.dataTransfer.files[0];
              if (file?.type === 'application/pdf') void handleStart(file);
            }}
            className={cn(
              'flex flex-col items-center justify-center gap-4 rounded-3xl border-2 border-dashed p-10 text-center transition-colors',
              isDraggingOnHero
                ? 'border-oak-primary bg-oak-primary/5'
                : 'border-border-primary bg-background-secondary hover:border-oak-primary/40 hover:bg-background-secondary/80',
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

        {/* Filter tabs */}
        <section className="rounded-3xl border border-border-primary bg-background-secondary shadow-sm">
          <div className="flex flex-wrap gap-0 border-b border-border-primary px-4">
            {(Object.keys(TAB_LABELS) as TabKey[]).map((tab) => (
              <button
                key={tab}
                type="button"
                onClick={() => setActiveTab(tab)}
                className={cn(
                  'relative flex items-center gap-1.5 px-4 py-3 text-sm font-medium transition-colors',
                  activeTab === tab
                    ? 'text-oak-primary after:absolute after:bottom-0 after:left-0 after:right-0 after:h-0.5 after:bg-oak-primary'
                    : 'text-text-secondary hover:text-text-primary',
                )}
              >
                {TAB_LABELS[tab]}
                <span
                  className={cn(
                    'rounded-full px-1.5 py-0.5 text-xs font-semibold',
                    activeTab === tab
                      ? 'bg-oak-primary/10 text-oak-primary'
                      : 'bg-background-tertiary text-text-muted',
                  )}
                >
                  {tabCounts[tab]}
                </span>
              </button>
            ))}
          </div>
          <div className="p-4">
            <FormInput
              placeholder="Search envelopes, senders, or recipients…"
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
          {filteredEnvelopes.map((envelope) => (
            <Link
              key={envelope.id}
              href={`/esigning/${envelope.id}`}
              className="group rounded-3xl border border-border-primary bg-background-secondary p-5 shadow-sm transition-colors hover:border-oak-primary/40"
            >
              <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                <div className="space-y-3">
                  <div className="flex flex-wrap items-center gap-2">
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
                  <div>
                    <div className="flex items-start gap-3">
                      <div className="rounded-2xl bg-oak-primary/10 p-3 text-oak-primary">
                        <FilePenLine className="h-5 w-5" />
                      </div>
                      <div>
                        <h2 className="text-lg font-semibold text-text-primary">{envelope.title}</h2>
                        <p className="mt-1 text-sm text-text-secondary">
                          {envelope.companyName ?? 'No linked company'} • Created by {envelope.createdByName}
                        </p>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="grid gap-1 text-sm text-text-secondary lg:text-right">
                  <div>Updated {formatEsigningDateTime(envelope.updatedAt)}</div>
                  <div>Created {formatEsigningDateTime(envelope.createdAt)}</div>
                  <div>Certificate {envelope.certificateId}</div>
                </div>
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
              {/* Last activity */}
              <div className="mt-3 text-xs text-text-muted">
                {envelope.status === 'DRAFT'
                  ? `Draft · ${envelope.documentCount} doc${envelope.documentCount === 1 ? '' : 's'} · ${envelope.signerCount} signer${envelope.signerCount === 1 ? '' : 's'}`
                  : envelope.status === 'COMPLETED'
                    ? `Completed ${envelope.completedAt ? formatEsigningDateTime(envelope.completedAt) : ''}`
                    : envelope.status === 'DECLINED'
                      ? 'Declined — action required'
                      : envelope.status === 'VOIDED'
                        ? 'Voided'
                        : envelope.status === 'EXPIRED'
                          ? 'Expired'
                          : `Updated ${formatEsigningDateTime(envelope.updatedAt)}`}
              </div>
            </Link>
          ))}

          {envelopesQuery.isLoading ? (
            <div className="rounded-3xl border border-dashed border-border-primary bg-background-secondary p-10 text-center text-sm text-text-secondary">
              Loading e-signing envelopes...
            </div>
          ) : null}

          {!envelopesQuery.isLoading && filteredEnvelopes.length === 0 ? (
            <div className="rounded-3xl border border-dashed border-border-primary bg-background-secondary p-10 text-center">
              <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-oak-primary/10 text-oak-primary">
                <FileSignature className="h-6 w-6" />
              </div>
              <h2 className="mt-4 text-lg font-semibold text-text-primary">No envelopes yet</h2>
              <p className="mt-2 text-sm text-text-secondary">
                Start with a draft envelope, upload PDFs, assign signers, and send for signature.
              </p>
              {can.createEsigning ? (
                <div className="mt-5">
                  <Button isLoading={isStarting} onClick={() => void handleStart()}>Create your first envelope</Button>
                </div>
              ) : null}
            </div>
          ) : null}
        </section>
      </div>
    </div>
  );
}
