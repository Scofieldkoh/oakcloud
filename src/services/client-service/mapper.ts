import { Prisma } from '@/generated/prisma';
import type { ClientServiceDto } from './types';

export const clientServiceInclude = {
  feeLines: { orderBy: [{ displayOrder: 'asc' as const }, { createdAt: 'asc' as const }] },
  agreement: {
    select: {
      status: true,
      activationStatus: true,
      generatedDocument: { select: { id: true, title: true } },
    },
  },
} satisfies Prisma.ClientServiceInclude;

export type ClientServiceRecord = Prisma.ClientServiceGetPayload<{
  include: typeof clientServiceInclude;
}>;

export const dateOnly = (value: Date | null): string | null =>
  value ? value.toISOString().slice(0, 10) : null;

export function toClientServiceDto(service: ClientServiceRecord): ClientServiceDto {
  return {
    id: service.id,
    companyId: service.companyId,
    source: service.source,
    agreementId: service.agreementId,
    agreementItemId: service.agreementItemId,
    serviceVariantId: service.serviceVariantId,
    familyName: service.familyName,
    serviceName: service.serviceName,
    status: service.status,
    serviceCadence: service.serviceCadence,
    customCadenceLabel: service.customCadenceLabel,
    startDate: dateOnly(service.startDate)!,
    endDate: dateOnly(service.endDate),
    fieldValues: (service.fieldValues ?? {}) as Record<string, string>,
    feeLines: service.feeLines.map((fee) => ({
      id: fee.id,
      description: fee.description,
      amount: fee.amount.toFixed(2),
      currency: fee.currency,
      billingFrequency: fee.billingFrequency,
      customFrequencyLabel: fee.customFrequencyLabel,
      billingStartDate: dateOnly(fee.billingStartDate),
      displayOrder: fee.displayOrder,
    })),
    agreement: service.agreement ? {
      title: service.agreement.generatedDocument.title,
      status: service.agreement.status,
      activationStatus: service.agreement.activationStatus,
      generatedDocumentId: service.agreement.generatedDocument.id,
      href: `/generated-documents/${service.agreement.generatedDocument.id}`,
    } : null,
    createdAt: service.createdAt.toISOString(),
    updatedAt: service.updatedAt.toISOString(),
  };
}
