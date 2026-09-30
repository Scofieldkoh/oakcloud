/**
 * Backs up the tenant-scoped models that have no hand-written export, delete or restore step.
 * Each BackupService keeps one instance, so the probe of which models carry a tenantId runs once.
 */

import { prisma } from '@/lib/prisma';
import { Prisma } from '@/generated/prisma';
import { preserveBusinessAssistantHistory } from '@/services/business-assistant-backup.service';

// Models handled explicitly in export/delete/restore flows.
// Any other model with a tenantId field can be handled dynamically.
const MANUALLY_HANDLED_MODEL_DELEGATES = new Set([
  'tenant',
  'user',
  'role',
  'rolePermission',
  'userRoleAssignment',
  'userPreference',
  'userCompanyAssignment',
  'company',
  'companyAddress',
  'companyFormerName',
  'companyOfficer',
  'companyShareholder',
  'companyCharge',
  'shareCapital',
  'companyContact',
  'contact',
  'document',
  'processingDocument',
  'documentLink',
  'documentTag',
  'processingDocumentTag',
  'documentPage',
  'documentExtraction',
  'documentRevision',
  'documentRevisionLineItem',
  'duplicateDecision',
  'processingAttempt',
  'processingCheckpoint',
  'documentTemplate',
  'generatedDocument',
  'documentSection',
  'documentComment',
  'documentDraft',
  'templatePartial',
  'serviceFamily',
  'serviceVariant',
  'serviceVariantFeeTemplate',
  'serviceAgreement',
  'serviceAgreementEntity',
  'serviceAgreementItem',
  'serviceAgreementItemEntity',
  'serviceAgreementFeeLine',
  'clientService',
  'clientServiceFeeLine',
  'WorkspaceLetterhead',
  'connector',
  'WorkspaceConnectorAccess',
  'connectorUsageLog',
  'noteTab',
  'fieldMapping',
  'bankAccount',
  'bankTransaction',
  'matchGroup',
  'matchGroupItem',
  'reconciliationPeriod',
  'aiConversation',
  'chartOfAccount',
  'chartOfAccountsMapping',
  'auditLog',
]);

// Immutable security/audit ledgers are intentionally outside tenant backup mutation.
// Restores must never delete, export, or recreate merge history.
const EXCLUDED_DYNAMIC_DELEGATES = new Set([
  'permission', 'workspaceBackup', 'backupSchedule', 'contactMergeOperation',
  'businessAssistantCapacitySlot',
]);

/** Exports, deletes and restores every other model that has a tenantId column. */
export class DynamicTenantModels {
  private dynamicTenantScopedModelDelegatesPromise: Promise<string[]> | null = null;

  private modelNameToDelegate(modelName: string): string {
    return modelName.charAt(0).toLowerCase() + modelName.slice(1);
  }

  private isUnsupportedTenantIdFilterError(error: unknown): boolean {
    if (!(error instanceof Error)) {
      return false;
    }

    return error.message.includes('Unknown argument `tenantId`');
  }

  private isForeignKeyConstraintError(error: unknown): boolean {
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      return error.code === 'P2003' || error.code === 'P2014';
    }

    return false;
  }

  private async getDynamicTenantScopedModelDelegates(): Promise<string[]> {
    if (this.dynamicTenantScopedModelDelegatesPromise) {
      return this.dynamicTenantScopedModelDelegatesPromise;
    }

    this.dynamicTenantScopedModelDelegatesPromise = (async () => {
      const candidates = Object.values(Prisma.ModelName)
        .map((modelName) => this.modelNameToDelegate(modelName))
        .filter(
          (delegateName) =>
            !MANUALLY_HANDLED_MODEL_DELEGATES.has(delegateName) &&
            !EXCLUDED_DYNAMIC_DELEGATES.has(delegateName)
        );

      const supported: string[] = [];

      for (const delegateName of candidates) {
        const delegate = (prisma as unknown as Record<string, { count?: (args: unknown) => Promise<number> }>)[
          delegateName
        ];

        if (!delegate?.count) {
          continue;
        }

        try {
          await delegate.count({
            where: { tenantId: '__backup_probe__' },
          });
          supported.push(delegateName);
        } catch (error) {
          if (this.isUnsupportedTenantIdFilterError(error)) {
            continue;
          }

          throw error;
        }
      }

      return supported;
    })();

    return this.dynamicTenantScopedModelDelegatesPromise;
  }

  async exportDynamicTenantModelData(
    tenantId: string,
    db: Prisma.TransactionClient,
  ): Promise<Record<string, unknown>> {
    const delegates = await this.getDynamicTenantScopedModelDelegates();
    const data: Record<string, unknown> = {};

    for (const delegateName of delegates) {
      const delegate = (db as unknown as Record<string, { findMany?: (args: unknown) => Promise<unknown[]> }>)[
        delegateName
      ];

      if (!delegate?.findMany) {
        continue;
      }

      data[delegateName] = await delegate.findMany({
        where: { tenantId },
      });
    }

    return data;
  }

  async deleteDynamicTenantModelData(
    tx: Prisma.TransactionClient,
    tenantId: string
  ): Promise<void> {
    const delegates = await this.getDynamicTenantScopedModelDelegates();
    let pending = delegates.filter((delegate) => !preserveBusinessAssistantHistory(delegate));

    while (pending.length > 0) {
      let progress = false;
      const retry: string[] = [];

      for (const delegateName of pending) {
        const delegate = (tx as unknown as Record<string, { deleteMany?: (args: unknown) => Promise<unknown> }>)[
          delegateName
        ];

        if (!delegate?.deleteMany) {
          continue;
        }

        try {
          await delegate.deleteMany({ where: { tenantId } });
          progress = true;
        } catch (error) {
          if (this.isForeignKeyConstraintError(error)) {
            retry.push(delegateName);
            continue;
          }
          throw error;
        }
      }

      if (retry.length > 0 && !progress) {
        throw new Error(
          `Unable to clean dynamic tenant models due to unresolved dependencies: ${retry.join(', ')}`
        );
      }

      pending = retry;
    }
  }

  async restoreDynamicTenantModelData(
    tx: Prisma.TransactionClient,
    data: Record<string, unknown>,
    handledKeys: Set<string>
  ): Promise<void> {
    const delegates = await this.getDynamicTenantScopedModelDelegates();
    const delegateSet = new Set(delegates);

    let pending = Object.entries(data)
      .filter(
        ([key, value]) =>
          !handledKeys.has(key) && delegateSet.has(key) && Array.isArray(value) && value.length > 0
      )
      .map(([key, value]) => ({ key, rows: value as unknown[] }));

    while (pending.length > 0) {
      let progress = false;
      const retry: Array<{ key: string; rows: unknown[] }> = [];

      for (const item of pending) {
        const delegate = (tx as unknown as Record<string, { createMany?: (args: unknown) => Promise<unknown> }>)[
          item.key
        ];

        if (!delegate?.createMany) {
          continue;
        }

        try {
          await delegate.createMany({
            data: item.rows,
            skipDuplicates: true,
          });
          progress = true;
        } catch (error) {
          if (this.isForeignKeyConstraintError(error)) {
            retry.push(item);
            continue;
          }
          throw error;
        }
      }

      if (retry.length > 0 && !progress) {
        throw new Error(
          `Unable to restore dynamic tenant models due to unresolved dependencies: ${retry
            .map((item) => item.key)
            .join(', ')}`
        );
      }

      pending = retry;
    }
  }
}
