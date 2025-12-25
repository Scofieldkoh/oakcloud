/**
 * Storage Configuration
 *
 * Reads storage configuration from environment variables
 * and provides a centralized config object.
 */

import type { StorageConfig, StorageProvider, S3EncryptionType } from './types';

/**
 * Get storage configuration from environment variables
 */
export function getStorageConfig(): StorageConfig {
  const provider = (process.env.STORAGE_PROVIDER || 'local') as StorageProvider;

  // Parse encryption type (default to AES256 for SSE-S3)
  const encryptionEnv = process.env.S3_ENCRYPTION?.trim();
  let s3Encryption: S3EncryptionType = 'AES256'; // Default: SSE-S3

  if (encryptionEnv) {
    const lowerEnc = encryptionEnv.toLowerCase();
    if (lowerEnc === 'none' || lowerEnc === 'disabled') {
      s3Encryption = 'none';
    } else if (lowerEnc === 'kms' || lowerEnc === 'aws:kms') {
      s3Encryption = 'aws:kms';
    } else if (lowerEnc === 'aes256' || lowerEnc === 'sse-s3') {
      s3Encryption = 'AES256';
    }
  }

  return {
    provider,

    // Local filesystem config
    localPath: process.env.STORAGE_LOCAL_PATH || './uploads',

    // S3/MinIO config
    s3Endpoint: process.env.S3_ENDPOINT || 'http://localhost:9000',
    s3Region: process.env.S3_REGION || 'us-east-1',
    s3Bucket: process.env.S3_BUCKET || 'oakcloud',
    s3AccessKey: process.env.S3_ACCESS_KEY || 'oakcloud',
    s3SecretKey: process.env.S3_SECRET_KEY || 'oakcloud_minio_secret',
    s3ForcePathStyle: process.env.S3_FORCE_PATH_STYLE !== 'false', // Default true for MinIO
    s3UseSsl: process.env.S3_USE_SSL === 'true',

    // S3 Encryption config
    s3Encryption,
    s3KmsKeyId: process.env.S3_KMS_KEY_ID,
  };
}

/**
 * Validate storage configuration
 * @throws Error if configuration is invalid
 */
export function validateStorageConfig(config: StorageConfig): void {
  if (config.provider === 's3') {
    if (!config.s3Endpoint) {
      throw new Error('S3_ENDPOINT is required when STORAGE_PROVIDER=s3');
    }
    if (!config.s3Bucket) {
      throw new Error('S3_BUCKET is required when STORAGE_PROVIDER=s3');
    }
    if (!config.s3AccessKey) {
      throw new Error('S3_ACCESS_KEY is required when STORAGE_PROVIDER=s3');
    }
    if (!config.s3SecretKey) {
      throw new Error('S3_SECRET_KEY is required when STORAGE_PROVIDER=s3');
    }
  } else if (config.provider === 'local') {
    if (!config.localPath) {
      throw new Error('STORAGE_LOCAL_PATH is required when STORAGE_PROVIDER=local');
    }
  } else {
    throw new Error(`Invalid STORAGE_PROVIDER: ${config.provider}. Must be 's3' or 'local'.`);
  }
}

/**
 * Storage key utilities
 */
export const StorageKeys = {
  /**
   * Generate storage key for a document's original file
   */
  documentOriginal(tenantId: string, companyId: string, documentId: string, extension: string): string {
    return `${tenantId}/companies/${companyId}/documents/${documentId}/original${extension}`;
  },

  /**
   * Generate storage key for a pending document (BizFile upload)
   */
  pendingDocument(tenantId: string, documentId: string, extension: string): string {
    return `${tenantId}/pending/${documentId}/original${extension}`;
  },

  /**
   * Generate storage key for a document page image
   */
  documentPage(tenantId: string, companyId: string, documentId: string, pageNumber: number): string {
    return `${tenantId}/companies/${companyId}/documents/${documentId}/pages/${pageNumber}.png`;
  },

  /**
   * Generate storage key for a derived file (thumbnail, child PDF, etc.)
   */
  derivedFile(
    tenantId: string,
    companyId: string,
    documentId: string,
    kind: string,
    filename: string
  ): string {
    return `${tenantId}/companies/${companyId}/documents/${documentId}/derived/${kind}/${filename}`;
  },

  /**
   * Get prefix for all files belonging to a document
   */
  documentPrefix(tenantId: string, companyId: string, documentId: string): string {
    return `${tenantId}/companies/${companyId}/documents/${documentId}/`;
  },

  /**
   * Get prefix for all files belonging to a company
   */
  companyPrefix(tenantId: string, companyId: string): string {
    return `${tenantId}/companies/${companyId}/`;
  },

  /**
   * Get prefix for all files belonging to a tenant
   */
  tenantPrefix(tenantId: string): string {
    return `${tenantId}/`;
  },

  /**
   * Get prefix for pending documents of a tenant
   */
  pendingPrefix(tenantId: string): string {
    return `${tenantId}/pending/`;
  },

  // ============================================================================
  // BACKUP STORAGE KEYS
  // ============================================================================

  /**
   * Generate storage key prefix for a backup
   */
  backupPrefix(backupId: string): string {
    return `backups/${backupId}/`;
  },

  /**
   * Generate storage key for backup manifest
   */
  backupManifest(backupId: string): string {
    return `backups/${backupId}/manifest.json`;
  },

  /**
   * Generate storage key for backup database data (gzip compressed)
   */
  backupData(backupId: string): string {
    return `backups/${backupId}/data.json.gz`;
  },

  /**
   * Generate storage key for a backed-up file (preserves original path structure)
   */
  backupFile(backupId: string, originalKey: string): string {
    return `backups/${backupId}/files/${originalKey}`;
  },

  /**
   * Get prefix for all backup files
   */
  backupsPrefix(): string {
    return 'backups/';
  },

  /**
   * Extract extension from filename or mime type
   */
  getExtension(filename: string, mimeType?: string): string {
    // Try to get from filename first
    const match = filename.match(/\.([^.]+)$/);
    if (match) {
      return `.${match[1].toLowerCase()}`;
    }

    // Fall back to mime type
    if (mimeType) {
      const mimeExtensions: Record<string, string> = {
        'application/pdf': '.pdf',
        'image/png': '.png',
        'image/jpeg': '.jpg',
        'image/jpg': '.jpg',
        'image/webp': '.webp',
        'image/tiff': '.tiff',
      };
      return mimeExtensions[mimeType] || '';
    }

    return '';
  },
};
