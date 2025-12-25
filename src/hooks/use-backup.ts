/**
 * Backup hooks for tenant backup and restore operations
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';

// ============================================================================
// Types
// ============================================================================

export type BackupStatus =
  | 'PENDING'
  | 'IN_PROGRESS'
  | 'COMPLETED'
  | 'FAILED'
  | 'RESTORING'
  | 'RESTORED'
  | 'DELETED';

export type BackupType = 'MANUAL' | 'SCHEDULED';

export interface TenantBackup {
  id: string;
  tenantId: string;
  name: string | null;
  backupType: BackupType;
  status: BackupStatus;
  storageKey: string;
  databaseSizeBytes: number;
  filesSizeBytes: number;
  totalSizeBytes: number;
  filesCount: number;
  progress: number;
  currentStep: string | null;
  errorMessage: string | null;
  errorDetails: Record<string, unknown> | null;
  restoredAt: string | null;
  restoredById: string | null;
  retentionDays: number | null;
  expiresAt: string | null;
  createdById: string;
  createdAt: string;
  completedAt: string | null;
  deletedAt: string | null;
  manifestJson: BackupManifest | null;
}

export interface BackupManifest {
  version: string;
  backupId: string;
  tenantId: string;
  tenantName: string;
  tenantSlug: string;
  createdAt: string;
  createdById: string;
  schemaVersion: string;
  stats: Record<string, number>;
  files: Array<{
    key: string;
    size: number;
    originalStorageKey: string;
  }>;
  checksums: {
    dataJson: string;
  };
}

export interface BackupsResponse {
  backups: TenantBackup[];
  totalCount: number;
  page: number;
  limit: number;
  totalPages: number;
}

export interface BackupsParams {
  tenantId?: string;
  status?: BackupStatus;
  page?: number;
  limit?: number;
}

export interface CreateBackupData {
  tenantId: string;
  name?: string;
  retentionDays?: number;
  includeAuditLogs?: boolean;
}

export interface RestoreBackupData {
  dryRun?: boolean;
  overwriteExisting?: boolean;
}

export interface RestoreResult {
  success: boolean;
  message: string;
}

// ============================================================================
// Hooks
// ============================================================================

/**
 * Fetch list of backups with optional filters
 */
export function useBackups(params?: BackupsParams) {
  return useQuery<BackupsResponse>({
    queryKey: ['backups', params],
    queryFn: async () => {
      const searchParams = new URLSearchParams();
      if (params?.tenantId) searchParams.set('tenantId', params.tenantId);
      if (params?.status) searchParams.set('status', params.status);
      if (params?.page) searchParams.set('page', params.page.toString());
      if (params?.limit) searchParams.set('limit', params.limit.toString());

      const res = await fetch(`/api/admin/backup?${searchParams}`);
      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error || 'Failed to fetch backups');
      }
      return res.json();
    },
    // Auto-refresh if any backup is in progress
    refetchInterval: (query) => {
      const hasInProgress = query.state.data?.backups?.some(
        (b) => b.status === 'PENDING' || b.status === 'IN_PROGRESS' || b.status === 'RESTORING'
      );
      return hasInProgress ? 5000 : false; // 5 second refresh
    },
  });
}

/**
 * Fetch single backup details
 */
export function useBackup(id: string | undefined) {
  return useQuery<TenantBackup>({
    queryKey: ['backup', id],
    queryFn: async () => {
      if (!id) throw new Error('Backup ID required');
      const res = await fetch(`/api/admin/backup/${id}`);
      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error || 'Failed to fetch backup');
      }
      return res.json();
    },
    enabled: !!id,
    // Auto-refresh if backup is in progress
    refetchInterval: (query) => {
      const status = query.state.data?.status;
      const isInProgress =
        status === 'PENDING' || status === 'IN_PROGRESS' || status === 'RESTORING';
      return isInProgress ? 3000 : false; // 3 second refresh
    },
  });
}

/**
 * Create a new backup
 */
export function useCreateBackup() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: CreateBackupData) => {
      const res = await fetch('/api/admin/backup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error || 'Failed to create backup');
      }
      return res.json() as Promise<{ backupId: string }>;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['backups'] });
    },
  });
}

/**
 * Restore from a backup
 */
export function useRestoreBackup() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, ...options }: { id: string } & RestoreBackupData) => {
      const res = await fetch(`/api/admin/backup/${id}/restore`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(options),
      });
      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error || 'Failed to restore backup');
      }
      return res.json() as Promise<RestoreResult>;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['backups'] });
      queryClient.invalidateQueries({ queryKey: ['tenants'] });
    },
  });
}

/**
 * Delete a backup
 */
