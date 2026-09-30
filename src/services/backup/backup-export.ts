/**
 * Exports a workspace's database rows and copies its stored files for a backup.
 */

import { storage } from '@/lib/storage';
import { StorageKeys } from '@/lib/storage/config';
import { createLogger } from '@/lib/logger';
import { Prisma } from '@/generated/prisma';
import type { BackupManifest, BackupOptions } from './backup-types';
import type { DynamicTenantModels } from './backup-dynamic-models';

const log = createLogger('backup-service');

/**
 * Export all tenant data to JSON
 */
export async function exportTenantData(
  tenantId: string,
  options: BackupOptions,
  db: Prisma.TransactionClient,
  dynamicModels: DynamicTenantModels,
): Promise<{ data: Record<string, unknown>; stats: Record<string, number> }> {
  log.debug(`Exporting data for tenant ${tenantId}`);

  // Export all tenant-scoped entities
  const [
    tenant,
    users,
    roles,
    rolePermissions,
    userRoleAssignments,
    userPreferences,
    userCompanyAssignments,
    companies,
    companyAddresses,
    companyFormerNames,
    companyOfficers,
    companyShareholders,
    companyCharges,
    shareCapital,
    companyContacts,
    contacts,
    documents,
    processingDocuments,
    documentLinks,
    documentTags,
    processingDocumentTags,
    documentPages,
    documentRevisions,
    documentRevisionLineItems,
    documentExtractions,
    duplicateDecisions,
    processingAttempts,
    processingCheckpoints,
    documentTemplates,
    generatedDocuments,
    documentSections,
    documentComments,
    documentDrafts,
    templatePartials,
    serviceFamilies,
    serviceVariants,
    serviceVariantFeeTemplates,
    serviceAgreements,
    serviceAgreementEntities,
    serviceAgreementItems,
    serviceAgreementItemEntities,
    serviceAgreementFeeLines,
    clientServices,
    clientServiceFeeLines,
    letterhead,
    connectors,
    connectorAccess,
    connectorUsageLogs,
    noteTabs,
    fieldMappings,
    bankAccounts,
    bankTransactions,
    matchGroups,
    matchGroupItems,
    reconciliationPeriods,
    aiConversations,
    chartOfAccounts,
    chartOfAccountsMappings,
  ] = await Promise.all([
    db.workspace.findUnique({ where: { id: tenantId } }),
    db.user.findMany({ where: { tenantId } }),
    db.role.findMany({ where: { tenantId } }),
    db.rolePermission.findMany({ where: { role: { tenantId } } }),
    db.userRoleAssignment.findMany({ where: { user: { tenantId } } }),
    db.userPreference.findMany({ where: { user: { tenantId } } }),
    db.userCompanyAssignment.findMany({ where: { user: { tenantId } } }),
    db.company.findMany({ where: { tenantId } }),
    db.companyAddress.findMany({ where: { company: { tenantId } } }),
    db.companyFormerName.findMany({ where: { company: { tenantId } } }),
    db.companyOfficer.findMany({ where: { company: { tenantId } } }),
    db.companyShareholder.findMany({ where: { company: { tenantId } } }),
    db.companyCharge.findMany({ where: { company: { tenantId } } }),
    db.shareCapital.findMany({ where: { company: { tenantId } } }),
    db.companyContact.findMany({ where: { company: { tenantId } } }),
    db.contact.findMany({ where: { tenantId } }),
    db.document.findMany({ where: { tenantId } }),
    db.processingDocument.findMany({ where: { tenantId } }),
    db.documentLink.findMany({
      where: {
        OR: [
          { sourceDocument: { document: { tenantId } } },
          { targetDocument: { document: { tenantId } } },
        ],
      },
    }),
    db.documentTag.findMany({ where: { tenantId } }),
    db.processingDocumentTag.findMany({
      where: { processingDocument: { document: { tenantId } } },
    }),
    db.documentPage.findMany({ where: { processingDocument: { document: { tenantId } } } }),
    db.documentRevision.findMany({ where: { processingDocument: { document: { tenantId } } } }),
    db.documentRevisionLineItem.findMany({
      where: { revision: { processingDocument: { document: { tenantId } } } },
    }),
    db.documentExtraction.findMany({ where: { processingDocument: { document: { tenantId } } } }),
    db.duplicateDecision.findMany({
      where: { processingDocument: { document: { tenantId } } },
    }),
    db.processingAttempt.findMany({
      where: { processingDocument: { document: { tenantId } } },
    }),
    db.processingCheckpoint.findMany({
      where: { processingDocument: { document: { tenantId } } },
    }),
    db.documentTemplate.findMany({ where: { tenantId } }),
    db.generatedDocument.findMany({ where: { tenantId } }),
    db.documentSection.findMany({ where: { document: { tenantId } } }),
    db.documentComment.findMany({ where: { document: { tenantId } } }),
    db.documentDraft.findMany({ where: { document: { tenantId } } }),
    db.templatePartial.findMany({ where: { tenantId } }),
    db.serviceFamily.findMany({ where: { tenantId } }),
    db.serviceVariant.findMany({ where: { tenantId } }),
    db.serviceVariantFeeTemplate.findMany({ where: { tenantId } }),
    db.serviceAgreement.findMany({ where: { tenantId } }),
    db.serviceAgreementEntity.findMany({ where: { tenantId } }),
    db.serviceAgreementItem.findMany({ where: { tenantId } }),
    db.serviceAgreementItemEntity.findMany({ where: { tenantId } }),
    db.serviceAgreementFeeLine.findMany({ where: { tenantId } }),
    db.clientService.findMany({ where: { tenantId } }),
    db.clientServiceFeeLine.findMany({ where: { tenantId } }),
    db.workspaceLetterhead.findUnique({ where: { tenantId } }),
    db.connector.findMany({ where: { workspaceId: tenantId } }),
    db.workspaceConnectorAccess.findMany({ where: { workspaceId: tenantId } }),
    db.connectorUsageLog.findMany({ where: { workspaceId: tenantId } }),
    db.noteTab.findMany({
      where: { OR: [{ company: { tenantId } }, { contact: { tenantId } }] },
    }),
    db.fieldMapping.findMany({ where: { integration: { tenantId } } }),
    db.bankAccount.findMany({ where: { tenantId } }),
    db.bankTransaction.findMany({ where: { tenantId } }),
    db.matchGroup.findMany({ where: { tenantId } }),
    db.matchGroupItem.findMany({ where: { matchGroup: { tenantId } } }),
    db.reconciliationPeriod.findMany({ where: { tenantId } }),
    db.aiConversation.findMany({ where: { tenantId } }),
    db.chartOfAccount.findMany({
      where: {
        OR: [{ tenantId }, { company: { tenantId } }],
      },
    }),
    db.chartOfAccountsMapping.findMany({
      where: { company: { tenantId } },
    }),
  ]);

  const dynamicData = await dynamicModels.exportDynamicTenantModelData(tenantId, db);

  // Optionally include audit logs
  let auditLogs: unknown[] = [];
  if (options.includeAuditLogs !== false) {
    auditLogs = await db.auditLog.findMany({ where: { tenantId } });
  }

  const data: Record<string, unknown> = {
    tenant,
    users,
    roles,
    rolePermissions,
    userRoleAssignments,
    userPreferences,
    userCompanyAssignments,
    companies,
    companyAddresses,
    companyFormerNames,
    companyOfficers,
    companyShareholders,
    companyCharges,
    shareCapital,
    companyContacts,
    contacts,
    documents,
    processingDocuments,
    documentLinks,
    documentTags,
    processingDocumentTags,
    documentPages,
    documentRevisions,
    documentRevisionLineItems,
    documentExtractions,
    duplicateDecisions,
    processingAttempts,
    processingCheckpoints,
    documentTemplates,
    generatedDocuments,
    documentSections,
    documentComments,
    documentDrafts,
    templatePartials,
    serviceFamilies,
    serviceVariants,
    serviceVariantFeeTemplates,
    serviceAgreements,
    serviceAgreementEntities,
    serviceAgreementItems,
    serviceAgreementItemEntities,
    serviceAgreementFeeLines,
    clientServices,
    clientServiceFeeLines,
    letterhead,
    connectors,
    connectorAccess,
    connectorUsageLogs,
    noteTabs,
    fieldMappings,
    bankAccounts,
    bankTransactions,
    matchGroups,
    matchGroupItems,
    reconciliationPeriods,
    aiConversations,
    chartOfAccounts,
    chartOfAccountsMappings,
    auditLogs,
    ...dynamicData,
  };

  // Calculate stats
  const stats: Record<string, number> = {};
  for (const [key, value] of Object.entries(data)) {
    stats[key] = Array.isArray(value) ? value.length : value ? 1 : 0;
  }

  return { data, stats };
}

/**
 * Copy tenant files to backup location
 */
export async function copyTenantFiles(
  tenantId: string,
  backupId: string,
  onProgress: (progress: number) => void
): Promise<BackupManifest['files']> {
  const files: BackupManifest['files'] = [];

  // List all files with tenant prefix
  const tenantPrefix = StorageKeys.tenantPrefix(tenantId);

  try {
    const allFiles = await storage.list(tenantPrefix, 100000);
    log.debug(`Found ${allFiles.length} files for tenant ${tenantId}`);

    for (let i = 0; i < allFiles.length; i++) {
      const file = allFiles[i];
      const destinationKey = StorageKeys.backupFile(backupId, file.key);

      try {
        await storage.copy(file.key, destinationKey);
        files.push({
          key: destinationKey,
          size: file.size,
          originalStorageKey: file.key,
        });
      } catch (copyError) {
        log.warn(`Failed to copy file ${file.key}:`, copyError);
        // Continue with other files
      }

      onProgress((i + 1) / allFiles.length);
    }
  } catch (listError) {
    log.warn(`Failed to list files for tenant ${tenantId}:`, listError);
    // Return empty files list but don't fail the backup
  }

  return files;
}
