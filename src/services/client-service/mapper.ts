import { Prisma } from '@/generated/prisma';
import type { ClientServiceDto } from './types';

export const clientServiceInclude = {
  feeLines: { orderBy: [{ displayOrder: 'asc' as const }, { createdAt: 'asc' as const }] },
  deadlineRules: {
    orderBy: [{ createdAt: 'asc' as const }, { id: 'asc' as const }],
    include: {
      rule: {
        select: {
          id: true,
          code: true,
          name: true,
          isActive: true,
          archivedAt: true,
          currentVersionId: true,
          currentVersion: {
            select: {
              id: true,
              version: true,
              configHash: true,
              recurrence: true,
              applicability: true,
              parameterDefinitions: {
                orderBy: [{ displayOrder: 'asc' as const }, { key: 'asc' as const }],
              },
            },
          },
        },
      },
    },
  },
  agreement: {
    select: {
      status: true,
      activationStatus: true,
      generatedDocument: { select: { id: true, title: true } },
    },
  },
} satisfies Prisma.ClientServiceInclude;

export const clientServiceInternalInclude = {
  // Internal archival/lineage flows intentionally retain archived fee lines;
  // public DTO mapping below filters them from normal service responses.
  ...clientServiceInclude,
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
    feeLines: service.feeLines
      .filter((fee) => fee.isActive !== false && fee.deletedAt == null)
      .map((fee) => ({
        id: fee.id,
        description: fee.description,
        amount: fee.amount.toFixed(2),
        currency: fee.currency,
        billingFrequency: fee.billingFrequency,
        customFrequencyLabel: fee.customFrequencyLabel,
        billingStartDate: dateOnly(fee.billingStartDate),
        displayOrder: fee.displayOrder,
      })),
    deadlineRules: (service.deadlineRules ?? []).map((clientRule) => ({
      id: clientRule.id,
      ruleId: clientRule.ruleId,
      enabled: clientRule.enabled,
      parameterValues: (clientRule.parameterValues ?? {}) as Record<string, unknown>,
      parameterProvenance: (clientRule.parameterProvenance ?? {}) as Record<string, 'COMPANY' | 'CATALOG_DEFAULT' | 'CLIENT_OVERRIDE'>,
      scheduleEntries: (Array.isArray(clientRule.scheduleEntries) ? clientRule.scheduleEntries : []) as ClientServiceDto['deadlineRules'][number]['scheduleEntries'],
      lastEvaluatedVersionId: clientRule.lastEvaluatedVersionId,
      applicabilityState: clientRule.applicabilityState,
      applicabilityReason: clientRule.applicabilityReason,
      configHash: clientRule.configHash,
      updatedAt: clientRule.updatedAt.toISOString(),
      rule: clientRule.rule ? {
        id: clientRule.rule.id,
        code: clientRule.rule.code,
        name: clientRule.rule.name,
        isActive: clientRule.rule.isActive,
        archivedAt: dateOnly(clientRule.rule.archivedAt),
        currentVersionId: clientRule.rule.currentVersionId,
        currentVersion: clientRule.rule.currentVersion ? {
          id: clientRule.rule.currentVersion.id,
          version: clientRule.rule.currentVersion.version,
          configHash: clientRule.rule.currentVersion.configHash,
          recurrence: clientRule.rule.currentVersion.recurrence,
          applicability: clientRule.rule.currentVersion.applicability,
          parameters: clientRule.rule.currentVersion.parameterDefinitions.map((parameter) => ({
            key: parameter.key,
            label: parameter.label,
            description: parameter.helpText ?? null,
            type: parameter.type,
            required: parameter.isRequired,
            defaultValue: parameter.defaultValue,
            validation: parameter.validation,
            helpText: parameter.helpText,
            displayOrder: parameter.displayOrder,
          })),
        } : null,
      } : null,
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
