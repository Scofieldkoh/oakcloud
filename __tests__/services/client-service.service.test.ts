import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ErrorCodes } from '@/lib/errors';

const prismaMock = vi.hoisted(() => ({
  clientService: { findFirst: vi.fn(), findMany: vi.fn(), count: vi.fn(), update: vi.fn(), updateMany: vi.fn() },
  company: { findFirst: vi.fn() },
  clientServiceFeeLine: { deleteMany: vi.fn(), updateMany: vi.fn(), createMany: vi.fn() },
  clientServiceDeadlineRule: { deleteMany: vi.fn(), createMany: vi.fn(), findMany: vi.fn() },
  serviceVariantDeadlineRule: { findMany: vi.fn() },
  deadlineRuleVersion: { findMany: vi.fn() },
  serviceCycle: { findMany: vi.fn() },
  businessCalendar: { findFirst: vi.fn() },
  deadlineRule: { findMany: vi.fn() },
  serviceAgreement: { findMany: vi.fn() },
  serviceAgreementFeeLine: { update: vi.fn() },
  serviceScheduleReconciliationRequest: { findUnique: vi.fn(), upsert: vi.fn() },
  $transaction: vi.fn(),
}));
const auditMock = vi.hoisted(() => ({ createAuditLog: vi.fn(), computeChanges: vi.fn(() => null) }));
vi.mock('@/lib/prisma', () => ({ prisma: prismaMock }));
vi.mock('@/lib/audit', () => auditMock);

import { archiveClientService, getClientService, listCompanyServices, previewClientServiceDeadlineConfiguration, updateClientService, validateClientServiceDeadlineRules } from '@/services/client-service';

const actor = { tenantId: 'tenant-1', userId: 'user-1' };
const record = {
  id: 'service-1', tenantId: actor.tenantId, companyId: 'company-1', agreementId: 'agreement-1',
  agreementItemId: 'item-1', source: 'AGREEMENT', serviceVariantId: 'variant-1', familyName: 'Corporate Services',
  serviceName: 'Corporate Secretarial Services', status: 'ACTIVE', serviceCadence: 'ANNUALLY',
  customCadenceLabel: null, startDate: new Date('2026-07-30'), endDate: null, fieldValues: {},
  billingDisposition: 'CONFIGURED', billingNotRequiredReason: null,
  createdAt: new Date('2026-07-30T00:00:00Z'), updatedAt: new Date('2026-07-30T00:00:00Z'),
  deletedAt: null, deletedReason: null,
  feeLines: [{ id: 'fee-1', sourceAgreementFeeLineId: 'agreement-fee-1', description: 'Annual fee', amount: { toString: () => '500.00', toFixed: () => '500.00' }, currency: 'SGD', billingFrequency: 'ANNUALLY', customFrequencyLabel: null, billingStartDate: new Date('2026-07-30'), scheduleConfig: null, isActive: true, deletedAt: null, deletedReason: null, displayOrder: 0 }],
  agreement: { status: 'EFFECTIVE', activationStatus: 'COMPLETED', generatedDocument: { id: 'document-1', title: 'Service Agreement' } },
};

