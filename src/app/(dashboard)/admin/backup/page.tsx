'use client';

import { useState } from 'react';
import { useSession } from '@/hooks/use-auth';
import { useTenants } from '@/hooks/use-admin';
import {
  useBackups,
  useCreateBackup,
  useRestoreBackup,
  useDeleteBackup,
  useBackupSchedules,
  useCreateBackupSchedule,
  useUpdateBackupSchedule,
  useDeleteBackupSchedule,
  useTriggerScheduledBackups,
  formatBytes,
  getBackupStatusLabel,
  describeCronPattern,
  type BackupStatus,
  type TenantBackup,
  type BackupSchedule,
} from '@/hooks/use-backup';
import { Button } from '@/components/ui/button';
import { Alert } from '@/components/ui/alert';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { Modal, ModalBody, ModalFooter } from '@/components/ui/modal';
import { FormInput } from '@/components/ui/form-input';
import { useToast } from '@/components/ui/toast';
import { Pagination } from '@/components/companies/pagination';
import {
  RefreshCw,
  Trash2,
  RotateCcw,
  Plus,
  Building,
  CheckCircle,
  XCircle,
  Clock,
  Loader2,
  AlertTriangle,
  Archive,
  FileArchive,
  Calendar,
  Play,
  Pause,
  Settings,
  Edit2,
} from 'lucide-react';
import { MobileCollapsibleSection } from '@/components/ui/collapsible-section';
import { MobileCard, CardDetailsGrid, CardDetailItem } from '@/components/ui/responsive-table';
import { format } from 'date-fns';
import { cn } from '@/lib/utils';

type TabType = 'backups' | 'schedules';

