/**
 * Replaces a workspace's database rows and restores its files from a backup.
 */

import { storage } from '@/lib/storage';
import { createLogger } from '@/lib/logger';
import { Prisma } from '@/generated/prisma';
import type { BackupManifest } from './backup-types';
import type { DynamicTenantModels } from './backup-dynamic-models';

const log = createLogger('backup-service');

/**
 * Restore chart of accounts with parent-child dependency handling.
 */
async function restoreChartOfAccounts(
  tx: Prisma.TransactionClient,
  rows: unknown[]
): Promise<void> {
  let pending = rows as Array<Record<string, unknown>>;
  const insertedIds = new Set<string>();

  while (pending.length > 0) {
    const insertable = pending.filter((row) => {
      const parentId = row.parentId as string | null | undefined;
      return !parentId || insertedIds.has(parentId);
    });

    const batch =
      insertable.length === 0 || insertable.length === pending.length ? pending : insertable;

    await tx.chartOfAccount.createMany({
      data: batch as Prisma.ChartOfAccountCreateManyInput[],
      skipDuplicates: true,
    });

    // If we inserted all remaining rows (or had to fall back), we are done.
    if (batch === pending) {
      return;
    }

    const insertedBatchIds = new Set<string>();
    for (const row of batch) {
      if (typeof row.id === 'string') {
        insertedIds.add(row.id);
        insertedBatchIds.add(row.id);
      }
    }

    pending = pending.filter((row) => {
      if (typeof row.id !== 'string') {
        return false;
      }
      return !insertedBatchIds.has(row.id);
    });
  }
}

/**
 * Delete all data for a tenant (used before restore)
 * Replaces database records. Existing files are retained so immutable evidence
 * and completed follow-up artifacts cannot be erased by an older snapshot.
 */
