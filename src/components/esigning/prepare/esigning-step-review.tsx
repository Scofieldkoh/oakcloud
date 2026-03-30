'use client';

import { Send, Copy, CheckCircle2, AlertTriangle } from 'lucide-react';
import type { EsigningEnvelopeDetailDto, EsigningManualLinkDto } from '@/types/esigning';
import type { PlacedField } from './esigning-field-canvas';
import { Button } from '@/components/ui/button';
import {
  ESIGNING_ACCESS_MODE_LABELS,
  ESIGNING_RECIPIENT_TYPE_LABELS,
  ESIGNING_SIGNING_ORDER_LABELS,
  formatEsigningDateTime,
} from '@/components/esigning/esigning-shared';
import { useToast } from '@/components/ui/toast';

interface EsigningStepReviewProps {
  envelope: EsigningEnvelopeDetailDto;
  fields: PlacedField[];
  onSend: () => Promise<void>;
  isSending: boolean;
  onBack: () => void;
  manualLinks: EsigningManualLinkDto[];
}

export function EsigningStepReview({
  envelope,
  fields,
  onSend,
  isSending,
  onBack,
  manualLinks,
}: EsigningStepReviewProps) {
  const toast = useToast();
  const signerRecipients = envelope.recipients.filter((r) => r.type === 'SIGNER');
  const fieldSummaryByRecipient = new Map(
    signerRecipients.map((recipient) => {
      const recipientFields = fields.filter((field) => field.recipientId === recipient.id);
      return [
        recipient.id,
        {
          totalCount: recipientFields.length,
          requiredCount: recipientFields.filter((field) => field.required).length,
          signatureCount: recipientFields.filter(
            (field) => field.type === 'SIGNATURE' || field.type === 'INITIALS'
          ).length,
        },
      ];
    })
  );

  // Validation
  const blockingIssues: string[] = [];
  if (envelope.documents.length === 0) blockingIssues.push('Upload at least one document');
  if (signerRecipients.length === 0) blockingIssues.push('Add at least one signer');
  signerRecipients.forEach((r) => {
    const summary = fieldSummaryByRecipient.get(r.id);
    if (!summary || summary.totalCount === 0) {
      blockingIssues.push(`${r.name} has no fields assigned`);
    } else if (summary.signatureCount === 0) {
      blockingIssues.push(`${r.name} has no signature field`);
    }
    if (r.accessMode === 'EMAIL_WITH_CODE' && !r.hasAccessCode) {
      blockingIssues.push(`${r.name} requires an access code`);
    }
  });

  const isReady = blockingIssues.length === 0;

  return (
    <div className="pb-20">
      <div className="max-w-4xl mx-auto p-6 space-y-6">
        {/* Envelope summary card */}
        <section className="rounded-3xl border border-border-primary bg-background-secondary p-6 shadow-sm">
          <h1 className="text-2xl font-semibold text-text-primary">{envelope.title}</h1>
          <div className="mt-3 flex flex-wrap items-center gap-3">
            <span className="inline-flex items-center rounded-full border border-border-primary px-3 py-1 text-xs text-text-secondary">
              {ESIGNING_SIGNING_ORDER_LABELS[envelope.signingOrder]}
            </span>
            {envelope.companyName && (
              <span className="text-sm text-text-secondary">{envelope.companyName}</span>
            )}
            {envelope.expiresAt && (
              <span className="text-sm text-text-secondary">
                Expires {formatEsigningDateTime(envelope.expiresAt)}
              </span>
            )}
          </div>
          {envelope.message && (
            <p className="mt-4 rounded-2xl border border-border-primary bg-background-primary p-4 text-sm text-text-secondary whitespace-pre-wrap">
              {envelope.message}
            </p>
          )}
        </section>

        {/* Signers section */}
        <section>
          <h2 className="mb-3 text-base font-semibold text-text-primary">Signers</h2>
          <div className="space-y-3">
            {signerRecipients.map((r) => {
              const summary = fieldSummaryByRecipient.get(r.id) ?? {
                totalCount: 0,
                requiredCount: 0,
                signatureCount: 0,
              };
              const hasIssue = summary.totalCount === 0 || summary.signatureCount === 0;

              return (
                <div
                  key={r.id}
                  className="rounded-2xl border border-border-primary bg-background-secondary p-4 shadow-sm"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-3 min-w-0">
                      <span
                        className="h-3 w-3 flex-shrink-0 rounded-full mt-0.5"
                        style={{ backgroundColor: r.colorTag }}
                      />
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-medium text-text-primary">{r.name}</span>
                          <span className="inline-flex items-center rounded-full border border-border-primary px-2 py-0.5 text-xs text-text-secondary">
                            {ESIGNING_RECIPIENT_TYPE_LABELS[r.type]}
                          </span>
                        </div>
                        <div className="mt-0.5 text-sm text-text-secondary">{r.email}</div>
                        <div className="mt-0.5 text-xs text-text-muted">
                          {ESIGNING_ACCESS_MODE_LABELS[r.accessMode]}
                        </div>
                        <div className="mt-1 text-xs text-text-secondary">
                          {summary.requiredCount} required field{summary.requiredCount !== 1 ? 's' : ''} · {summary.signatureCount} signature
                        </div>
                      </div>
                    </div>
                    <div className="flex-shrink-0">
                      {hasIssue ? (
                        <div className="flex items-center gap-1.5 text-amber-600">
                          <AlertTriangle className="h-4 w-4" />
                          <span className="text-xs font-medium">Needs attention</span>
                        </div>
                      ) : (
                        <div className="flex items-center gap-1.5 text-emerald-600">
                          <CheckCircle2 className="h-4 w-4" />
                          <span className="text-xs font-medium">Ready</span>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        {/* Documents section */}
        <section>
          <h2 className="mb-3 text-base font-semibold text-text-primary">Documents</h2>
          <div className="space-y-2">
            {envelope.documents.map((doc) => {
              const hasFields = fields.some((f) => f.documentId === doc.id);
              return (
                <div
                  key={doc.id}
                  className="flex items-center justify-between rounded-2xl border border-border-primary bg-background-secondary px-4 py-3"
                >
                  <span className="text-sm font-medium text-text-primary">{doc.fileName}</span>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-text-muted">{doc.pageCount} pages</span>
                    <span
                      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium border ${
                        hasFields
                          ? 'border-oak-primary/20 bg-oak-primary/10 text-oak-primary'
                          : 'border-border-primary bg-background-tertiary text-text-muted'
                      }`}
                    >
                      {hasFields ? 'Requires action' : 'Review Only'}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        {/* Validation panel */}
        {isReady ? (
          <div className="flex items-center gap-3 rounded-2xl border border-emerald-200 bg-emerald-50 px-5 py-4">
            <CheckCircle2 className="h-5 w-5 flex-shrink-0 text-emerald-600" />
            <span className="text-sm font-medium text-emerald-800">
              Ready to send — all requirements are met.
            </span>
          </div>
        ) : (
          <div className="rounded-2xl border border-amber-200 bg-amber-50 px-5 py-4">
            <div className="flex items-center gap-2 mb-2">
              <AlertTriangle className="h-4 w-4 text-amber-700" />
              <span className="text-sm font-semibold text-amber-800">Issues to resolve</span>
            </div>
            <ul className="list-disc list-inside space-y-1">
              {blockingIssues.map((issue, i) => (
                <li key={i} className="text-sm text-amber-700">{issue}</li>
              ))}
            </ul>
          </div>
        )}

        {/* Manual links */}
        {manualLinks.length > 0 && (
          <section>
            <h2 className="mb-3 text-base font-semibold text-text-primary">Manual Signing Links</h2>
            <div className="space-y-3">
              {manualLinks.map((link) => (
                <div
                  key={link.recipientId}
                  className="rounded-2xl border border-border-primary bg-background-secondary p-4"
                >
                  <div className="text-sm font-semibold text-text-primary">{link.recipientName}</div>
                  <div className="mt-0.5 text-xs text-text-secondary">{link.recipientEmail}</div>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <a
                      href={link.signingUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="min-w-0 flex-1 rounded-xl border border-border-primary bg-background-primary px-3 py-2 text-xs text-text-secondary truncate"
                    >
                      {link.signingUrl}
                    </a>
                    <Button
                      variant="secondary"
                      size="xs"
                      leftIcon={<Copy className="h-3.5 w-3.5" />}
                      onClick={() =>
                        void navigator.clipboard
                          .writeText(link.signingUrl)
                          .then(() => toast.success('Link copied'))
                          .catch(() => toast.error('Clipboard access failed'))
                      }
                    >
                      Copy
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}
      </div>

      {/* Sticky footer */}
      <div className="sticky bottom-0 bg-background-secondary border-t border-border-primary px-6 py-3 flex items-center justify-between gap-4">
        <Button variant="secondary" onClick={onBack}>
          ← Back
        </Button>
        <span className="text-sm text-text-secondary">
          {envelope.documents.length} docs · {signerRecipients.length} signers ·{' '}
          {ESIGNING_SIGNING_ORDER_LABELS[envelope.signingOrder]}
        </span>
        <Button
          onClick={() => void onSend()}
          isLoading={isSending}
          disabled={blockingIssues.length > 0}
          leftIcon={<Send className="h-4 w-4" />}
        >
          Send Envelope
        </Button>
      </div>
    </div>
  );
}
