/**
 * Shared types for workspace backup and restore.
 */

import type { BackupStatus } from '@/generated/prisma';

export interface BackupManifest {
  version: '1.1' | '1.2';
  backupId: string;
  tenantId: string;
  tenantName: string;
  tenantSlug: string;
  createdAt: string;
  snapshotCutoff?: string;
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