describe('client service service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    prismaMock.clientService.findFirst.mockReset();
    prismaMock.$transaction.mockImplementation(async (callback) => callback(prismaMock));
    prismaMock.serviceAgreement.findMany.mockResolvedValue([]);
    prismaMock.clientService.updateMany.mockResolvedValue({ count: 1 });
    prismaMock.serviceScheduleReconciliationRequest.findUnique.mockResolvedValue(null);
    prismaMock.serviceScheduleReconciliationRequest.upsert.mockResolvedValue({ id: 'req-1', dedupeKey: 'k-1' });
  });

  it('tenant-scopes company lists and returns fixed-point fees without legal wording', async () => {
    prismaMock.clientService.findMany.mockResolvedValue([record]);
    prismaMock.clientService.count.mockResolvedValue(1);
    const result = await listCompanyServices('company-1', { page: 1, limit: 20 }, actor);
    expect(prismaMock.clientService.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ tenantId: actor.tenantId, companyId: 'company-1', deletedAt: null }) }));
    expect(result.services[0].feeLines[0].amount).toBe('500.00');
    expect(JSON.stringify(result.services[0])).not.toContain('partialContent');
  });

  it('updates operational fees without mutating agreement fees', async () => {
    prismaMock.clientService.findFirst.mockResolvedValue(record);
    prismaMock.clientService.findFirst
      .mockResolvedValueOnce(record)
      .mockResolvedValueOnce({ ...record, feeLines: [{ ...record.feeLines[0], description: 'Revised annual fee', amount: { toString: () => '650.00', toFixed: () => '650.00' } }] });
    await updateClientService(record.id, { expectedUpdatedAt: record.updatedAt.toISOString(), feeLines: [{ id: 'fee-1', description: 'Revised annual fee', amount: '650.00', currency: 'SGD', billingFrequency: 'ANNUALLY', billingStartDate: '2026-07-30', displayOrder: 0 }] }, actor);
    expect(prismaMock.clientServiceFeeLine.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ id: 'fee-1', deletedAt: null }),
      data: expect.objectContaining({ amount: expect.anything(), currency: 'SGD' }),
    }));
    expect(prismaMock.serviceAgreementFeeLine.update).not.toHaveBeenCalled();
    expect(auditMock.createAuditLog).toHaveBeenCalledWith(expect.objectContaining({
      entityType: 'ClientService',
      action: 'UPDATE',
      changes: expect.objectContaining({
        feeLines: expect.objectContaining({
          new: expect.objectContaining({
            snapshot: expect.objectContaining({
              items: expect.arrayContaining([expect.objectContaining({
                id: 'fee-1',
                sourceAgreementFeeLineId: 'agreement-fee-1',
              })]),
            }),
          }),
        }),
      }),
    }), prismaMock);
  });

  it('archives removed persisted fee lines instead of deleting their lineage', async () => {
    prismaMock.clientService.findFirst
      .mockResolvedValueOnce(record)
      .mockResolvedValueOnce({ ...record, feeLines: [{ ...record.feeLines[0], id: 'fee-2', sourceAgreementFeeLineId: null }] });

    await updateClientService(record.id, {
      expectedUpdatedAt: record.updatedAt.toISOString(),
      feeLines: [{ id: 'fee-2', description: 'Replacement fee', amount: '650.00', currency: 'SGD', billingFrequency: 'ANNUALLY', billingStartDate: '2026-07-30', displayOrder: 0 }],
    }, actor);

    expect(prismaMock.clientServiceFeeLine.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { tenantId: actor.tenantId, clientServiceId: record.id, id: { in: ['fee-1'] }, deletedAt: null },
      data: expect.objectContaining({
        isActive: false,
        deletedAt: expect.any(Date),
        deletedReason: 'Removed from client service configuration',
      }),
    }));
    expect(prismaMock.clientServiceFeeLine.deleteMany).not.toHaveBeenCalled();
  });

  it('persists client deadline configuration and enqueues from the same transaction', async () => {
    const ruleId = '22222222-2222-4222-8222-222222222222';
    prismaMock.clientService.findFirst.mockResolvedValue({ ...record, deadlineRules: [] });
    prismaMock.clientServiceDeadlineRule.deleteMany.mockResolvedValue({ count: 0 });
    prismaMock.clientServiceDeadlineRule.createMany.mockResolvedValue({ count: 1 });
    prismaMock.serviceVariantDeadlineRule.findMany.mockResolvedValue([{
      ruleId,
      enabledByDefault: true,
      parameterDefaults: {},
      scheduleDefaults: [],
      rule: {
        id: ruleId,
        isActive: true,
        archivedAt: null,
        currentVersionId: 'version-1',
        currentVersion: {
          id: 'version-1',
          parameterDefinitions: [{ key: 'monthsAfterFye', type: 'INTEGER', isRequired: false, validation: null }],
          milestoneTemplates: [],
        },
      },
    }]);

    const impact = await previewClientServiceDeadlineConfiguration(record.id, {
      expectedUpdatedAt: record.updatedAt.toISOString(),
      deadlineRules: [{
        ruleId,
        enabled: true,
        parameterValues: { monthsAfterFye: 12 },
        parameterProvenance: { monthsAfterFye: 'CLIENT_OVERRIDE' },
        scheduleEntries: [{
          key: 'salary-payout',
          label: 'Salary payout',
          expression: { kind: 'DAY_OF_MONTH', day: 15 },
          businessDayAdjustment: 'NONE',
        }],
      }],
      scheduleSnapshot: {
        status: record.status as 'ACTIVE',
        serviceCadence: record.serviceCadence as 'ANNUALLY',
        customCadenceLabel: record.customCadenceLabel,
        startDate: '2026-07-30',
        endDate: null,
        fieldValues: {},
      },
    }, actor);

    await updateClientService(record.id, {
      expectedUpdatedAt: record.updatedAt.toISOString(),
      impactFingerprint: impact.previewFingerprint,
      deadlineRules: [{
        ruleId,
        enabled: true,
        parameterValues: { monthsAfterFye: 12 },
        parameterProvenance: { monthsAfterFye: 'CLIENT_OVERRIDE' },
        scheduleEntries: [{
          key: 'salary-payout',
          label: 'Salary payout',
          expression: { kind: 'DAY_OF_MONTH', day: 15 },
          businessDayAdjustment: 'NONE',
        }],
      }],
    }, actor);

    expect(prismaMock.clientServiceDeadlineRule.deleteMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { tenantId: actor.tenantId, clientServiceId: record.id },
    }));
    expect(prismaMock.clientServiceDeadlineRule.createMany).toHaveBeenCalledWith(expect.objectContaining({
      data: [expect.objectContaining({
        tenantId: actor.tenantId,
        clientServiceId: record.id,
        ruleId,
        parameterProvenance: { monthsAfterFye: 'CLIENT_OVERRIDE' },
      })],
    }));
    expect(prismaMock.serviceScheduleReconciliationRequest.upsert).toHaveBeenCalled();
    expect(auditMock.createAuditLog).toHaveBeenCalledWith(expect.objectContaining({ entityType: 'ClientService', action: 'UPDATE' }), prismaMock);
  });

  it('does not enqueue reconciliation for display-name-only edits', async () => {
    prismaMock.clientService.findFirst
      .mockResolvedValueOnce(record)
      .mockResolvedValueOnce({ ...record, serviceName: 'Renamed service' });

    await updateClientService(record.id, {
      expectedUpdatedAt: record.updatedAt.toISOString(),
      serviceName: 'Renamed service',
    }, actor);

    expect(prismaMock.serviceScheduleReconciliationRequest.upsert).not.toHaveBeenCalled();
  });

  it('treats a UI-shaped fee save with unchanged canonical values as a no-op', async () => {
    prismaMock.clientService.findFirst.mockResolvedValue(record);

    await updateClientService(record.id, {
      expectedUpdatedAt: record.updatedAt.toISOString(),
      feeLines: [{
        id: 'fee-1',
        description: 'Annual fee',
        amount: '500.00',
        currency: 'SGD',
        billingFrequency: 'ANNUALLY',
        billingStartDate: '2026-07-30',
        displayOrder: 0,
      }],
    }, actor);

    expect(prismaMock.clientService.updateMany).not.toHaveBeenCalled();
    expect(prismaMock.clientServiceFeeLine.updateMany).not.toHaveBeenCalled();
    expect(prismaMock.clientServiceFeeLine.createMany).not.toHaveBeenCalled();
    expect(auditMock.createAuditLog).not.toHaveBeenCalled();
    expect(prismaMock.serviceScheduleReconciliationRequest.upsert).not.toHaveBeenCalled();
  });

  it('treats formatting-equivalent decimal fee amounts as a no-op', async () => {
    prismaMock.clientService.findFirst.mockResolvedValue(record);

    await updateClientService(record.id, {
      expectedUpdatedAt: record.updatedAt.toISOString(),
      feeLines: [{
        id: 'fee-1',
        description: 'Annual fee',
        amount: '500',
        currency: 'SGD',
        billingFrequency: 'ANNUALLY',
        billingStartDate: '2026-07-30',
        displayOrder: 0,
      }],
    }, actor);

    expect(prismaMock.clientServiceFeeLine.updateMany).not.toHaveBeenCalled();
    expect(prismaMock.clientServiceFeeLine.createMany).not.toHaveBeenCalled();
    expect(auditMock.createAuditLog).not.toHaveBeenCalled();
    expect(prismaMock.serviceScheduleReconciliationRequest.upsert).not.toHaveBeenCalled();
  });

  it('persists, audits, and reconciles a display-order-only fee change', async () => {
    prismaMock.clientService.findFirst
      .mockResolvedValueOnce(record)
      .mockResolvedValueOnce({ ...record, feeLines: [{ ...record.feeLines[0], displayOrder: 1 }] });

    await updateClientService(record.id, {
      expectedUpdatedAt: record.updatedAt.toISOString(),
      feeLines: [{
        id: 'fee-1',
        description: 'Annual fee',
        amount: '500',
        currency: 'SGD',
        billingFrequency: 'ANNUALLY',
        billingStartDate: '2026-07-30',
        displayOrder: 1,
      }],
    }, actor);

    expect(prismaMock.clientServiceFeeLine.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ displayOrder: 1 }),
    }));
    expect(auditMock.createAuditLog).toHaveBeenCalledWith(expect.objectContaining({ action: 'UPDATE' }), prismaMock);
    expect(prismaMock.serviceScheduleReconciliationRequest.upsert).toHaveBeenCalled();
  });

  it('enqueues fee-only reconciliation in the same transaction without a deadline preview', async () => {
    prismaMock.clientService.findFirst
      .mockResolvedValueOnce(record)
      .mockResolvedValueOnce({ ...record, feeLines: [{ ...record.feeLines[0], amount: { toString: () => '650.00', toFixed: () => '650.00' } }] });

    await updateClientService(record.id, {
      expectedUpdatedAt: record.updatedAt.toISOString(),
      feeLines: [{
        id: 'fee-1', description: 'Annual fee', amount: '650.00', currency: 'SGD',
        billingFrequency: 'ANNUALLY', billingStartDate: '2026-07-30', displayOrder: 0,
      }],
    }, actor);

    expect(prismaMock.serviceScheduleReconciliationRequest.upsert).toHaveBeenCalledWith(expect.objectContaining({
      create: expect.objectContaining({
        tenantId: actor.tenantId,
        scopeId: record.id,
        triggerType: 'CLIENT_SERVICE_CONFIGURATION_CHANGED',
        requestedById: actor.userId,
      }),
    }));
  });

  it('persists configured billing disposition and schedules without reintroducing updatedAt inputs', async () => {
    const scheduleConfig = {
      schemaVersion: 1 as const,
      cadence: 'ANNUALLY' as const,
      startDate: '2026-07-30',
      customInterval: { unit: 'MONTH' as const, count: 12 },
      scheduleEntries: [{ key: 'deposit', label: 'Deposit', expression: { kind: 'DAY_OF_MONTH' as const, day: 1 }, businessDayAdjustment: 'NEXT' as const }],
    };
    const unreviewedRecord = { ...record, billingDisposition: 'UNREVIEWED' as const };
    prismaMock.clientService.findFirst
      .mockResolvedValueOnce(unreviewedRecord)
      .mockResolvedValueOnce({ ...unreviewedRecord, billingDisposition: 'CONFIGURED', feeLines: [{ ...record.feeLines[0], scheduleConfig, amount: { toString: () => '650.00', toFixed: () => '650.00' } }] });

    await updateClientService(record.id, {
      expectedUpdatedAt: record.updatedAt.toISOString(),
      billingDisposition: 'CONFIGURED',
      billingNotRequiredReason: null,
      feeLines: [{
        id: 'fee-1', description: 'Annual fee', amount: '650.00', currency: 'SGD', billingFrequency: 'ANNUALLY',
        billingStartDate: '2026-07-30', displayOrder: 0, scheduleConfig,
      }],
    }, actor);

    expect(prismaMock.clientService.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ billingDisposition: 'CONFIGURED', billingNotRequiredReason: null }),
    }));
    expect(prismaMock.clientServiceFeeLine.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ scheduleConfig }),
    }));
    expect(auditMock.createAuditLog).toHaveBeenCalledWith(expect.objectContaining({
      changes: expect.objectContaining({
        billingDisposition: { old: 'UNREVIEWED', new: 'CONFIGURED' },
        feeLines: expect.objectContaining({
          new: expect.objectContaining({
            snapshot: expect.objectContaining({
              items: expect.arrayContaining([expect.objectContaining({
                scheduleConfigHash: expect.any(String),
                billingStartDate: '2026-07-30',
              })]),
            }),
          }),
        }),
      }),
    }), prismaMock);
  });

  it('rejects a disposition-only CONFIGURED update when persisted legacy fees are not materializable', async () => {
    const invalidLegacyRecord = {
      ...record,
      feeLines: [{ ...record.feeLines[0], billingStartDate: null, scheduleConfig: null }],
    };
    prismaMock.clientService.findFirst.mockResolvedValue(invalidLegacyRecord);

    await expect(updateClientService(record.id, {
      expectedUpdatedAt: record.updatedAt.toISOString(),
      billingDisposition: 'CONFIGURED',
    }, actor)).rejects.toThrow(/configured billing requires a valid start date/i);
    expect(prismaMock.clientService.updateMany).not.toHaveBeenCalled();
  });

  it('rejects conflicting structured cadence before replacing an existing fee line', async () => {
    prismaMock.clientService.findFirst.mockResolvedValue(record);
    await expect(updateClientService(record.id, {
      expectedUpdatedAt: record.updatedAt.toISOString(),
      billingDisposition: 'CONFIGURED',
      feeLines: [{
        id: 'fee-1', description: 'Annual fee', amount: '500.00', currency: 'SGD',
        billingFrequency: 'ANNUALLY', billingStartDate: '2026-07-30', displayOrder: 0,
        scheduleConfig: {
          schemaVersion: 1,
          cadence: 'MONTHLY',
          startDate: '2026-07-30',
          customInterval: { unit: 'MONTH', count: 1 },
          scheduleEntries: [{ key: 'default', label: 'Billing date', expression: { kind: 'DAY_OF_MONTH', day: 30 }, businessDayAdjustment: 'NONE' }],
        },
      }],
    }, actor)).rejects.toThrow(/frequency|cadence/i);
    expect(prismaMock.clientService.updateMany).not.toHaveBeenCalled();
  });

  it('archives active fee schedules with the confirmed not-required reason', async () => {
    prismaMock.clientService.findFirst
      .mockResolvedValueOnce(record)
      .mockResolvedValueOnce({ ...record, billingDisposition: 'NOT_REQUIRED', billingNotRequiredReason: 'Included elsewhere', feeLines: [] });

    await updateClientService(record.id, {
      expectedUpdatedAt: record.updatedAt.toISOString(),
      billingDisposition: 'NOT_REQUIRED',
      billingNotRequiredReason: 'Included elsewhere',
    }, actor);

    expect(prismaMock.clientServiceFeeLine.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ clientServiceId: record.id, deletedAt: null }),
      data: expect.objectContaining({ isActive: false, deletedReason: 'Included elsewhere' }),
    }));
    expect(prismaMock.serviceScheduleReconciliationRequest.upsert).toHaveBeenCalledWith(expect.objectContaining({
      create: expect.objectContaining({ triggerType: 'CLIENT_SERVICE_CONFIGURATION_CHANGED' }),
    }));
    expect(auditMock.createAuditLog).toHaveBeenCalledWith(expect.objectContaining({
      changes: expect.objectContaining({
        billingDisposition: { old: 'CONFIGURED', new: 'NOT_REQUIRED' },
        billingNotRequiredReason: { old: null, new: 'Included elsewhere' },
        feeLines: expect.objectContaining({
          new: expect.objectContaining({
            snapshot: expect.objectContaining({
              items: expect.arrayContaining([expect.objectContaining({
                id: 'fee-1', state: 'ARCHIVED', archiveReason: 'Included elsewhere',
              })]),
            }),
          }),
        }),
      }),
    }), prismaMock);
  });

  it('replaces archived not-required lineage when billing is configured again', async () => {
    const archived = {
      ...record.feeLines[0],
      id: 'fee-archived',
      isActive: false,
      deletedAt: new Date('2026-08-01T00:00:00.000Z'),
      deletedReason: 'Included elsewhere',
    };
    const nextFee = {
      id: 'fee-new', description: 'Replacement annual fee', amount: '650.00', currency: 'SGD',
      billingFrequency: 'ANNUALLY' as const, billingStartDate: '2026-08-01', displayOrder: 0,
    };
    prismaMock.clientService.findFirst
      .mockResolvedValueOnce({ ...record, billingDisposition: 'NOT_REQUIRED', billingNotRequiredReason: 'Included elsewhere', feeLines: [archived] })
      .mockResolvedValueOnce({ ...record, billingDisposition: 'CONFIGURED', billingNotRequiredReason: null, feeLines: [{ ...nextFee, amount: { toString: () => '650.00', toFixed: () => '650.00' }, billingStartDate: new Date('2026-08-01T00:00:00.000Z'), isActive: true, deletedAt: null, deletedReason: null }] });

    await updateClientService(record.id, {
      expectedUpdatedAt: record.updatedAt.toISOString(),
      billingDisposition: 'CONFIGURED',
      billingNotRequiredReason: null,
      feeLines: [nextFee],
    }, actor);

    expect(prismaMock.clientServiceFeeLine.createMany).toHaveBeenCalledWith(expect.objectContaining({
      data: [expect.objectContaining({
        id: 'fee-new',
        sourceAgreementFeeLineId: null,
        isActive: true,
      })],
    }));
    expect(prismaMock.clientServiceFeeLine.updateMany).not.toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ id: 'fee-archived' }),
      data: expect.objectContaining({ isActive: true }),
    }));
  });

  it('hides archived fee lines from public DTOs and does not recreate them on later edits', async () => {
    const archived = {
      ...record.feeLines[0],
      id: 'fee-archived',
      isActive: false,
      deletedAt: new Date('2026-08-01T00:00:00.000Z'),
      deletedReason: 'Removed from client service configuration',
    };
    prismaMock.clientService.findFirst.mockResolvedValueOnce({ ...record, feeLines: [...record.feeLines, archived] });
    const dto = await getClientService(record.id, actor);
    expect(dto.feeLines.map((fee) => fee.id)).toEqual(['fee-1']);

    prismaMock.clientService.findFirst
      .mockResolvedValueOnce({ ...record, feeLines: [...record.feeLines, archived] })
      .mockResolvedValueOnce({ ...record, feeLines: [record.feeLines[0]] });
    await updateClientService(record.id, {
      expectedUpdatedAt: record.updatedAt.toISOString(),
      feeLines: [{
        id: 'fee-1', description: 'Revised annual fee', amount: '650.00', currency: 'SGD',
        billingFrequency: 'ANNUALLY', billingStartDate: '2026-07-30', displayOrder: 0,
      }],
    }, actor);
    expect(prismaMock.clientServiceFeeLine.createMany).not.toHaveBeenCalledWith(expect.objectContaining({
      data: expect.arrayContaining([expect.objectContaining({ id: 'fee-archived' })]),
    }));
  });

  it('rejects a stale competing editor before replacing fees', async () => {
    prismaMock.clientService.findFirst.mockResolvedValue(record);
    await expect(updateClientService(record.id, {
      expectedUpdatedAt: '2026-07-29T00:00:00.000Z',
      status: 'PAUSED',
    }, actor)).rejects.toMatchObject({ statusCode: 409 });
    expect(prismaMock.clientService.update).not.toHaveBeenCalled();
    expect(prismaMock.clientServiceFeeLine.deleteMany).not.toHaveBeenCalled();
  });

  it('archives within the tenant and records the reason', async () => {
    prismaMock.clientService.findFirst.mockResolvedValue(record);
    prismaMock.clientService.update.mockResolvedValue(record);
    await expect(archiveClientService(record.id, 'Client requested termination', actor)).resolves.toEqual({ id: record.id, archived: true });
    expect(prismaMock.clientService.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ id: record.id, tenantId: actor.tenantId, deletedAt: null }),
      data: expect.objectContaining({ deletedReason: 'Client requested termination' }),
    }));
    expect(auditMock.createAuditLog).toHaveBeenCalledWith(expect.objectContaining({ action: 'DELETE' }), prismaMock);
  });

  it('rejects a service from another tenant', async () => {
    prismaMock.clientService.findFirst.mockResolvedValue(null);
    await expect(getClientService(record.id, actor)).rejects.toMatchObject({ statusCode: 404 });
  });

  it('aligns validated associations to input rule IDs even when SQL returns them reversed', async () => {
    const ruleA = '22222222-2222-4222-8222-222222222222';
    const ruleB = '33333333-3333-4333-8333-333333333333';
    const association = (ruleId: string) => ({
      ruleId,
      enabledByDefault: true,
      parameterDefaults: {},
      scheduleDefaults: [],
      rule: {
        id: ruleId,
        isActive: true,
        archivedAt: null,
        currentVersionId: `version-${ruleId}`,
        currentVersion: {
          id: `version-${ruleId}`,
          state: 'PUBLISHED',
          recurrence: { schemaVersion: 1, kind: 'ANNUALLY' },
          applicability: { schemaVersion: 1, kind: 'ALL', conditions: [] },
          parameterDefinitions: [],
          milestoneTemplates: [],
        },
      },
    });
    prismaMock.serviceVariantDeadlineRule.findMany.mockResolvedValue([association(ruleB), association(ruleA)]);
    const result = await validateClientServiceDeadlineRules(prismaMock as never, {
      tenantId: actor.tenantId,
      serviceVariantId: record.serviceVariantId,
      companyId: record.companyId,
    }, [
      { ruleId: ruleA, enabled: true, parameterValues: {}, parameterProvenance: {}, scheduleEntries: [] },
      { ruleId: ruleB, enabled: true, parameterValues: {}, parameterProvenance: {}, scheduleEntries: [] },
    ]);
    expect(result.associations.map((item) => item.ruleId)).toEqual([ruleA, ruleB]);
  });

  it('rejects schedule-affecting updates without a fail-closed impact fingerprint', async () => {
    prismaMock.clientService.findFirst.mockResolvedValue({ ...record, deadlineRules: [] });
    (auditMock.computeChanges as unknown as { mockReturnValue: (value: unknown) => void }).mockReturnValue({ status: { old: 'ACTIVE', new: 'PAUSED' } });
    await expect(updateClientService(record.id, {
      expectedUpdatedAt: record.updatedAt.toISOString(),
      status: 'PAUSED',
    }, actor)).rejects.toMatchObject({ statusCode: 400 });
    expect(prismaMock.clientService.updateMany).not.toHaveBeenCalled();
  });

  it('preserves eligible existing occurrences when preview input is missing', async () => {
    const ruleId = '44444444-4444-4444-8444-444444444444';
    const versionId = '55555555-5555-4555-8555-555555555555';
    prismaMock.clientService.findFirst.mockResolvedValue({ ...record, deadlineRules: [] });
    prismaMock.serviceVariantDeadlineRule.findMany.mockResolvedValue([{
      ruleId,
      rule: {
        id: ruleId,
        isActive: true,
        archivedAt: null,
        currentVersionId: versionId,
        currentVersion: {
          id: versionId,
          state: 'PUBLISHED',
          recurrence: { schemaVersion: 1, kind: 'ANNUALLY' },
          applicability: { schemaVersion: 1, kind: 'ALL', conditions: [] },
          parameterDefinitions: [{ key: 'requiredDays', type: 'INTEGER', isRequired: true, validation: null }],
          milestoneTemplates: [],
        },
      },
    }]);
    prismaMock.serviceCycle.findMany.mockResolvedValue([{
      id: 'cycle-1',
      ruleId,
      periodKey: '2026',
      occurrences: [{
        id: 'occurrence-1',
        cycleId: 'cycle-1',
        milestoneKey: 'filing',
        scheduleEntryKey: 'filing',
        deadlineType: 'CLIENT',
        calculatedDueDate: new Date('2026-12-15'),
        operativeDueDate: new Date('2026-12-15'),
        dateOverridden: false,
        status: 'OPEN',
        origin: 'RULE',
        ruleVersionId: versionId,
      }],
    }]);
    const impact = await previewClientServiceDeadlineConfiguration(record.id, {
      expectedUpdatedAt: record.updatedAt.toISOString(),
      deadlineRules: [{ ruleId, enabled: true, parameterValues: {}, parameterProvenance: {}, scheduleEntries: [] }],
      scheduleSnapshot: {
        status: record.status as 'ACTIVE',
        serviceCadence: record.serviceCadence as 'ANNUALLY',
        customCadenceLabel: record.customCadenceLabel,
        startDate: '2026-07-30',
        endDate: null,
        fieldValues: {},
      },
    }, actor);
    expect(impact.counts.cancelled).toBe(0);
    expect(impact.warnings).toEqual(expect.arrayContaining([expect.objectContaining({ state: 'MISSING_INPUT' })]));
    expect(prismaMock.clientServiceDeadlineRule.deleteMany).not.toHaveBeenCalled();
    expect(prismaMock.clientServiceDeadlineRule.createMany).not.toHaveBeenCalled();
    expect(prismaMock.serviceScheduleReconciliationRequest.upsert).not.toHaveBeenCalled();
  });

  it('protects every existing cycle when the first-period evaluator throws missing input', async () => {
    const ruleId = '66666666-6666-4666-8666-666666666666';
    const versionId = '77777777-7777-4777-8777-777777777777';
    prismaMock.clientService.findFirst.mockResolvedValue({ ...record, deadlineRules: [] });
    prismaMock.serviceVariantDeadlineRule.findMany.mockResolvedValue([{
      ruleId,
      rule: {
        id: ruleId,
        isActive: true,
        archivedAt: null,
        currentVersionId: versionId,
        currentVersion: {
          id: versionId,
          state: 'PUBLISHED',
          recurrence: { schemaVersion: 1, kind: 'ANNUALLY' },
          applicability: { schemaVersion: 1, kind: 'ALL', conditions: [] },
          parameterDefinitions: [],
          milestoneTemplates: [{
            milestoneKey: 'missing-source',
            name: 'Missing source',
            description: null,
            type: 'CLIENT',
            generationMode: 'ONCE_PER_CYCLE',
            dateExpression: {
              kind: 'RELATIVE_TO_SOURCE',
              source: { kind: 'SCHEDULE_ENTRY', key: 'missing-entry' },
              offset: 0,
              unit: 'CALENDAR_DAY',
            },
            businessDayAdjustment: 'NONE',
            displayOrder: 0,
            isActive: true,
          }],
        },
      },
    }]);
    prismaMock.serviceCycle.findMany.mockResolvedValue([
      {
        id: 'cycle-outside-a',
        ruleId,
        periodKey: 'outside-a',
        occurrences: [{
          id: 'occurrence-outside-a',
          cycleId: 'cycle-outside-a',
          milestoneKey: 'missing-source',
          scheduleEntryKey: '',
          deadlineType: 'CLIENT',
          calculatedDueDate: new Date('2026-12-15'),
          operativeDueDate: new Date('2026-12-15'),
          dateOverridden: false,
          status: 'OPEN',
          origin: 'RULE',
          ruleVersionId: versionId,
        }],
      },
      {
        id: 'cycle-outside-b',
        ruleId,
        periodKey: 'outside-b',
        occurrences: [{
          id: 'occurrence-outside-b',
          cycleId: 'cycle-outside-b',
          milestoneKey: 'missing-source',
          scheduleEntryKey: '',
          deadlineType: 'CLIENT',
          calculatedDueDate: new Date('2026-12-20'),
          operativeDueDate: new Date('2026-12-20'),
          dateOverridden: false,
          status: 'OPEN',
          origin: 'RULE',
          ruleVersionId: versionId,
        }],
      },
    ]);

    const impact = await previewClientServiceDeadlineConfiguration(record.id, {
      expectedUpdatedAt: record.updatedAt.toISOString(),
      deadlineRules: [{ ruleId, enabled: true, parameterValues: {}, parameterProvenance: {}, scheduleEntries: [] }],
      scheduleSnapshot: {
        status: 'ACTIVE',
        serviceCadence: 'ANNUALLY',
        customCadenceLabel: null,
        startDate: '2026-07-30',
        endDate: null,
        fieldValues: {},
      },
    }, actor);

    expect(impact.counts.cancelled).toBe(0);
    expect(impact.warnings).toEqual([expect.objectContaining({ ruleId, state: 'MISSING_INPUT' })]);
  });

  it('keeps warning counts equal to warnings for disabled and applicability outcomes', async () => {
    const disabledRuleId = '88888888-8888-4888-8888-888888888888';
    const notApplicableRuleId = '99999999-9999-4999-8999-999999999999';
    const missingRuleId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
    const association = (ruleId: string, applicability: unknown, parameterDefinitions: unknown[] = []) => ({
      ruleId,
      rule: {
        id: ruleId,
        isActive: true,
        archivedAt: null,
        currentVersionId: `version-${ruleId}`,
        currentVersion: {
          id: `version-${ruleId}`,
          state: 'PUBLISHED',
          recurrence: { schemaVersion: 1, kind: 'ANNUALLY' },
          applicability,
          parameterDefinitions,
          milestoneTemplates: [],
        },
      },
    });
    prismaMock.clientService.findFirst.mockResolvedValue({ ...record, deadlineRules: [] });
    prismaMock.serviceVariantDeadlineRule.findMany.mockResolvedValue([
      association(disabledRuleId, { schemaVersion: 1, kind: 'ALL', conditions: [] }),
      association(notApplicableRuleId, { kind: 'FIELD_PRESENT', field: 'name' }),
      association(missingRuleId, { schemaVersion: 1, kind: 'ALL', conditions: [] }, [{ key: 'requiredDays', type: 'INTEGER', isRequired: true, validation: null }]),
    ]);

    const impact = await previewClientServiceDeadlineConfiguration(record.id, {
      expectedUpdatedAt: record.updatedAt.toISOString(),
      deadlineRules: [
        { ruleId: disabledRuleId, enabled: false, parameterValues: {}, parameterProvenance: {}, scheduleEntries: [] },
        { ruleId: notApplicableRuleId, enabled: true, parameterValues: {}, parameterProvenance: {}, scheduleEntries: [] },
        { ruleId: missingRuleId, enabled: true, parameterValues: {}, parameterProvenance: {}, scheduleEntries: [] },
      ],
      scheduleSnapshot: {
        status: 'ACTIVE',
        serviceCadence: 'ANNUALLY',
        customCadenceLabel: null,
        startDate: '2026-07-30',
        endDate: null,
        fieldValues: {},
      },
    }, actor);

    expect(impact.warnings).toHaveLength(3);
    expect(impact.counts.warnings).toBe(impact.warnings.length);
  });

  it('audits persisted rule history when a republished version precedes a schedule-only edit', async () => {
    const ruleId = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
    const oldVersionId = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
    const currentVersionId = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
    const persistedConfigHash = 'e'.repeat(64);
    const oldPublishedConfigHash = 'f'.repeat(64);
    const currentPublishedConfigHash = '0'.repeat(64);
    const persistedRule = {
      id: 'client-rule-history',
      ruleId,
      enabled: true,
      parameterValues: { monthsAfterFye: 12 },
      parameterProvenance: { monthsAfterFye: 'CLIENT_OVERRIDE' },
      scheduleEntries: [],
      lastEvaluatedVersionId: oldVersionId,
      applicabilityState: 'APPLICABLE',
      applicabilityReason: null,
      configHash: persistedConfigHash,
      updatedAt: new Date('2026-07-30T00:00:00Z'),
    };
    const currentAssociation = {
      ruleId,
      rule: {
        id: ruleId,
        isActive: true,
        archivedAt: null,
        currentVersionId,
        currentVersion: {
          id: currentVersionId,
          state: 'PUBLISHED',
          configHash: currentPublishedConfigHash,
          recurrence: { schemaVersion: 1, kind: 'ANNUALLY' },
          applicability: { schemaVersion: 1, kind: 'ALL', conditions: [] },
          parameterDefinitions: [{ key: 'monthsAfterFye', type: 'INTEGER', isRequired: false, validation: null }],
          milestoneTemplates: [],
        },
      },
    };
    prismaMock.clientService.findFirst.mockResolvedValue({ ...record, deadlineRules: [persistedRule] });
    prismaMock.serviceVariantDeadlineRule.findMany.mockResolvedValue([currentAssociation]);
    prismaMock.deadlineRuleVersion.findMany.mockResolvedValue([{ id: oldVersionId, ruleId, state: 'PUBLISHED', configHash: oldPublishedConfigHash }]);
    (auditMock.computeChanges as unknown as { mockReturnValue: (value: unknown) => void }).mockReturnValue({ status: { old: 'ACTIVE', new: 'PAUSED' } });

    const rules = [{ ruleId, enabled: true, parameterValues: { monthsAfterFye: 12 }, parameterProvenance: { monthsAfterFye: 'CLIENT_OVERRIDE' as const }, scheduleEntries: [] }];
    const impact = await previewClientServiceDeadlineConfiguration(record.id, {
      expectedUpdatedAt: record.updatedAt.toISOString(),
      deadlineRules: rules,
      scheduleSnapshot: {
        status: 'PAUSED',
        serviceCadence: 'ANNUALLY',
        customCadenceLabel: null,
        startDate: '2026-07-30',
        endDate: null,
        fieldValues: {},
      },
    }, actor);

    await updateClientService(record.id, {
      expectedUpdatedAt: record.updatedAt.toISOString(),
      status: 'PAUSED',
      impactFingerprint: impact.previewFingerprint,
    }, actor);

    const changes = auditMock.createAuditLog.mock.calls.at(-1)?.[0]?.changes as Record<string, unknown>;
    const deadlineRules = changes.deadlineRules as { old: { rules: Array<Record<string, unknown>> }; new: { rules: Array<Record<string, unknown>> } };
    expect(deadlineRules.old.rules[0]).toEqual(expect.objectContaining({
      publishedVersionId: oldVersionId,
      publishedConfigHash: oldPublishedConfigHash,
      configHash: persistedConfigHash,
      applicabilityState: 'APPLICABLE',
    }));
    expect(deadlineRules.new.rules[0]).toEqual(deadlineRules.old.rules[0]);
  });

  it('omits a non-published historical version from the persisted audit', async () => {
    const ruleId = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';
    const historicalVersionId = 'ffffffff-ffff-4fff-8fff-ffffffffffff';
    const currentVersionId = '12121212-1212-4121-8121-121212121212';
    const persistedConfigHash = '1'.repeat(64);
    const persistedRule = {
      id: 'client-rule-draft-history',
      ruleId,
      enabled: true,
      parameterValues: {},
      parameterProvenance: {},
      scheduleEntries: [],
      lastEvaluatedVersionId: historicalVersionId,
      applicabilityState: 'APPLICABLE',
      applicabilityReason: null,
      configHash: persistedConfigHash,
      updatedAt: new Date('2026-07-30T00:00:00Z'),
    };
    prismaMock.clientService.findFirst.mockResolvedValue({ ...record, deadlineRules: [persistedRule] });
    prismaMock.serviceVariantDeadlineRule.findMany.mockResolvedValue([{
      ruleId,
      rule: {
        id: ruleId,
        isActive: true,
        archivedAt: null,
        currentVersionId,
        currentVersion: {
          id: currentVersionId,
          state: 'PUBLISHED',
          configHash: '2'.repeat(64),
          recurrence: { schemaVersion: 1, kind: 'ANNUALLY' },
          applicability: { schemaVersion: 1, kind: 'ALL', conditions: [] },
          parameterDefinitions: [],
          milestoneTemplates: [],
        },
      },
    }]);
    prismaMock.deadlineRuleVersion.findMany.mockResolvedValue([{ id: historicalVersionId, ruleId, state: 'DRAFT', configHash: '3'.repeat(64) }]);
    (auditMock.computeChanges as unknown as { mockReturnValue: (value: unknown) => void }).mockReturnValue({ status: { old: 'ACTIVE', new: 'PAUSED' } });

    const impact = await previewClientServiceDeadlineConfiguration(record.id, {
      expectedUpdatedAt: record.updatedAt.toISOString(),
      deadlineRules: [{ ruleId, enabled: true, parameterValues: {}, parameterProvenance: {}, scheduleEntries: [] }],
      scheduleSnapshot: {
        status: 'PAUSED',
        serviceCadence: 'ANNUALLY',
        customCadenceLabel: null,
        startDate: '2026-07-30',
        endDate: null,
        fieldValues: {},
      },
    }, actor);
    await updateClientService(record.id, {
      expectedUpdatedAt: record.updatedAt.toISOString(),
      status: 'PAUSED',
      impactFingerprint: impact.previewFingerprint,
    }, actor);

    const changes = auditMock.createAuditLog.mock.calls.at(-1)?.[0]?.changes as Record<string, unknown>;
    const rules = (changes.deadlineRules as { old: { rules: Array<Record<string, unknown>> } }).old.rules;
    expect(rules[0]).toEqual(expect.objectContaining({
      publishedVersionId: null,
      publishedConfigHash: null,
      configHash: persistedConfigHash,
    }));
  });

  it('returns a full observe fingerprint capped only in samples', async () => {
    prismaMock.clientService.findFirst.mockResolvedValue({ ...record, deadlineRules: [] });
    const makeOccurrence = (index: number, dueDate = '2026-12-15') => ({
      id: `occ-${index}`,
      cycleId: 'cycle-1',
      milestoneKey: `milestone-${index}`,
      scheduleEntryKey: 'entry',
      deadlineType: 'CLIENT',
      calculatedDueDate: new Date(`${dueDate}T00:00:00.000Z`),
      operativeDueDate: new Date(`${dueDate}T00:00:00.000Z`),
      dateOverridden: false,
      status: 'OPEN',
      origin: 'RULE',
      ruleVersionId: 'version-1',
    });
    prismaMock.serviceCycle.findMany.mockResolvedValue([{
      id: 'cycle-1',
      ruleId: 'rule-1',
      periodKey: '2026',
      occurrences: Array.from({ length: 101 }, (_, index) => makeOccurrence(index)),
    }]);
    const input = {
      expectedUpdatedAt: record.updatedAt.toISOString(),
      deadlineRules: [],
      scheduleSnapshot: {
        status: 'ACTIVE' as const,
        serviceCadence: 'ANNUALLY' as const,
        customCadenceLabel: null,
        startDate: '2026-07-30',
        endDate: null,
        fieldValues: {},
      },
    };
    const first = await previewClientServiceDeadlineConfiguration(record.id, input, actor);
    prismaMock.serviceCycle.findMany.mockResolvedValue([{
      id: 'cycle-1',
      ruleId: 'rule-1',
      periodKey: '2026',
      occurrences: Array.from({ length: 101 }, (_, index) => makeOccurrence(index, index === 100 ? '2026-12-16' : '2026-12-15')),
    }]);
    const second = await previewClientServiceDeadlineConfiguration(record.id, input, actor);
    expect(first.samples).toHaveLength(100);
    expect(second.samples).toHaveLength(100);
    expect(second.previewFingerprint).not.toBe(first.previewFingerprint);
    expect(prismaMock.serviceScheduleReconciliationRequest.upsert).not.toHaveBeenCalled();
  });

  it('rejects a stale impact fingerprint before the transactional service update', async () => {
    prismaMock.clientService.findFirst.mockResolvedValue({ ...record, deadlineRules: [] });
    (auditMock.computeChanges as unknown as { mockReturnValue: (value: unknown) => void }).mockReturnValue({ status: { old: 'ACTIVE', new: 'PAUSED' } });
    await expect(updateClientService(record.id, {
      expectedUpdatedAt: record.updatedAt.toISOString(),
      status: 'PAUSED',
      impactFingerprint: '0'.repeat(64),
    }, actor)).rejects.toMatchObject({ code: ErrorCodes.IMPACT_CHANGED, statusCode: 409 });
    expect(prismaMock.clientService.updateMany).not.toHaveBeenCalled();
  });

  it('adds accessible company IDs to the SQL service predicate before mapping', async () => {
    prismaMock.clientService.findFirst.mockResolvedValue(record);
    await getClientService(record.id, { ...actor, accessibleCompanyIds: ['company-allowed'] });
    expect(prismaMock.clientService.findFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        company: expect.objectContaining({ id: { in: ['company-allowed'] }, tenantId: actor.tenantId }),
      }),
    }));
  });

  it('maps agreement services with the generated document link', async () => {
    prismaMock.clientService.findFirst.mockResolvedValue(record);
    const result = await getClientService(record.id, actor);
    expect(result.agreement?.href).toBe('/generated-documents/document-1');
  });

  it('maps manual services with null agreement lineage and no summary', async () => {
    prismaMock.clientService.findFirst.mockResolvedValue({
      ...record,
      id: 'service-manual',
      source: 'MANUAL',
      agreementId: null,
      agreementItemId: null,
      agreement: null,
    });
    const result = await getClientService('service-manual', actor);
    expect(result).toMatchObject({ source: 'MANUAL', agreementId: null, agreementItemId: null, agreement: null });
  });
});
