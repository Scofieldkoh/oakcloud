/**
 * Backup Service
 *
 * Handles tenant backup and restore operations.
 * Supports exporting database data as gzip-compressed JSON and copying S3 files.
 */

import { gzipSync, gunzipSync } from 'zlib';
import { prisma } from '@/lib/prisma';
import { storage } from '@/lib/storage';
import { StorageKeys } from '@/lib/storage/config';
import { createAuditLog } from '@/lib/audit';
import { hashBlake3 } from '@/lib/encryption';
import { createLogger } from '@/lib/logger';
import type { BackupStatus, Prisma } from '@/generated/prisma';

const log = createLogger('backup-service');

// Compression settings
const COMPRESSION_LEVEL = 6; // Default gzip level (1-9, higher = better compression but slower)

// ============================================================================
// Types
// ============================================================================

export interface BackupManifest {
  version: '1.1';
  backupId: string;
  tenantId: string;
  tenantName: string;
  tenantSlug: string;
  createdAt: string;
  createdById: string;

  // Schema version for compatibility
  schemaVersion: string;

  // Statistics
  stats: Record<string, number>;

  // Compression info
  compression: {
    algorithm: 'gzip';
    level: number;
    uncompressedSize: number;
    compressedSize: number;
    ratio: number; // Compression ratio (e.g., 0.15 = 85% reduction)
  };

  // File manifest
  files: {
    key: string;
    size: number;
    originalStorageKey: string;
  }[];

  // Data checksums (hash of UNCOMPRESSED data for integrity verification)
  checksums: {
    dataJson: string;
  };
}

export interface BackupOptions {
  name?: string;
  includeAuditLogs?: boolean; // Default: true
  retentionDays?: number;
}

export interface RestoreOptions {
  dryRun?: boolean; // Validate without actually restoring
  overwriteExisting?: boolean; // Default: false (fail if tenant exists)
}

export interface ListBackupsParams {
  tenantId?: string;
  status?: BackupStatus;
  page?: number;
  limit?: number;
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Format bytes to human-readable size
 */
function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

// ============================================================================
// Backup Service Class
// ============================================================================

class BackupService {
  /**
   * Create a backup for a tenant
   */
  async createTenantBackup(
    tenantId: string,
    userId: string,
    options: BackupOptions = {}
  ): Promise<{ backupId: string }> {
    // 1. Validate tenant exists
    const tenant = await prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { id: true, name: true, slug: true, deletedAt: true },
    });

    if (!tenant) {
      throw new Error('Tenant not found');
    }

    if (tenant.deletedAt) {
      throw new Error('Cannot backup a deleted tenant');
    }

    // 2. Check for existing in-progress backups
    const existingBackup = await prisma.tenantBackup.findFirst({
      where: {
        tenantId,
        status: { in: ['PENDING', 'IN_PROGRESS'] },
        deletedAt: null,
      },
    });

    if (existingBackup) {
      throw new Error('A backup is already in progress for this tenant');
    }

    // 3. Create backup record in PENDING state
    const backupId = crypto.randomUUID();
    const storageKey = StorageKeys.backupPrefix(backupId);
    const now = new Date();

    const backup = await prisma.tenantBackup.create({
      data: {
        id: backupId,
        tenantId,
        name: options.name || `Backup ${now.toISOString().slice(0, 19).replace('T', ' ')}`,
        backupType: 'MANUAL',
        status: 'PENDING',
        storageKey,
        createdById: userId,
        retentionDays: options.retentionDays,
        expiresAt: options.retentionDays
          ? new Date(now.getTime() + options.retentionDays * 24 * 60 * 60 * 1000)
          : null,
      },
    });

    // 4. Start async backup process (don't await - return immediately)
    this.executeBackup(backupId, tenantId, tenant.name, tenant.slug, userId, options).catch(
      (error) => {
        log.error(`Backup ${backupId} failed:`, error);
        this.markBackupFailed(backupId, error);
      }
    );

    // 5. Audit log
    await createAuditLog({
      tenantId,
      userId,
      action: 'BACKUP_CREATED',
      entityType: 'TenantBackup',
      entityId: backupId,
      entityName: backup.name || undefined,
      summary: `Started backup for tenant "${tenant.name}"`,
      changeSource: 'MANUAL',
    });

