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
import { getNextCronOccurrence } from '@/lib/cron-utils';
import { Prisma } from '@/generated/prisma';
import type { BackupStatus } from '@/generated/prisma';
import { acquireBusinessOperationBarrier } from '@/lib/business-operation-backup-barrier';
import {
  assertAssistantRestoreSafety,
  invalidateRestoredAssistantDispatch,
} from '@/services/business-assistant-backup.service';
import {
  acquireContactMergeBackupBarrier,
  CONTACT_MERGE_BACKUP_BARRIER_TIMEOUT_MS,
  readDatabaseClock,
} from '@/lib/contact-merge-backup-barrier';
import type { BackupManifest, BackupOptions, ListBackupsParams, RestoreOptions } from './backup/backup-types';
import { DynamicTenantModels } from './backup/backup-dynamic-models';
import { copyTenantFiles, exportTenantData } from './backup/backup-export';
import { deleteWorkspaceData, restoreDatabaseData, restoreFiles } from './backup/backup-restore';
import * as schedules from './backup/backup-schedules';

const log = createLogger('backup-service');

// Compression settings
const COMPRESSION_LEVEL = 6; // Default gzip level (1-9, higher = better compression but slower)

export type { BackupManifest, BackupOptions, RestoreOptions, ListBackupsParams } from './backup/backup-types';

export function assertContactMergeRestoreSafety(
  snapshotCutoff: string | undefined,
  laterMerge: { id: string; approvedAt: Date } | null,
): void {
  if (!laterMerge) return;
  if (!snapshotCutoff) {
    throw new Error(
      `Unsafe legacy backup restore rejected because contact merge ${laterMerge.id} exists. ` +
      'Choose a new backup created with a contact-merge snapshot cutoff.'
    );
  }
  throw new Error(
    `Unsafe restore rejected: backup snapshot ${snapshotCutoff} predates contact merge ${laterMerge.id}. ` +
    'Choose a backup created after the latest contact merge to avoid resurrecting hard-deleted source contacts.'
  );
}

