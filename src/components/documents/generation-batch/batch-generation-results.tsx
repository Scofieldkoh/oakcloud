'use client';

import Link from 'next/link';
import { CheckCircle2, ExternalLink, RotateCcw, XCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { EditableBatchItem } from './batch-workspace-state';
import { ITEM_STATUS_LABELS } from './batch-document-queue';

export interface BatchGenerationResultsProps {
  items: EditableBatchItem[];
  onRetry: (itemId: string) => void | Promise<void>;
}

export function BatchGenerationResults({
  items,
  onRetry,
}: BatchGenerationResultsProps) {
  const generated = items.filter((item) => item.status === 'GENERATED').length;
  const failed = items.filter((item) => item.status === 'FAILED').length;
  const completed = items.length > 0 && generated === items.length;

  return (
    <div className="space-y-4">
      <header className="rounded-lg border border-border-primary bg-background-secondary p-4">
        <h2 className="text-base font-semibold text-text-primary">
          {completed ? 'Batch complete' : 'Generation results'}
        </h2>
        <p className="mt-1 text-sm text-text-secondary">
          {generated} generated
          {failed > 0 ? `, ${failed} failed` : ''}
          {' · '}{items.length} total
        </p>
      </header>

      {completed && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-status-success/30 bg-status-success/5 p-4">
          <p className="text-sm text-text-primary">
            All documents were generated successfully.
          </p>
          <Link href="/generated-documents">
            <Button variant="primary" size="sm">Return to Generated documents</Button>
          </Link>
        </div>
      )}

      <ul className="divide-y divide-border-secondary rounded-lg border border-border-primary bg-background-primary">
        {items.map((item) => (
          <li key={item.key} className="flex flex-wrap items-center gap-3 p-4">
            {item.status === 'GENERATED' ? (
              <CheckCircle2 className="h-5 w-5 shrink-0 text-status-success" aria-hidden="true" />
            ) : item.status === 'FAILED' ? (
              <XCircle className="h-5 w-5 shrink-0 text-status-error" aria-hidden="true" />
            ) : (
              <span className="h-5 w-5 shrink-0 rounded-full border border-border-primary" aria-hidden="true" />
            )}
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium text-text-primary">
                {item.configuration.title || item.templateName}
              </p>
              <p className="text-xs text-text-muted">
                {item.templateName} · {ITEM_STATUS_LABELS[item.status]}
              </p>
              {item.status === 'FAILED' && item.lastError && (
                <p className="mt-1 text-sm text-status-error" role="alert">
                  {item.lastError.message}
                </p>
              )}
              {item.status !== 'GENERATED' && item.status !== 'FAILED' && (
                <p className="mt-1 text-xs text-text-muted">
                  This document did not run because it was not ready.
                </p>
              )}
            </div>
            {item.status === 'GENERATED' && item.generatedDocumentId && (
              <Link
                href={`/generated-documents/${item.generatedDocumentId}`}
                className="inline-flex min-h-9 items-center gap-1 text-sm font-medium text-oak-primary transition-colors hover:text-oak-dark"
                aria-label={`Open ${item.configuration.title || item.templateName}`}
              >
                <ExternalLink className="h-4 w-4" aria-hidden="true" />
                Open document
              </Link>
            )}
            {item.status === 'FAILED' && (
              <Button
                variant="secondary"
                size="sm"
                onClick={() => void onRetry(item.key)}
                aria-label={`Retry ${item.configuration.title || item.templateName}`}
                leftIcon={<RotateCcw className="h-4 w-4" aria-hidden="true" />}
              >
                Retry
              </Button>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