    log.info(`Backup ${backupId} started for tenant ${tenantId}`);
    return { backupId };
  }

  /**
   * Execute the actual backup process (runs async)
   */
  private async executeBackup(
    backupId: string,
    tenantId: string,
    tenantName: string,
    tenantSlug: string,
    userId: string | undefined,
    options: BackupOptions
  ): Promise<void> {
    try {
      // Update status to IN_PROGRESS
      await this.updateBackupProgress(backupId, 'IN_PROGRESS', 0, 'Starting backup...');

      // 1. Export database data and compress (30% of progress)
      await this.updateBackupProgress(backupId, 'IN_PROGRESS', 5, 'Exporting database...');
      const { data, stats } = await this.exportTenantData(tenantId, options);
      const dataJson = JSON.stringify(data); // No pretty-print to save space
      const dataBuffer = Buffer.from(dataJson, 'utf-8');
      const dataChecksum = hashBlake3(dataBuffer);

      // Compress the data with gzip
      await this.updateBackupProgress(backupId, 'IN_PROGRESS', 15, 'Compressing data...');
      const compressedBuffer = gzipSync(dataBuffer, { level: COMPRESSION_LEVEL });
      const compressionRatio = compressedBuffer.length / dataBuffer.length;

      await storage.upload(StorageKeys.backupData(backupId), compressedBuffer, {
        contentType: 'application/gzip',
      });
      await this.updateBackupProgress(backupId, 'IN_PROGRESS', 30, 'Database exported');
      log.debug(
        `Backup ${backupId}: Database exported and compressed (${formatBytes(dataBuffer.length)} → ${formatBytes(compressedBuffer.length)}, ${Math.round((1 - compressionRatio) * 100)}% reduction)`
      );

      // 2. Copy S3 files (60% of progress)
      await this.updateBackupProgress(backupId, 'IN_PROGRESS', 35, 'Copying files...');
      const files = await this.copyTenantFiles(tenantId, backupId, (progress) => {
        const overallProgress = 35 + Math.floor(progress * 55);
        this.updateBackupProgress(
          backupId,
          'IN_PROGRESS',
          overallProgress,
          `Copying files... (${Math.floor(progress * 100)}%)`
        );
      });
      await this.updateBackupProgress(backupId, 'IN_PROGRESS', 90, 'Files copied');
      log.debug(`Backup ${backupId}: ${files.length} files copied`);

      // 3. Generate and upload manifest (10% of progress)
      await this.updateBackupProgress(backupId, 'IN_PROGRESS', 92, 'Generating manifest...');
      const manifest: BackupManifest = {
        version: '1.1',
        backupId,
        tenantId,
        tenantName,
        tenantSlug,
        createdAt: new Date().toISOString(),
        createdById: userId || 'system',
        schemaVersion: '1.0.0',
        stats,
        compression: {
          algorithm: 'gzip',
          level: COMPRESSION_LEVEL,
          uncompressedSize: dataBuffer.length,
          compressedSize: compressedBuffer.length,
          ratio: compressionRatio,
        },
        files,
        checksums: {
          dataJson: dataChecksum,
        },
      };

      const manifestBuffer = Buffer.from(JSON.stringify(manifest, null, 2), 'utf-8');
      await storage.upload(StorageKeys.backupManifest(backupId), manifestBuffer, {
        contentType: 'application/json',
      });

      // 4. Calculate total size and finalize (use compressed size for storage)
      const filesSizeBytes = files.reduce((sum, f) => sum + f.size, 0);
      const totalSizeBytes = compressedBuffer.length + filesSizeBytes + manifestBuffer.length;

      await prisma.tenantBackup.update({
        where: { id: backupId },
        data: {
          status: 'COMPLETED',
          progress: 100,
          currentStep: 'Completed',
          completedAt: new Date(),
          databaseSizeBytes: BigInt(compressedBuffer.length), // Compressed size
          filesSizeBytes: BigInt(filesSizeBytes),
          totalSizeBytes: BigInt(totalSizeBytes),
          filesCount: files.length,
          manifestJson: manifest as unknown as Prisma.JsonObject,
        },
      });

      // Audit log (userId is undefined for system-initiated backups)
      await createAuditLog({
        tenantId,
        userId: userId || undefined,
        action: 'BACKUP_COMPLETED',
        entityType: 'TenantBackup',
        entityId: backupId,
        summary: `Backup completed: ${files.length} files, ${formatBytes(totalSizeBytes)}`,
        changeSource: userId ? 'MANUAL' : 'SYSTEM',
        metadata: { filesCount: files.length, totalSize: totalSizeBytes },
      });

      log.info(`Backup ${backupId} completed: ${files.length} files, ${formatBytes(totalSizeBytes)}`);
    } catch (error) {
      await this.markBackupFailed(backupId, error);
      throw error;
    }
  }

  /**
   * Export all tenant data to JSON
   */
  private async exportTenantData(
    tenantId: string,
    options: BackupOptions
  ): Promise<{ data: Record<string, unknown>; stats: Record<string, number> }> {
    log.debug(`Exporting data for tenant ${tenantId}`);

    // Export all tenant-scoped entities
    const [
      tenant,
      users,
      roles,
      rolePermissions,
      userRoleAssignments,
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
      documentPages,
      documentRevisions,
      documentRevisionLineItems,
      documentExtractions,
      documentTemplates,
      generatedDocuments,
      documentSections,
      documentShares,
      documentComments,
      documentDrafts,
      templatePartials,
      letterhead,
      connectors,
      connectorAccess,
      connectorUsageLogs,
      noteTabs,
      bankAccounts,
      bankTransactions,
      matchGroups,
      matchGroupItems,
      reconciliationPeriods,
      aiConversations,
    ] = await Promise.all([
      prisma.tenant.findUnique({ where: { id: tenantId } }),
      prisma.user.findMany({ where: { tenantId } }),
      prisma.role.findMany({ where: { tenantId } }),
      prisma.rolePermission.findMany({ where: { role: { tenantId } } }),
      prisma.userRoleAssignment.findMany({ where: { user: { tenantId } } }),
      prisma.userCompanyAssignment.findMany({ where: { user: { tenantId } } }),
      prisma.company.findMany({ where: { tenantId } }),
      prisma.companyAddress.findMany({ where: { company: { tenantId } } }),
      prisma.companyFormerName.findMany({ where: { company: { tenantId } } }),
      prisma.companyOfficer.findMany({ where: { company: { tenantId } } }),
      prisma.companyShareholder.findMany({ where: { company: { tenantId } } }),
      prisma.companyCharge.findMany({ where: { company: { tenantId } } }),
      prisma.shareCapital.findMany({ where: { company: { tenantId } } }),
      prisma.companyContact.findMany({ where: { company: { tenantId } } }),
      prisma.contact.findMany({ where: { tenantId } }),
      prisma.document.findMany({ where: { tenantId } }),
      prisma.processingDocument.findMany({ where: { document: { tenantId } } }),
      prisma.documentPage.findMany({ where: { processingDocument: { document: { tenantId } } } }),
      prisma.documentRevision.findMany({ where: { processingDocument: { document: { tenantId } } } }),
      prisma.documentRevisionLineItem.findMany({
        where: { revision: { processingDocument: { document: { tenantId } } } },
      }),
      prisma.documentExtraction.findMany({ where: { processingDocument: { document: { tenantId } } } }),
      prisma.documentTemplate.findMany({ where: { tenantId } }),
      prisma.generatedDocument.findMany({ where: { tenantId } }),
      prisma.documentSection.findMany({ where: { document: { tenantId } } }),
      prisma.documentShare.findMany({ where: { document: { tenantId } } }),
      prisma.documentComment.findMany({ where: { document: { tenantId } } }),
      prisma.documentDraft.findMany({ where: { document: { tenantId } } }),
      prisma.templatePartial.findMany({ where: { tenantId } }),
      prisma.tenantLetterhead.findUnique({ where: { tenantId } }),
      prisma.connector.findMany({ where: { tenantId } }),
      prisma.tenantConnectorAccess.findMany({ where: { tenantId } }),
      prisma.connectorUsageLog.findMany({ where: { tenantId } }),
      prisma.noteTab.findMany({
        where: { OR: [{ company: { tenantId } }, { contact: { tenantId } }] },
      }),
      prisma.bankAccount.findMany({ where: { tenantId } }),
      prisma.bankTransaction.findMany({ where: { tenantId } }),
      prisma.matchGroup.findMany({ where: { tenantId } }),
      prisma.matchGroupItem.findMany({ where: { matchGroup: { tenantId } } }),
      prisma.reconciliationPeriod.findMany({ where: { tenantId } }),
      prisma.aiConversation.findMany({ where: { tenantId } }),
    ]);

    // Optionally include audit logs
    let auditLogs: unknown[] = [];
    if (options.includeAuditLogs !== false) {
      auditLogs = await prisma.auditLog.findMany({ where: { tenantId } });
    }

    const data: Record<string, unknown> = {
      tenant,
      users,
      roles,
      rolePermissions,
      userRoleAssignments,
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
      documentPages,
      documentRevisions,
      documentRevisionLineItems,
      documentExtractions,
      documentTemplates,
      generatedDocuments,
      documentSections,
      documentShares,
      documentComments,
      documentDrafts,
      templatePartials,
      letterhead,
      connectors,
      connectorAccess,
      connectorUsageLogs,
      noteTabs,
      bankAccounts,
      bankTransactions,
      matchGroups,
      matchGroupItems,
      reconciliationPeriods,
      aiConversations,
      auditLogs,
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
  private async copyTenantFiles(
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

  /**
   * Update backup progress
   */
  private async updateBackupProgress(
    backupId: string,
    status: BackupStatus,
    progress: number,
    currentStep: string
  ): Promise<void> {
    await prisma.tenantBackup.update({
      where: { id: backupId },
      data: { status, progress, currentStep },
    });
  }

  /**
   * Mark backup as failed
   */
  private async markBackupFailed(backupId: string, error: unknown): Promise<void> {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    const errorDetails = error instanceof Error ? { stack: error.stack } : undefined;

    await prisma.tenantBackup.update({
      where: { id: backupId },
      data: {
        status: 'FAILED',
        errorMessage,
        errorDetails: errorDetails as Prisma.InputJsonValue | undefined,
        currentStep: 'Failed',
      },
    });

    // Get tenant ID for audit log
    const backup = await prisma.tenantBackup.findUnique({
      where: { id: backupId },
      select: { tenantId: true, createdById: true },
    });

    if (backup) {
      await createAuditLog({
        tenantId: backup.tenantId,
        userId: backup.createdById ?? undefined,
        action: 'BACKUP_FAILED',
        entityType: 'TenantBackup',
        entityId: backupId,
        summary: `Backup failed: ${errorMessage}`,
        changeSource: 'SYSTEM',
      });
    }
  }

  /**
   * List available backups
   */
  async listBackups(params: ListBackupsParams = {}): Promise<{
    backups: Awaited<ReturnType<typeof prisma.tenantBackup.findMany>>;
    totalCount: number;
  }> {
    const { tenantId, status, page = 1, limit = 20 } = params;

    const where: Prisma.TenantBackupWhereInput = {
      deletedAt: null,
      ...(tenantId && { tenantId }),
      ...(status && { status }),
    };

    const [backups, totalCount] = await Promise.all([
      prisma.tenantBackup.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.tenantBackup.count({ where }),
    ]);

    return { backups, totalCount };
  }

  /**
   * Get backup details
   */
  async getBackupDetails(backupId: string) {
    const backup = await prisma.tenantBackup.findUnique({
      where: { id: backupId, deletedAt: null },
    });

    if (!backup) {
      throw new Error('Backup not found');
    }

    return backup;
  }

  /**
   * Validate backup integrity
   */
  async validateBackupIntegrity(backupId: string): Promise<BackupManifest> {
    // Try to download and parse manifest
    try {
      const manifestBuffer = await storage.download(StorageKeys.backupManifest(backupId));
      const manifest = JSON.parse(manifestBuffer.toString('utf-8')) as BackupManifest;

      // Download compressed data and decompress
      const compressedBuffer = await storage.download(StorageKeys.backupData(backupId));
      const dataBuffer = gunzipSync(compressedBuffer);

      // Verify checksum against uncompressed data
      const dataChecksum = hashBlake3(dataBuffer);

      if (dataChecksum !== manifest.checksums.dataJson) {
        throw new Error('Data file checksum mismatch - backup may be corrupted');
      }

      return manifest;
    } catch (error) {
      throw new Error(`Backup validation failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Restore a backup
   */
  async restoreTenantBackup(
    backupId: string,
    userId: string,
    options: RestoreOptions = {}
  ): Promise<{ success: boolean; message: string }> {
    const backup = await this.getBackupDetails(backupId);

    if (backup.status !== 'COMPLETED' && backup.status !== 'RESTORED') {
      throw new Error('Backup must be in COMPLETED or RESTORED status to restore');
    }

    // Check if tenant already exists and is not deleted
    const existingTenant = await prisma.tenant.findUnique({
      where: { id: backup.tenantId },
      select: { id: true, name: true, deletedAt: true },
    });

    if (existingTenant && !existingTenant.deletedAt && !options.overwriteExisting) {
      throw new Error(
        `Tenant "${existingTenant.name}" already exists. Use overwriteExisting option to replace.`
      );
    }

    // Validate backup integrity first
    const manifest = await this.validateBackupIntegrity(backupId);

    if (options.dryRun) {
      return {
        success: true,
        message: `Dry run successful. Would restore: ${manifest.stats.users || 0} users, ${manifest.stats.companies || 0} companies, ${manifest.files.length} files.`,
      };
    }

    // Update backup status
    await prisma.tenantBackup.update({
      where: { id: backupId },
      data: { status: 'RESTORING', currentStep: 'Starting restore...' },
    });

    // Audit log - restore started
    await createAuditLog({
      tenantId: backup.tenantId,
      userId,
      action: 'BACKUP_RESTORE_STARTED',
      entityType: 'TenantBackup',
      entityId: backupId,
      summary: `Started restoring backup for tenant`,
      changeSource: 'MANUAL',
    });

    try {
      // 1. Download, decompress, and parse data.json.gz
      const compressedBuffer = await storage.download(StorageKeys.backupData(backupId));
      const dataBuffer = gunzipSync(compressedBuffer);
      const data = JSON.parse(dataBuffer.toString('utf-8')) as Record<string, unknown>;

      // 2. If overwriting, delete existing tenant data first
      if (existingTenant && !existingTenant.deletedAt && options.overwriteExisting) {
        await this.deleteTenantData(backup.tenantId);
      }

      // 3. Restore database data (in transaction)
      await this.restoreDatabaseData(data);

      // 4. Restore files
      await this.restoreFiles(backupId, backup.tenantId, manifest.files);

      // 5. Update backup status
      await prisma.tenantBackup.update({
        where: { id: backupId },
        data: {
          status: 'RESTORED',
          restoredAt: new Date(),
          restoredById: userId,
          currentStep: 'Completed',
        },
      });

      // Audit log
      await createAuditLog({
        tenantId: backup.tenantId,
        userId,
        action: 'BACKUP_RESTORE_COMPLETED',
        entityType: 'TenantBackup',
        entityId: backupId,
        summary: `Restored backup for tenant`,
        changeSource: 'MANUAL',
      });

      log.info(`Backup ${backupId} restored successfully`);
      return { success: true, message: 'Backup restored successfully' };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';

      await prisma.tenantBackup.update({
        where: { id: backupId },
        data: {
          status: 'COMPLETED', // Revert to COMPLETED so it can be retried
          errorMessage: `Restore failed: ${errorMessage}`,
          currentStep: 'Restore failed',
        },
      });

      await createAuditLog({
        tenantId: backup.tenantId,
        userId,
        action: 'BACKUP_RESTORE_FAILED',
        entityType: 'TenantBackup',
        entityId: backupId,
        summary: `Restore failed: ${errorMessage}`,
        changeSource: 'SYSTEM',
      });

      throw error;
    }
  }

  /**
   * Delete all data for a tenant (used before restore)
   * Deletes both database records and S3 files
   */
  private async deleteTenantData(tenantId: string): Promise<void> {
    log.info(`Deleting existing data for tenant ${tenantId} before restore`);

    // 1. Delete all tenant files from storage first
    try {
      const tenantPrefix = StorageKeys.tenantPrefix(tenantId);
      const deletedFilesCount = await storage.deletePrefix(tenantPrefix);
      log.info(`Deleted ${deletedFilesCount} files for tenant ${tenantId}`);
    } catch (error) {
      log.warn(`Failed to delete some storage files for tenant ${tenantId}:`, error);
      // Continue with database cleanup even if storage cleanup partially fails
    }

    // 2. Delete database records in reverse order of dependencies
    await prisma.$transaction(async (tx) => {
      // Delete processing module data
      await tx.matchGroupItem.deleteMany({ where: { matchGroup: { tenantId } } });
      await tx.matchGroup.deleteMany({ where: { tenantId } });
      await tx.bankTransaction.deleteMany({ where: { tenantId } });
      await tx.bankAccount.deleteMany({ where: { tenantId } });
      await tx.reconciliationPeriod.deleteMany({ where: { tenantId } });

      // Delete document processing data
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
      await tx.processingDocument.deleteMany({ where: { document: { tenantId } } });

      // Delete generated documents
      await tx.documentDraft.deleteMany({ where: { document: { tenantId } } });
      await tx.documentComment.deleteMany({ where: { document: { tenantId } } });
      await tx.documentShare.deleteMany({ where: { document: { tenantId } } });
      await tx.documentSection.deleteMany({ where: { document: { tenantId } } });
      await tx.generatedDocument.deleteMany({ where: { tenantId } });
      await tx.templatePartial.deleteMany({ where: { tenantId } });
      await tx.documentTemplate.deleteMany({ where: { tenantId } });
      await tx.tenantLetterhead.deleteMany({ where: { tenantId } });

      // Delete documents
      await tx.document.deleteMany({ where: { tenantId } });

      // Delete company data
      await tx.noteTab.deleteMany({ where: { OR: [{ company: { tenantId } }, { contact: { tenantId } }] } });
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

      // Delete connectors
      await tx.connectorUsageLog.deleteMany({ where: { tenantId } });
      await tx.tenantConnectorAccess.deleteMany({ where: { tenantId } });
      await tx.connector.deleteMany({ where: { tenantId } });

      // Delete AI conversations
      await tx.aiConversation.deleteMany({ where: { tenantId } });

      // Delete audit logs
      await tx.auditLog.deleteMany({ where: { tenantId } });

      // Delete contacts
      await tx.contact.deleteMany({ where: { tenantId } });

      // Delete companies
      await tx.company.deleteMany({ where: { tenantId } });

      // Delete users
      await tx.user.deleteMany({ where: { tenantId } });

      // Note: Don't delete the tenant itself - just its data
    });
  }

  /**
   * Restore database data from backup
   */
  private async restoreDatabaseData(data: Record<string, unknown>): Promise<void> {
    log.info('Restoring database data from backup');

    await prisma.$transaction(async (tx) => {
      // Restore in order of dependencies

      // 1. Tenant (upsert to handle existing tenant)
      if (data.tenant) {
        const tenant = data.tenant as Record<string, unknown>;
        await tx.tenant.upsert({
          where: { id: tenant.id as string },
          create: tenant as Prisma.TenantCreateInput,
          update: tenant as Prisma.TenantUpdateInput,
        });
      }

      // 2. Users
      if (Array.isArray(data.users) && data.users.length > 0) {
        await tx.user.createMany({
          data: data.users as Prisma.UserCreateManyInput[],
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

      // 10. Note Tabs
      if (Array.isArray(data.noteTabs) && data.noteTabs.length > 0) {
        await tx.noteTab.createMany({
          data: data.noteTabs as Prisma.NoteTabCreateManyInput[],
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
          return { ...doc, currentRevisionId: null };
        });
        await tx.processingDocument.createMany({
          data: docsWithoutRevision as Prisma.ProcessingDocumentCreateManyInput[],
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

      // 25. Tenant Letterhead
      if (data.letterhead) {
        const letterhead = data.letterhead as Record<string, unknown>;
        await tx.tenantLetterhead.upsert({
          where: { tenantId: letterhead.tenantId as string },
          create: letterhead as Prisma.TenantLetterheadCreateInput,
          update: letterhead as Prisma.TenantLetterheadUpdateInput,
        });
      }

      // 26. Generated Documents
      if (Array.isArray(data.generatedDocuments) && data.generatedDocuments.length > 0) {
        await tx.generatedDocument.createMany({
          data: data.generatedDocuments as Prisma.GeneratedDocumentCreateManyInput[],
          skipDuplicates: true,
        });
      }

      // 27. Document Sections
      if (Array.isArray(data.documentSections) && data.documentSections.length > 0) {
        await tx.documentSection.createMany({
          data: data.documentSections as Prisma.DocumentSectionCreateManyInput[],
          skipDuplicates: true,
        });
      }

      // 28. Document Shares
      if (Array.isArray(data.documentShares) && data.documentShares.length > 0) {
        await tx.documentShare.createMany({
          data: data.documentShares as Prisma.DocumentShareCreateManyInput[],
          skipDuplicates: true,
        });
      }

      // 29. Document Comments
      if (Array.isArray(data.documentComments) && data.documentComments.length > 0) {
        await tx.documentComment.createMany({
          data: data.documentComments as Prisma.DocumentCommentCreateManyInput[],
          skipDuplicates: true,
        });
      }

      // 30. Document Drafts
      if (Array.isArray(data.documentDrafts) && data.documentDrafts.length > 0) {
        await tx.documentDraft.createMany({
          data: data.documentDrafts as Prisma.DocumentDraftCreateManyInput[],
          skipDuplicates: true,
        });
      }

      // 31. Connectors
      if (Array.isArray(data.connectors) && data.connectors.length > 0) {
        await tx.connector.createMany({
          data: data.connectors as Prisma.ConnectorCreateManyInput[],
          skipDuplicates: true,
        });
      }

      // 32. Connector Access
      if (Array.isArray(data.connectorAccess) && data.connectorAccess.length > 0) {
        await tx.tenantConnectorAccess.createMany({
          data: data.connectorAccess as Prisma.TenantConnectorAccessCreateManyInput[],
          skipDuplicates: true,
        });
      }

      // 33. Connector Usage Logs
      if (Array.isArray(data.connectorUsageLogs) && data.connectorUsageLogs.length > 0) {
        await tx.connectorUsageLog.createMany({
          data: data.connectorUsageLogs as Prisma.ConnectorUsageLogCreateManyInput[],
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

      // 40. Audit Logs (optional - only if included in backup)
      if (Array.isArray(data.auditLogs) && data.auditLogs.length > 0) {
        await tx.auditLog.createMany({
          data: data.auditLogs as Prisma.AuditLogCreateManyInput[],
          skipDuplicates: true,
        });
      }
    });
  }

  /**
   * Restore files from backup
   */
  private async restoreFiles(
    backupId: string,
    tenantId: string,
    files: BackupManifest['files']
  ): Promise<void> {
    log.info(`Restoring ${files.length} files from backup ${backupId}`);

    for (const file of files) {
      try {
        // Copy from backup location to original location
        await storage.copy(file.key, file.originalStorageKey);
      } catch (error) {
        log.warn(`Failed to restore file ${file.originalStorageKey}:`, error);
        // Continue with other files
      }
    }
  }

  /**
   * Delete a backup
   */
  async deleteBackup(backupId: string, userId?: string): Promise<void> {
    const backup = await this.getBackupDetails(backupId);

    // Don't allow deleting in-progress backups
    if (backup.status === 'IN_PROGRESS' || backup.status === 'RESTORING') {
      throw new Error('Cannot delete a backup that is in progress');
    }

    // Delete files from storage
    try {
      await storage.deletePrefix(StorageKeys.backupPrefix(backupId));
    } catch (error) {
      log.warn(`Failed to delete backup files for ${backupId}:`, error);
      // Continue with soft delete even if storage cleanup fails
    }

    // Soft delete the backup record
    await prisma.tenantBackup.update({
      where: { id: backupId },
      data: { deletedAt: new Date(), status: 'DELETED' },
    });

    // Audit log
    await createAuditLog({
      tenantId: backup.tenantId,
      userId,
      action: 'BACKUP_DELETED',
      entityType: 'TenantBackup',
      entityId: backupId,
      entityName: backup.name || undefined,
      summary: `Deleted backup ${backup.name || backupId}`,
      changeSource: userId ? 'MANUAL' : 'SYSTEM',
    });

    log.info(`Backup ${backupId} deleted`);
  }

  // ============================================================================
  // Backup Schedule Management
  // ============================================================================

  /**
   * Get or create a backup schedule for a tenant
   */
  async getSchedule(tenantId: string): Promise<{
    id: string;
    tenantId: string;
    cronPattern: string;
    isEnabled: boolean;
    timezone: string;
    retentionDays: number;
    maxBackups: number;
    lastRunAt: Date | null;
    nextRunAt: Date | null;
    lastError: string | null;
    consecutiveFailures: number;
  } | null> {
    const schedule = await prisma.backupSchedule.findUnique({
      where: { tenantId },
    });

    return schedule;
  }

  /**
   * Create or update a backup schedule for a tenant
   */
  async upsertSchedule(
    tenantId: string,
    data: {
      cronPattern: string;
      isEnabled?: boolean;
      timezone?: string;
      retentionDays?: number;
      maxBackups?: number;
    }
  ): Promise<{
    id: string;
    tenantId: string;
    cronPattern: string;
    isEnabled: boolean;
    timezone: string;
    retentionDays: number;
    maxBackups: number;
    nextRunAt: Date | null;
  }> {
    // Validate tenant exists
    const tenant = await prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { id: true, deletedAt: true },
    });

    if (!tenant || tenant.deletedAt) {
      throw new Error('Tenant not found');
    }

    // Calculate next run time based on cron pattern
    const nextRunAt = data.isEnabled
      ? this.calculateNextRun(data.cronPattern, data.timezone || 'UTC')
      : null;

    const schedule = await prisma.backupSchedule.upsert({
      where: { tenantId },
      create: {
        tenantId,
        cronPattern: data.cronPattern,
        isEnabled: data.isEnabled ?? false,
        timezone: data.timezone ?? 'UTC',
        retentionDays: data.retentionDays ?? 30,
        maxBackups: data.maxBackups ?? 10,
        nextRunAt,
      },
      update: {
        cronPattern: data.cronPattern,
        isEnabled: data.isEnabled,
        timezone: data.timezone,
        retentionDays: data.retentionDays,
        maxBackups: data.maxBackups,
        nextRunAt,
      },
    });

    log.info(`Backup schedule ${schedule.isEnabled ? 'enabled' : 'updated'} for tenant ${tenantId}`);

    return schedule;
  }

  /**
   * Delete a backup schedule
   */
  async deleteSchedule(tenantId: string): Promise<void> {
    await prisma.backupSchedule.delete({
      where: { tenantId },
    });

    log.info(`Backup schedule deleted for tenant ${tenantId}`);
  }

  /**
   * List all enabled backup schedules
   */
  async listEnabledSchedules(): Promise<
    Array<{
      id: string;
      tenantId: string;
      cronPattern: string;
      timezone: string;
      retentionDays: number;
      maxBackups: number;
      nextRunAt: Date | null;
      lastRunAt: Date | null;
      consecutiveFailures: number;
    }>
  > {
    const schedules = await prisma.backupSchedule.findMany({
      where: { isEnabled: true },
      orderBy: { nextRunAt: 'asc' },
    });

    return schedules;
  }

  /**
   * Get schedules that are due to run
   */
  async getDueSchedules(): Promise<
    Array<{
      id: string;
      tenantId: string;
      cronPattern: string;
      timezone: string;
      retentionDays: number;
      maxBackups: number;
    }>
  > {
    const now = new Date();

    const dueSchedules = await prisma.backupSchedule.findMany({
      where: {
        isEnabled: true,
        nextRunAt: { lte: now },
      },
      orderBy: { nextRunAt: 'asc' },
    });

    return dueSchedules;
  }

  /**
   * Execute a scheduled backup for a tenant
   *
   * This is called by the scheduler when a backup is due.
   * Creates a backup and updates the schedule tracking.
   */
  async executeScheduledBackup(scheduleId: string): Promise<{ backupId: string } | null> {
    const schedule = await prisma.backupSchedule.findUnique({
      where: { id: scheduleId },
      include: {
        tenant: {
          select: { id: true, name: true, deletedAt: true },
        },
      },
    });

    if (!schedule || !schedule.isEnabled) {
      log.warn(`Schedule ${scheduleId} not found or disabled`);
      return null;
    }

    if (schedule.tenant.deletedAt) {
      log.warn(`Tenant ${schedule.tenantId} is deleted, disabling schedule`);
      await prisma.backupSchedule.update({
        where: { id: scheduleId },
        data: { isEnabled: false, lastError: 'Tenant deleted' },
      });
      return null;
    }

    log.info(`Executing scheduled backup for tenant ${schedule.tenant.name}`);

    try {
      // Create the backup (SCHEDULED type)
      const result = await this.createScheduledBackup(
        schedule.tenantId,
        schedule.retentionDays
      );

      // Update schedule with success
      const nextRunAt = this.calculateNextRun(schedule.cronPattern, schedule.timezone);
      await prisma.backupSchedule.update({
        where: { id: scheduleId },
        data: {
          lastRunAt: new Date(),
          lastBackupId: result.backupId,
          nextRunAt,
          lastError: null,
          consecutiveFailures: 0,
        },
      });

      // Enforce max backups limit
      await this.enforceMaxBackups(schedule.tenantId, schedule.maxBackups);

      log.info(`Scheduled backup created: ${result.backupId}`);
      return result;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';

      // Update schedule with failure
      const nextRunAt = this.calculateNextRun(schedule.cronPattern, schedule.timezone);
      await prisma.backupSchedule.update({
        where: { id: scheduleId },
        data: {
          lastRunAt: new Date(),
          nextRunAt,
          lastError: errorMessage,
          consecutiveFailures: { increment: 1 },
        },
      });

      log.error(`Scheduled backup failed for tenant ${schedule.tenantId}:`, error);
      throw error;
    }
  }

  /**
   * Create a scheduled backup (internal, uses SCHEDULED type)
   */
  private async createScheduledBackup(
    tenantId: string,
    retentionDays: number
  ): Promise<{ backupId: string }> {
    const tenant = await prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { id: true, name: true, slug: true },
    });

    if (!tenant) {
      throw new Error('Tenant not found');
    }

    // Check for existing in-progress backups
    const existingBackup = await prisma.tenantBackup.findFirst({
      where: {
        tenantId,
        status: { in: ['PENDING', 'IN_PROGRESS'] },
        deletedAt: null,
      },
    });

    if (existingBackup) {
      throw new Error('A backup is already in progress for this tenant');
    }

    // Create backup record with SCHEDULED type
    const backupId = crypto.randomUUID();
    const storageKey = StorageKeys.backupPrefix(backupId);
    const now = new Date();
    const expiresAt = new Date(now.getTime() + retentionDays * 24 * 60 * 60 * 1000);

    const backup = await prisma.tenantBackup.create({
      data: {
        id: backupId,
        tenantId,
        name: `Scheduled Backup - ${now.toISOString().split('T')[0]}`,
        backupType: 'SCHEDULED',
        status: 'PENDING',
        storageKey,
        retentionDays,
        expiresAt,
        createdById: undefined, // System-initiated
      },
    });

    // Execute backup asynchronously (pass undefined userId for system-initiated backups)
    this.executeBackup(
      backup.id,
      tenantId,
      tenant.name,
      tenant.slug,
      undefined, // System-initiated backup - no user
      { includeAuditLogs: true }
    ).catch((error) => {
      log.error(`Scheduled backup execution failed for ${backupId}:`, error);
    });

    // Audit log
    await createAuditLog({
      tenantId,
      userId: undefined, // System action
      action: 'BACKUP_CREATED',
      entityType: 'TenantBackup',
      entityId: backupId,
      entityName: backup.name || undefined,
      summary: `Scheduled backup initiated`,
      changeSource: 'SYSTEM',
    });

    return { backupId };
  }

  /**
   * Enforce max backups limit by deleting oldest completed backups
   */
  private async enforceMaxBackups(tenantId: string, maxBackups: number): Promise<void> {
    // Get all completed SCHEDULED backups for this tenant, ordered by creation date
    const backups = await prisma.tenantBackup.findMany({
      where: {
        tenantId,
        backupType: 'SCHEDULED',
        status: { in: ['COMPLETED', 'RESTORED'] },
        deletedAt: null,
      },
      orderBy: { createdAt: 'desc' },
      select: { id: true, name: true, createdAt: true },
    });

    // If we have more than maxBackups, delete the oldest ones
    if (backups.length > maxBackups) {
      const backupsToDelete = backups.slice(maxBackups);

      for (const backup of backupsToDelete) {
        try {
          await this.deleteBackup(backup.id, undefined);
          log.info(`Deleted old scheduled backup ${backup.id} (enforcing maxBackups=${maxBackups})`);
        } catch (error) {
          log.error(`Failed to delete old backup ${backup.id}:`, error);
        }
      }
    }
  }

  /**
   * Calculate the next run time based on cron pattern
   *
   * This is a simplified implementation. For production, consider using
   * a proper cron parser library like 'cron-parser' or 'croner'.
   */
  private calculateNextRun(cronPattern: string, _timezone: string): Date {
    // Parse cron pattern: minute hour dayOfMonth month dayOfWeek
    const parts = cronPattern.split(' ');
    if (parts.length !== 5) {
      log.warn(`Invalid cron pattern: ${cronPattern}, defaulting to tomorrow`);
      return new Date(Date.now() + 24 * 60 * 60 * 1000);
    }

    const [minute, hour] = parts;
    const now = new Date();

    // Simple implementation: calculate next occurrence based on hour and minute
    // For a more robust solution, use a cron parser library
    let nextRun = new Date(now);

    // Parse minute and hour (handle wildcards as "every hour/minute")
    const targetMinute = minute === '*' ? 0 : parseInt(minute, 10);
    const targetHour = hour === '*' ? now.getHours() : parseInt(hour, 10);

    nextRun.setHours(targetHour, targetMinute, 0, 0);

    // If the calculated time is in the past, move to next day
    if (nextRun <= now) {
      nextRun.setDate(nextRun.getDate() + 1);
    }

    return nextRun;
  }

  /**
   * Process all due scheduled backups
   *
   * Call this from a cron job or scheduler.
   */
  async processScheduledBackups(): Promise<{
    processed: number;
    succeeded: number;
    failed: number;
    results: Array<{ scheduleId: string; tenantId: string; backupId?: string; error?: string }>;
  }> {
    const dueSchedules = await this.getDueSchedules();

    if (dueSchedules.length === 0) {
      log.debug('No scheduled backups due');
      return { processed: 0, succeeded: 0, failed: 0, results: [] };
    }

    log.info(`Processing ${dueSchedules.length} scheduled backup(s)`);

    const results: Array<{ scheduleId: string; tenantId: string; backupId?: string; error?: string }> = [];
    let succeeded = 0;
    let failed = 0;

    for (const schedule of dueSchedules) {
      try {
        const result = await this.executeScheduledBackup(schedule.id);
        if (result) {
          results.push({ scheduleId: schedule.id, tenantId: schedule.tenantId, backupId: result.backupId });
          succeeded++;
        }
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        results.push({ scheduleId: schedule.id, tenantId: schedule.tenantId, error: errorMessage });
        failed++;
      }
    }

    log.info(`Scheduled backups complete: ${succeeded} succeeded, ${failed} failed`);

    return { processed: dueSchedules.length, succeeded, failed, results };
  }

  // ============================================================================
  // Cleanup Functions (for scheduled/startup cleanup)
  // ============================================================================

  /**
   * Clean up expired backups
   *
   * This function finds all backups that have passed their expiresAt date
   * and deletes them (both storage files and database records).
   *
   * Call this:
   * - On application startup
   * - Via cron job (e.g., daily at 2 AM)
   * - Via API endpoint for manual trigger
   *
   * @param options.dryRun - If true, only log what would be deleted without actually deleting
   * @returns Summary of cleanup operation
   */
  async cleanupExpiredBackups(options: { dryRun?: boolean } = {}): Promise<{
    scannedCount: number;
    expiredCount: number;
    deletedCount: number;
    failedCount: number;
    errors: Array<{ backupId: string; error: string }>;
  }> {
    const { dryRun = false } = options;
    const now = new Date();

    log.info(`Starting expired backup cleanup${dryRun ? ' (DRY RUN)' : ''}`);

    // Find all expired backups that haven't been deleted yet
    const expiredBackups = await prisma.tenantBackup.findMany({
      where: {
        expiresAt: { lte: now },
        deletedAt: null,
        status: {
          in: ['COMPLETED', 'RESTORED', 'FAILED'], // Don't delete in-progress backups
        },
      },
      select: {
        id: true,
        name: true,
        tenantId: true,
        expiresAt: true,
        status: true,
        createdAt: true,
      },
      orderBy: { expiresAt: 'asc' },
    });

    const result = {
      scannedCount: expiredBackups.length,
      expiredCount: expiredBackups.length,
      deletedCount: 0,
      failedCount: 0,
      errors: [] as Array<{ backupId: string; error: string }>,
    };

    if (expiredBackups.length === 0) {
      log.info('No expired backups found');
      return result;
    }

    log.info(`Found ${expiredBackups.length} expired backup(s) to clean up`);

    for (const backup of expiredBackups) {
      try {
        if (dryRun) {
          log.info(
            `[DRY RUN] Would delete backup ${backup.id} (${backup.name || 'Unnamed'}) - expired at ${backup.expiresAt?.toISOString()}`
          );
          result.deletedCount++;
          continue;
        }

        // Delete storage files
        try {
          await storage.deletePrefix(StorageKeys.backupPrefix(backup.id));
        } catch (error) {
          log.warn(`Failed to delete storage for backup ${backup.id}:`, error);
          // Continue with database cleanup
        }

        // Soft delete the backup record
        await prisma.tenantBackup.update({
          where: { id: backup.id },
          data: {
            deletedAt: now,
            status: 'DELETED',
          },
        });

        // Audit log (system-initiated deletion)
        await createAuditLog({
          tenantId: backup.tenantId,
          userId: undefined, // System action
          action: 'BACKUP_DELETED',
          entityType: 'TenantBackup',
          entityId: backup.id,
          entityName: backup.name || undefined,
          summary: `Auto-deleted expired backup ${backup.name || backup.id}`,
          changeSource: 'SYSTEM',
          metadata: {
            reason: 'retention_expired',
            expiredAt: backup.expiresAt?.toISOString(),
          },
        });

        result.deletedCount++;
        log.info(`Deleted expired backup ${backup.id} (${backup.name || 'Unnamed'})`);
      } catch (error) {
        result.failedCount++;
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        result.errors.push({ backupId: backup.id, error: errorMessage });
        log.error(`Failed to delete backup ${backup.id}:`, error);
      }
    }

    log.info(
      `Cleanup complete: ${result.deletedCount} deleted, ${result.failedCount} failed out of ${result.expiredCount} expired`
    );

    return result;
  }

  /**
   * Clean up stale in-progress backups
   *
   * Finds backups that have been stuck in PENDING or IN_PROGRESS status
   * for too long (likely due to server crash/restart) and marks them as failed.
   *
   * @param staleThresholdMinutes - Minutes after which an in-progress backup is considered stale (default: 60)
   */
  async cleanupStaleBackups(staleThresholdMinutes: number = 60): Promise<{
    staleCount: number;
    markedFailedCount: number;
  }> {
    const staleThreshold = new Date(Date.now() - staleThresholdMinutes * 60 * 1000);

    log.info(`Checking for backups stuck since before ${staleThreshold.toISOString()}`);

    // Find stale backups
    const staleBackups = await prisma.tenantBackup.findMany({
      where: {
        status: { in: ['PENDING', 'IN_PROGRESS', 'RESTORING'] },
        createdAt: { lte: staleThreshold },
        deletedAt: null,
      },
      select: {
        id: true,
        name: true,
        tenantId: true,
        status: true,
        createdAt: true,
        currentStep: true,
      },
    });

    if (staleBackups.length === 0) {
      log.info('No stale backups found');
      return { staleCount: 0, markedFailedCount: 0 };
    }

    log.warn(`Found ${staleBackups.length} stale backup(s)`);

    let markedFailedCount = 0;

    for (const backup of staleBackups) {
      try {
        await prisma.tenantBackup.update({
          where: { id: backup.id },
          data: {
            status: 'FAILED',
            errorMessage: `Backup stale - no progress for ${staleThresholdMinutes} minutes (likely server restart)`,
            errorDetails: {
              lastStatus: backup.status,
              lastStep: backup.currentStep,
              staleThresholdMinutes,
              detectedAt: new Date().toISOString(),
            },
          },
        });

        // Audit log
        await createAuditLog({
          tenantId: backup.tenantId,
          userId: undefined, // System action
          action: 'BACKUP_FAILED',
          entityType: 'TenantBackup',
          entityId: backup.id,
          entityName: backup.name || undefined,
          summary: `Backup marked as failed due to stale status`,
          changeSource: 'SYSTEM',
          metadata: {
            reason: 'stale_timeout',
            previousStatus: backup.status,
            lastStep: backup.currentStep,
          },
        });

        markedFailedCount++;
        log.info(`Marked stale backup ${backup.id} as FAILED`);
      } catch (error) {
        log.error(`Failed to update stale backup ${backup.id}:`, error);
      }
    }

    return { staleCount: staleBackups.length, markedFailedCount };
  }

  /**
   * Run all cleanup tasks
   *
   * Call this on application startup and/or via scheduled cron job.
   * Handles:
   * 1. Stale in-progress backups (marks as failed)
   * 2. Expired backups (deletes them)
   *
   * @param options.dryRun - If true, only log what would be done
   */
  async runCleanup(options: { dryRun?: boolean } = {}): Promise<{
    staleBackups: { staleCount: number; markedFailedCount: number };
    expiredBackups: {
      scannedCount: number;
      expiredCount: number;
      deletedCount: number;
      failedCount: number;
      errors: Array<{ backupId: string; error: string }>;
    };
  }> {
    log.info(`Running backup cleanup${options.dryRun ? ' (DRY RUN)' : ''}`);

    // 1. First, clean up stale backups (mark as failed)
    const staleResult = await this.cleanupStaleBackups();

    // 2. Then, clean up expired backups (delete them)
    const expiredResult = await this.cleanupExpiredBackups(options);

    return {
      staleBackups: staleResult,
      expiredBackups: expiredResult,
    };
  }
}

// Export singleton instance
export const backupService = new BackupService();