export function useDeleteBackup() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/admin/backup/${id}`, { method: 'DELETE' });
      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error || 'Failed to delete backup');
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['backups'] });
    },
  });
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Format bytes to human-readable size
 */
export function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

/**
 * Get status color for backup status
 */
export function getBackupStatusColor(status: BackupStatus): string {
  switch (status) {
    case 'COMPLETED':
    case 'RESTORED':
      return 'green';
    case 'PENDING':
    case 'IN_PROGRESS':
    case 'RESTORING':
      return 'blue';
    case 'FAILED':
      return 'red';
    case 'DELETED':
      return 'gray';
    default:
      return 'gray';
  }
}

/**
 * Get human-readable status label
 */
export function getBackupStatusLabel(status: BackupStatus): string {
  switch (status) {
    case 'PENDING':
      return 'Pending';
    case 'IN_PROGRESS':
      return 'In Progress';
    case 'COMPLETED':
      return 'Completed';
    case 'FAILED':
      return 'Failed';
    case 'RESTORING':
      return 'Restoring';
    case 'RESTORED':
      return 'Restored';
    case 'DELETED':
      return 'Deleted';
    default:
      return status;
  }
}

// ============================================================================
// Backup Schedule Types
// ============================================================================

export interface BackupSchedule {
  id: string;
  tenantId: string;
  cronPattern: string;
  isEnabled: boolean;
  timezone: string;
  retentionDays: number;
  maxBackups: number;
  lastRunAt: string | null;
  lastBackupId: string | null;
  nextRunAt: string | null;
  lastError: string | null;
  consecutiveFailures: number;
  createdAt: string;
  updatedAt: string;
  tenant?: {
    id: string;
    name: string;
    slug: string;
  };
}

export interface BackupSchedulesResponse {
  schedules: BackupSchedule[];
  totalCount: number;
  page: number;
  limit: number;
  totalPages: number;
}

export interface BackupSchedulesParams {
  page?: number;
  limit?: number;
}

export interface CreateBackupScheduleData {
  tenantId: string;
  cronPattern: string;
  isEnabled?: boolean;
  timezone?: string;
  retentionDays?: number;
  maxBackups?: number;
}

export interface UpdateBackupScheduleData {
  cronPattern?: string;
  isEnabled?: boolean;
  timezone?: string;
  retentionDays?: number;
  maxBackups?: number;
}

// ============================================================================
// Backup Schedule Hooks
// ============================================================================

/**
 * Fetch list of backup schedules
 */
export function useBackupSchedules(params?: BackupSchedulesParams) {
  return useQuery<BackupSchedulesResponse>({
    queryKey: ['backup-schedules', params],
    queryFn: async () => {
      const searchParams = new URLSearchParams();
      if (params?.page) searchParams.set('page', params.page.toString());
      if (params?.limit) searchParams.set('limit', params.limit.toString());

      const res = await fetch(`/api/admin/backup/schedule?${searchParams}`);
      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error || 'Failed to fetch backup schedules');
      }
      return res.json();
    },
  });
}

/**
 * Fetch single backup schedule by tenant ID
 */
export function useBackupSchedule(tenantId: string | undefined) {
  return useQuery<BackupSchedule>({
    queryKey: ['backup-schedule', tenantId],
    queryFn: async () => {
      if (!tenantId) throw new Error('Tenant ID required');
      const res = await fetch(`/api/admin/backup/schedule/${tenantId}`);
      if (!res.ok) {
        if (res.status === 404) return null;
        const error = await res.json();
        throw new Error(error.error || 'Failed to fetch backup schedule');
      }
      return res.json();
    },
    enabled: !!tenantId,
  });
}

/**
 * Create a new backup schedule
 */
export function useCreateBackupSchedule() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: CreateBackupScheduleData) => {
      const res = await fetch('/api/admin/backup/schedule', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error || 'Failed to create backup schedule');
      }
      return res.json() as Promise<BackupSchedule>;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['backup-schedules'] });
    },
  });
}

/**
 * Update a backup schedule
 */
export function useUpdateBackupSchedule() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ tenantId, ...data }: { tenantId: string } & UpdateBackupScheduleData) => {
      const res = await fetch(`/api/admin/backup/schedule/${tenantId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error || 'Failed to update backup schedule');
      }
      return res.json() as Promise<BackupSchedule>;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['backup-schedules'] });
      queryClient.invalidateQueries({ queryKey: ['backup-schedule', variables.tenantId] });
    },
  });
}

/**
 * Delete a backup schedule
 */
export function useDeleteBackupSchedule() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (tenantId: string) => {
      const res = await fetch(`/api/admin/backup/schedule/${tenantId}`, { method: 'DELETE' });
      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error || 'Failed to delete backup schedule');
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['backup-schedules'] });
    },
  });
}

/**
 * Trigger scheduled backup runner manually
 */
export function useTriggerScheduledBackups() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async () => {
      const res = await fetch('/api/admin/backup/scheduled', { method: 'POST' });
      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error || 'Failed to trigger scheduled backups');
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['backups'] });
      queryClient.invalidateQueries({ queryKey: ['backup-schedules'] });
    },
  });
}

// ============================================================================
// Schedule Helper Functions
// ============================================================================

/**
 * Parse cron pattern to human-readable description
 */
export function describeCronPattern(cronPattern: string): string {
  const parts = cronPattern.split(' ');
  if (parts.length !== 5) return cronPattern;

  const [minute, hour, dayOfMonth, month, dayOfWeek] = parts;

  // Common patterns
  if (dayOfMonth === '*' && month === '*' && dayOfWeek === '*') {
    // Daily
    if (minute !== '*' && hour !== '*') {
      return `Daily at ${hour.padStart(2, '0')}:${minute.padStart(2, '0')}`;
    }
  }

  if (dayOfMonth === '*' && month === '*' && dayOfWeek !== '*') {
    // Weekly
    const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const dayName = days[parseInt(dayOfWeek)] || dayOfWeek;
    if (minute !== '*' && hour !== '*') {
      return `Weekly on ${dayName} at ${hour.padStart(2, '0')}:${minute.padStart(2, '0')}`;
    }
  }

  if (dayOfMonth !== '*' && month === '*' && dayOfWeek === '*') {
    // Monthly
    if (minute !== '*' && hour !== '*') {
      return `Monthly on day ${dayOfMonth} at ${hour.padStart(2, '0')}:${minute.padStart(2, '0')}`;
    }
  }

  return cronPattern;
}
