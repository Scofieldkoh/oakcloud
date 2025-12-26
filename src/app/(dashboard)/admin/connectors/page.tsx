'use client';

import { useState, useEffect } from 'react';
import { useSession } from '@/hooks/use-auth';
import {
  useConnectors,
  useCreateConnector,
  useUpdateConnector,
  useDeleteConnector,
  useTestConnector,
  useToggleConnector,
  useTenantAccess,
  useUpdateTenantAccess,
  useConnectorUsage,
  useExportUsage,
  getProviderDisplayName,
  getTypeDisplayName,
  getCredentialFields,
  getProvidersForType,
  parseTestResult,
  formatCost,
  formatTokens,
  formatLatency,
  type Connector,
  type ConnectorSearchParams,
  type UsageSearchParams,
} from '@/hooks/use-connectors';
import { Button } from '@/components/ui/button';
import { FormInput } from '@/components/ui/form-input';
import { Modal, ModalBody, ModalFooter } from '@/components/ui/modal';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { Alert } from '@/components/ui/alert';
import { Dropdown, DropdownTrigger, DropdownMenu, DropdownItem } from '@/components/ui/dropdown';
import { Checkbox } from '@/components/ui/checkbox';
import { useToast } from '@/components/ui/toast';
import { useActiveTenantId, useTenantSelection } from '@/components/ui/tenant-selector';
import {
  Plus,
  MoreVertical,
  Pencil,
  Trash2,
  Check,
  X,
  Zap,
  Settings,
  Cloud,
  Brain,
  RefreshCw,
  Shield,
  Eye,
  EyeOff,
  BarChart3,
  Download,
  Calendar,
  ChevronLeft,
  ChevronRight,
  HelpCircle,
  ExternalLink,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { MobileCard, CardDetailsGrid, CardDetailItem } from '@/components/ui/responsive-table';

// ============================================================================
// Types
// ============================================================================

type ConnectorType = 'AI_PROVIDER' | 'STORAGE';
type ConnectorProvider = 'OPENAI' | 'ANTHROPIC' | 'GOOGLE' | 'ONEDRIVE' | 'SHAREPOINT';

interface CreateFormData {
  name: string;
  type: ConnectorType;
  provider: ConnectorProvider;
  tenantId: string | null;
  credentials: Record<string, string>;
  isEnabled: boolean;
  isDefault: boolean;
}

interface EditFormData {
  name: string;
  credentials: Record<string, string>;
  isEnabled: boolean;
  isDefault: boolean;
}

// ============================================================================
// Constants
// ============================================================================

const INITIAL_CREATE_FORM: CreateFormData = {
  name: '',
  type: 'AI_PROVIDER',
  provider: 'OPENAI',
  tenantId: null,
  credentials: {},
  isEnabled: true,
  isDefault: false,
};

// ============================================================================
// Helper Components
// ============================================================================

function StatusBadge({ isEnabled }: { isEnabled: boolean }) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium',
        isEnabled
          ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300'
          : 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400'
      )}
    >
      {isEnabled ? <Check className="w-3 h-3" /> : <X className="w-3 h-3" />}
      {isEnabled ? 'Enabled' : 'Disabled'}
    </span>
  );
}

function ScopeBadge({ isSystem }: { isSystem: boolean }) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs',
        isSystem
          ? 'bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300'
          : 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300'
      )}
    >
      {isSystem ? <Shield className="w-3 h-3" /> : <Settings className="w-3 h-3" />}
      {isSystem ? 'System' : 'Tenant'}
    </span>
  );
}

function ProviderIcon({ provider }: { provider: ConnectorProvider }) {
  const iconClass = 'w-5 h-5';
  switch (provider) {
    case 'OPENAI':
      return <Brain className={cn(iconClass, 'text-green-600')} />;
    case 'ANTHROPIC':
      return <Brain className={cn(iconClass, 'text-orange-600')} />;
    case 'GOOGLE':
      return <Brain className={cn(iconClass, 'text-blue-600')} />;
    case 'ONEDRIVE':
      return <Cloud className={cn(iconClass, 'text-sky-600')} />;
    case 'SHAREPOINT':
      return <Cloud className={cn(iconClass, 'text-purple-600')} />;
    default:
      return <Zap className={iconClass} />;
  }
}

function TestResultBadge({ result }: { result: string | null }) {
  const parsed = parseTestResult(result);
  if (!result) {
    return <span className="text-xs text-text-muted">Not tested</span>;
  }
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 text-xs',
        parsed.success ? 'text-green-600' : 'text-red-600'
      )}
      title={parsed.error}
    >
      {parsed.success ? <Check className="w-3 h-3" /> : <X className="w-3 h-3" />}
      {parsed.success ? 'OK' : 'Failed'}
    </span>
  );
}

// ============================================================================
// Main Page Component
// ============================================================================

