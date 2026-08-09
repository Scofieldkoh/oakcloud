import { createAuditLog } from '@/lib/audit';
import { NotFoundError } from '@/lib/errors';
import { prisma } from '@/lib/prisma';
import { isSerializationConflict, runSerializableTransaction } from '@/lib/prisma-transaction';
import type { TenantAwareParams } from '@/lib/types';
import type { CreateManualClientServiceInput } from '@/lib/validations/client-service';
import { Prisma } from '@/generated/prisma';
import { ClientServiceWriteConflictError, DuplicateClientServiceError } from './errors';
import { summarizeClientServiceFees } from './fee-summary';
import { clientServiceInclude, dateOnly, toClientServiceDto } from './mapper';

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
        select: { id: true },
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
