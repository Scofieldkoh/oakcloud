import { computeChanges, createAuditLog } from '@/lib/audit';
import { ConflictError, NotFoundError, ValidationError } from '@/lib/errors';
import { prisma } from '@/lib/prisma';
import type { TenantAwareParams } from '@/lib/types';
import type { SearchClientServicesInput, UpdateClientServiceInput } from '@/lib/validations/client-service';
import { Prisma } from '@/generated/prisma';
import type { ClientServiceDto, CompanyServiceActivationDto } from './types';
import { clientServiceInclude, dateOnly, toClientServiceDto, type ClientServiceRecord } from './mapper';
import { summarizeClientServiceFees } from './fee-summary';

function parseDate(value: string | null | undefined): Date | null | undefined {
  if (value === undefined) return undefined;
  return value === null ? null : new Date(`${value}T00:00:00.000Z`);
}

function sameJson(left: unknown, right: unknown): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

async function requireService(id: string, tenantId: string, db: Prisma.TransactionClient | typeof prisma = prisma) {
  const service = await db.clientService.findFirst({ where: { id, tenantId, deletedAt: null }, include: clientServiceInclude });
  if (!service) throw new NotFoundError('Client service not found');
  return service;
}

export async function listCompanyServices(
  companyId: string,
  input: SearchClientServicesInput,
  params: TenantAwareParams,
): Promise<{ services: ClientServiceDto[]; total: number; activations: CompanyServiceActivationDto[] }> {
  const where: Prisma.ClientServiceWhereInput = {
    tenantId: params.tenantId,
    companyId,
    deletedAt: null,
    ...(input.status ? { status: input.status } : {}),
    ...(input.query ? { OR: [
      { serviceName: { contains: input.query, mode: 'insensitive' } },
      { familyName: { contains: input.query, mode: 'insensitive' } },
    ] } : {}),
  };
  const [services, total, agreements] = await Promise.all([
    prisma.clientService.findMany({ where, include: clientServiceInclude, orderBy: [{ status: 'asc' }, { serviceName: 'asc' }], skip: (input.page - 1) * input.limit, take: input.limit }),
    prisma.clientService.count({ where }),
    prisma.serviceAgreement.findMany({
      where: { tenantId: params.tenantId, entities: { some: { companyId } }, activationStatus: { in: ['PENDING', 'PROCESSING', 'FAILED_RETRYABLE', 'FAILED_PERMANENT'] } },
      select: { id: true, activationStatus: true, activationLastError: true, generatedDocument: { select: { title: true } } },
      orderBy: { updatedAt: 'desc' },
    }),
  ]);
  return { services: services.map(toClientServiceDto), total, activations: agreements.map((agreement) => ({ agreementId: agreement.id, title: agreement.generatedDocument.title, activationStatus: agreement.activationStatus, activationLastError: agreement.activationLastError, canRetry: false })) };
}

export async function getClientService(id: string, params: TenantAwareParams): Promise<ClientServiceDto> {
  return toClientServiceDto(await requireService(id, params.tenantId));
}