export default function ConnectorsPage() {
  const { data: session } = useSession();
  const { success, error: showError } = useToast();
  const isSuperAdmin = session?.isSuperAdmin ?? false;
  const isTenantAdmin = session?.isTenantAdmin ?? false;

  // State - tenant selection from centralized store
  const { selectedTenantId } = useTenantSelection();
  const [typeFilter, setTypeFilter] = useState<ConnectorType | ''>('');
  const [providerFilter, setProviderFilter] = useState<ConnectorProvider | ''>('');
  const [page, setPage] = useState(1);

  // Modals
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [editingConnector, setEditingConnector] = useState<Connector | null>(null);
  const [deletingConnector, setDeletingConnector] = useState<Connector | null>(null);
  const [accessConnector, setAccessConnector] = useState<Connector | null>(null);
  const [usageConnector, setUsageConnector] = useState<Connector | null>(null);

  // Usage modal state
  const [usageDateRange, setUsageDateRange] = useState<{ start: string; end: string }>({
    start: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0], // 30 days ago
    end: new Date().toISOString().split('T')[0], // today
  });
  const [usagePage, setUsagePage] = useState(1);

  // Form state
  const [createForm, setCreateForm] = useState<CreateFormData>(INITIAL_CREATE_FORM);
  const [editForm, setEditForm] = useState<EditFormData>({
    name: '',
    credentials: {},
    isEnabled: true,
    isDefault: false,
  });
  const [formError, setFormError] = useState('');
  const [showCredentials, setShowCredentials] = useState<Record<string, boolean>>({});
  const [showSetupGuide, setShowSetupGuide] = useState<'SHAREPOINT' | 'ONEDRIVE' | null>(null);

  // Active tenant - using centralized hook
  const activeTenantId = useActiveTenantId(isSuperAdmin, session?.tenantId);

  // Build search params
  const searchParams: ConnectorSearchParams = {
    ...(isSuperAdmin && selectedTenantId ? { tenantId: selectedTenantId } : {}),
    ...(typeFilter ? { type: typeFilter } : {}),
    ...(providerFilter ? { provider: providerFilter } : {}),
    includeSystem: true,
    page,
    limit: 50,
  };

  // Queries
  const { data: connectorsData, isLoading } = useConnectors(searchParams);

  // Mutations
  const createMutation = useCreateConnector();
  const updateMutation = useUpdateConnector(editingConnector?.id);
  const deleteMutation = useDeleteConnector();
  const testMutation = useTestConnector();
  const toggleMutation = useToggleConnector(undefined);

  // Usage query
  const usageParams: UsageSearchParams | null = usageConnector
    ? {
        connectorId: usageConnector.id,
        startDate: usageDateRange.start,
        endDate: usageDateRange.end,
        page: usagePage,
        limit: 20,
      }
    : null;
  const { data: usageData, isLoading: usageLoading } = useConnectorUsage(usageParams);
  const exportMutation = useExportUsage();

  // Access control
  if (!isSuperAdmin && !isTenantAdmin) {
    return (
      <div className="p-6">
        <Alert variant="error">You do not have permission to access this page.</Alert>
      </div>
    );
  }

  // Group connectors by type
  const connectorsByType: Partial<Record<ConnectorType, Connector[]>> = connectorsData?.connectors.reduce(
    (acc, connector) => {
      if (!acc[connector.type]) {
        acc[connector.type] = [];
      }
      acc[connector.type]!.push(connector);
      return acc;
    },
    {} as Partial<Record<ConnectorType, Connector[]>>
  ) || {};

  // Handlers
  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError('');

    if (!createForm.name.trim()) {
      setFormError('Name is required');
      return;
    }

    // Validate required credentials
    const fields = getCredentialFields(createForm.provider);
    for (const field of fields) {
      if (field.required && !createForm.credentials[field.key]) {
        setFormError(`${field.label} is required`);
        return;
      }
    }

    try {
      await createMutation.mutateAsync({
        name: createForm.name,
        type: createForm.type,
        provider: createForm.provider,
        tenantId: isSuperAdmin ? createForm.tenantId : session?.tenantId || null,
        credentials: createForm.credentials,
        isEnabled: createForm.isEnabled,
        isDefault: createForm.isDefault,
      });
      success('Connector created successfully');
      setIsCreateModalOpen(false);
      setCreateForm(INITIAL_CREATE_FORM);
    } catch (err) {
      showError(err instanceof Error ? err.message : 'Failed to create connector');
    }
  };

  const handleUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError('');

    if (!editingConnector) return;

    if (!editForm.name.trim()) {
      setFormError('Name is required');
      return;
    }

    try {
      const updateData: Record<string, unknown> = {
        name: editForm.name,
        isEnabled: editForm.isEnabled,
        isDefault: editForm.isDefault,
      };

      // Only include credentials if they've been modified (non-empty)
      const hasCredentialChanges = Object.values(editForm.credentials).some((v) => v);
      if (hasCredentialChanges) {
        updateData.credentials = editForm.credentials;
      }

      await updateMutation.mutateAsync(updateData);
      success('Connector updated successfully');
      setEditingConnector(null);
    } catch (err) {
      showError(err instanceof Error ? err.message : 'Failed to update connector');
    }
  };

  const handleDelete = async (reason?: string) => {
    if (!deletingConnector) return;

    try {
      await deleteMutation.mutateAsync({ id: deletingConnector.id, reason: reason || 'No reason provided' });
      success('Connector deleted successfully');
      setDeletingConnector(null);
    } catch (err) {
      showError(err instanceof Error ? err.message : 'Failed to delete connector');
    }
  };

  const handleTest = async (connector: Connector) => {
    try {
      const result = await testMutation.mutateAsync(connector.id);
      if (result.success) {
        success(`Connection test passed (${result.latencyMs}ms)`);
      } else {
        showError(`Connection test failed: ${result.error}`);
      }
    } catch (err) {
      showError(err instanceof Error ? err.message : 'Failed to test connection');
    }
  };

  const handleToggle = async (connector: Connector) => {
    try {
      const res = await fetch(`/api/connectors/${connector.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isEnabled: !connector.isEnabled }),
      });
      if (!res.ok) throw new Error('Failed to toggle');
      success(`Connector ${connector.isEnabled ? 'disabled' : 'enabled'}`);
      // Refetch handled by mutation invalidation
    } catch (err) {
      showError(err instanceof Error ? err.message : 'Failed to toggle connector');
    }
  };

  const openEditModal = (connector: Connector) => {
    setEditingConnector(connector);
    setEditForm({
      name: connector.name,
      credentials: {}, // Don't pre-fill credentials
      isEnabled: connector.isEnabled,
      isDefault: connector.isDefault,
    });
    setFormError('');
  };

  const toggleCredentialVisibility = (key: string) => {
    setShowCredentials((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  // Render mobile connector card
  const renderConnectorCard = (connector: Connector) => {
    const isSystem = connector.tenantId === null;
    const canEdit = isSuperAdmin || (!isSystem && connector.tenantId === session?.tenantId);
    const canDelete = canEdit;
    const isTesting = testMutation.isPending && testMutation.variables === connector.id;

    return (
      <MobileCard
        key={connector.id}
        title={
          <div className="flex items-center gap-2">
            <ProviderIcon provider={connector.provider} />
            <span className="font-medium text-text-primary">{connector.name}</span>
          </div>
        }
        subtitle={getProviderDisplayName(connector.provider)}
        badge={<StatusBadge isEnabled={connector.isEnabled} />}
        actions={
          <div className="flex items-center gap-1">
            <Button
              variant="secondary"
              size="xs"
              onClick={() => handleTest(connector)}
              isLoading={isTesting}
              disabled={isTesting}
            >
              <RefreshCw className="w-3 h-3" />
            </Button>
            {(canEdit || canDelete || (isSuperAdmin && isSystem)) && (
              <Dropdown>
                <DropdownTrigger asChild>
                  <Button variant="ghost" size="xs" iconOnly leftIcon={<MoreVertical className="w-4 h-4" />} aria-label="More options" />
                </DropdownTrigger>
                <DropdownMenu align="right">
                  {canEdit && (
                    <DropdownItem onClick={() => openEditModal(connector)}>
                      <Pencil className="w-4 h-4 mr-2" />
                      Edit
                    </DropdownItem>
                  )}
                  {canEdit && (
                    <DropdownItem onClick={() => handleToggle(connector)}>
                      {connector.isEnabled ? (
                        <>
                          <X className="w-4 h-4 mr-2" />
                          Disable
                        </>
                      ) : (
                        <>
                          <Check className="w-4 h-4 mr-2" />
                          Enable
                        </>
                      )}
                    </DropdownItem>
                  )}
                  <DropdownItem onClick={() => {
                    setUsageConnector(connector);
                    setUsagePage(1);
                  }}>
                    <BarChart3 className="w-4 h-4 mr-2" />
                    View Usage
                  </DropdownItem>
                  {isSuperAdmin && isSystem && (
                    <DropdownItem onClick={() => setAccessConnector(connector)}>
                      <Shield className="w-4 h-4 mr-2" />
                      Tenant Access
                    </DropdownItem>
                  )}
                  {canDelete && (
                    <DropdownItem
                      destructive
                      onClick={() => setDeletingConnector(connector)}
                    >
                      <Trash2 className="w-4 h-4 mr-2" />
                      Delete
                    </DropdownItem>
                  )}
                </DropdownMenu>
              </Dropdown>
            )}
          </div>
        }
        details={
          <CardDetailsGrid>
            <CardDetailItem label="Scope" value={<ScopeBadge isSystem={isSystem} />} />
            <CardDetailItem label="Test" value={<TestResultBadge result={connector.lastTestResult} />} />
            <CardDetailItem label="Calls" value={connector.callCount.toLocaleString()} />
            <CardDetailItem
              label="Last Used"
              value={connector.lastUsedAt ? new Date(connector.lastUsedAt).toLocaleDateString() : 'Never'}
            />
          </CardDetailsGrid>
        }
      />
    );
  };

  // Render connector row
  const renderConnectorRow = (connector: Connector) => {
    const isSystem = connector.tenantId === null;
    const canEdit = isSuperAdmin || (!isSystem && connector.tenantId === session?.tenantId);
    const canDelete = canEdit;
    const isTesting = testMutation.isPending && testMutation.variables === connector.id;

    return (
      <tr key={connector.id} className="hover:bg-bg-tertiary transition-colors">
        <td className="px-4 py-3">
          <div className="flex items-center gap-3">
            <ProviderIcon provider={connector.provider} />
            <div>
              <div className="font-medium text-text-primary">{connector.name}</div>
              <div className="text-xs text-text-secondary">
                {getProviderDisplayName(connector.provider)}
              </div>
            </div>
          </div>
        </td>
        <td className="px-4 py-3">
          <ScopeBadge isSystem={isSystem} />
        </td>
        <td className="px-4 py-3">
          <StatusBadge isEnabled={connector.isEnabled} />
        </td>
        <td className="px-4 py-3">
          <TestResultBadge result={connector.lastTestResult} />
        </td>
        <td className="px-4 py-3 text-sm text-text-secondary">
          {connector.callCount.toLocaleString()}
        </td>
        <td className="px-4 py-3 text-sm text-text-muted">
          {connector.lastUsedAt
            ? new Date(connector.lastUsedAt).toLocaleDateString()
            : 'Never'}
        </td>
        <td className="px-4 py-3">
          <div className="flex items-center gap-2">
            <Button
              variant="secondary"
              size="xs"
              onClick={() => handleTest(connector)}
              isLoading={isTesting}
              disabled={isTesting}
            >
              <RefreshCw className="w-3 h-3 mr-1" />
              Test
            </Button>
            {(canEdit || canDelete || (isSuperAdmin && isSystem)) && (
              <Dropdown>
                <DropdownTrigger asChild>
                  <Button variant="ghost" size="xs" iconOnly leftIcon={<MoreVertical className="w-4 h-4" />} aria-label="More options" />
                </DropdownTrigger>
                <DropdownMenu align="right">
                  {canEdit && (
                    <DropdownItem onClick={() => openEditModal(connector)}>
                      <Pencil className="w-4 h-4 mr-2" />
                      Edit
                    </DropdownItem>
                  )}
                  {canEdit && (
                    <DropdownItem onClick={() => handleToggle(connector)}>
                      {connector.isEnabled ? (
                        <>
                          <X className="w-4 h-4 mr-2" />
                          Disable
                        </>
                      ) : (
                        <>
                          <Check className="w-4 h-4 mr-2" />
                          Enable
                        </>
                      )}
                    </DropdownItem>
                  )}
                  <DropdownItem onClick={() => {
                    setUsageConnector(connector);
                    setUsagePage(1);
                  }}>
                    <BarChart3 className="w-4 h-4 mr-2" />
                    View Usage
                  </DropdownItem>
                  {isSuperAdmin && isSystem && (
                    <DropdownItem onClick={() => setAccessConnector(connector)}>
                      <Shield className="w-4 h-4 mr-2" />
                      Tenant Access
                    </DropdownItem>
                  )}
                  {canDelete && (
                    <DropdownItem
                      destructive
                      onClick={() => setDeletingConnector(connector)}
                    >
                      <Trash2 className="w-4 h-4 mr-2" />
                      Delete
                    </DropdownItem>
                  )}
                </DropdownMenu>
              </Dropdown>
            )}
          </div>
        </td>
      </tr>
    );
  };

  return (
    <div className="p-4 sm:p-6 space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-semibold text-text-primary">
            Connectors Hub
          </h1>
          <p className="text-sm text-text-secondary mt-1">
            Manage external service integrations for AI and storage
          </p>
        </div>
        <Button variant="primary" size="sm" onClick={() => setIsCreateModalOpen(true)}>
          <Plus className="w-4 h-4 mr-2" />
          Add Connector
        </Button>
      </div>

      {/* Tenant context info for SUPER_ADMIN */}
      {isSuperAdmin && selectedTenantId && (
        <div className="mb-4 text-sm text-text-secondary">
          Showing connectors for selected tenant. System connectors are always visible.
        </div>
      )}

      {/* Filters */}
      <div className="flex flex-wrap gap-3">
        <select
          value={typeFilter}
          onChange={(e) => {
            setTypeFilter(e.target.value as ConnectorType | '');
            setPage(1);
          }}
          className="input input-sm w-40"
        >
          <option value="">All Types</option>
          <option value="AI_PROVIDER">AI Provider</option>
          <option value="STORAGE">Storage</option>
        </select>
        <select
          value={providerFilter}
          onChange={(e) => {
            setProviderFilter(e.target.value as ConnectorProvider | '');
            setPage(1);
          }}
          className="input input-sm w-40"
        >
          <option value="">All Providers</option>
          <option value="OPENAI">OpenAI</option>
          <option value="ANTHROPIC">Anthropic</option>
          <option value="GOOGLE">Google AI</option>
          <option value="ONEDRIVE">OneDrive</option>
          <option value="SHAREPOINT">SharePoint</option>
        </select>
      </div>

      {/* Connectors List */}
      {isLoading ? (
        <div className="text-center py-12 text-text-muted">Loading connectors...</div>
      ) : !connectorsData?.connectors.length ? (
        <div className="text-center py-12">
          <Zap className="w-12 h-12 mx-auto text-text-muted mb-4" />
          <p className="text-text-secondary">No connectors configured yet</p>
          <p className="text-sm text-text-muted mt-1">
            Add a connector to enable AI features and storage integrations
          </p>
        </div>
      ) : (
        <div className="space-y-6">
          {/* AI Providers */}
          {(connectorsByType['AI_PROVIDER']?.length ?? 0) > 0 && (
            <div className="card">
              <div className="p-4 border-b border-border-primary">
                <h2 className="font-medium text-text-primary flex items-center gap-2">
                  <Brain className="w-5 h-5 text-oak-light" />
                  AI Providers
                </h2>
              </div>
              {/* Mobile Card View */}
              <div className="md:hidden p-4 space-y-3">
                {connectorsByType['AI_PROVIDER']?.map(renderConnectorCard)}
              </div>
              {/* Desktop Table View */}
              <div className="hidden md:block overflow-x-auto">
                <table className="w-full min-w-[800px]">
                  <thead>
                    <tr className="border-b border-border-primary bg-bg-tertiary">
                      <th className="px-4 py-2 text-left text-xs font-medium text-text-secondary uppercase tracking-wider" style={{ width: '22%' }}>
                        Provider
                      </th>
                      <th className="px-4 py-2 text-left text-xs font-medium text-text-secondary uppercase tracking-wider" style={{ width: '12%' }}>
                        Scope
                      </th>
                      <th className="px-4 py-2 text-left text-xs font-medium text-text-secondary uppercase tracking-wider" style={{ width: '12%' }}>
                        Status
                      </th>
                      <th className="px-4 py-2 text-left text-xs font-medium text-text-secondary uppercase tracking-wider" style={{ width: '10%' }}>
                        Test
                      </th>
                      <th className="px-4 py-2 text-left text-xs font-medium text-text-secondary uppercase tracking-wider" style={{ width: '10%' }}>
                        Calls
                      </th>
                      <th className="px-4 py-2 text-left text-xs font-medium text-text-secondary uppercase tracking-wider" style={{ width: '14%' }}>
                        Last Used
                      </th>
                      <th className="px-4 py-2 text-left text-xs font-medium text-text-secondary uppercase tracking-wider" style={{ width: '20%' }}>
                        Actions
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border-primary">
                    {connectorsByType['AI_PROVIDER']?.map(renderConnectorRow)}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Storage */}
          {(connectorsByType['STORAGE']?.length ?? 0) > 0 && (
            <div className="card">
              <div className="p-4 border-b border-border-primary">
                <h2 className="font-medium text-text-primary flex items-center gap-2">
                  <Cloud className="w-5 h-5 text-sky-500" />
                  Storage
                </h2>
              </div>
              {/* Mobile Card View */}
              <div className="md:hidden p-4 space-y-3">
                {connectorsByType['STORAGE']?.map(renderConnectorCard)}
              </div>
              {/* Desktop Table View */}
              <div className="hidden md:block overflow-x-auto">
                <table className="w-full min-w-[800px]">
                  <thead>
                    <tr className="border-b border-border-primary bg-bg-tertiary">
                      <th className="px-4 py-2 text-left text-xs font-medium text-text-secondary uppercase tracking-wider" style={{ width: '22%' }}>
                        Provider
                      </th>
                      <th className="px-4 py-2 text-left text-xs font-medium text-text-secondary uppercase tracking-wider" style={{ width: '12%' }}>
                        Scope
                      </th>
                      <th className="px-4 py-2 text-left text-xs font-medium text-text-secondary uppercase tracking-wider" style={{ width: '12%' }}>
                        Status
                      </th>
                      <th className="px-4 py-2 text-left text-xs font-medium text-text-secondary uppercase tracking-wider" style={{ width: '10%' }}>
                        Test
                      </th>
                      <th className="px-4 py-2 text-left text-xs font-medium text-text-secondary uppercase tracking-wider" style={{ width: '10%' }}>
                        Calls
                      </th>
                      <th className="px-4 py-2 text-left text-xs font-medium text-text-secondary uppercase tracking-wider" style={{ width: '14%' }}>
                        Last Used
                      </th>
                      <th className="px-4 py-2 text-left text-xs font-medium text-text-secondary uppercase tracking-wider" style={{ width: '20%' }}>
                        Actions
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border-primary">
                    {connectorsByType['STORAGE']?.map(renderConnectorRow)}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Create Modal */}
      <Modal
        isOpen={isCreateModalOpen}
        onClose={() => {
          setIsCreateModalOpen(false);
          setCreateForm(INITIAL_CREATE_FORM);
          setFormError('');
        }}
        title="Add Connector"
        size="md"
      >
        <form onSubmit={handleCreate}>
          <ModalBody>
            {formError && (
              <Alert variant="error" className="mb-4">
                {formError}
              </Alert>
            )}
            <div className="space-y-4">
              {/* Scope (SUPER_ADMIN only) */}
              {isSuperAdmin && (
                <div>
                  <label className="label">Scope</label>
                  <select
                    value={createForm.tenantId ?? 'system'}
                    onChange={(e) =>
                      setCreateForm({
                        ...createForm,
                        tenantId: e.target.value === 'system' ? null : e.target.value,
                      })
                    }
                    className="input input-sm w-full"
                  >
                    <option value="system">System (available to all tenants)</option>
                    {activeTenantId && (
                      <option value={activeTenantId}>Current Tenant Only</option>
                    )}
                  </select>
                </div>
              )}

              {/* Type */}
              <div>
                <label className="label">Type</label>
                <select
                  value={createForm.type}
                  onChange={(e) => {
                    const type = e.target.value as ConnectorType;
                    const providers = getProvidersForType(type);
                    setCreateForm({
                      ...createForm,
                      type,
                      provider: providers[0],
                      credentials: {},
                    });
                  }}
                  className="input input-sm w-full"
                >
                  <option value="AI_PROVIDER">AI Provider</option>
                  <option value="STORAGE">Storage</option>
                </select>
              </div>

              {/* Provider */}
              <div>
                <label className="label">Provider</label>
                <select
                  value={createForm.provider}
                  onChange={(e) =>
                    setCreateForm({
                      ...createForm,
                      provider: e.target.value as ConnectorProvider,
                      credentials: {},
                    })
                  }
                  className="input input-sm w-full"
                >
                  {getProvidersForType(createForm.type).map((p) => (
                    <option key={p} value={p}>
                      {getProviderDisplayName(p)}
                    </option>
                  ))}
                </select>
              </div>

              {/* Name */}
              <FormInput
                label="Display Name"
                value={createForm.name}
                onChange={(e) => setCreateForm({ ...createForm, name: e.target.value })}
                placeholder={`e.g., Production ${getProviderDisplayName(createForm.provider)}`}
                inputSize="sm"
              />

              {/* Credentials */}
              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <label className="label mb-0">Credentials</label>
                  {(createForm.provider === 'SHAREPOINT' || createForm.provider === 'ONEDRIVE') && (
                    <button
                      type="button"
                      onClick={() => setShowSetupGuide(createForm.provider as 'SHAREPOINT' | 'ONEDRIVE')}
                      className="text-text-muted hover:text-oak-light transition-colors"
                      title="Setup Guide"
                    >
                      <HelpCircle className="w-4 h-4" />
                    </button>
                  )}
                </div>
                {getCredentialFields(createForm.provider).map((field) => (
                  <div key={field.key} className="relative">
                    <FormInput
                      label={field.label}
                      type={
                        field.type === 'password' && !showCredentials[field.key]
                          ? 'password'
                          : 'text'
                      }
                      value={createForm.credentials[field.key] || ''}
                      onChange={(e) =>
                        setCreateForm({
                          ...createForm,
                          credentials: {
                            ...createForm.credentials,
                            [field.key]: e.target.value,
                          },
                        })
                      }
                      placeholder={field.required ? 'Required' : 'Optional'}
                      inputSize="sm"
                    />
                    {field.type === 'password' && (
                      <button
                        type="button"
                        onClick={() => toggleCredentialVisibility(field.key)}
                        className="absolute right-3 top-8 text-text-muted hover:text-text-secondary"
                      >
                        {showCredentials[field.key] ? (
                          <EyeOff className="w-4 h-4" />
                        ) : (
                          <Eye className="w-4 h-4" />
                        )}
                      </button>
                    )}
                  </div>
                ))}
              </div>

              {/* Options */}
              <div className="space-y-3">
                {/* Enabled Toggle */}
                <div className="flex items-center justify-between p-3 rounded-lg border border-border-primary bg-bg-tertiary">
                  <div className="flex flex-col">
                    <span className="text-sm font-medium text-text-primary">Enabled</span>
                    <span className="text-xs text-text-muted">
                      {createForm.isEnabled ? 'Connector is active and can be used' : 'Connector is disabled'}
                    </span>
                  </div>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={createForm.isEnabled}
                    onClick={() => setCreateForm({ ...createForm, isEnabled: !createForm.isEnabled })}
                    className={cn(
                      'relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-oak-primary focus:ring-offset-2',
                      createForm.isEnabled ? 'bg-oak-primary border-oak-primary' : 'bg-gray-300 border-gray-300 dark:bg-gray-600 dark:border-gray-600'
                    )}
                  >
                    <span
                      className={cn(
                        'pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-md transition duration-200 ease-in-out',
                        createForm.isEnabled ? 'translate-x-5' : 'translate-x-0'
                      )}
                    />
                  </button>
                </div>

                {/* Default Toggle */}
                <div className="flex items-center justify-between p-3 rounded-lg border border-border-primary bg-bg-tertiary">
                  <div className="flex flex-col">
                    <span className="text-sm font-medium text-text-primary">Set as default</span>
                    <span className="text-xs text-text-muted">
                      {createForm.isDefault ? 'This is the default connector for its type' : 'Not the default connector'}
                    </span>
                  </div>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={createForm.isDefault}
                    onClick={() => setCreateForm({ ...createForm, isDefault: !createForm.isDefault })}
                    className={cn(
                      'relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-oak-primary focus:ring-offset-2',
                      createForm.isDefault ? 'bg-oak-primary border-oak-primary' : 'bg-gray-300 border-gray-300 dark:bg-gray-600 dark:border-gray-600'
                    )}
                  >
                    <span
                      className={cn(
                        'pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-md transition duration-200 ease-in-out',
                        createForm.isDefault ? 'translate-x-5' : 'translate-x-0'
                      )}
                    />
                  </button>
                </div>
              </div>
            </div>
          </ModalBody>
          <ModalFooter>
            <Button
              variant="secondary"
              onClick={() => {
                setIsCreateModalOpen(false);
                setCreateForm(INITIAL_CREATE_FORM);
                setFormError('');
              }}
            >
              Cancel
            </Button>
            <Button
              variant="primary"
              type="submit"
              isLoading={createMutation.isPending}
            >
              Create Connector
            </Button>
          </ModalFooter>
        </form>
      </Modal>

      {/* Edit Modal */}
      <Modal
        isOpen={!!editingConnector}
        onClose={() => {
          setEditingConnector(null);
          setFormError('');
        }}
        title={`Edit ${editingConnector?.name}`}
        size="md"
      >
        <form onSubmit={handleUpdate}>
          <ModalBody>
            {formError && (
              <Alert variant="error" className="mb-4">
                {formError}
              </Alert>
            )}
            <div className="space-y-4">
              {/* Name */}
              <FormInput
                label="Display Name"
                value={editForm.name}
                onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                inputSize="sm"
              />

              {/* Credentials */}
              {editingConnector && (
                <div className="space-y-3">
                  <div className="flex items-center gap-2">
                    <label className="label mb-0">
                      Credentials{' '}
                      <span className="text-text-muted font-normal">
                        (leave blank to keep current)
                      </span>
                    </label>
                    {(editingConnector.provider === 'SHAREPOINT' || editingConnector.provider === 'ONEDRIVE') && (
                      <button
                        type="button"
                        onClick={() => setShowSetupGuide(editingConnector.provider as 'SHAREPOINT' | 'ONEDRIVE')}
                        className="text-text-muted hover:text-oak-light transition-colors"
                        title="Setup Guide"
                      >
                        <HelpCircle className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                  {getCredentialFields(editingConnector.provider).map((field) => (
                    <div key={field.key} className="relative">
                      <FormInput
                        label={field.label}
                        type={
                          field.type === 'password' && !showCredentials[field.key]
                            ? 'password'
                            : 'text'
                        }
                        value={editForm.credentials[field.key] || ''}
                        onChange={(e) =>
                          setEditForm({
                            ...editForm,
                            credentials: {
                              ...editForm.credentials,
                              [field.key]: e.target.value,
                            },
                          })
                        }
                        placeholder={
                          editingConnector.credentialsMasked
                            ? 'Hidden (enter new value to change)'
                            : 'Leave blank to keep current'
                        }
                        inputSize="sm"
                      />
                      {field.type === 'password' && (
                        <button
                          type="button"
                          onClick={() => toggleCredentialVisibility(field.key)}
                          className="absolute right-3 top-8 text-text-muted hover:text-text-secondary"
                        >
                          {showCredentials[field.key] ? (
                            <EyeOff className="w-4 h-4" />
                          ) : (
                            <Eye className="w-4 h-4" />
                          )}
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              )}

              {/* Options */}
              <div className="space-y-3">
                {/* Enabled Toggle */}
                <div className="flex items-center justify-between p-3 rounded-lg border border-border-primary bg-bg-tertiary">
                  <div className="flex flex-col">
                    <span className="text-sm font-medium text-text-primary">Enabled</span>
                    <span className="text-xs text-text-muted">
                      {editForm.isEnabled ? 'Connector is active and can be used' : 'Connector is disabled'}
                    </span>
                  </div>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={editForm.isEnabled}
                    onClick={() => setEditForm({ ...editForm, isEnabled: !editForm.isEnabled })}
                    className={cn(
                      'relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-oak-primary focus:ring-offset-2',
                      editForm.isEnabled ? 'bg-oak-primary border-oak-primary' : 'bg-gray-300 border-gray-300 dark:bg-gray-600 dark:border-gray-600'
                    )}
                  >
                    <span
                      className={cn(
                        'pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-md transition duration-200 ease-in-out',
                        editForm.isEnabled ? 'translate-x-5' : 'translate-x-0'
                      )}
                    />
                  </button>
                </div>

                {/* Default Toggle */}
                <div className="flex items-center justify-between p-3 rounded-lg border border-border-primary bg-bg-tertiary">
                  <div className="flex flex-col">
                    <span className="text-sm font-medium text-text-primary">Set as default</span>
                    <span className="text-xs text-text-muted">
                      {editForm.isDefault ? 'This is the default connector for its type' : 'Not the default connector'}
                    </span>
                  </div>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={editForm.isDefault}
                    onClick={() => setEditForm({ ...editForm, isDefault: !editForm.isDefault })}
                    className={cn(
                      'relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-oak-primary focus:ring-offset-2',
                      editForm.isDefault ? 'bg-oak-primary border-oak-primary' : 'bg-gray-300 border-gray-300 dark:bg-gray-600 dark:border-gray-600'
                    )}
                  >
                    <span
                      className={cn(
                        'pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-md transition duration-200 ease-in-out',
                        editForm.isDefault ? 'translate-x-5' : 'translate-x-0'
                      )}
                    />
                  </button>
                </div>
              </div>
            </div>
          </ModalBody>
          <ModalFooter>
            <Button
              variant="secondary"
              onClick={() => {
                setEditingConnector(null);
                setFormError('');
              }}
            >
              Cancel
            </Button>
            <Button
              variant="primary"
              type="submit"
              isLoading={updateMutation.isPending}
            >
              Save Changes
            </Button>
          </ModalFooter>
        </form>
      </Modal>

      {/* Delete Confirmation */}
      <ConfirmDialog
        isOpen={!!deletingConnector}
        onClose={() => setDeletingConnector(null)}
        onConfirm={handleDelete}
        title="Delete Connector"
        description={`Are you sure you want to delete "${deletingConnector?.name}"? This will disable the integration and cannot be undone.`}
        confirmLabel="Delete"
        variant="danger"
        requireReason
        reasonLabel="Reason for deletion"
        reasonMinLength={10}
        isLoading={deleteMutation.isPending}
      />

      {/* Tenant Access Modal */}
      {accessConnector && (
        <TenantAccessModal
          connector={accessConnector}
          onClose={() => setAccessConnector(null)}
        />
      )}

      {/* Setup Guide Modal */}
      {showSetupGuide && (
        <SetupGuideModal
          provider={showSetupGuide}
          onClose={() => setShowSetupGuide(null)}
        />
      )}

      {/* Usage Modal */}
      {usageConnector && (
        <Modal
          isOpen
          onClose={() => setUsageConnector(null)}
          title={`Usage: ${usageConnector.name}`}
          size="6xl"
        >
          <ModalBody>
            {/* Stats Summary */}
            {usageData?.stats && (
              <div className="grid grid-cols-1 xs:grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
                <div className="bg-bg-tertiary rounded-lg p-3">
                  <div className="text-xs text-text-muted uppercase tracking-wide">Total Calls</div>
                  <div className="text-xl font-semibold text-text-primary mt-1">
                    {usageData.stats.totalCalls.toLocaleString()}
                  </div>
                  <div className="text-xs text-text-secondary mt-1">
                    {usageData.stats.successfulCalls} successful, {usageData.stats.failedCalls} failed
                  </div>
                </div>
                <div className="bg-bg-tertiary rounded-lg p-3">
                  <div className="text-xs text-text-muted uppercase tracking-wide">Total Cost</div>
                  <div className="text-xl font-semibold text-text-primary mt-1">
                    {formatCost(usageData.stats.totalCostUsd)}
                  </div>
                </div>
                <div className="bg-bg-tertiary rounded-lg p-3">
                  <div className="text-xs text-text-muted uppercase tracking-wide">Total Tokens</div>
                  <div className="text-xl font-semibold text-text-primary mt-1">
                    {formatTokens(usageData.stats.totalTokens)}
                  </div>
                </div>
                <div className="bg-bg-tertiary rounded-lg p-3">
                  <div className="text-xs text-text-muted uppercase tracking-wide">Avg Latency</div>
                  <div className="text-xl font-semibold text-text-primary mt-1">
                    {formatLatency(usageData.stats.avgLatencyMs)}
                  </div>
                </div>
              </div>
            )}

            {/* Date Range Filter */}
            <div className="flex flex-wrap items-center gap-3 mb-4">
              <div className="flex items-center gap-2">
                <Calendar className="w-4 h-4 text-text-muted" />
                <input
                  type="date"
                  value={usageDateRange.start}
                  onChange={(e) => {
                    setUsageDateRange((prev) => ({ ...prev, start: e.target.value }));
                    setUsagePage(1);
                  }}
                  className="input input-sm"
                />
                <span className="text-text-muted">to</span>
                <input
                  type="date"
                  value={usageDateRange.end}
                  onChange={(e) => {
                    setUsageDateRange((prev) => ({ ...prev, end: e.target.value }));
                    setUsagePage(1);
                  }}
                  className="input input-sm"
                />
              </div>
              <Button
                variant="secondary"
                size="xs"
                onClick={() => {
                  if (usageParams) {
                    exportMutation.mutate(usageParams);
                  }
                }}
                isLoading={exportMutation.isPending}
              >
                <Download className="w-3 h-3 mr-1" />
                Export CSV
              </Button>
            </div>

            {/* Usage Logs Table */}
            {usageLoading ? (
              <div className="text-center py-8 text-text-muted">Loading usage logs...</div>
            ) : !usageData?.logs.length ? (
              <div className="text-center py-8 text-text-muted">
                No usage logs found for this date range
              </div>
            ) : (
              <>
                <div className="overflow-x-auto">
                  <table className="table w-full text-sm">
                    <thead>
                      <tr>
                        <th className="text-left">Date</th>
                        <th className="text-left">Model</th>
                        <th className="text-left">Operation</th>
                        <th className="text-right">Tokens</th>
                        <th className="text-right">Cost</th>
                        <th className="text-right">Latency</th>
                        <th className="text-center">Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {usageData.logs.map((log) => (
                        <tr key={log.id} className="hover:bg-bg-tertiary/50">
                          <td className="text-text-secondary">
                            {new Date(log.createdAt).toLocaleString()}
                          </td>
                          <td className="text-text-primary">{log.model}</td>
                          <td className="text-text-secondary">{log.operation || 'N/A'}</td>
                          <td className="text-right text-text-secondary">
                            {formatTokens(log.totalTokens)}
                          </td>
                          <td className="text-right text-text-primary font-medium">
                            {formatCost(log.costUsd)}
                          </td>
                          <td className="text-right text-text-secondary">
                            {formatLatency(log.latencyMs)}
                          </td>
                          <td className="text-center">
                            {log.success ? (
                              <span className="inline-flex items-center gap-1 text-xs text-green-600">
                                <Check className="w-3 h-3" />
                              </span>
                            ) : (
                              <span
                                className="inline-flex items-center gap-1 text-xs text-red-600"
                                title={log.errorMessage || 'Failed'}
                              >
                                <X className="w-3 h-3" />
                              </span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {/* Pagination */}
                {usageData.totalPages > 1 && (
                  <div className="flex items-center justify-between mt-4 pt-4 border-t border-border-primary">
                    <div className="text-sm text-text-muted">
                      Page {usageData.page} of {usageData.totalPages} ({usageData.total} total)
                    </div>
                    <div className="flex items-center gap-2">
                      <Button
                        variant="secondary"
                        size="xs"
                        onClick={() => setUsagePage((p) => Math.max(1, p - 1))}
                        disabled={usagePage <= 1}
                      >
                        <ChevronLeft className="w-4 h-4" />
                      </Button>
                      <Button
                        variant="secondary"
                        size="xs"
                        onClick={() => setUsagePage((p) => Math.min(usageData.totalPages, p + 1))}
                        disabled={usagePage >= usageData.totalPages}
                      >
                        <ChevronRight className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>
                )}
              </>
            )}
          </ModalBody>
          <ModalFooter>
            <Button variant="secondary" onClick={() => setUsageConnector(null)}>
              Close
            </Button>
          </ModalFooter>
        </Modal>
      )}
    </div>
  );
}

// ============================================================================
// Tenant Access Modal Component
// ============================================================================

interface TenantAccessModalProps {
  connector: Connector;
  onClose: () => void;
}

function TenantAccessModal({ connector, onClose }: TenantAccessModalProps) {
  const { success, error: showError } = useToast();
  const { data: accessData, isLoading } = useTenantAccess(connector.id);
  const updateMutation = useUpdateTenantAccess(connector.id);

  const [localAccess, setLocalAccess] = useState<
    Array<{ tenantId: string; tenantName: string; isEnabled: boolean }>
  >([]);

  useEffect(() => {
    if (accessData?.tenantAccess) {
      setLocalAccess(accessData.tenantAccess);
    }
  }, [accessData]);

  const handleToggle = (tenantId: string) => {
    setLocalAccess((prev) =>
      prev.map((a) =>
        a.tenantId === tenantId ? { ...a, isEnabled: !a.isEnabled } : a
      )
    );
  };

  const handleSave = async () => {
    try {
      await updateMutation.mutateAsync(
        localAccess.map(({ tenantId, isEnabled }) => ({ tenantId, isEnabled }))
      );
      success('Tenant access updated');
      onClose();
    } catch (err) {
      showError(err instanceof Error ? err.message : 'Failed to update access');
    }
  };

  return (
    <Modal isOpen onClose={onClose} title={`Tenant Access: ${connector.name}`} size="md">
      <ModalBody>
        {isLoading ? (
          <div className="text-center py-8 text-text-muted">Loading tenants...</div>
        ) : !localAccess.length ? (
          <div className="text-center py-8 text-text-muted">
            No active tenants found
          </div>
        ) : (
          <div className="space-y-2 max-h-[400px] overflow-y-auto">
            <p className="text-sm text-text-secondary mb-4">
              Control which tenants can use this system connector. Disabled tenants
              will not have access to this integration.
            </p>
            {localAccess.map((access) => (
              <div
                key={access.tenantId}
                className="flex items-center justify-between p-3 rounded-lg bg-bg-tertiary"
              >
                <span className="text-sm text-text-primary">{access.tenantName}</span>
                <Checkbox
                  checked={access.isEnabled}
                  onChange={() => handleToggle(access.tenantId)}
                  size="sm"
                />
              </div>
            ))}
          </div>
        )}
      </ModalBody>
      <ModalFooter>
        <Button variant="secondary" onClick={onClose}>
          Cancel
        </Button>
        <Button
          variant="primary"
          onClick={handleSave}
          isLoading={updateMutation.isPending}
          disabled={isLoading}
        >
          Save Changes
        </Button>
      </ModalFooter>
    </Modal>
  );
}

// ============================================================================
// Setup Guide Modal Component
// ============================================================================

interface SetupGuideModalProps {
  provider: 'SHAREPOINT' | 'ONEDRIVE';
  onClose: () => void;
}

function SetupGuideModal({ provider, onClose }: SetupGuideModalProps) {
  const isSharePoint = provider === 'SHAREPOINT';
  const title = isSharePoint ? 'SharePoint Setup Guide' : 'OneDrive Setup Guide';

  return (
    <Modal isOpen onClose={onClose} title={title} size="lg">
      <ModalBody>
        <div className="space-y-6 text-sm">
          {/* Step 1: Register Azure AD Application */}
          <section>
            <h3 className="font-semibold text-text-primary mb-2 flex items-center gap-2">
              <span className="w-6 h-6 rounded-full bg-oak-light text-white flex items-center justify-center text-xs">1</span>
              Register Azure AD Application
            </h3>
            <ol className="list-decimal list-inside space-y-1 text-text-secondary ml-8">
              <li>
                Go to{' '}
                <a
                  href="https://portal.azure.com/#view/Microsoft_AAD_RegisteredApps/ApplicationsListBlade"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-oak-light hover:underline inline-flex items-center gap-1"
                >
                  Azure Portal → App registrations
                  <ExternalLink className="w-3 h-3" />
                </a>
              </li>
              <li>Click <strong>New registration</strong></li>
              <li>Enter a name (e.g., &quot;Oakcloud {isSharePoint ? 'SharePoint' : 'OneDrive'} Connector&quot;)</li>
              <li>Select <strong>Accounts in this organizational directory only</strong></li>
              <li>Click <strong>Register</strong></li>
            </ol>
          </section>

          {/* Step 2: Get Application IDs */}
          <section>
            <h3 className="font-semibold text-text-primary mb-2 flex items-center gap-2">
              <span className="w-6 h-6 rounded-full bg-oak-light text-white flex items-center justify-center text-xs">2</span>
              Get Application IDs
            </h3>
            <div className="ml-8 text-text-secondary">
              <p className="mb-2">From the app&apos;s <strong>Overview</strong> page, copy:</p>
              <ul className="list-disc list-inside space-y-1">
                <li><strong>Application (client) ID</strong> → Client ID</li>
                <li><strong>Directory (tenant) ID</strong> → Microsoft Tenant ID</li>
              </ul>
            </div>
          </section>

          {/* Step 3: Create Client Secret */}
          <section>
            <h3 className="font-semibold text-text-primary mb-2 flex items-center gap-2">
              <span className="w-6 h-6 rounded-full bg-oak-light text-white flex items-center justify-center text-xs">3</span>
              Create Client Secret
            </h3>
            <ol className="list-decimal list-inside space-y-1 text-text-secondary ml-8">
              <li>Go to <strong>Certificates & secrets</strong> → <strong>Client secrets</strong></li>
              <li>Click <strong>New client secret</strong></li>
              <li>Add description and select expiry (recommend 24 months)</li>
              <li>Copy the <strong>Value</strong> immediately (shown only once!) → Client Secret</li>
            </ol>
          </section>

          {/* Step 4: Configure API Permissions */}
          <section>
            <h3 className="font-semibold text-text-primary mb-2 flex items-center gap-2">
              <span className="w-6 h-6 rounded-full bg-oak-light text-white flex items-center justify-center text-xs">4</span>
              Configure API Permissions
            </h3>
            <ol className="list-decimal list-inside space-y-1 text-text-secondary ml-8">
              <li>Go to <strong>API permissions</strong> → <strong>Add a permission</strong></li>
              <li>Select <strong>Microsoft Graph</strong> → <strong>Application permissions</strong></li>
              <li>
                Add these permissions:
                <ul className="list-disc list-inside ml-4 mt-1">
                  {isSharePoint ? (
                    <>
                      <li><code className="bg-bg-tertiary px-1 rounded">Sites.ReadWrite.All</code></li>
                      <li><code className="bg-bg-tertiary px-1 rounded">Files.ReadWrite.All</code></li>
                    </>
                  ) : (
                    <>
                      <li><code className="bg-bg-tertiary px-1 rounded">Files.ReadWrite.All</code></li>
                    </>
                  )}
                </ul>
              </li>
              <li>Click <strong>Grant admin consent</strong> for your organization</li>
            </ol>
          </section>

          {/* Step 5: Get Site ID (SharePoint only) */}
          {isSharePoint && (
            <section>
              <h3 className="font-semibold text-text-primary mb-2 flex items-center gap-2">
                <span className="w-6 h-6 rounded-full bg-oak-light text-white flex items-center justify-center text-xs">5</span>
                Get SharePoint Site ID
              </h3>
              <div className="ml-8 text-text-secondary space-y-2">
                <p>Open this URL in your browser (replace placeholders):</p>
                <code className="block bg-bg-tertiary p-2 rounded text-xs overflow-x-auto">
                  https://graph.microsoft.com/v1.0/sites/&#123;hostname&#125;:/sites/&#123;site-name&#125;
                </code>
                <p className="text-xs text-text-muted">
                  Example: <code className="bg-bg-tertiary px-1 rounded">https://graph.microsoft.com/v1.0/sites/contoso.sharepoint.com:/sites/TeamSite</code>
                </p>
                <p>
                  You can also use{' '}
                  <a
                    href="https://developer.microsoft.com/en-us/graph/graph-explorer"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-oak-light hover:underline inline-flex items-center gap-1"
                  >
                    Graph Explorer
                    <ExternalLink className="w-3 h-3" />
                  </a>
                  {' '}to find your site ID.
                </p>
                <p>Copy the <strong>id</strong> field from the response → SharePoint Site ID</p>
              </div>
            </section>
          )}

          {/* Testing Section */}
          <section className="bg-bg-tertiary rounded-lg p-4">
            <h3 className="font-semibold text-text-primary mb-2">Testing the Connection</h3>
            <p className="text-text-secondary text-xs">
              After entering your credentials, click the <strong>Test</strong> button to verify the connection.
              If it fails, check that:
            </p>
            <ul className="list-disc list-inside text-text-secondary text-xs mt-2 space-y-1">
              <li>Admin consent has been granted for the API permissions</li>
              <li>The client secret has not expired</li>
              {isSharePoint && <li>The Site ID is correct and accessible</li>}
              <li>Your tenant allows application access</li>
            </ul>
          </section>
        </div>
      </ModalBody>
      <ModalFooter>
        <Button variant="secondary" onClick={onClose}>
          Close
        </Button>
        <Button
          variant="primary"
          onClick={() => window.open('https://portal.azure.com/#view/Microsoft_AAD_RegisteredApps/ApplicationsListBlade', '_blank')}
        >
          <ExternalLink className="w-4 h-4 mr-2" />
          Open Azure Portal
        </Button>
      </ModalFooter>
    </Modal>
  );
}