export default function BackupPage() {
  const { data: session } = useSession();
  const { success, error: showError } = useToast();

  // Tab state
  const [activeTab, setActiveTab] = useState<TabType>('backups');

  // Backup list state
  const [page, setPage] = useState(1);
  const [limit] = useState(20);
  const [selectedTenantId, setSelectedTenantId] = useState<string>('');
  const [statusFilter, setStatusFilter] = useState<BackupStatus | ''>('');

  // Create backup modal state
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [newBackupTenantId, setNewBackupTenantId] = useState('');
  const [newBackupName, setNewBackupName] = useState('');
  const [newBackupRetention, setNewBackupRetention] = useState('');

  // Restore/delete dialog state
  const [restoreDialogOpen, setRestoreDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [selectedBackup, setSelectedBackup] = useState<TenantBackup | null>(null);
  const [restoreMode, setRestoreMode] = useState<'merge' | 'clean'>('merge');

  // Schedule state
  const [schedulePage, setSchedulePage] = useState(1);
  const [scheduleModalOpen, setScheduleModalOpen] = useState(false);
  const [editingSchedule, setEditingSchedule] = useState<BackupSchedule | null>(null);
  const [deleteScheduleDialogOpen, setDeleteScheduleDialogOpen] = useState(false);
  const [selectedSchedule, setSelectedSchedule] = useState<BackupSchedule | null>(null);

  // Schedule form state
  const [scheduleTenantId, setScheduleTenantId] = useState('');
  const [scheduleCron, setScheduleCron] = useState('0 2 * * *');
  const [scheduleEnabled, setScheduleEnabled] = useState(true);
  const [scheduleTimezone, setScheduleTimezone] = useState('Asia/Singapore');
  const [scheduleRetention, setScheduleRetention] = useState('30');
  const [scheduleMaxBackups, setScheduleMaxBackups] = useState('10');

  // Schedule builder state (for customizable UI)
  const [scheduleFrequency, setScheduleFrequency] = useState<'daily' | 'weekly' | 'monthly'>('daily');
  const [scheduleHour, setScheduleHour] = useState('2');
  const [scheduleMinute, setScheduleMinute] = useState('0');
  const [scheduleDayOfWeek, setScheduleDayOfWeek] = useState('0'); // 0 = Sunday
  const [scheduleDayOfMonth, setScheduleDayOfMonth] = useState('1');

  // Build cron pattern from schedule builder values
  const buildCronPattern = () => {
    const minute = scheduleMinute;
    const hour = scheduleHour;
    switch (scheduleFrequency) {
      case 'daily':
        return `${minute} ${hour} * * *`;
      case 'weekly':
        return `${minute} ${hour} * * ${scheduleDayOfWeek}`;
      case 'monthly':
        return `${minute} ${hour} ${scheduleDayOfMonth} * *`;
      default:
        return `${minute} ${hour} * * *`;
    }
  };

  // Parse cron pattern to schedule builder values
  const parseCronToBuilder = (cron: string) => {
    const parts = cron.split(' ');
    if (parts.length !== 5) return;

    const [minute, hour, dayOfMonth, , dayOfWeek] = parts;
    setScheduleMinute(minute);
    setScheduleHour(hour);

    if (dayOfMonth !== '*' && dayOfWeek === '*') {
      setScheduleFrequency('monthly');
      setScheduleDayOfMonth(dayOfMonth);
    } else if (dayOfWeek !== '*') {
      setScheduleFrequency('weekly');
      setScheduleDayOfWeek(dayOfWeek);
    } else {
      setScheduleFrequency('daily');
    }
  };

  // Queries
  const { data: tenantsData } = useTenants({ limit: 200 });
  const { data: backupsData, isLoading: backupsLoading, error: backupsError, refetch: refetchBackups } = useBackups({
    tenantId: selectedTenantId || undefined,
    status: (statusFilter as BackupStatus) || undefined,
    page,
    limit,
  });
  const { data: schedulesData, isLoading: schedulesLoading, error: schedulesError, refetch: refetchSchedules } = useBackupSchedules({
    page: schedulePage,
    limit: 20,
  });

  // Mutations
  const createMutation = useCreateBackup();
  const restoreMutation = useRestoreBackup();
  const deleteMutation = useDeleteBackup();
  const createScheduleMutation = useCreateBackupSchedule();
  const updateScheduleMutation = useUpdateBackupSchedule();
  const deleteScheduleMutation = useDeleteBackupSchedule();
  const triggerMutation = useTriggerScheduledBackups();

  // Only SUPER_ADMIN can access this page
  if (!session?.isSuperAdmin) {
    return (
      <div className="p-4 sm:p-6">
        <Alert variant="error">You do not have permission to access this page.</Alert>
      </div>
    );
  }

  const backups = backupsData?.backups || [];
  const totalCount = backupsData?.totalCount || 0;
  const totalPages = backupsData?.totalPages || 1;
  const schedules = schedulesData?.schedules || [];
  const schedulesTotalCount = schedulesData?.totalCount || 0;
  const schedulesTotalPages = schedulesData?.totalPages || 1;

  // Handler functions
  const handleCreateBackup = async () => {
    if (!newBackupTenantId) {
      showError('Please select a tenant');
      return;
    }

    try {
      const result = await createMutation.mutateAsync({
        tenantId: newBackupTenantId,
        name: newBackupName || undefined,
        retentionDays: newBackupRetention ? parseInt(newBackupRetention) : undefined,
      });
      success(`Backup started successfully (ID: ${result.backupId.slice(0, 8)}...)`);
      setCreateModalOpen(false);
      setNewBackupTenantId('');
      setNewBackupName('');
      setNewBackupRetention('');
    } catch (err) {
      showError(err instanceof Error ? err.message : 'Failed to create backup');
    }
  };

  const handleRestore = async () => {
    if (!selectedBackup) return;

    try {
      const result = await restoreMutation.mutateAsync({
        id: selectedBackup.id,
        overwriteExisting: restoreMode === 'clean',
      });
      success(result.message);
      setRestoreDialogOpen(false);
      setSelectedBackup(null);
      setRestoreMode('merge');
    } catch (err) {
      showError(err instanceof Error ? err.message : 'Failed to restore backup');
    }
  };

  const handleDelete = async () => {
    if (!selectedBackup) return;

    try {
      await deleteMutation.mutateAsync(selectedBackup.id);
      success('Backup deleted successfully');
      setDeleteDialogOpen(false);
      setSelectedBackup(null);
    } catch (err) {
      showError(err instanceof Error ? err.message : 'Failed to delete backup');
    }
  };

  const handleSaveSchedule = async () => {
    if (!editingSchedule && !scheduleTenantId) {
      showError('Please select a tenant');
      return;
    }

    const cronPattern = buildCronPattern();

    try {
      if (editingSchedule) {
        await updateScheduleMutation.mutateAsync({
          tenantId: editingSchedule.tenantId,
          cronPattern,
          isEnabled: scheduleEnabled,
          timezone: scheduleTimezone,
          retentionDays: parseInt(scheduleRetention) || 30,
          maxBackups: parseInt(scheduleMaxBackups) || 10,
        });
        success('Schedule updated successfully');
      } else {
        await createScheduleMutation.mutateAsync({
          tenantId: scheduleTenantId,
          cronPattern,
          isEnabled: true, // Always enabled by default when creating
          timezone: scheduleTimezone,
          retentionDays: parseInt(scheduleRetention) || 30,
          maxBackups: parseInt(scheduleMaxBackups) || 10,
        });
        success('Schedule created successfully');
      }
      closeScheduleModal();
    } catch (err) {
      showError(err instanceof Error ? err.message : 'Failed to save schedule');
    }
  };

  const handleDeleteSchedule = async () => {
    if (!selectedSchedule) return;

    try {
      await deleteScheduleMutation.mutateAsync(selectedSchedule.tenantId);
      success('Schedule deleted successfully');
      setDeleteScheduleDialogOpen(false);
      setSelectedSchedule(null);
    } catch (err) {
      showError(err instanceof Error ? err.message : 'Failed to delete schedule');
    }
  };

  const handleToggleSchedule = async (schedule: BackupSchedule) => {
    try {
      await updateScheduleMutation.mutateAsync({
        tenantId: schedule.tenantId,
        isEnabled: !schedule.isEnabled,
      });
      success(`Schedule ${schedule.isEnabled ? 'disabled' : 'enabled'}`);
    } catch (err) {
      showError(err instanceof Error ? err.message : 'Failed to update schedule');
    }
  };

  const handleTriggerBackups = async () => {
    try {
      const result = await triggerMutation.mutateAsync();
      if (result.processed === 0) {
        success('No scheduled backups due at this time');
      } else {
        success(`Triggered ${result.succeeded} backup(s)`);
      }
    } catch (err) {
      showError(err instanceof Error ? err.message : 'Failed to trigger backups');
    }
  };

  const openScheduleModal = (schedule?: BackupSchedule) => {
    if (schedule) {
      setEditingSchedule(schedule);
      setScheduleTenantId(schedule.tenantId);
      setScheduleCron(schedule.cronPattern);
      setScheduleEnabled(schedule.isEnabled);
      setScheduleTimezone(schedule.timezone);
      setScheduleRetention(schedule.retentionDays.toString());
      setScheduleMaxBackups(schedule.maxBackups.toString());
      parseCronToBuilder(schedule.cronPattern);
    } else {
      setEditingSchedule(null);
      setScheduleTenantId('');
      setScheduleCron('0 2 * * *');
      setScheduleEnabled(true);
      setScheduleTimezone('Asia/Singapore');
      setScheduleRetention('30');
      setScheduleMaxBackups('10');
      // Reset builder to defaults
      setScheduleFrequency('daily');
      setScheduleHour('2');
      setScheduleMinute('0');
      setScheduleDayOfWeek('0');
      setScheduleDayOfMonth('1');
    }
    setScheduleModalOpen(true);
  };

  const closeScheduleModal = () => {
    setScheduleModalOpen(false);
    setEditingSchedule(null);
    setScheduleTenantId('');
    setScheduleCron('0 2 * * *');
    setScheduleEnabled(true);
    setScheduleTimezone('Asia/Singapore');
    setScheduleRetention('30');
    setScheduleMaxBackups('10');
    // Reset builder
    setScheduleFrequency('daily');
    setScheduleHour('2');
    setScheduleMinute('0');
    setScheduleDayOfWeek('0');
    setScheduleDayOfMonth('1');
  };

  const getStatusIcon = (status: BackupStatus) => {
    switch (status) {
      case 'COMPLETED':
      case 'RESTORED':
        return <CheckCircle className="w-4 h-4 text-status-success" />;
      case 'PENDING':
      case 'IN_PROGRESS':
      case 'RESTORING':
        return <Loader2 className="w-4 h-4 text-accent-primary animate-spin" />;
      case 'FAILED':
        return <XCircle className="w-4 h-4 text-status-error" />;
      case 'DELETED':
        return <Trash2 className="w-4 h-4 text-text-tertiary" />;
      default:
        return <Clock className="w-4 h-4 text-text-tertiary" />;
    }
  };

  // Calculate stats
  const stats = {
    total: backups.length,
    completed: backups.filter((b) => b.status === 'COMPLETED' || b.status === 'RESTORED').length,
    inProgress: backups.filter(
      (b) => b.status === 'PENDING' || b.status === 'IN_PROGRESS' || b.status === 'RESTORING'
    ).length,
    failed: backups.filter((b) => b.status === 'FAILED').length,
  };

  // Get tenants that already have schedules
  const tenantsWithSchedules = new Set(schedules.map((s) => s.tenantId));

  return (
    <div className="p-4 sm:p-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
        <div>
          <h1 className="text-xl sm:text-2xl font-semibold text-text-primary">
            Backup & Restore
          </h1>
          <p className="text-sm text-text-secondary mt-1">
            Create and manage tenant backups for disaster recovery
          </p>
        </div>
        <div className="flex items-center gap-2">
          {activeTab === 'backups' && (
            <>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => refetchBackups()}
                disabled={backupsLoading}
              >
                <RefreshCw className={cn('w-4 h-4 mr-1', backupsLoading && 'animate-spin')} />
                Refresh
              </Button>
              <Button
                variant="primary"
                size="sm"
                onClick={() => setCreateModalOpen(true)}
              >
                <Plus className="w-4 h-4 mr-1" />
                Create Backup
              </Button>
            </>
          )}
          {activeTab === 'schedules' && (
            <>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => refetchSchedules()}
                disabled={schedulesLoading}
              >
                <RefreshCw className={cn('w-4 h-4 mr-1', schedulesLoading && 'animate-spin')} />
                Refresh
              </Button>
              <Button
                variant="secondary"
                size="sm"
                onClick={handleTriggerBackups}
                disabled={triggerMutation.isPending}
                isLoading={triggerMutation.isPending}
              >
                <Play className="w-4 h-4 mr-1" />
                Run Now
              </Button>
              <Button
                variant="primary"
                size="sm"
                onClick={() => openScheduleModal()}
              >
                <Plus className="w-4 h-4 mr-1" />
                Add Schedule
              </Button>
            </>
          )}
        </div>
      </div>

      {/* Tab Navigation */}
      <div className="flex gap-1 mb-6 border-b border-border-primary">
        <button
          onClick={() => setActiveTab('backups')}
          className={cn(
            'px-4 py-2 text-sm font-medium transition-colors border-b-2 -mb-px',
            activeTab === 'backups'
              ? 'text-accent-primary border-accent-primary'
              : 'text-text-secondary border-transparent hover:text-text-primary hover:border-border-secondary'
          )}
        >
          <Archive className="w-4 h-4 inline-block mr-1.5 -mt-0.5" />
          Backups
        </button>
        <button
          onClick={() => setActiveTab('schedules')}
          className={cn(
            'px-4 py-2 text-sm font-medium transition-colors border-b-2 -mb-px',
            activeTab === 'schedules'
              ? 'text-accent-primary border-accent-primary'
              : 'text-text-secondary border-transparent hover:text-text-primary hover:border-border-secondary'
          )}
        >
          <Calendar className="w-4 h-4 inline-block mr-1.5 -mt-0.5" />
          Schedules
          {schedules.filter((s) => s.isEnabled).length > 0 && (
            <span className="ml-1.5 px-1.5 py-0.5 text-xs rounded-full bg-status-success/10 text-status-success">
              {schedules.filter((s) => s.isEnabled).length}
            </span>
          )}
        </button>
      </div>

      {/* Backups Tab */}
      {activeTab === 'backups' && (
        <>
          {/* Stats Cards */}
          <MobileCollapsibleSection title="Statistics" count={4} className="mb-6">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div className="bg-background-secondary rounded-lg p-3 border border-border-primary">
                <div className="flex items-center gap-2 text-text-secondary text-xs mb-1">
                  <Archive className="w-3.5 h-3.5" />
                  Total Backups
                </div>
                <div className="text-xl font-semibold text-text-primary">{totalCount}</div>
              </div>
              <div className="bg-background-secondary rounded-lg p-3 border border-border-primary">
                <div className="flex items-center gap-2 text-status-success text-xs mb-1">
                  <CheckCircle className="w-3.5 h-3.5" />
                  Completed
                </div>
                <div className="text-xl font-semibold text-status-success">{stats.completed}</div>
              </div>
              <div className="bg-background-secondary rounded-lg p-3 border border-border-primary">
                <div className="flex items-center gap-2 text-accent-primary text-xs mb-1">
                  <Loader2 className="w-3.5 h-3.5" />
                  In Progress
                </div>
                <div className="text-xl font-semibold text-accent-primary">{stats.inProgress}</div>
              </div>
              <div className="bg-background-secondary rounded-lg p-3 border border-border-primary">
                <div className="flex items-center gap-2 text-status-error text-xs mb-1">
                  <XCircle className="w-3.5 h-3.5" />
                  Failed
                </div>
                <div className="text-xl font-semibold text-status-error">{stats.failed}</div>
              </div>
            </div>
          </MobileCollapsibleSection>

          {/* Filters */}
          <div className="flex flex-wrap gap-3 mb-4">
            <select
              value={selectedTenantId}
              onChange={(e) => {
                setSelectedTenantId(e.target.value);
                setPage(1);
              }}
              className="px-3 py-1.5 text-sm rounded-md border border-border-primary bg-background-primary text-text-primary focus:outline-none focus:ring-1 focus:ring-accent-primary"
            >
              <option value="">All Tenants</option>
              {tenantsData?.tenants.map((tenant) => (
                <option key={tenant.id} value={tenant.id}>
                  {tenant.name}
                </option>
              ))}
            </select>
            <select
              value={statusFilter}
              onChange={(e) => {
                setStatusFilter(e.target.value as BackupStatus | '');
                setPage(1);
              }}
              className="px-3 py-1.5 text-sm rounded-md border border-border-primary bg-background-primary text-text-primary focus:outline-none focus:ring-1 focus:ring-accent-primary"
            >
              <option value="">All Status</option>
              <option value="PENDING">Pending</option>
              <option value="IN_PROGRESS">In Progress</option>
              <option value="COMPLETED">Completed</option>
              <option value="FAILED">Failed</option>
              <option value="RESTORING">Restoring</option>
              <option value="RESTORED">Restored</option>
            </select>
          </div>

          {/* Error Alert */}
          {backupsError && (
            <Alert variant="error" className="mb-4">
              {backupsError instanceof Error ? backupsError.message : 'Failed to load backups'}
            </Alert>
          )}

          {/* Mobile Card View for Backups */}
          <div className="md:hidden space-y-3">
            {backupsLoading ? (
              <div className="card p-8 text-center text-text-secondary">
                <Loader2 className="w-6 h-6 animate-spin mx-auto mb-2" />
                Loading backups...
              </div>
            ) : backups.length === 0 ? (
              <div className="card p-8 text-center text-text-secondary">
                <FileArchive className="w-8 h-8 mx-auto mb-2 opacity-50" />
                No backups found
              </div>
            ) : (
              backups.map((backup) => {
                const tenant = tenantsData?.tenants.find((t) => t.id === backup.tenantId);
                return (
                  <MobileCard
                    key={backup.id}
                    title={
                      <span className="font-medium text-text-primary">
                        {backup.name || 'Unnamed Backup'}
                      </span>
                    }
                    subtitle={
                      <span className="text-xs text-text-tertiary font-mono">
                        {backup.id.slice(0, 8)}...
                      </span>
                    }
                    badge={
                      <div className="flex items-center gap-1.5">
                        {getStatusIcon(backup.status)}
                        <span
                          className={cn(
                            'text-xs font-medium',
                            backup.status === 'COMPLETED' || backup.status === 'RESTORED'
                              ? 'text-status-success'
                              : backup.status === 'FAILED'
                                ? 'text-status-error'
                                : backup.status === 'PENDING' ||
                                    backup.status === 'IN_PROGRESS' ||
                                    backup.status === 'RESTORING'
                                  ? 'text-accent-primary'
                                  : 'text-text-secondary'
                          )}
                        >
                          {getBackupStatusLabel(backup.status)}
                        </span>
                      </div>
                    }
                    actions={
                      <div className="flex items-center gap-1">
                        {(backup.status === 'COMPLETED' || backup.status === 'RESTORED') && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => {
                              setSelectedBackup(backup);
                              setRestoreDialogOpen(true);
                            }}
                            aria-label="Restore backup"
                          >
                            <RotateCcw className="w-4 h-4" />
                          </Button>
                        )}
                        {backup.status !== 'IN_PROGRESS' &&
                          backup.status !== 'RESTORING' &&
                          backup.status !== 'DELETED' && (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => {
                                setSelectedBackup(backup);
                                setDeleteDialogOpen(true);
                              }}
                              aria-label="Delete backup"
                              className="text-status-error hover:text-status-error"
                            >
                              <Trash2 className="w-4 h-4" />
                            </Button>
                          )}
                      </div>
                    }
                    details={
                      <>
                        {(backup.status === 'IN_PROGRESS' || backup.status === 'RESTORING') && (
                          <div className="mb-3">
                            <div className="w-full h-1.5 bg-background-tertiary rounded-full overflow-hidden">
                              <div
                                className="h-full bg-accent-primary transition-all duration-300"
                                style={{ width: `${backup.progress}%` }}
                              />
                            </div>
                            <div className="text-xs text-text-tertiary mt-0.5">
                              {backup.currentStep || `${backup.progress}%`}
                            </div>
                          </div>
                        )}
                        {backup.status === 'FAILED' && backup.errorMessage && (
                          <div className="text-xs text-status-error mb-3 line-clamp-2">
                            {backup.errorMessage}
                          </div>
                        )}
                        <CardDetailsGrid>
                          <CardDetailItem
                            label="Tenant"
                            value={
                              <div className="flex items-center gap-1.5">
                                <Building className="w-3.5 h-3.5 text-text-tertiary" />
                                <span className="truncate">{tenant?.name || backup.tenantId.slice(0, 8) + '...'}</span>
                              </div>
                            }
                          />
                          <CardDetailItem label="Size" value={formatBytes(backup.totalSizeBytes)} />
                          <CardDetailItem label="Files" value={backup.filesCount.toLocaleString()} />
                          <CardDetailItem
                            label="Created"
                            value={format(new Date(backup.createdAt), 'dd MMM yyyy HH:mm')}
                          />
                          <CardDetailItem
                            label="Expiry"
                            value={
                              backup.expiresAt ? (
                                <span
                                  className={cn(
                                    new Date(backup.expiresAt) < new Date()
                                      ? 'text-status-error'
                                      : new Date(backup.expiresAt) < new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
                                        ? 'text-status-warning'
                                        : 'text-text-secondary'
                                  )}
                                >
                                  {format(new Date(backup.expiresAt), 'dd MMM yyyy')}
                                </span>
                              ) : (
                                <span className="text-text-tertiary">Never</span>
                              )
                            }
                          />
                        </CardDetailsGrid>
                      </>
                    }
                  />
                );
              })
            )}
          </div>

          {/* Desktop Backups Table */}
          <div className="hidden md:block bg-background-secondary rounded-lg border border-border-primary overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[800px]">
                <thead>
                  <tr className="border-b border-border-primary bg-background-tertiary">
                    <th className="px-4 py-3 text-left text-xs font-medium text-text-secondary uppercase tracking-wider">
                      Backup
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-text-secondary uppercase tracking-wider">
                      Tenant
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-text-secondary uppercase tracking-wider">
                      Status
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-text-secondary uppercase tracking-wider">
                      Size
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-text-secondary uppercase tracking-wider">
                      Files
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-text-secondary uppercase tracking-wider">
                      Created
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-text-secondary uppercase tracking-wider">
                      Expiry
                    </th>
                    <th className="px-4 py-3 text-right text-xs font-medium text-text-secondary uppercase tracking-wider">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border-primary">
                  {backupsLoading ? (
                    <tr>
                      <td colSpan={8} className="px-4 py-8 text-center text-text-secondary">
                        <Loader2 className="w-6 h-6 animate-spin mx-auto mb-2" />
                        Loading backups...
                      </td>
                    </tr>
                  ) : backups.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="px-4 py-8 text-center text-text-secondary">
                        <FileArchive className="w-8 h-8 mx-auto mb-2 opacity-50" />
                        No backups found
                      </td>
                    </tr>
                  ) : (
                    backups.map((backup) => {
                      const tenant = tenantsData?.tenants.find((t) => t.id === backup.tenantId);
                      return (
                        <tr
                          key={backup.id}
                          className="hover:bg-background-tertiary transition-colors"
                        >
                          <td className="px-4 py-3">
                            <div>
                              <div className="text-sm font-medium text-text-primary">
                                {backup.name || 'Unnamed Backup'}
                              </div>
                              <div className="text-xs text-text-tertiary font-mono">
                                {backup.id.slice(0, 8)}...
                              </div>
                            </div>
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-2">
                              <Building className="w-4 h-4 text-text-tertiary" />
                              <span className="text-sm text-text-primary">
                                {tenant?.name || backup.tenantId.slice(0, 8) + '...'}
                              </span>
                            </div>
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-2">
                              {getStatusIcon(backup.status)}
                              <span
                                className={cn(
                                  'text-sm font-medium',
                                  backup.status === 'COMPLETED' || backup.status === 'RESTORED'
                                    ? 'text-status-success'
                                    : backup.status === 'FAILED'
                                      ? 'text-status-error'
                                      : backup.status === 'PENDING' ||
                                          backup.status === 'IN_PROGRESS' ||
                                          backup.status === 'RESTORING'
                                        ? 'text-accent-primary'
                                        : 'text-text-secondary'
                                )}
                              >
                                {getBackupStatusLabel(backup.status)}
                              </span>
                            </div>
                            {(backup.status === 'IN_PROGRESS' || backup.status === 'RESTORING') && (
                              <div className="mt-1">
                                <div className="w-24 h-1.5 bg-background-tertiary rounded-full overflow-hidden">
                                  <div
                                    className="h-full bg-accent-primary transition-all duration-300"
                                    style={{ width: `${backup.progress}%` }}
                                  />
                                </div>
                                <div className="text-xs text-text-tertiary mt-0.5">
                                  {backup.currentStep || `${backup.progress}%`}
                                </div>
                              </div>
                            )}
                            {backup.status === 'FAILED' && backup.errorMessage && (
                              <div className="text-xs text-status-error mt-0.5 max-w-[200px] truncate">
                                {backup.errorMessage}
                              </div>
                            )}
                          </td>
                          <td className="px-4 py-3 text-sm text-text-primary">
                            {formatBytes(backup.totalSizeBytes)}
                          </td>
                          <td className="px-4 py-3 text-sm text-text-primary">
                            {backup.filesCount.toLocaleString()}
                          </td>
                          <td className="px-4 py-3 text-sm text-text-secondary">
                            {format(new Date(backup.createdAt), 'dd MMM yyyy HH:mm')}
                          </td>
                          <td className="px-4 py-3 text-sm">
                            {backup.expiresAt ? (
                              <span
                                className={cn(
                                  new Date(backup.expiresAt) < new Date()
                                    ? 'text-status-error'
                                    : new Date(backup.expiresAt) < new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
                                      ? 'text-status-warning'
                                      : 'text-text-secondary'
                                )}
                              >
                                {format(new Date(backup.expiresAt), 'dd MMM yyyy')}
                              </span>
                            ) : (
                              <span className="text-text-tertiary">Never</span>
                            )}
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex items-center justify-end gap-1">
                              {(backup.status === 'COMPLETED' || backup.status === 'RESTORED') && (
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => {
                                    setSelectedBackup(backup);
                                    setRestoreDialogOpen(true);
                                  }}
                                  aria-label="Restore backup"
                                >
                                  <RotateCcw className="w-4 h-4" />
                                </Button>
                              )}
                              {backup.status !== 'IN_PROGRESS' &&
                                backup.status !== 'RESTORING' &&
                                backup.status !== 'DELETED' && (
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => {
                                      setSelectedBackup(backup);
                                      setDeleteDialogOpen(true);
                                    }}
                                    aria-label="Delete backup"
                                    className="text-status-error hover:text-status-error"
                                  >
                                    <Trash2 className="w-4 h-4" />
                                  </Button>
                                )}
                            </div>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="px-4 py-3 border-t border-border-primary">
                <Pagination
                  page={page}
                  totalPages={totalPages}
                  total={totalCount}
                  limit={limit}
                  onPageChange={setPage}
                  showPageSize={false}
                />
              </div>
            )}
          </div>
        </>
      )}

      {/* Schedules Tab */}
      {activeTab === 'schedules' && (
        <>

          {/* Error Alert */}
          {schedulesError && (
            <Alert variant="error" className="mb-4">
              {schedulesError instanceof Error ? schedulesError.message : 'Failed to load schedules'}
            </Alert>
          )}

          {/* Mobile Card View for Schedules */}
          <div className="md:hidden space-y-3">
            {schedulesLoading ? (
              <div className="card p-8 text-center text-text-secondary">
                <Loader2 className="w-6 h-6 animate-spin mx-auto mb-2" />
                Loading schedules...
              </div>
            ) : schedules.length === 0 ? (
              <div className="card p-8 text-center text-text-secondary">
                <Calendar className="w-8 h-8 mx-auto mb-2 opacity-50" />
                No backup schedules configured
              </div>
            ) : (
              schedules.map((schedule) => (
                <MobileCard
                  key={schedule.id}
                  title={
                    <div className="flex items-center gap-2">
                      <Building className="w-4 h-4 text-text-tertiary" />
                      <span className="font-medium text-text-primary">
                        {schedule.tenant?.name || schedule.tenantId.slice(0, 8) + '...'}
                      </span>
                    </div>
                  }
                  subtitle={
                    <span className="text-xs text-text-tertiary font-mono">
                      {schedule.cronPattern}
                    </span>
                  }
                  badge={
                    <div className="flex items-center gap-1.5">
                      {schedule.isEnabled ? (
                        <>
                          <CheckCircle className="w-4 h-4 text-status-success" />
                          <span className="text-xs font-medium text-status-success">Enabled</span>
                        </>
                      ) : (
                        <>
                          <Pause className="w-4 h-4 text-text-tertiary" />
                          <span className="text-xs text-text-tertiary">Disabled</span>
                        </>
                      )}
                    </div>
                  }
                  actions={
                    <div className="flex items-center gap-1">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleToggleSchedule(schedule)}
                        aria-label={schedule.isEnabled ? 'Disable schedule' : 'Enable schedule'}
                      >
                        {schedule.isEnabled ? (
                          <Pause className="w-4 h-4" />
                        ) : (
                          <Play className="w-4 h-4" />
                        )}
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => openScheduleModal(schedule)}
                        aria-label="Edit schedule"
                      >
                        <Edit2 className="w-4 h-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          setSelectedSchedule(schedule);
                          setDeleteScheduleDialogOpen(true);
                        }}
                        aria-label="Delete schedule"
                        className="text-status-error hover:text-status-error"
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  }
                  details={
                    <>
                      {schedule.lastError && (
                        <div className="text-xs text-status-error mb-3 line-clamp-2">
                          {schedule.lastError}
                        </div>
                      )}
                      <CardDetailsGrid>
                        <CardDetailItem
                          label="Schedule"
                          value={describeCronPattern(schedule.cronPattern)}
                          fullWidth
                        />
                        <CardDetailItem
                          label="Retention"
                          value={`${schedule.retentionDays} days / ${schedule.maxBackups} max`}
                        />
                        <CardDetailItem
                          label="Next Run"
                          value={
                            schedule.nextRunAt
                              ? format(new Date(schedule.nextRunAt), 'dd MMM yyyy, HH:mm')
                              : '-'
                          }
                        />
                        <CardDetailItem
                          label="Last Run"
                          value={
                            schedule.lastRunAt
                              ? format(new Date(schedule.lastRunAt), 'dd MMM yyyy, HH:mm')
                              : 'Never'
                          }
                        />
                      </CardDetailsGrid>
                    </>
                  }
                />
              ))
            )}
          </div>

          {/* Desktop Schedules Table */}
          <div className="hidden md:block bg-background-secondary rounded-lg border border-border-primary overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[700px]">
                <thead>
                  <tr className="border-b border-border-primary bg-background-tertiary">
                    <th className="px-4 py-3 text-left text-xs font-medium text-text-secondary uppercase tracking-wider">
                      Tenant
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-text-secondary uppercase tracking-wider">
                      Schedule
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-text-secondary uppercase tracking-wider">
                      Status
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-text-secondary uppercase tracking-wider">
                      Retention
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-text-secondary uppercase tracking-wider">
                      Next Run
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-text-secondary uppercase tracking-wider">
                      Last Run
                    </th>
                    <th className="px-4 py-3 text-right text-xs font-medium text-text-secondary uppercase tracking-wider">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border-primary">
                  {schedulesLoading ? (
                    <tr>
                      <td colSpan={7} className="px-4 py-8 text-center text-text-secondary">
                        <Loader2 className="w-6 h-6 animate-spin mx-auto mb-2" />
                        Loading schedules...
                      </td>
                    </tr>
                  ) : schedules.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="px-4 py-8 text-center text-text-secondary">
                        <Calendar className="w-8 h-8 mx-auto mb-2 opacity-50" />
                        No backup schedules configured
                      </td>
                    </tr>
                  ) : (
                    schedules.map((schedule) => (
                      <tr
                        key={schedule.id}
                        className="hover:bg-background-tertiary transition-colors"
                      >
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            <Building className="w-4 h-4 text-text-tertiary" />
                            <span className="text-sm text-text-primary">
                              {schedule.tenant?.name || schedule.tenantId.slice(0, 8) + '...'}
                            </span>
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <div className="text-sm text-text-primary">
                            {describeCronPattern(schedule.cronPattern)}
                          </div>
                          <div className="text-xs text-text-tertiary font-mono">
                            {schedule.cronPattern}
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            {schedule.isEnabled ? (
                              <>
                                <CheckCircle className="w-4 h-4 text-status-success" />
                                <span className="text-sm font-medium text-status-success">Enabled</span>
                              </>
                            ) : (
                              <>
                                <Pause className="w-4 h-4 text-text-tertiary" />
                                <span className="text-sm text-text-tertiary">Disabled</span>
                              </>
                            )}
                          </div>
                          {schedule.lastError && (
                            <div className="text-xs text-status-error mt-0.5 max-w-[150px] truncate" title={schedule.lastError}>
                              {schedule.lastError}
                            </div>
                          )}
                        </td>
                        <td className="px-4 py-3 text-sm text-text-primary">
                          {schedule.retentionDays} days / {schedule.maxBackups} max
                        </td>
                        <td className="px-4 py-3 text-sm text-text-secondary">
                          {schedule.nextRunAt
                            ? format(new Date(schedule.nextRunAt), 'dd MMM yyyy, HH:mm')
                            : '-'}
                        </td>
                        <td className="px-4 py-3 text-sm text-text-secondary">
                          {schedule.lastRunAt
                            ? format(new Date(schedule.lastRunAt), 'dd MMM yyyy, HH:mm')
                            : 'Never'}
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center justify-end gap-1">
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleToggleSchedule(schedule)}
                              aria-label={schedule.isEnabled ? 'Disable schedule' : 'Enable schedule'}
                            >
                              {schedule.isEnabled ? (
                                <Pause className="w-4 h-4" />
                              ) : (
                                <Play className="w-4 h-4" />
                              )}
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => openScheduleModal(schedule)}
                              aria-label="Edit schedule"
                            >
                              <Edit2 className="w-4 h-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => {
                                setSelectedSchedule(schedule);
                                setDeleteScheduleDialogOpen(true);
                              }}
                              aria-label="Delete schedule"
                              className="text-status-error hover:text-status-error"
                            >
                              <Trash2 className="w-4 h-4" />
                            </Button>
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            {schedulesTotalPages > 1 && (
              <div className="px-4 py-3 border-t border-border-primary">
                <Pagination
                  page={schedulePage}
                  totalPages={schedulesTotalPages}
                  total={schedulesTotalCount}
                  limit={20}
                  onPageChange={setSchedulePage}
                  showPageSize={false}
                />
              </div>
            )}
          </div>
        </>
      )}

      {/* Create Backup Modal */}
      <Modal
        isOpen={createModalOpen}
        onClose={() => {
          setCreateModalOpen(false);
          setNewBackupTenantId('');
          setNewBackupName('');
          setNewBackupRetention('');
        }}
        title="Create Backup"
        size="md"
      >
        <ModalBody>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-text-primary mb-1">
                Tenant <span className="text-status-error">*</span>
              </label>
              <select
                value={newBackupTenantId}
                onChange={(e) => setNewBackupTenantId(e.target.value)}
                className="w-full px-3 py-2 text-sm rounded-md border border-border-primary bg-background-primary text-text-primary focus:outline-none focus:ring-1 focus:ring-accent-primary"
              >
                <option value="">Select a tenant...</option>
                {tenantsData?.tenants
                  .filter((t) => t.status === 'ACTIVE')
                  .map((tenant) => (
                    <option key={tenant.id} value={tenant.id}>
                      {tenant.name}
                    </option>
                  ))}
              </select>
            </div>
            <FormInput
              label="Backup Name"
              value={newBackupName}
              onChange={(e) => setNewBackupName(e.target.value)}
              placeholder="Optional: Enter a descriptive name"
            />
            <FormInput
              label="Retention Days"
              type="number"
              value={newBackupRetention}
              onChange={(e) => setNewBackupRetention(e.target.value)}
              placeholder="Optional: Days to keep backup (1-365)"
              min={1}
              max={365}
            />
          </div>
        </ModalBody>
        <ModalFooter>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => {
              setCreateModalOpen(false);
              setNewBackupTenantId('');
              setNewBackupName('');
              setNewBackupRetention('');
            }}
          >
            Cancel
          </Button>
          <Button
            variant="primary"
            size="sm"
            onClick={handleCreateBackup}
            disabled={!newBackupTenantId || createMutation.isPending}
            isLoading={createMutation.isPending}
          >
            <Plus className="w-4 h-4 mr-1" />
            Create Backup
          </Button>
        </ModalFooter>
      </Modal>

      {/* Schedule Modal */}
      <Modal
        isOpen={scheduleModalOpen}
        onClose={closeScheduleModal}
        title={editingSchedule ? 'Edit Schedule' : 'Add Schedule'}
        size="md"
      >
        <ModalBody>
          <div className="space-y-4">
            {!editingSchedule && (
              <div>
                <label className="block text-sm font-medium text-text-primary mb-1">
                  Tenant <span className="text-status-error">*</span>
                </label>
                <select
                  value={scheduleTenantId}
                  onChange={(e) => setScheduleTenantId(e.target.value)}
                  className="w-full px-3 py-2 text-sm rounded-md border border-border-primary bg-background-primary text-text-primary focus:outline-none focus:ring-1 focus:ring-accent-primary"
                >
                  <option value="">Select a tenant...</option>
                  {tenantsData?.tenants
                    .filter((t) => t.status === 'ACTIVE' && !tenantsWithSchedules.has(t.id))
                    .map((tenant) => (
                      <option key={tenant.id} value={tenant.id}>
                        {tenant.name}
                      </option>
                    ))}
                </select>
                {tenantsWithSchedules.size > 0 && (
                  <p className="text-xs text-text-tertiary mt-1">
                    Tenants with existing schedules are hidden
                  </p>
                )}
              </div>
            )}
            {editingSchedule && (
              <div>
                <label className="block text-sm font-medium text-text-primary mb-1">Tenant</label>
                <div className="flex items-center gap-2 px-3 py-2 text-sm rounded-md border border-border-primary bg-background-tertiary text-text-primary">
                  <Building className="w-4 h-4 text-text-tertiary" />
                  {editingSchedule.tenant?.name || editingSchedule.tenantId}
                </div>
              </div>
            )}
            {/* Frequency Selection */}
            <div>
              <label className="block text-sm font-medium text-text-primary mb-1">Frequency</label>
              <select
                value={scheduleFrequency}
                onChange={(e) => setScheduleFrequency(e.target.value as 'daily' | 'weekly' | 'monthly')}
                className="w-full px-3 py-2 text-sm rounded-md border border-border-primary bg-background-primary text-text-primary focus:outline-none focus:ring-1 focus:ring-accent-primary"
              >
                <option value="daily">Daily</option>
                <option value="weekly">Weekly</option>
                <option value="monthly">Monthly</option>
              </select>
            </div>

            {/* Day Selection (Weekly) */}
            {scheduleFrequency === 'weekly' && (
              <div>
                <label className="block text-sm font-medium text-text-primary mb-1">Day of Week</label>
                <select
                  value={scheduleDayOfWeek}
                  onChange={(e) => setScheduleDayOfWeek(e.target.value)}
                  className="w-full px-3 py-2 text-sm rounded-md border border-border-primary bg-background-primary text-text-primary focus:outline-none focus:ring-1 focus:ring-accent-primary"
                >
                  <option value="0">Sunday</option>
                  <option value="1">Monday</option>
                  <option value="2">Tuesday</option>
                  <option value="3">Wednesday</option>
                  <option value="4">Thursday</option>
                  <option value="5">Friday</option>
                  <option value="6">Saturday</option>
                </select>
              </div>
            )}

            {/* Day Selection (Monthly) */}
            {scheduleFrequency === 'monthly' && (
              <div>
                <label className="block text-sm font-medium text-text-primary mb-1">Day of Month</label>
                <select
                  value={scheduleDayOfMonth}
                  onChange={(e) => setScheduleDayOfMonth(e.target.value)}
                  className="w-full px-3 py-2 text-sm rounded-md border border-border-primary bg-background-primary text-text-primary focus:outline-none focus:ring-1 focus:ring-accent-primary"
                >
                  {Array.from({ length: 28 }, (_, i) => i + 1).map((day) => (
                    <option key={day} value={day.toString()}>
                      {day === 1 ? '1st' : day === 2 ? '2nd' : day === 3 ? '3rd' : `${day}th`}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {/* Time Selection */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-text-primary mb-1">Hour</label>
                <select
                  value={scheduleHour}
                  onChange={(e) => setScheduleHour(e.target.value)}
                  className="w-full px-3 py-2 text-sm rounded-md border border-border-primary bg-background-primary text-text-primary focus:outline-none focus:ring-1 focus:ring-accent-primary"
                >
                  {Array.from({ length: 24 }, (_, i) => i).map((hour) => (
                    <option key={hour} value={hour.toString()}>
                      {hour === 0 ? '12:00 AM (midnight)' : hour === 12 ? '12:00 PM (noon)' : hour < 12 ? `${hour}:00 AM` : `${hour - 12}:00 PM`}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-text-primary mb-1">Minute</label>
                <select
                  value={scheduleMinute}
                  onChange={(e) => setScheduleMinute(e.target.value)}
                  className="w-full px-3 py-2 text-sm rounded-md border border-border-primary bg-background-primary text-text-primary focus:outline-none focus:ring-1 focus:ring-accent-primary"
                >
                  <option value="0">:00</option>
                  <option value="15">:15</option>
                  <option value="30">:30</option>
                  <option value="45">:45</option>
                </select>
              </div>
            </div>

            {/* Timezone */}
            <div>
              <label className="block text-sm font-medium text-text-primary mb-1">Timezone</label>
              <select
                value={scheduleTimezone}
                onChange={(e) => setScheduleTimezone(e.target.value)}
                className="w-full px-3 py-2 text-sm rounded-md border border-border-primary bg-background-primary text-text-primary focus:outline-none focus:ring-1 focus:ring-accent-primary"
              >
                <option value="Asia/Singapore">Singapore (SGT)</option>
                <option value="Asia/Hong_Kong">Hong Kong (HKT)</option>
                <option value="Asia/Tokyo">Tokyo (JST)</option>
                <option value="Asia/Shanghai">Shanghai (CST)</option>
                <option value="Asia/Kuala_Lumpur">Kuala Lumpur (MYT)</option>
                <option value="Australia/Sydney">Sydney (AEST)</option>
                <option value="Europe/London">London (GMT/BST)</option>
                <option value="America/New_York">New York (EST/EDT)</option>
                <option value="America/Los_Angeles">Los Angeles (PST/PDT)</option>
                <option value="UTC">UTC</option>
              </select>
            </div>

            {/* Retention Settings */}
            <div className="grid grid-cols-2 gap-4">
              <FormInput
                label="Keep backups for (days)"
                type="number"
                value={scheduleRetention}
                onChange={(e) => setScheduleRetention(e.target.value)}
                min={1}
                max={365}
              />
              <FormInput
                label="Maximum backups"
                type="number"
                value={scheduleMaxBackups}
                onChange={(e) => setScheduleMaxBackups(e.target.value)}
                min={1}
                max={100}
              />
            </div>

            {/* Enable/Disable toggle - only show when editing */}
            {editingSchedule && (
              <div className="flex items-center justify-between p-3 rounded-lg border border-border-primary bg-bg-tertiary">
                <div className="flex flex-col">
                  <span className="text-sm font-medium text-text-primary">Schedule Status</span>
                  <span className="text-xs text-text-muted">
                    {scheduleEnabled ? 'Backups will run automatically' : 'Backups are paused'}
                  </span>
                </div>
                <button
                  type="button"
                  role="switch"
                  aria-checked={scheduleEnabled}
                  onClick={() => setScheduleEnabled(!scheduleEnabled)}
                  className={cn(
                    'relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-oak-primary focus:ring-offset-2',
                    scheduleEnabled ? 'bg-oak-primary border-oak-primary' : 'bg-gray-300 border-gray-300 dark:bg-gray-600 dark:border-gray-600'
                  )}
                >
                  <span
                    className={cn(
                      'pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-md transition duration-200 ease-in-out',
                      scheduleEnabled ? 'translate-x-5' : 'translate-x-0'
                    )}
                  />
                </button>
              </div>
            )}
          </div>
        </ModalBody>
        <ModalFooter>
          <Button variant="secondary" size="sm" onClick={closeScheduleModal}>
            Cancel
          </Button>
          <Button
            variant="primary"
            size="sm"
            onClick={handleSaveSchedule}
            disabled={
              (!editingSchedule && !scheduleTenantId) ||
              createScheduleMutation.isPending ||
              updateScheduleMutation.isPending
            }
            isLoading={createScheduleMutation.isPending || updateScheduleMutation.isPending}
          >
            <Settings className="w-4 h-4 mr-1" />
            {editingSchedule ? 'Update Schedule' : 'Create Schedule'}
          </Button>
        </ModalFooter>
      </Modal>

      {/* Restore Modal */}
      <Modal
        isOpen={restoreDialogOpen}
        onClose={() => {
          setRestoreDialogOpen(false);
          setSelectedBackup(null);
          setRestoreMode('merge');
        }}
        title="Restore Backup"
        size="md"
      >
        <ModalBody>
          <div className="space-y-4">
            <p className="text-sm text-text-secondary">
              Restore backup{' '}
              <strong className="text-text-primary">
                {selectedBackup?.name || selectedBackup?.id.slice(0, 8) + '...'}
              </strong>{' '}
              to tenant.
            </p>

            {/* Restore Mode Selection */}
            <div className="space-y-3">
              <label className="block text-sm font-medium text-text-primary">
                Restore Mode
              </label>

              {/* Merge Mode */}
              <label
                className={cn(
                  'flex items-start gap-3 p-3 rounded-md border cursor-pointer transition-colors',
                  restoreMode === 'merge'
                    ? 'border-accent-primary bg-accent-primary/5'
                    : 'border-border-primary hover:border-border-secondary'
                )}
              >
                <input
                  type="radio"
                  name="restoreMode"
                  value="merge"
                  checked={restoreMode === 'merge'}
                  onChange={() => setRestoreMode('merge')}
                  className="mt-0.5 text-accent-primary focus:ring-accent-primary"
                />
                <div className="flex-1">
                  <div className="text-sm font-medium text-text-primary">
                    Merge (Add missing records)
                  </div>
                  <div className="text-xs text-text-secondary mt-0.5">
                    Only adds records that don&apos;t exist. Existing data remains unchanged.
                    Safe for partial restores.
                  </div>
                </div>
              </label>

              {/* Clean Mode */}
              <label
                className={cn(
                  'flex items-start gap-3 p-3 rounded-md border cursor-pointer transition-colors',
                  restoreMode === 'clean'
                    ? 'border-status-warning bg-status-warning/5'
                    : 'border-border-primary hover:border-border-secondary'
                )}
              >
                <input
                  type="radio"
                  name="restoreMode"
                  value="clean"
                  checked={restoreMode === 'clean'}
                  onChange={() => setRestoreMode('clean')}
                  className="mt-0.5 text-status-warning focus:ring-status-warning"
                />
                <div className="flex-1">
                  <div className="text-sm font-medium text-text-primary flex items-center gap-1.5">
                    Clean Restore (Replace all data)
                    <AlertTriangle className="w-3.5 h-3.5 text-status-warning" />
                  </div>
                  <div className="text-xs text-text-secondary mt-0.5">
                    Deletes all existing tenant data and files, then restores from backup.
                    Data created after this backup will be permanently lost.
                  </div>
                </div>
              </label>
            </div>

            {/* Warning for clean restore */}
            {restoreMode === 'clean' && (
              <Alert variant="warning" compact>
                <strong>Warning:</strong> This will permanently delete all current tenant data
                including documents, companies, users, and files created after this backup.
              </Alert>
            )}
          </div>
        </ModalBody>
        <ModalFooter>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => {
              setRestoreDialogOpen(false);
              setSelectedBackup(null);
              setRestoreMode('merge');
            }}
          >
            Cancel
          </Button>
          <Button
            variant={restoreMode === 'clean' ? 'danger' : 'primary'}
            size="sm"
            onClick={handleRestore}
            isLoading={restoreMutation.isPending}
          >
            <RotateCcw className="w-4 h-4 mr-1" />
            {restoreMode === 'clean' ? 'Clean Restore' : 'Merge Restore'}
          </Button>
        </ModalFooter>
      </Modal>

      {/* Delete Backup Confirmation Dialog */}
      <ConfirmDialog
        isOpen={deleteDialogOpen}
        onClose={() => {
          setDeleteDialogOpen(false);
          setSelectedBackup(null);
        }}
        onConfirm={handleDelete}
        title="Delete Backup"
        confirmLabel="Delete"
        variant="danger"
        isLoading={deleteMutation.isPending}
        description={
          <span>
            Are you sure you want to delete the backup{' '}
            <strong>{selectedBackup?.name || selectedBackup?.id.slice(0, 8) + '...'}</strong>?
            This action cannot be undone.
          </span>
        }
      />

      {/* Delete Schedule Confirmation Dialog */}
      <ConfirmDialog
        isOpen={deleteScheduleDialogOpen}
        onClose={() => {
          setDeleteScheduleDialogOpen(false);
          setSelectedSchedule(null);
        }}
        onConfirm={handleDeleteSchedule}
        title="Delete Schedule"
        confirmLabel="Delete"
        variant="danger"
        isLoading={deleteScheduleMutation.isPending}
        description={
          <span>
            Are you sure you want to delete the backup schedule for{' '}
            <strong>{selectedSchedule?.tenant?.name || selectedSchedule?.tenantId}</strong>?
            This will not affect existing backups.
          </span>
        }
      />
    </div>
  );
}
