import type { Prisma } from '@/generated/prisma';
import { prisma } from '@/lib/prisma';

const EMAIL_DELIVERY_FAILURE_LIMIT = 10;

export type EsigningEmailDeliveryKind =
  | 'request'
  | 'reminder'
  | 'completion'
  | 'declined'
  | 'pdf_failure'
  | 'expiry_warning'
  | 'expired'
  | 'voided';

export interface EsigningEmailDeliveryResult {
  ok: boolean;
  kind: EsigningEmailDeliveryKind;
  to: string;
  subject: string;
  attemptedAt: string;
  error?: string;
}

export interface EsigningEmailDeliveryFailure {
  kind: EsigningEmailDeliveryKind;
  to: string;
  subject: string;
  error: string;
  attemptedAt: string;
}

export interface EsigningEmailDeliveryHealth {
  status: 'ok' | 'failed';
  lastFailureAt: string | null;
  failures: EsigningEmailDeliveryFailure[];
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? { ...(value as Record<string, unknown>) }
    : {};
}

function parseFailures(value: unknown): EsigningEmailDeliveryFailure[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.flatMap((entry) => {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
      return [];
    }
    const record = entry as Record<string, unknown>;
    if (
      typeof record.kind !== 'string' ||
      typeof record.to !== 'string' ||
      typeof record.subject !== 'string' ||
      typeof record.error !== 'string' ||
      typeof record.attemptedAt !== 'string'
    ) {
      return [];
    }

    return [{
      kind: record.kind as EsigningEmailDeliveryKind,
      to: record.to,
      subject: record.subject,
      error: record.error,
      attemptedAt: record.attemptedAt,
    }];
  });
}

export function getEsigningEmailDeliveryHealth(metadata: unknown): EsigningEmailDeliveryHealth {
  const emailDelivery = asRecord(asRecord(metadata).emailDelivery);
  const failures = parseFailures(emailDelivery.failures);

  if (emailDelivery.status === 'failed' && failures.length > 0) {
    return {
      status: 'failed',
      lastFailureAt: typeof emailDelivery.lastFailureAt === 'string'
        ? emailDelivery.lastFailureAt
        : failures[0]?.attemptedAt ?? null,
      failures,
    };
  }

  return {
    status: 'ok',
    lastFailureAt: null,
    failures: [],
  };
}

export function applyEsigningEmailDeliveryResults(
  metadata: unknown,
  results: EsigningEmailDeliveryResult[]
): Record<string, unknown> {
  const nextMetadata = asRecord(metadata);
  if (results.length === 0) {
    return nextMetadata;
  }

  const failures = results
    .filter((result) => !result.ok)
    .map((result) => ({
      kind: result.kind,
      to: result.to,
      subject: result.subject,
      error: result.error || 'Email provider did not accept the message',
      attemptedAt: result.attemptedAt,
    }));

  if (failures.length === 0) {
    nextMetadata.emailDelivery = {
      status: 'ok',
      lastFailureAt: null,
      failures: [],
    };
    return nextMetadata;
  }

  const existing = getEsigningEmailDeliveryHealth(nextMetadata).failures;
  const allFailures = [...failures, ...existing].slice(0, EMAIL_DELIVERY_FAILURE_LIMIT);
  nextMetadata.emailDelivery = {
    status: 'failed',
    lastFailureAt: failures[0]?.attemptedAt ?? null,
    failures: allFailures,
  };
  return nextMetadata;
}

export async function recordEsigningEnvelopeEmailDeliveryResults(
  envelopeId: string,
  results: EsigningEmailDeliveryResult[]
): Promise<void> {
  if (results.length === 0) {
    return;
  }

  const envelope = await prisma.esigningEnvelope.findUnique({
    where: { id: envelopeId },
    select: { metadata: true },
  });

  if (!envelope) {
    return;
  }

  await prisma.esigningEnvelope.update({
    where: { id: envelopeId },
    data: {
      metadata: applyEsigningEmailDeliveryResults(
        envelope.metadata,
        results
      ) as Prisma.InputJsonValue,
    },
  });
}
