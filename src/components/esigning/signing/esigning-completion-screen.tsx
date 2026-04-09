'use client';

import Link from 'next/link';
import { CheckCircle2, Clock, Download, ExternalLink } from 'lucide-react';
import { formatEsigningDateTime } from '@/components/esigning/esigning-shared';

interface EsigningCompletionScreenProps {
  envelopeTitle: string;
  recipientName: string;
  signedAt: string | null;
  isAllPartiesDone: boolean;
  remainingSignerCount: number;
  expiresAt: string | null;
  pdfGenerationStatus: 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'FAILED' | null;
  documents: Array<{ id: string; fileName: string; signedPdfUrl: string | null }>;
  downloadToken: string | null;
  certificateId: string;
}

export function EsigningCompletionScreen({
  envelopeTitle,
  recipientName,
  signedAt,
  isAllPartiesDone,
  remainingSignerCount,
  expiresAt,
  pdfGenerationStatus,
  documents,
  certificateId,
}: EsigningCompletionScreenProps) {
  const firstSignedDoc = documents.find((d) => d.signedPdfUrl);
  const hasPendingSigners = !isAllPartiesDone && remainingSignerCount > 0;
  const isSignedCopyReady = isAllPartiesDone && pdfGenerationStatus === 'COMPLETED' && Boolean(firstSignedDoc?.signedPdfUrl);
  const isSignedCopyPreparing = isAllPartiesDone && pdfGenerationStatus !== 'COMPLETED';

  return (
    <div className="min-h-screen bg-background-primary px-4 pt-16 pb-12">
      <div className="mx-auto w-full max-w-2xl">
        {/* Main card */}
        <div className="rounded-3xl border border-border-primary bg-background-secondary p-8 shadow-sm text-center">
          {/* Icon */}
          <div className="flex justify-center">
            <div className="flex h-20 w-20 items-center justify-center rounded-full bg-emerald-50 border border-emerald-200">
              <CheckCircle2 className="h-10 w-10 text-emerald-500" />
            </div>
          </div>

          {/* Title */}
          <h1 className="mt-6 text-2xl font-semibold text-text-primary">
            {isAllPartiesDone ? 'Completed' : 'Your part is complete'}
          </h1>
          <p className="mt-2 text-sm text-text-secondary">
            {isAllPartiesDone
              ? 'All parties will receive a completed copy of the signed documents.'
              : 'The sender has been notified. Waiting for other signers to complete their part.'}
          </p>
          {hasPendingSigners || expiresAt ? (
            <div className="mt-4 rounded-2xl border border-border-primary bg-background-primary px-4 py-3 text-left text-sm text-text-secondary">
              {hasPendingSigners ? (
                <p>
                  {remainingSignerCount} signer{remainingSignerCount === 1 ? '' : 's'} still need to
                  complete this envelope.
                </p>
              ) : null}
              {expiresAt ? (
                <p className={hasPendingSigners ? 'mt-1' : undefined}>
                  Envelope deadline: {formatEsigningDateTime(expiresAt)}
                </p>
              ) : null}
            </div>
          ) : null}

          {/* Envelope info */}
          <p className="mt-4 text-xs text-text-muted">
            Envelope: <span className="font-medium text-text-secondary">{envelopeTitle}</span>
          </p>
          <p className="text-xs text-text-muted">
            Recipient: <span className="font-medium text-text-secondary">{recipientName}</span>
          </p>
        </div>

        {/* Timeline */}
        <div className="mt-6 rounded-3xl border border-border-primary bg-background-secondary p-6 shadow-sm">
          <h2 className="mb-4 text-sm font-semibold text-text-primary">Signing Timeline</h2>
          <div className="relative pl-5">
            {/* Connecting line */}
            <div className="absolute left-[7px] top-2 h-[calc(100%-16px)] w-0.5 bg-border-primary" />

            {/* Step 1: Received */}
            <div className="relative mb-5 flex items-start gap-3">
              <div className="absolute -left-5 mt-0.5 h-3.5 w-3.5 rounded-full border-2 border-border-primary bg-background-tertiary" />
              <div>
                <p className="text-sm font-medium text-text-primary">
                  You received a request to sign
                </p>
                <p className="text-xs text-text-muted">Envelope sent by the sender</p>
              </div>
            </div>

            {/* Step 2: Signed */}
            <div className="relative mb-5 flex items-start gap-3">
              <div className="absolute -left-5 mt-0.5 h-3.5 w-3.5 rounded-full border-2 border-emerald-400 bg-emerald-400" />
              <div>
                <p className="text-sm font-medium text-text-primary">You signed</p>
                <p className="text-xs text-text-muted">{formatEsigningDateTime(signedAt)}</p>
              </div>
            </div>

            {/* Step 3: Completion status */}
            <div className="relative flex items-start gap-3">
              <div
                className={
                  isAllPartiesDone
                    ? 'absolute -left-5 mt-0.5 h-3.5 w-3.5 rounded-full border-2 border-emerald-400 bg-emerald-400'
                    : 'absolute -left-5 mt-0.5 h-3.5 w-3.5 rounded-full border-2 border-border-primary bg-background-tertiary'
                }
              />
              <div>
                <p className="text-sm font-medium text-text-primary">
                  {isAllPartiesDone
                    ? 'Completed — all parties received a copy'
                    : 'Waiting for other signers'}
                </p>
                {!isAllPartiesDone && (
                  <div className="mt-1 flex items-center gap-1 text-xs text-text-muted">
                    <Clock className="h-3 w-3" />
                    Pending
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Action buttons */}
        <div className="mt-6 flex flex-wrap justify-center gap-3">
          <Link
            href={`/verify/${certificateId}`}
            className="inline-flex items-center gap-2 rounded-2xl border border-border-primary bg-background-secondary px-5 py-2.5 text-sm font-medium text-text-primary shadow-sm hover:bg-background-tertiary transition-colors"
          >
            <ExternalLink className="h-4 w-4" />
            View Certificate
          </Link>

          {isSignedCopyReady && firstSignedDoc?.signedPdfUrl && (
            <a
              href={firstSignedDoc.signedPdfUrl}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-2 rounded-2xl border border-border-primary bg-background-secondary px-5 py-2.5 text-sm font-medium text-text-primary shadow-sm hover:bg-background-tertiary transition-colors"
            >
              <Download className="h-4 w-4" />
              Save a Copy
            </a>
          )}
        </div>

        {isSignedCopyPreparing ? (
          <p className="mt-3 text-center text-xs text-text-muted">
            Your signed PDF is being prepared and will be available once processing finishes.
          </p>
        ) : null}
      </div>
    </div>
  );
}
