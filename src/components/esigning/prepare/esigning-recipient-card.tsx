'use client';

import { Copy } from 'lucide-react';
import type { EsigningSigningOrder } from '@/generated/prisma';
import type { EsigningEnvelopeRecipientDto } from '@/types/esigning';
import { Button } from '@/components/ui/button';
import {
  ESIGNING_ACCESS_MODE_LABELS,
  ESIGNING_RECIPIENT_TYPE_LABELS,
  RecipientStatusBadge,
} from '@/components/esigning/esigning-shared';
import { cn } from '@/lib/utils';

interface EsigningRecipientCardProps {
  recipient: EsigningEnvelopeRecipientDto;
  envelopeSigningOrder: EsigningSigningOrder;
  canEdit: boolean;
  onEdit: () => void;
  onRemove: () => void;
  onCopyLink?: () => void;
  isCopyingLink?: boolean;
  onResend?: () => void;
  warnings: string[];
}

export function EsigningRecipientCard({
  recipient,
  envelopeSigningOrder,
  canEdit,
  onEdit,
  onRemove,
  onCopyLink,
  isCopyingLink = false,
  onResend,
  warnings,
}: EsigningRecipientCardProps) {
  const showOrderBadge = envelopeSigningOrder !== 'PARALLEL';

  return (
    <div className="relative overflow-hidden rounded-2xl border border-border-primary bg-background-primary shadow-sm">
      {/* Left color rail */}
      <div
        className="absolute left-0 top-0 bottom-0 w-1"
        style={{ backgroundColor: recipient.colorTag }}
      />

      {/* Card content */}
      <div className="pl-5 pr-4 py-3">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex items-start gap-3 min-w-0">
            {/* Order badge */}
            {showOrderBadge && (
              <div
                className="mt-0.5 flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full text-xs font-semibold text-white"
                style={{ backgroundColor: recipient.colorTag }}
              >
                {recipient.type === 'CC' ? 'CC' : (recipient.signingOrder ?? '?')}
              </div>
            )}

            {/* Info */}
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                {!showOrderBadge && (
                  <span
                    className="h-2.5 w-2.5 flex-shrink-0 rounded-full"
                    style={{ backgroundColor: recipient.colorTag }}
                  />
                )}
                <span className="font-semibold text-text-primary truncate">{recipient.name}</span>
                <RecipientStatusBadge status={recipient.status} />
                <span
                  className={cn(
                    'inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium',
                    recipient.type === 'SIGNER'
                      ? 'bg-oak-primary/10 text-oak-primary border border-oak-primary/20'
                      : 'border border-border-primary bg-background-secondary text-text-secondary'
                  )}
                >
                  {ESIGNING_RECIPIENT_TYPE_LABELS[recipient.type]}
                </span>
              </div>
              <div className="mt-0.5 text-sm text-text-secondary">{recipient.email}</div>
              <div className="mt-0.5 text-xs text-text-muted">
                {ESIGNING_ACCESS_MODE_LABELS[recipient.accessMode]}
              </div>
            </div>
          </div>

          {/* Actions */}
          <div className="flex flex-shrink-0 flex-wrap items-center gap-2 sm:mt-0">
            {canEdit && (
              <Button variant="secondary" size="xs" onClick={onEdit}>
                Edit
              </Button>
            )}
            {onCopyLink && (
              <Button
                variant="secondary"
                size="xs"
                leftIcon={<Copy className="h-3.5 w-3.5" />}
                onClick={onCopyLink}
                isLoading={isCopyingLink}
              >
                Copy link
              </Button>
            )}
            {onResend && (
              <Button variant="secondary" size="xs" onClick={onResend}>
                Resend
              </Button>
            )}
            {canEdit && (
              <Button variant="danger" size="xs" onClick={onRemove}>
                Remove
              </Button>
            )}
          </div>
        </div>
      </div>

      {/* Warning strip */}
      {warnings.length > 0 && (
        <div className="border-t border-amber-200 bg-amber-50 px-4 py-2 pl-5">
          {warnings.map((warning, i) => (
            <div key={i} className="flex items-center gap-1.5 text-xs text-amber-700">
              <span>⚠</span>
              <span>{warning}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