export async function deleteWorkspaceData(
  tenantId: string,
  tx: Prisma.TransactionClient,
  dynamicModels: DynamicTenantModels,
): Promise<void> {
  log.info(`Deleting existing data for tenant ${tenantId} before restore`);

  // Storage work happens after commit. Unreferenced files are subject to the
  // separate retention policy, never destructive transaction-side I/O.
  // Delete database records in reverse order of dependencies.
    // Delete processing module data
    await tx.matchGroupItem.deleteMany({ where: { matchGroup: { tenantId } } });
    await tx.matchGroup.deleteMany({ where: { tenantId } });
    await tx.bankTransaction.deleteMany({ where: { tenantId } });
    await tx.bankAccount.deleteMany({ where: { tenantId } });
    await tx.reconciliationPeriod.deleteMany({ where: { tenantId } });

    // Delete integrations/postings that depend on document revisions
    await tx.externalPosting.deleteMany({ where: { tenantId } });
    await tx.fieldMapping.deleteMany({ where: { integration: { tenantId } } });

    // Delete document processing satellites
    await tx.documentLink.deleteMany({
      where: {
        OR: [
          { sourceDocument: { document: { tenantId } } },
          { targetDocument: { document: { tenantId } } },
        ],
      },
    });
    await tx.processingDocumentTag.deleteMany({
      where: { processingDocument: { document: { tenantId } } },
    });
    await tx.duplicateDecision.deleteMany({
      where: { processingDocument: { document: { tenantId } } },
    });
    await tx.processingAttempt.deleteMany({
      where: { processingDocument: { document: { tenantId } } },
    });
    await tx.processingCheckpoint.deleteMany({
      where: { processingDocument: { document: { tenantId } } },
    });

    // Delete document processing core data
    await tx.documentRevisionLineItem.deleteMany({
      where: { revision: { processingDocument: { document: { tenantId } } } },
    });
    await tx.documentRevision.deleteMany({
      where: { processingDocument: { document: { tenantId } } },
    });
    await tx.documentExtraction.deleteMany({
      where: { processingDocument: { document: { tenantId } } },
    });
    await tx.documentPage.deleteMany({
      where: { processingDocument: { document: { tenantId } } },
    });
    await tx.processingDocument.deleteMany({ where: { tenantId } });

    // Delete generated documents
    await tx.clientServiceFeeLine.deleteMany({ where: { tenantId } });
    await tx.clientService.deleteMany({ where: { tenantId } });
    await tx.serviceAgreementFeeLine.deleteMany({ where: { tenantId } });
    await tx.serviceAgreementItemEntity.deleteMany({ where: { tenantId } });
    await tx.serviceAgreementItem.deleteMany({ where: { tenantId } });
    await tx.serviceAgreementEntity.deleteMany({ where: { tenantId } });
    await tx.serviceAgreement.deleteMany({ where: { tenantId } });
    await tx.serviceVariantFeeTemplate.deleteMany({ where: { tenantId } });
    await tx.serviceVariant.deleteMany({ where: { tenantId } });
    await tx.serviceFamily.deleteMany({ where: { tenantId } });
    await tx.documentDraft.deleteMany({ where: { document: { tenantId } } });
    await tx.documentComment.deleteMany({ where: { document: { tenantId } } });
    await tx.documentSection.deleteMany({ where: { document: { tenantId } } });
    await tx.generatedDocument.deleteMany({ where: { tenantId } });
    await tx.templatePartial.deleteMany({ where: { tenantId } });
    await tx.documentTemplate.deleteMany({ where: { tenantId } });
    await tx.workspaceLetterhead.deleteMany({ where: { tenantId } });

    // Delete documents
    await tx.document.deleteMany({ where: { tenantId } });

    // Delete company data
    await tx.noteTab.deleteMany({ where: { OR: [{ company: { tenantId } }, { contact: { tenantId } }] } });
    await tx.documentTag.deleteMany({ where: { tenantId } });
    await tx.chartOfAccountsMapping.deleteMany({ where: { company: { tenantId } } });
    await tx.chartOfAccount.deleteMany({
      where: {
        OR: [{ tenantId }, { company: { tenantId } }],
      },
    });
    await tx.companyCharge.deleteMany({ where: { company: { tenantId } } });
    await tx.shareCapital.deleteMany({ where: { company: { tenantId } } });
    await tx.companyShareholder.deleteMany({ where: { company: { tenantId } } });
    await tx.companyOfficer.deleteMany({ where: { company: { tenantId } } });
    await tx.companyContact.deleteMany({ where: { company: { tenantId } } });
    await tx.companyAddress.deleteMany({ where: { company: { tenantId } } });
    await tx.companyFormerName.deleteMany({ where: { company: { tenantId } } });

    // Delete user assignments and roles
    await tx.userCompanyAssignment.deleteMany({ where: { user: { tenantId } } });
    await tx.userRoleAssignment.deleteMany({ where: { user: { tenantId } } });
    await tx.rolePermission.deleteMany({ where: { role: { tenantId } } });
    await tx.role.deleteMany({ where: { tenantId } });
    await tx.userPreference.deleteMany({ where: { user: { tenantId } } });

    // Delete connectors
    await tx.connectorUsageLog.deleteMany({ where: { workspaceId: tenantId } });
    await tx.workspaceConnectorAccess.deleteMany({ where: { workspaceId: tenantId } });
    await tx.connector.deleteMany({ where: { workspaceId: tenantId } });

    // Delete AI conversations
    await tx.aiConversation.deleteMany({ where: { tenantId } });

    // Delete audit logs
    await tx.auditLog.deleteMany({ where: { tenantId } });

    // Delete any additional tenant-scoped models discovered dynamically
    await dynamicModels.deleteDynamicTenantModelData(tx, tenantId);

    // Delete contacts
    await tx.contact.deleteMany({ where: { tenantId } });

    // Delete companies
    await tx.company.deleteMany({ where: { tenantId } });

    // Delete users
    await tx.user.deleteMany({ where: { tenantId } });

  // Note: Don't delete the tenant itself - just its data
}

/**
 * Restore database data from backup
 */
