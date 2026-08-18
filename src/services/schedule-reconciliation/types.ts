import type { Prisma } from '@/generated/prisma';

export type ScheduleReconciliationScopeType =
  | 'TENANT'
  | 'COMPANY'
  | 'CLIENT_SERVICE'
  | 'RULE'
  | 'BUSINESS_CALENDAR';

export type EnqueueScheduleReconciliationInput = {
  tenantId: string;
  scopeType: ScheduleReconciliationScopeType;
  scopeId: string;
  triggerType: string;
  correlationId: string;
  requestedById: string | null;
  notBefore?: Date;
};

export type ScheduleReconciliationRequestRef = {
  id: string;
  dedupeKey: string;
};

export type ScheduleReconciliationDb = Pick<
  Prisma.TransactionClient,
  'serviceScheduleReconciliationRequest'
>;