export async function updateClientService(id: string, input: UpdateClientServiceInput, params: TenantAwareParams): Promise<ClientServiceDto> {
  const updated: ClientServiceRecord = await prisma.$transaction(async (tx): Promise<ClientServiceRecord> => {
    const current = await requireService(id, params.tenantId, tx);
    if (current.updatedAt.toISOString() !== input.updatedAt) {
      throw new ConflictError('This service was updated by someone else. Reload it and try again.');
    }
    const cadence = input.serviceCadence ?? current.serviceCadence;
    const customCadenceLabel = input.customCadenceLabel === undefined ? current.customCadenceLabel : input.customCadenceLabel;
    const startDate = parseDate(input.startDate) ?? current.startDate;
    const endDate = input.endDate === undefined ? current.endDate : parseDate(input.endDate);
    if (cadence === 'CUSTOM' && !customCadenceLabel?.trim()) throw new ValidationError('Custom cadence label is required');
    if (endDate && endDate < startDate) throw new ValidationError('End date must be on or after start date');

    const scalarChanges = computeChanges(
      {
        familyName: current.familyName,
        serviceName: current.serviceName,
        status: current.status,
        serviceCadence: current.serviceCadence,
        customCadenceLabel: current.customCadenceLabel,
        startDate: dateOnly(current.startDate),
        endDate: dateOnly(current.endDate),
      },
      {
        familyName: input.familyName,
        serviceName: input.serviceName,
        status: input.status,
        serviceCadence: input.serviceCadence,
        customCadenceLabel: input.customCadenceLabel,
        startDate: input.startDate,
        endDate: input.endDate,
      },
      ['familyName', 'serviceName', 'status', 'serviceCadence', 'customCadenceLabel', 'startDate', 'endDate'],
    ) ?? {};
    const fieldValuesChanged = input.fieldValues !== undefined && !sameJson(current.fieldValues, input.fieldValues);
    const feeSummaryBefore = summarizeClientServiceFees(current.feeLines);
    const feeSummaryAfter = input.feeLines ? summarizeClientServiceFees(input.feeLines) : feeSummaryBefore;
    const feesChanged = input.feeLines !== undefined && !sameJson(
      current.feeLines.map((fee) => ({ id: fee.id, description: fee.description, amount: fee.amount.toFixed(2), currency: fee.currency, billingFrequency: fee.billingFrequency, customFrequencyLabel: fee.customFrequencyLabel, billingStartDate: dateOnly(fee.billingStartDate), displayOrder: fee.displayOrder })),
      input.feeLines.map((fee) => ({ ...fee, customFrequencyLabel: fee.customFrequencyLabel ?? null, billingStartDate: fee.billingStartDate ?? null })),
    );
    if (Object.keys(scalarChanges).length === 0 && !fieldValuesChanged && !feesChanged) return current;

    const claimed = await tx.clientService.updateMany({
      where: { id, tenantId: params.tenantId, deletedAt: null, updatedAt: new Date(input.updatedAt) },
      data: {
        familyName: input.familyName,
        serviceName: input.serviceName,
        status: input.status,
        serviceCadence: input.serviceCadence,
        customCadenceLabel: input.customCadenceLabel,
        startDate: input.startDate ? new Date(`${input.startDate}T00:00:00.000Z`) : undefined,
        endDate: parseDate(input.endDate),
        fieldValues: input.fieldValues,
        updatedAt: new Date(),
      },
    });
    if (claimed.count !== 1) throw new ConflictError('This service was updated by someone else. Reload it and try again.');

    if (input.feeLines && feesChanged) {
      await tx.clientServiceFeeLine.deleteMany({ where: { clientServiceId: id, tenantId: params.tenantId } });
      await tx.clientServiceFeeLine.createMany({ data: input.feeLines.map((fee) => ({
        id: fee.id,
        tenantId: params.tenantId,
        clientServiceId: id,
        sourceAgreementFeeLineId: current.feeLines.find((storedFee) => storedFee.id === fee.id)?.sourceAgreementFeeLineId ?? null,
        description: fee.description,
        amount: new Prisma.Decimal(fee.amount),
        currency: fee.currency,
        billingFrequency: fee.billingFrequency,
        customFrequencyLabel: fee.customFrequencyLabel ?? null,
        billingStartDate: parseDate(fee.billingStartDate) ?? null,
        displayOrder: fee.displayOrder,
      })) });
    }

    const result = await requireService(id, params.tenantId, tx);
    const changes = {
      ...scalarChanges,
      ...(fieldValuesChanged ? { fieldValues: { old: '[redacted]', new: '[redacted]' } } : {}),
      ...(feesChanged ? { feeLines: { old: feeSummaryBefore, new: feeSummaryAfter } } : {}),
    };
    await createAuditLog({
      tenantId: params.tenantId,
      userId: params.userId,
      companyId: current.companyId,
      entityType: 'ClientService',
      entityId: id,
      entityName: result.serviceName,
      action: 'UPDATE',
      changes,
      summary: `Updated operational service${feesChanged ? ` and ${input.feeLines?.length ?? 0} fee line(s)` : ''}`,
    }, tx);
    return result;
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  return toClientServiceDto(updated);
}

export async function archiveClientService(id: string, reason: string, params: TenantAwareParams): Promise<{ id: string; archived: true }> {
  await prisma.$transaction(async (tx) => {
    const current = await requireService(id, params.tenantId, tx);
    await tx.clientService.update({ where: { id }, data: { deletedAt: new Date(), deletedReason: reason } });
    await createAuditLog({ tenantId: params.tenantId, userId: params.userId, companyId: current.companyId, entityType: 'ClientService', entityId: id, entityName: current.serviceName, action: 'DELETE', reason, summary: 'Archived operational service' }, tx);
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  return { id, archived: true };
}
