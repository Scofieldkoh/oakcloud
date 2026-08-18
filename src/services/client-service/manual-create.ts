import { createAuditLog } from '@/lib/audit';
import { NotFoundError } from '@/lib/errors';
import { prisma } from '@/lib/prisma';
import { isSerializationConflict, runSerializableTransaction } from '@/lib/prisma-transaction';
import type { TenantAwareParams } from '@/lib/types';
import type { ClientServiceDeadlineRuleInput, CreateManualClientServiceInput } from '@/lib/validations/client-service';
import { Prisma } from '@/generated/prisma';
import { ClientServiceWriteConflictError, DuplicateClientServiceError } from './errors';
import { summarizeClientServiceFees } from './fee-summary';
import { clientServiceInclude, dateOnly, toClientServiceDto } from './mapper';
import { enqueueScheduleReconciliation } from '@/services/schedule-reconciliation';
import { canonicalDeadlineRuleAudit, persistClientServiceDeadlineRules, validateClientServiceDeadlineRules } from './service';

const parseDateOnly = (value: string): Date => new Date(`${value}T00:00:00.000Z`);

export async function createManualClientService(
  companyId: string,
  input: CreateManualClientServiceInput,
  params: TenantAwareParams,
) {
  try {
    return await runSerializableTransaction(prisma, async (tx) => {
      const company = await tx.company.findFirst({
        where: { id: companyId, tenantId: params.tenantId, deletedAt: null },
        select: {
          id: true,
          entityType: true,
          status: true,
          primarySsicCode: true,
          secondarySsicCode: true,
          uen: true,
          name: true,
          financialYearEndDay: true,
          financialYearEndMonth: true,
          incorporationDate: true,
          registrationDate: true,
          nextAgmDueDate: true,
          nextArDueDate: true,
          accountsDueDate: true,
          hasCharges: true,
          currentOfficerCount: true,
          currentShareholderCount: true,
          annualReceiptsOrExpenditure: true,
          isGstRegistered: true,
          isRegisteredCharity: true,
          isIPC: true,
        },
      });
      if (!company) throw new NotFoundError('Company not found');

      const variant = await tx.serviceVariant.findFirst({
        where: {
          id: input.serviceVariantId,
          tenantId: params.tenantId,
          deletedAt: null,
          isActive: true,
          family: { tenantId: params.tenantId, deletedAt: null, isActive: true },
          sowPartial: { tenantId: params.tenantId, deletedAt: null },
        },
        select: { id: true, name: true, family: { select: { name: true } } },
      });
      if (!variant) throw new NotFoundError('Service variant not found');

      const duplicateWhere: Prisma.ClientServiceWhereInput = {
        tenantId: params.tenantId,
        companyId,
        serviceVariantId: input.serviceVariantId,
        startDate: parseDateOnly(input.startDate),
        deletedAt: null,
      };

      if (!input.confirmDuplicate) {
        const [total, matches] = await Promise.all([
          tx.clientService.count({ where: duplicateWhere }),
          tx.clientService.findMany({
            where: duplicateWhere,
            select: { id: true, serviceName: true, startDate: true, status: true, source: true },
            orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
            take: 5,
          }),
        ]);
        if (total > 0) {
          throw new DuplicateClientServiceError({
            total,
            items: matches.map((match) => ({ ...match, startDate: dateOnly(match.startDate)! })),
          });
        }
      }

      const service = await tx.clientService.create({
        data: {
          tenantId: params.tenantId,
          companyId,
          source: 'MANUAL',
          agreementId: null,
          agreementItemId: null,
          serviceVariantId: variant.id,
          familyName: variant.family.name,
          serviceName: variant.name,
          status: input.status,
          serviceCadence: input.serviceCadence,
          customCadenceLabel: input.customCadenceLabel,
          startDate: parseDateOnly(input.startDate),
          endDate: input.endDate ? parseDateOnly(input.endDate) : null,
          fieldValues: input.fieldValues as Prisma.InputJsonValue,
        },
      });

      await tx.clientServiceFeeLine.createMany({
        data: input.feeLines.map((fee, displayOrder) => ({
          tenantId: params.tenantId,
          clientServiceId: service.id,
          sourceAgreementFeeLineId: null,
          description: fee.description,
          amount: new Prisma.Decimal(fee.amount),
          currency: fee.currency,
          billingFrequency: fee.billingFrequency,
          customFrequencyLabel: fee.customFrequencyLabel,
          billingStartDate: fee.billingStartDate ? parseDateOnly(fee.billingStartDate) : null,
          displayOrder,
        })),
      });

      const feeSummary = summarizeClientServiceFees(input.feeLines);

      let deadlineRuleValidation;
      if (input.deadlineRules !== undefined) {
        deadlineRuleValidation = await validateClientServiceDeadlineRules(
          tx,
          { tenantId: params.tenantId, serviceVariantId: variant.id, companyId },
          input.deadlineRules,
          company,
        );
        await persistClientServiceDeadlineRules(tx, {
          tenantId: params.tenantId,
          clientServiceId: service.id,
          userId: params.userId,
        }, deadlineRuleValidation);
      }

      const variantRules = input.deadlineRules === undefined && tx.serviceVariantDeadlineRule?.findMany
        ? await tx.serviceVariantDeadlineRule.findMany({
            where: {
              serviceVariantId: variant.id,
              tenantId: params.tenantId,
              enabledByDefault: true,
              archivedAt: null,
              rule: {
                tenantId: params.tenantId,
                isActive: true,
                archivedAt: null,
                currentVersionId: { not: null },
              },
            },
            select: {
              ruleId: true,
              enabledByDefault: true,
              parameterDefaults: true,
              scheduleDefaults: true,
              rule: {
                select: {
                  id: true,
                  isActive: true,
                  archivedAt: true,
                  currentVersionId: true,
                  currentVersion: {
                    select: {
                      id: true,
                      state: true,
                      configHash: true,
                      recurrence: true,
                      applicability: true,
                      parameterDefinitions: true,
                      milestoneTemplates: true,
                    },
                  },
                },
              },
            },
          })
        : [];

      const enabledVariantRules = variantRules.filter((variantRule) => variantRule.enabledByDefault !== false);
      if (input.deadlineRules === undefined && enabledVariantRules.length > 0) {
        const defaultInputs = enabledVariantRules.map((vr) => {
          const parameterValues = (vr.parameterDefaults && typeof vr.parameterDefaults === 'object' && !Array.isArray(vr.parameterDefaults))
            ? vr.parameterDefaults as Record<string, unknown>
            : {};
          return {
            ruleId: vr.ruleId,
            enabled: true,
            parameterValues,
            parameterProvenance: Object.fromEntries(Object.keys(parameterValues).map((key) => [key, 'CATALOG_DEFAULT' as const])),
            scheduleEntries: (Array.isArray(vr.scheduleDefaults) ? vr.scheduleDefaults : []),
          };
        });
        deadlineRuleValidation = await validateClientServiceDeadlineRules(
          tx,
          { tenantId: params.tenantId, serviceVariantId: variant.id, companyId },
          defaultInputs as ClientServiceDeadlineRuleInput[],
          company,
        );
        await persistClientServiceDeadlineRules(tx, {
          tenantId: params.tenantId,
          clientServiceId: service.id,
          userId: params.userId,
        }, deadlineRuleValidation);
      }

      const reconciliationCorrelationId = `manual-service-${service.id}-${Date.now()}`;
      await enqueueScheduleReconciliation(tx, {
        tenantId: params.tenantId,
        scopeType: 'CLIENT_SERVICE',
        scopeId: service.id,
        triggerType: 'CLIENT_SERVICE_CREATED',
        correlationId: reconciliationCorrelationId,
        requestedById: params.userId ?? null,
      });

      await createAuditLog({
        tenantId: params.tenantId,
        userId: params.userId,
        companyId,
        entityType: 'ClientService',
        entityId: service.id,
        entityName: variant.name,
        action: 'CREATE',
        changeSource: 'MANUAL',
        changes: {
          source: { old: null, new: 'MANUAL' },
          serviceVariantId: { old: null, new: variant.id },
          feeLines: { old: { count: 0, totals: {} }, new: feeSummary },
          deadlineRules: { old: canonicalDeadlineRuleAudit(undefined), new: canonicalDeadlineRuleAudit(deadlineRuleValidation) },
          reconciliationCorrelationId: { old: null, new: reconciliationCorrelationId },
          duplicateConfirmed: { old: false, new: input.confirmDuplicate },
        },
        summary: `Added manual operational service with ${feeSummary.count} fee line(s)`,
      }, tx);

      const created = await tx.clientService.findFirst({
        where: { id: service.id, tenantId: params.tenantId, deletedAt: null },
        include: clientServiceInclude,
      });
      if (!created) throw new NotFoundError('Client service not found');
      return toClientServiceDto(created);
    });
  } catch (error) {
    if (isSerializationConflict(error)) throw new ClientServiceWriteConflictError();
    throw error;
  }
}