export async function restoreDatabaseData(
  data: Record<string, unknown>,
  tenantId: string,
  tx: Prisma.TransactionClient,
  dynamicModels: DynamicTenantModels,
): Promise<void> {
  log.info('Restoring database data from backup');

  // Restore in order of dependencies

    // 1. Tenant (upsert to handle existing tenant)
    if (data.tenant) {
      const tenant = data.tenant as Record<string, unknown>;
      await tx.workspace.upsert({
        where: { id: tenant.id as string },
        create: tenant as Prisma.WorkspaceCreateInput,
        update: tenant as Prisma.WorkspaceUpdateInput,
      });
    }

    // 2. Users
    if (Array.isArray(data.users) && data.users.length > 0) {
      await tx.user.createMany({
        data: data.users as Prisma.UserCreateManyInput[],
        skipDuplicates: true,
      });
    }

    // 2b. User Preferences
    if (Array.isArray(data.userPreferences) && data.userPreferences.length > 0) {
      await tx.userPreference.createMany({
        data: data.userPreferences as Prisma.UserPreferenceCreateManyInput[],
        skipDuplicates: true,
      });
    }

    // 3. Roles
    if (Array.isArray(data.roles) && data.roles.length > 0) {
      await tx.role.createMany({
        data: data.roles as Prisma.RoleCreateManyInput[],
        skipDuplicates: true,
      });
    }

    // 4. Role Permissions
    if (Array.isArray(data.rolePermissions) && data.rolePermissions.length > 0) {
      await tx.rolePermission.createMany({
        data: data.rolePermissions as Prisma.RolePermissionCreateManyInput[],
        skipDuplicates: true,
      });
    }

    // 5. User Role Assignments
    if (Array.isArray(data.userRoleAssignments) && data.userRoleAssignments.length > 0) {
      await tx.userRoleAssignment.createMany({
        data: data.userRoleAssignments as Prisma.UserRoleAssignmentCreateManyInput[],
        skipDuplicates: true,
      });
    }

    // 6. Companies
    if (Array.isArray(data.companies) && data.companies.length > 0) {
      await tx.company.createMany({
        data: data.companies as Prisma.CompanyCreateManyInput[],
        skipDuplicates: true,
      });
    }

    // 6b. Chart of Accounts (tenant + company scope)
    if (Array.isArray(data.chartOfAccounts) && data.chartOfAccounts.length > 0) {
      await restoreChartOfAccounts(tx, data.chartOfAccounts);
    }

    // 7. User Company Assignments
    if (Array.isArray(data.userCompanyAssignments) && data.userCompanyAssignments.length > 0) {
      await tx.userCompanyAssignment.createMany({
        data: data.userCompanyAssignments as Prisma.UserCompanyAssignmentCreateManyInput[],
        skipDuplicates: true,
      });
    }

    // 8. Contacts (before company contacts)
    if (Array.isArray(data.contacts) && data.contacts.length > 0) {
      await tx.contact.createMany({
        data: data.contacts as Prisma.ContactCreateManyInput[],
        skipDuplicates: true,
      });
    }

    // 9. Company Contacts
    if (Array.isArray(data.companyContacts) && data.companyContacts.length > 0) {
      await tx.companyContact.createMany({
        data: data.companyContacts as Prisma.CompanyContactCreateManyInput[],
        skipDuplicates: true,
      });
    }

    // 9b. Document Tags
    if (Array.isArray(data.documentTags) && data.documentTags.length > 0) {
      await tx.documentTag.createMany({
        data: data.documentTags as Prisma.DocumentTagCreateManyInput[],
        skipDuplicates: true,
      });
    }

    // 10. Note Tabs
    if (Array.isArray(data.noteTabs) && data.noteTabs.length > 0) {
      await tx.noteTab.createMany({
        data: data.noteTabs as Prisma.NoteTabCreateManyInput[],
        skipDuplicates: true,
      });
    }

    // 10b. Chart of Accounts Mappings
    if (Array.isArray(data.chartOfAccountsMappings) && data.chartOfAccountsMappings.length > 0) {
      await tx.chartOfAccountsMapping.createMany({
        data: data.chartOfAccountsMappings as Prisma.ChartOfAccountsMappingCreateManyInput[],
        skipDuplicates: true,
      });
    }

    // 11. Documents (before entities that reference sourceDocumentId)
    if (Array.isArray(data.documents) && data.documents.length > 0) {
      await tx.document.createMany({
        data: data.documents as Prisma.DocumentCreateManyInput[],
        skipDuplicates: true,
      });
    }

    // 12. Processing Documents (without currentRevisionId - will update later after revisions are created)
    // This handles circular dependency: ProcessingDocument -> DocumentRevision -> ProcessingDocument
    const processingDocsToUpdate: Array<{ id: string; currentRevisionId: string }> = [];
    if (Array.isArray(data.processingDocuments) && data.processingDocuments.length > 0) {
      const docsWithoutRevision = (data.processingDocuments as Array<Record<string, unknown>>).map((doc) => {
        if (doc.currentRevisionId) {
          processingDocsToUpdate.push({
            id: doc.id as string,
            currentRevisionId: doc.currentRevisionId as string,
          });
        }
        // Inject tenantId (may be missing in backups taken before this field was added)
        return { ...doc, tenantId, currentRevisionId: null };
      });
      await tx.processingDocument.createMany({
        data: docsWithoutRevision as Prisma.ProcessingDocumentCreateManyInput[],
        skipDuplicates: true,
      });
    }

    // 12b. Document Links
    if (Array.isArray(data.documentLinks) && data.documentLinks.length > 0) {
      await tx.documentLink.createMany({
        data: data.documentLinks as Prisma.DocumentLinkCreateManyInput[],
        skipDuplicates: true,
      });
    }

    // 12c. Duplicate Decisions
    if (Array.isArray(data.duplicateDecisions) && data.duplicateDecisions.length > 0) {
      await tx.duplicateDecision.createMany({
        data: data.duplicateDecisions as Prisma.DuplicateDecisionCreateManyInput[],
        skipDuplicates: true,
      });
    }

    // 12d. Processing Attempts
    if (Array.isArray(data.processingAttempts) && data.processingAttempts.length > 0) {
      await tx.processingAttempt.createMany({
        data: data.processingAttempts as Prisma.ProcessingAttemptCreateManyInput[],
        skipDuplicates: true,
      });
    }

    // 12e. Processing Checkpoints
    if (Array.isArray(data.processingCheckpoints) && data.processingCheckpoints.length > 0) {
      await tx.processingCheckpoint.createMany({
        data: data.processingCheckpoints as Prisma.ProcessingCheckpointCreateManyInput[],
        skipDuplicates: true,
      });
    }

    // 13. Company Addresses (has sourceDocumentId FK to Document)
    if (Array.isArray(data.companyAddresses) && data.companyAddresses.length > 0) {
      await tx.companyAddress.createMany({
        data: data.companyAddresses as Prisma.CompanyAddressCreateManyInput[],
        skipDuplicates: true,
      });
    }

    // 14. Company Former Names (has sourceDocumentId FK to Document)
    if (Array.isArray(data.companyFormerNames) && data.companyFormerNames.length > 0) {
      await tx.companyFormerName.createMany({
        data: data.companyFormerNames as Prisma.CompanyFormerNameCreateManyInput[],
        skipDuplicates: true,
      });
    }

    // 15. Company Officers (has sourceDocumentId FK to Document)
    if (Array.isArray(data.companyOfficers) && data.companyOfficers.length > 0) {
      await tx.companyOfficer.createMany({
        data: data.companyOfficers as Prisma.CompanyOfficerCreateManyInput[],
        skipDuplicates: true,
      });
    }

    // 16. Company Shareholders (has sourceDocumentId FK to Document)
    if (Array.isArray(data.companyShareholders) && data.companyShareholders.length > 0) {
      await tx.companyShareholder.createMany({
        data: data.companyShareholders as Prisma.CompanyShareholderCreateManyInput[],
        skipDuplicates: true,
      });
    }

    // 17. Share Capital (has sourceDocumentId FK to Document)
    if (Array.isArray(data.shareCapital) && data.shareCapital.length > 0) {
      await tx.shareCapital.createMany({
        data: data.shareCapital as Prisma.ShareCapitalCreateManyInput[],
        skipDuplicates: true,
      });
    }

    // 18. Company Charges (has sourceDocumentId FK to Document)
    if (Array.isArray(data.companyCharges) && data.companyCharges.length > 0) {
      await tx.companyCharge.createMany({
        data: data.companyCharges as Prisma.CompanyChargeCreateManyInput[],
        skipDuplicates: true,
      });
    }

    // 19. Document Pages
    if (Array.isArray(data.documentPages) && data.documentPages.length > 0) {
      await tx.documentPage.createMany({
        data: data.documentPages as Prisma.DocumentPageCreateManyInput[],
        skipDuplicates: true,
      });
    }

    // 20. Document Extractions
    if (Array.isArray(data.documentExtractions) && data.documentExtractions.length > 0) {
      await tx.documentExtraction.createMany({
        data: data.documentExtractions as Prisma.DocumentExtractionCreateManyInput[],
        skipDuplicates: true,
      });
    }

    // 21. Document Revisions
    if (Array.isArray(data.documentRevisions) && data.documentRevisions.length > 0) {
      await tx.documentRevision.createMany({
        data: data.documentRevisions as Prisma.DocumentRevisionCreateManyInput[],
        skipDuplicates: true,
      });
    }

    // 21b. Update ProcessingDocuments with currentRevisionId (deferred from step 12)
    for (const doc of processingDocsToUpdate) {
      await tx.processingDocument.update({
        where: { id: doc.id },
        data: { currentRevisionId: doc.currentRevisionId },
      });
    }

    // 22. Document Revision Line Items
    if (Array.isArray(data.documentRevisionLineItems) && data.documentRevisionLineItems.length > 0) {
      await tx.documentRevisionLineItem.createMany({
        data: data.documentRevisionLineItems as Prisma.DocumentRevisionLineItemCreateManyInput[],
        skipDuplicates: true,
      });
    }

    // 22b. Processing Document Tags
    if (Array.isArray(data.processingDocumentTags) && data.processingDocumentTags.length > 0) {
      await tx.processingDocumentTag.createMany({
        data: data.processingDocumentTags as Prisma.ProcessingDocumentTagCreateManyInput[],
        skipDuplicates: true,
      });
    }

    // 23. Document Templates
    if (Array.isArray(data.documentTemplates) && data.documentTemplates.length > 0) {
      await tx.documentTemplate.createMany({
        data: data.documentTemplates as Prisma.DocumentTemplateCreateManyInput[],
        skipDuplicates: true,
      });
    }

    // 24. Template Partials
    if (Array.isArray(data.templatePartials) && data.templatePartials.length > 0) {
      await tx.templatePartial.createMany({
        data: data.templatePartials as Prisma.TemplatePartialCreateManyInput[],
        skipDuplicates: true,
      });
    }

    if (Array.isArray(data.serviceFamilies) && data.serviceFamilies.length > 0) {
      await tx.serviceFamily.createMany({ data: data.serviceFamilies as Prisma.ServiceFamilyCreateManyInput[], skipDuplicates: true });
    }
    if (Array.isArray(data.serviceVariants) && data.serviceVariants.length > 0) {
      await tx.serviceVariant.createMany({ data: data.serviceVariants as Prisma.ServiceVariantCreateManyInput[], skipDuplicates: true });
    }
    if (Array.isArray(data.serviceVariantFeeTemplates) && data.serviceVariantFeeTemplates.length > 0) {
      await tx.serviceVariantFeeTemplate.createMany({ data: data.serviceVariantFeeTemplates as Prisma.ServiceVariantFeeTemplateCreateManyInput[], skipDuplicates: true });
    }

    // 25. Tenant Letterhead
    if (data.letterhead) {
      const letterhead = data.letterhead as Record<string, unknown>;
      await tx.workspaceLetterhead.upsert({
        where: { tenantId: letterhead.tenantId as string },
        create: letterhead as Prisma.WorkspaceLetterheadCreateInput,
        update: letterhead as Prisma.WorkspaceLetterheadUpdateInput,
      });
    }

    // 26. Generated Documents
    if (Array.isArray(data.generatedDocuments) && data.generatedDocuments.length > 0) {
      await tx.generatedDocument.createMany({
        data: data.generatedDocuments as Prisma.GeneratedDocumentCreateManyInput[],
        skipDuplicates: true,
      });
    }

    if (Array.isArray(data.serviceAgreements) && data.serviceAgreements.length > 0) {
      await tx.serviceAgreement.createMany({ data: data.serviceAgreements as Prisma.ServiceAgreementCreateManyInput[], skipDuplicates: true });
    }
    if (Array.isArray(data.serviceAgreementEntities) && data.serviceAgreementEntities.length > 0) {
      await tx.serviceAgreementEntity.createMany({ data: data.serviceAgreementEntities as Prisma.ServiceAgreementEntityCreateManyInput[], skipDuplicates: true });
    }
    if (Array.isArray(data.serviceAgreementItems) && data.serviceAgreementItems.length > 0) {
      await tx.serviceAgreementItem.createMany({ data: data.serviceAgreementItems as Prisma.ServiceAgreementItemCreateManyInput[], skipDuplicates: true });
    }
    if (Array.isArray(data.serviceAgreementItemEntities) && data.serviceAgreementItemEntities.length > 0) {
      await tx.serviceAgreementItemEntity.createMany({ data: data.serviceAgreementItemEntities as Prisma.ServiceAgreementItemEntityCreateManyInput[], skipDuplicates: true });
    }
    if (Array.isArray(data.serviceAgreementFeeLines) && data.serviceAgreementFeeLines.length > 0) {
      await tx.serviceAgreementFeeLine.createMany({ data: data.serviceAgreementFeeLines as Prisma.ServiceAgreementFeeLineCreateManyInput[], skipDuplicates: true });
    }
    if (Array.isArray(data.clientServices) && data.clientServices.length > 0) {
      await tx.clientService.createMany({ data: data.clientServices as Prisma.ClientServiceCreateManyInput[], skipDuplicates: true });
    }
    if (Array.isArray(data.clientServiceFeeLines) && data.clientServiceFeeLines.length > 0) {
      await tx.clientServiceFeeLine.createMany({ data: data.clientServiceFeeLines as Prisma.ClientServiceFeeLineCreateManyInput[], skipDuplicates: true });
    }

    // 27. Document Sections
    if (Array.isArray(data.documentSections) && data.documentSections.length > 0) {
      await tx.documentSection.createMany({
        data: data.documentSections as Prisma.DocumentSectionCreateManyInput[],
        skipDuplicates: true,
      });
    }

    // 28. Document Comments
    if (Array.isArray(data.documentComments) && data.documentComments.length > 0) {
      await tx.documentComment.createMany({
        data: data.documentComments as Prisma.DocumentCommentCreateManyInput[],
        skipDuplicates: true,
      });
    }

    // 29. Document Drafts
    if (Array.isArray(data.documentDrafts) && data.documentDrafts.length > 0) {
      await tx.documentDraft.createMany({
        data: data.documentDrafts as Prisma.DocumentDraftCreateManyInput[],
        skipDuplicates: true,
      });
    }

    // 31. Connectors
    if (Array.isArray(data.connectors) && data.connectors.length > 0) {
      await tx.connector.createMany({
        data: data.connectors.map((connector) => {
          const { tenantId: legacyTenantId, ...item } = connector as Record<string, unknown>;
          return {
            ...item,
            workspaceId: item.workspaceId ?? legacyTenantId,
          };
        }) as Prisma.ConnectorCreateManyInput[],
        skipDuplicates: true,
      });
    }

    // 32. Connector Access
    if (Array.isArray(data.connectorAccess) && data.connectorAccess.length > 0) {
      await tx.workspaceConnectorAccess.createMany({
        data: data.connectorAccess.map((access) => {
          const { tenantId: legacyTenantId, ...item } = access as Record<string, unknown>;
          return {
            ...item,
            workspaceId: item.workspaceId ?? legacyTenantId,
          };
        }) as Prisma.WorkspaceConnectorAccessCreateManyInput[],
        skipDuplicates: true,
      });
    }

    // 33. Connector Usage Logs
    if (Array.isArray(data.connectorUsageLogs) && data.connectorUsageLogs.length > 0) {
      await tx.connectorUsageLog.createMany({
        data: data.connectorUsageLogs.map((log) => {
          const { tenantId: legacyTenantId, ...item } = log as Record<string, unknown>;
          return {
            ...item,
            workspaceId: item.workspaceId ?? legacyTenantId,
          };
        }) as Prisma.ConnectorUsageLogCreateManyInput[],
        skipDuplicates: true,
      });
    }

    // 34. Bank Accounts
    if (Array.isArray(data.bankAccounts) && data.bankAccounts.length > 0) {
      await tx.bankAccount.createMany({
        data: data.bankAccounts as Prisma.BankAccountCreateManyInput[],
        skipDuplicates: true,
      });
    }

    // 35. Bank Transactions
    if (Array.isArray(data.bankTransactions) && data.bankTransactions.length > 0) {
      await tx.bankTransaction.createMany({
        data: data.bankTransactions as Prisma.BankTransactionCreateManyInput[],
        skipDuplicates: true,
      });
    }

    // 36. Match Groups
    if (Array.isArray(data.matchGroups) && data.matchGroups.length > 0) {
      await tx.matchGroup.createMany({
        data: data.matchGroups as Prisma.MatchGroupCreateManyInput[],
        skipDuplicates: true,
      });
    }

    // 37. Match Group Items
    if (Array.isArray(data.matchGroupItems) && data.matchGroupItems.length > 0) {
      await tx.matchGroupItem.createMany({
        data: data.matchGroupItems as Prisma.MatchGroupItemCreateManyInput[],
        skipDuplicates: true,
      });
    }

    // 38. Reconciliation Periods
    if (Array.isArray(data.reconciliationPeriods) && data.reconciliationPeriods.length > 0) {
      await tx.reconciliationPeriod.createMany({
        data: data.reconciliationPeriods as Prisma.ReconciliationPeriodCreateManyInput[],
        skipDuplicates: true,
      });
    }

    // 39. AI Conversations
    if (Array.isArray(data.aiConversations) && data.aiConversations.length > 0) {
      await tx.aiConversation.createMany({
        data: data.aiConversations as Prisma.AiConversationCreateManyInput[],
        skipDuplicates: true,
      });
    }

    // 40. Restore dynamically discovered tenant-scoped models
    await dynamicModels.restoreDynamicTenantModelData(
      tx,
      data,
      new Set([
        'tenant',
        'users',
        'roles',
        'rolePermissions',
        'userRoleAssignments',
        'userPreferences',
        'userCompanyAssignments',
        'companies',
        'chartOfAccounts',
        'contacts',
        'companyContacts',
        'documentTags',
        'noteTabs',
        'chartOfAccountsMappings',
        'documents',
        'processingDocuments',
        'documentLinks',
        'duplicateDecisions',
        'processingAttempts',
        'processingCheckpoints',
        'companyAddresses',
        'companyFormerNames',
        'companyOfficers',
        'companyShareholders',
        'shareCapital',
        'companyCharges',
        'documentPages',
        'documentExtractions',
        'documentRevisions',
        'documentRevisionLineItems',
        'processingDocumentTags',
        'documentTemplates',
        'templatePartials',
        'serviceFamilies',
        'serviceVariants',
        'serviceVariantFeeTemplates',
        'letterhead',
        'generatedDocuments',
        'serviceAgreements',
        'serviceAgreementEntities',
        'serviceAgreementItems',
        'serviceAgreementItemEntities',
        'serviceAgreementFeeLines',
        'clientServices',
        'clientServiceFeeLines',
        'documentSections',
        'documentComments',
        'documentDrafts',
        'connectors',
        'connectorAccess',
        'connectorUsageLogs',
        'bankAccounts',
        'bankTransactions',
        'matchGroups',
        'matchGroupItems',
        'reconciliationPeriods',
        'aiConversations',
        'fieldMappings',
        'auditLogs',
      ])
    );

    // 41. Field Mappings (depends on accounting integrations)
    if (Array.isArray(data.fieldMappings) && data.fieldMappings.length > 0) {
      await tx.fieldMapping.createMany({
        data: data.fieldMappings as Prisma.FieldMappingCreateManyInput[],
        skipDuplicates: true,
      });
    }

    // 42. Audit Logs (optional - only if included in backup)
  if (Array.isArray(data.auditLogs) && data.auditLogs.length > 0) {
    await tx.auditLog.createMany({
      data: data.auditLogs as Prisma.AuditLogCreateManyInput[],
      skipDuplicates: true,
    });
  }
}

/**
 * Restore files from backup
 */
export async function restoreFiles(
  backupId: string,
  tenantId: string,
  files: BackupManifest['files']
): Promise<void> {
  log.info(`Restoring ${files.length} files from backup ${backupId}`);

  let failures = 0;
  for (const file of files) {
    try {
      // Copy from backup location to original location
      await storage.copy(file.key, file.originalStorageKey);
    } catch (error) {
      failures += 1;
      log.warn('A backup file could not be restored', { backupId, tenantId, error: error instanceof Error ? error.name : 'UnknownError' });
    }
  }
  if (failures > 0) throw new Error(`${failures} backup file(s) could not be restored. Dispatch remains paused until a successful restore retry.`);
}