async function assertRestoreMergeSafety(
  db: Pick<Prisma.TransactionClient, 'contactMergeOperation'>,
  tenantId: string,
  snapshotCutoff: string | undefined,
): Promise<void> {
  const mergeAfterBackup = await db.contactMergeOperation.findFirst({
    where: {
      tenantId,
      ...(snapshotCutoff
        ? { approvedAt: { gte: new Date(snapshotCutoff) } }
        : {}),
    },
    select: { id: true, approvedAt: true },
    orderBy: { approvedAt: 'asc' },
  });
  assertContactMergeRestoreSafety(snapshotCutoff, mergeAfterBackup);
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

export class BackupService {
  private dynamicModels = new DynamicTenantModels();

  /**
   * Create a backup for a tenant
   */
  async createWorkspaceBackup(
    tenantId: string,
    userId: string,
    options: BackupOptions = {}
  ): Promise<{ backupId: string }> {
    // 1. Validate tenant exists
    const tenant = await prisma.workspace.findUnique({
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
    const existingBackup = await prisma.workspaceBackup.findFirst({
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

    const backup = await prisma.workspaceBackup.create({
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
      entityType: 'WorkspaceBackup',
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
      const { snapshotCutoff, data, stats } = await prisma.$transaction(async (tx) => {
        await acquireBusinessOperationBarrier(tx, tenantId, 'exclusive');
        await acquireContactMergeBackupBarrier(tx, tenantId);
        const cutoff = await readDatabaseClock(tx);
        const exported = await this.exportTenantData(tenantId, options, tx);
        return { snapshotCutoff: cutoff.toISOString(), ...exported };
      }, { timeout: CONTACT_MERGE_BACKUP_BARRIER_TIMEOUT_MS });
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
        version: '1.2',
        backupId,
        tenantId,
        tenantName,
        tenantSlug,
        createdAt: new Date().toISOString(),
        snapshotCutoff,
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

      await prisma.workspaceBackup.update({
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
        entityType: 'WorkspaceBackup',
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
  private exportTenantData(tenantId: string, options: BackupOptions, db: Prisma.TransactionClient) {
    return exportTenantData(tenantId, options, db, this.dynamicModels);
  }

  /**
   * Copy tenant files to backup location
   */
  private copyTenantFiles(tenantId: string, backupId: string, onProgress: (progress: number) => void) {
    return copyTenantFiles(tenantId, backupId, onProgress);
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
    await prisma.workspaceBackup.update({
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

    await prisma.workspaceBackup.update({
      where: { id: backupId },
      data: {
        status: 'FAILED',
        errorMessage,
        errorDetails: errorDetails as Prisma.InputJsonValue | undefined,
        currentStep: 'Failed',
      },
    });

    // Get tenant ID for audit log
    const backup = await prisma.workspaceBackup.findUnique({
      where: { id: backupId },
      select: { tenantId: true, createdById: true },
    });

    if (backup) {
      await createAuditLog({
        tenantId: backup.tenantId,
        userId: backup.createdById ?? undefined,
        action: 'BACKUP_FAILED',
        entityType: 'WorkspaceBackup',
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
    backups: Awaited<ReturnType<typeof prisma.workspaceBackup.findMany>>;
    totalCount: number;
  }> {
    const { tenantId, status, page = 1, limit = 20 } = params;

    const where: Prisma.WorkspaceBackupWhereInput = {
      deletedAt: null,
      ...(tenantId && { tenantId }),
      ...(status && { status }),
    };

    const [backups, totalCount] = await Promise.all([
      prisma.workspaceBackup.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.workspaceBackup.count({ where }),
    ]);

    return { backups, totalCount };
  }

  /**
   * Get backup details
   */
  async getBackupDetails(backupId: string) {
    const backup = await prisma.workspaceBackup.findUnique({
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
  async restoreWorkspaceBackup(
    backupId: string,
    userId: string,
    options: RestoreOptions = {}
  ): Promise<{ success: boolean; message: string }> {
    const backup = await this.getBackupDetails(backupId);

    if (backup.status !== 'COMPLETED' && backup.status !== 'RESTORED') {
      throw new Error('Backup must be in COMPLETED or RESTORED status to restore');
    }

    // Check if tenant already exists and is not deleted
    const existingTenant = await prisma.workspace.findUnique({
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

    // A backup taken before a completed merge may still contain the now hard-deleted
    // sources. Restoring it would resurrect identities while the immutable ledger says
    // they were merged. Post-merge backups are safe because their snapshot already
    // reflects every merge completed before the backup timestamp.
    await assertRestoreMergeSafety(prisma, backup.tenantId, manifest.snapshotCutoff);
    await assertAssistantRestoreSafety(prisma, backup.tenantId, manifest.snapshotCutoff);

    if (options.dryRun) {
      return {
        success: true,
        message: `Dry run successful. Would restore: ${manifest.stats.users || 0} users, ${manifest.stats.companies || 0} companies, ${manifest.files.length} files.`,
      };
    }

    // Update backup status
    await prisma.workspaceBackup.update({
      where: { id: backupId },
      data: { status: 'RESTORING', currentStep: 'Starting restore...' },
    });

    // Audit log - restore started
    await createAuditLog({
      tenantId: backup.tenantId,
      userId,
      action: 'BACKUP_RESTORE_STARTED',
      entityType: 'WorkspaceBackup',
      entityId: backupId,
      summary: `Started restoring backup for tenant`,
      changeSource: 'MANUAL',
    });

    let databaseRestored = !!(backup.errorDetails && typeof backup.errorDetails === 'object'
      && !Array.isArray(backup.errorDetails) && backup.errorDetails.businessAssistantDispatchPaused === true);
    try {
      // 1. Download, decompress, and parse data.json.gz
      const compressedBuffer = await storage.download(StorageKeys.backupData(backupId));
      const dataBuffer = gunzipSync(compressedBuffer);
      const data = JSON.parse(dataBuffer.toString('utf-8')) as Record<string, unknown>;

      await prisma.$transaction(async (tx) => {
        await acquireBusinessOperationBarrier(tx, backup.tenantId, 'exclusive');
        await acquireContactMergeBackupBarrier(tx, backup.tenantId);
        await assertRestoreMergeSafety(tx, backup.tenantId, manifest.snapshotCutoff);
        await assertAssistantRestoreSafety(tx, backup.tenantId, manifest.snapshotCutoff);

        // 2. If overwriting, delete existing tenant data first
        if (existingTenant && !existingTenant.deletedAt && options.overwriteExisting) {
          await this.deleteWorkspaceData(backup.tenantId, tx);
        }

        // 3. Restore database data using the same barrier-owning transaction
        await this.restoreDatabaseData(data, backup.tenantId, tx);
        await invalidateRestoredAssistantDispatch(tx, backup.tenantId);
      }, { timeout: CONTACT_MERGE_BACKUP_BARRIER_TIMEOUT_MS });
      databaseRestored = true;

      // 4. Restore files
      await this.restoreFiles(backupId, backup.tenantId, manifest.files);

      // 5. Update backup status
      await prisma.workspaceBackup.update({
        where: { id: backupId },
        data: {
          status: 'RESTORED',
          restoredAt: new Date(),
          restoredById: userId,
          currentStep: 'Completed',
          errorMessage: null,
          errorDetails: Prisma.DbNull,
        },
      });

      // Audit log
      await createAuditLog({
        tenantId: backup.tenantId,
        userId,
        action: 'BACKUP_RESTORE_COMPLETED',
        entityType: 'WorkspaceBackup',
        entityId: backupId,
        summary: `Restored backup for tenant`,
        changeSource: 'MANUAL',
      });

      log.info(`Backup ${backupId} restored successfully`);
      return { success: true, message: 'Backup restored successfully' };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';

      await prisma.workspaceBackup.update({
        where: { id: backupId },
        data: {
          status: 'COMPLETED', // Revert to COMPLETED so it can be retried
          errorMessage: `Restore failed: ${errorMessage}`,
          currentStep: 'Restore failed',
          // Keep dispatch paused if database restoration succeeded but files or
          // completion bookkeeping failed. A successful retry clears this flag.
          errorDetails: databaseRestored
            ? { businessAssistantDispatchPaused: true, phase: 'FILES_OR_COMPLETION' }
            : Prisma.DbNull,
        },
      });

      await createAuditLog({
        tenantId: backup.tenantId,
        userId,
        action: 'BACKUP_RESTORE_FAILED',
        entityType: 'WorkspaceBackup',
        entityId: backupId,
        summary: `Restore failed: ${errorMessage}`,
        changeSource: 'SYSTEM',
      });

      throw error;
    }
  }

  /**
   * Delete all data for a tenant (used before restore)
   */
  private deleteWorkspaceData(tenantId: string, tx: Prisma.TransactionClient) {
    return deleteWorkspaceData(tenantId, tx, this.dynamicModels);
  }

  /**
   * Restore database data from backup
   */
  private restoreDatabaseData(data: Record<string, unknown>, tenantId: string, tx: Prisma.TransactionClient) {
    return restoreDatabaseData(data, tenantId, tx, this.dynamicModels);
  }

  /**
   * Restore files from backup
   */
  private restoreFiles(backupId: string, tenantId: string, files: BackupManifest['files']) {
    return restoreFiles(backupId, tenantId, files);
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
    await prisma.workspaceBackup.update({
      where: { id: backupId },
      data: { deletedAt: new Date(), status: 'DELETED' },
    });

    // Audit log
    await createAuditLog({
      tenantId: backup.tenantId,
      userId,
      action: 'BACKUP_DELETED',
      entityType: 'WorkspaceBackup',
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

  getSchedule(...args: Parameters<typeof schedules.getSchedule>) {
    return schedules.getSchedule(...args);
  }

  upsertSchedule(...args: Parameters<typeof schedules.upsertSchedule>) {
    return schedules.upsertSchedule(...args);
  }

  deleteSchedule(...args: Parameters<typeof schedules.deleteSchedule>) {
    return schedules.deleteSchedule(...args);
  }

  listEnabledSchedules(...args: Parameters<typeof schedules.listEnabledSchedules>) {
    return schedules.listEnabledSchedules(...args);
  }

  getDueSchedules(...args: Parameters<typeof schedules.getDueSchedules>) {
    return schedules.getDueSchedules(...args);
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

    const scheduledRunAt = schedule.nextRunAt;
    const executionStartedAt = new Date();

    if (!scheduledRunAt || scheduledRunAt > executionStartedAt) {
      log.debug(`Schedule ${scheduleId} is no longer due`);
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

    const nextRunAt = getNextCronOccurrence(schedule.cronPattern, schedule.timezone, executionStartedAt);
    const claimResult = await prisma.backupSchedule.updateMany({
      where: {
        id: scheduleId,
        isEnabled: true,
        nextRunAt: scheduledRunAt,
      },
      data: {
        nextRunAt,
      },
    });

    if (claimResult.count === 0) {
      log.debug(`Schedule ${scheduleId} was already claimed by another worker`);
      return null;
    }

    if (schedule.lastRunAt && schedule.lastRunAt.getTime() >= scheduledRunAt.getTime()) {
      log.warn(
        `Schedule ${scheduleId} already ran for ${scheduledRunAt.toISOString()}, advanced next run to ${nextRunAt.toISOString()}`
      );
      return null;
    }

    try {
      // Create the backup (SCHEDULED type)
      const result = await this.createScheduledBackup(
        schedule.tenantId,
        schedule.retentionDays
      );

      // Update schedule with success
      await prisma.backupSchedule.update({
        where: { id: scheduleId },
        data: {
          lastRunAt: executionStartedAt,
          lastBackupId: result.backupId,
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
      await prisma.backupSchedule.update({
        where: { id: scheduleId },
        data: {
          lastRunAt: executionStartedAt,
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
    const tenant = await prisma.workspace.findUnique({
      where: { id: tenantId },
      select: { id: true, name: true, slug: true },
    });

    if (!tenant) {
      throw new Error('Tenant not found');
    }

    // Check for existing in-progress backups
    const existingBackup = await prisma.workspaceBackup.findFirst({
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

    const backup = await prisma.workspaceBackup.create({
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
      entityType: 'WorkspaceBackup',
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
    const backups = await prisma.workspaceBackup.findMany({
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
    const expiredBackups = await prisma.workspaceBackup.findMany({
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
        await prisma.workspaceBackup.update({
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
          entityType: 'WorkspaceBackup',
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
    const staleBackups = await prisma.workspaceBackup.findMany({
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
        await prisma.workspaceBackup.update({
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
          entityType: 'WorkspaceBackup',
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
