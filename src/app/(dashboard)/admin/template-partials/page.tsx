'use client';

import { useState, useCallback, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useSession } from '@/hooks/use-auth';
import { Button } from '@/components/ui/button';
import { FormInput } from '@/components/ui/form-input';
import { Modal, ModalBody, ModalFooter } from '@/components/ui/modal';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { Dropdown, DropdownTrigger, DropdownMenu, DropdownItem } from '@/components/ui/dropdown';
import { useActiveTenantId, useTenantSelection } from '@/components/ui/tenant-selector';
import { useToast } from '@/components/ui/toast';
import { Pagination } from '@/components/companies/pagination';
import { RichTextDisplay } from '@/components/ui/rich-text-editor';
import {
  useTemplatePartials,
  useDeletePartial,
  useDuplicatePartial,
  usePartialUsage,
  type TemplatePartialWithRelations,
} from '@/hooks/use-template-partials';
import {
  Plus,
  MoreVertical,
  Pencil,
  Trash2,
  Copy,
  Search,
  FileText,
  Code,
  FileCode,
  ChevronRight,
  Loader2,
  AlertCircle,
  Check,
  X,
  Eye,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { format } from 'date-fns';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';

// ============================================================================
// Types
// ============================================================================

type TabType = 'templates' | 'partials';

interface DocumentTemplate {
  id: string;
  name: string;
  description?: string | null;
  category: string;
  content: string;
  placeholders: PlaceholderDefinition[];
  isActive: boolean;
  version: number;
  createdAt: string;
  updatedAt: string;
  createdBy?: {
    id: string;
    firstName: string;
    lastName: string;
  };
  _count?: {
    generatedDocuments: number;
  };
}

interface PlaceholderDefinition {
  key: string;
  label: string;
  type: 'text' | 'date' | 'number' | 'currency' | 'boolean' | 'list' | 'conditional';
  source: 'company' | 'contact' | 'officer' | 'shareholder' | 'custom' | 'system';
  path?: string;
  defaultValue?: string;
  format?: string;
  required: boolean;
}

interface TemplateSearchResult {
  templates: DocumentTemplate[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

// PartialFormData moved to editor page for full-page editing

const CATEGORIES = [
  { value: 'RESOLUTION', label: 'Resolution' },
  { value: 'CONTRACT', label: 'Contract' },
  { value: 'LETTER', label: 'Letter' },
  { value: 'MINUTES', label: 'Minutes' },
  { value: 'NOTICE', label: 'Notice' },
  { value: 'CERTIFICATE', label: 'Certificate' },
  { value: 'OTHER', label: 'Other' },
];

// ============================================================================
// Template API Functions
// ============================================================================

async function fetchTemplates(
  params: { search?: string; category?: string; page: number; limit: number },
  tenantId?: string
): Promise<TemplateSearchResult> {
  const searchParams = new URLSearchParams();
  if (params.search) searchParams.set('query', params.search);
  if (params.category) searchParams.set('category', params.category);
  searchParams.set('page', params.page.toString());
  searchParams.set('limit', params.limit.toString());
  if (tenantId) searchParams.set('tenantId', tenantId);

  const response = await fetch(`/api/document-templates?${searchParams}`);
  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || 'Failed to fetch templates');
  }
  return response.json();
}

async function createTemplate(
  data: {
    name: string;
    description?: string;
    category: string;
    content: string;
    isActive: boolean;
    tenantId?: string;
  }
): Promise<DocumentTemplate> {
  const response = await fetch('/api/document-templates', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || 'Failed to create template');
  }
  return response.json();
}

async function updateTemplate(
  data: {
    id: string;
    name?: string;
    description?: string;
    category?: string;
    content?: string;
    isActive?: boolean;
    tenantId?: string;
    reason?: string;
  }
): Promise<DocumentTemplate> {
  const { id, tenantId, reason, ...updates } = data;
  const response = await fetch(`/api/document-templates/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...updates, tenantId, reason }),
  });
  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || 'Failed to update template');
  }
  return response.json();
}

async function deleteTemplate(id: string, reason: string, tenantId?: string): Promise<void> {
  const searchParams = new URLSearchParams({ reason });
  if (tenantId) searchParams.set('tenantId', tenantId);
  const response = await fetch(`/api/document-templates/${id}?${searchParams}`, {
    method: 'DELETE',
  });
  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || 'Failed to delete template');
  }
}

async function duplicateTemplate(id: string, name: string, tenantId?: string): Promise<DocumentTemplate> {
  const response = await fetch(`/api/document-templates/${id}/duplicate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, tenantId }),
  });
  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || 'Failed to duplicate template');
  }
  return response.json();
}

// ============================================================================
// Helper Components
// ============================================================================

function UsageCount({ count }: { count: number }) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs',
        count > 0
          ? 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300'
          : 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400'
      )}
    >
      <FileCode className="w-3 h-3" />
      {count} template{count !== 1 ? 's' : ''}
    </span>
  );
}

function PartialSyntax({ name }: { name: string }) {
  return (
    <code className="px-1.5 py-0.5 bg-gray-100 dark:bg-gray-800 rounded text-xs font-mono text-accent-primary">
      {'{{>'} {name} {'}}'}
    </code>
  );
}

// ============================================================================
// Document Templates Tab
// ============================================================================

function DocumentTemplatesTab({
  activeTenantId,
  canManage,
}: {
  activeTenantId: string;
  canManage: boolean;
}) {
  const router = useRouter();
  const { success, error: showError } = useToast();
  const queryClient = useQueryClient();

  // List state
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('');
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(20);

  // Modal states (only for view, delete, duplicate - create/edit use full page)
  const [viewingTemplate, setViewingTemplate] = useState<DocumentTemplate | null>(null);
  const [deletingTemplate, setDeletingTemplate] = useState<DocumentTemplate | null>(null);
  const [duplicatingTemplate, setDuplicatingTemplate] = useState<DocumentTemplate | null>(null);

  // Form state for duplicate modal
  const [duplicateName, setDuplicateName] = useState('');

  // Query
  const { data, isLoading, error } = useQuery({
    queryKey: ['document-templates', { search, categoryFilter, page, limit }, activeTenantId],
    queryFn: () => fetchTemplates({ search, category: categoryFilter, page, limit }, activeTenantId),
    enabled: !!activeTenantId,
  });

  // Mutations
  const deleteMutation = useMutation({
    mutationFn: ({ id, reason }: { id: string; reason: string }) =>
      deleteTemplate(id, reason, activeTenantId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['document-templates'] });
      success('Template deleted successfully');
      setDeletingTemplate(null);
    },
    onError: (err: Error) => showError(err.message),
  });

  const duplicateMutation = useMutation({
    mutationFn: ({ id, name }: { id: string; name: string }) =>
      duplicateTemplate(id, name, activeTenantId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['document-templates'] });
      success('Template duplicated successfully');
      setDuplicatingTemplate(null);
      setDuplicateName('');
    },
    onError: (err: Error) => showError(err.message),
  });

  const toggleActiveMutation = useMutation({
    mutationFn: ({ id, isActive }: { id: string; isActive: boolean }) =>
      updateTemplate({
        id,
        isActive,
        tenantId: activeTenantId,
        reason: isActive ? 'Activated template' : 'Deactivated template',
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['document-templates'] });
      success('Template status updated');
    },
    onError: (err: Error) => showError(err.message),
  });

  // Handlers - Navigate to editor page for create/edit
  const openCreateModal = () => {
    router.push('/admin/template-partials/editor');
  };

  const openEditModal = (template: DocumentTemplate) => {
    router.push(`/admin/template-partials/editor?id=${template.id}`);
  };

  const handleDelete = (reason?: string) => {
    if (!deletingTemplate) return;
    deleteMutation.mutate({ id: deletingTemplate.id, reason: reason || 'Deleted by user' });
  };

  const handleDuplicate = () => {
    if (!duplicatingTemplate) return;
    const name = duplicateName.trim() || `Copy of ${duplicatingTemplate.name}`;
    duplicateMutation.mutate({ id: duplicatingTemplate.id, name });
  };

  const openDuplicateDialog = (template: DocumentTemplate) => {
    setDuplicatingTemplate(template);
    setDuplicateName(`Copy of ${template.name}`);
  };

  const getCategoryLabel = (category: string) => {
    return CATEGORIES.find((c) => c.value === category)?.label || category;
  };

  const templates = data?.templates || [];

  return (
    <div>
      {/* Filters */}
      <div className="flex flex-col sm:flex-row sm:items-center gap-3 mb-6">
        <div className="flex-1 max-w-md relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-muted" />
          <input
            type="text"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
            placeholder="Search templates..."
            className="w-full h-9 pl-9 pr-4 border border-border-primary rounded-md bg-background-primary text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-accent-primary/50 text-sm"
          />
        </div>
        <select
          value={categoryFilter}
          onChange={(e) => {
            setCategoryFilter(e.target.value);
            setPage(1);
          }}
          className="h-9 px-3 text-sm border border-border-primary rounded-md bg-background-primary text-text-primary focus:outline-none focus:ring-2 focus:ring-accent-primary/50 w-full sm:w-48"
        >
          <option value="">All Categories</option>
          {CATEGORIES.map((cat) => (
            <option key={cat.value} value={cat.value}>
              {cat.label}
            </option>
          ))}
        </select>
        {canManage && (
          <Button variant="primary" className="h-9" leftIcon={<Plus />} onClick={openCreateModal}>
            New Template
          </Button>
        )}
      </div>

      {/* Loading */}
      {isLoading && (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-6 h-6 animate-spin text-text-muted" />
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="card p-4 border-status-error bg-status-error/5 mb-6">
          <div className="flex items-center gap-3 text-status-error">
            <AlertCircle className="w-5 h-5" />
            <p>{error instanceof Error ? error.message : 'Failed to load templates'}</p>
          </div>
        </div>
      )}

      {/* Empty state */}
      {!isLoading && !error && templates.length === 0 && (
        <div className="flex flex-col items-center justify-center py-12">
          <FileText className="w-12 h-12 mb-3 opacity-50 text-text-muted" />
          <p className="text-sm text-text-muted">
            {search || categoryFilter
              ? 'No templates found matching your search'
              : 'No templates yet'}
          </p>
          {canManage && !search && !categoryFilter && (
            <button
              onClick={openCreateModal}
              className="mt-3 px-4 py-1.5 text-sm text-text-secondary bg-background-tertiary hover:bg-background-elevated rounded-full transition-colors"
            >
              Create your first template
            </button>
          )}
        </div>
      )}

      {/* Templates List */}
      {!isLoading && !error && templates.length > 0 && (
        <div className="space-y-3">
          {templates.map((template) => (
            <div
              key={template.id}
              className="card p-4 hover:border-accent-primary transition-colors"
            >
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <button
                      onClick={() => canManage && openEditModal(template)}
                      className={cn(
                        "font-medium text-text-primary text-left",
                        canManage && "hover:text-accent-primary hover:underline cursor-pointer"
                      )}
                    >
                      {template.name}
                    </button>
                    <span
                      className={cn(
                        'badge text-xs',
                        template.isActive
                          ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300'
                          : 'bg-gray-100 text-gray-600 dark:bg-gray-900/30 dark:text-gray-400'
                      )}
                    >
                      {template.isActive ? 'Active' : 'Inactive'}
                    </span>
                    <span className="badge bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300 text-xs">
                      {getCategoryLabel(template.category)}
                    </span>
                  </div>
                  {template.description && (
                    <p className="text-sm text-text-secondary mt-1 line-clamp-2">
                      {template.description}
                    </p>
                  )}
                  <div className="flex items-center gap-4 mt-2 text-xs text-text-muted">
                    <span>Version {template.version}</span>
                    <span>
                      {template._count?.generatedDocuments || 0} documents generated
                    </span>
                    <span>Updated {format(new Date(template.updatedAt), 'MMM d, yyyy')}</span>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setViewingTemplate(template)}
                    title="Preview template"
                    className="p-1.5 rounded hover:bg-background-tertiary text-text-muted hover:text-text-primary transition-colors"
                  >
                    <Eye className="w-4 h-4" />
                  </button>

                  {canManage && (
                    <Dropdown>
                      <DropdownTrigger asChild>
                        <button className="p-1.5 rounded hover:bg-background-tertiary text-text-muted hover:text-text-primary transition-colors">
                          <MoreVertical className="w-4 h-4" />
                        </button>
                      </DropdownTrigger>
                      <DropdownMenu align="right">
                        <DropdownItem
                          icon={<Pencil className="w-4 h-4" />}
                          onClick={() => openEditModal(template)}
                        >
                          Edit
                        </DropdownItem>
                        <DropdownItem
                          icon={<Copy className="w-4 h-4" />}
                          onClick={() => openDuplicateDialog(template)}
                        >
                          Duplicate
                        </DropdownItem>
                        <DropdownItem
                          icon={template.isActive ? <X className="w-4 h-4" /> : <Check className="w-4 h-4" />}
                          onClick={() =>
                            toggleActiveMutation.mutate({
                              id: template.id,
                              isActive: !template.isActive,
                            })
                          }
                        >
                          {template.isActive ? 'Deactivate' : 'Activate'}
                        </DropdownItem>
                        <DropdownItem
                          icon={<Trash2 className="w-4 h-4" />}
                          destructive
                          onClick={() => setDeletingTemplate(template)}
                        >
                          Delete
                        </DropdownItem>
                      </DropdownMenu>
                    </Dropdown>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Pagination */}
      {data && data.totalPages > 0 && (
        <div className="mt-6">
          <Pagination
            page={data.page}
            totalPages={data.totalPages}
            total={data.total}
            limit={data.limit}
            onPageChange={setPage}
            onLimitChange={(newLimit) => {
              setLimit(newLimit);
              setPage(1);
            }}
          />
        </div>
      )}

      {/* Preview Modal */}
      <Modal
        isOpen={!!viewingTemplate}
        onClose={() => setViewingTemplate(null)}
        title={viewingTemplate?.name || 'Template Preview'}
        size="xl"
      >
        <ModalBody>
          {viewingTemplate && (
            <div className="space-y-4">
              <div className="flex items-center gap-2 flex-wrap">
                <span
                  className={cn(
                    'badge text-xs',
                    viewingTemplate.isActive
                      ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300'
                      : 'bg-gray-100 text-gray-600 dark:bg-gray-900/30 dark:text-gray-400'
                  )}
                >
                  {viewingTemplate.isActive ? 'Active' : 'Inactive'}
                </span>
                <span className="badge bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300 text-xs">
                  {getCategoryLabel(viewingTemplate.category)}
                </span>
                <span className="text-xs text-text-muted">Version {viewingTemplate.version}</span>
              </div>

              {viewingTemplate.description && (
                <p className="text-sm text-text-secondary">{viewingTemplate.description}</p>
              )}

              <div className="border border-border-primary rounded-lg p-4 bg-background-secondary">
                <RichTextDisplay content={viewingTemplate.content} />
              </div>
            </div>
          )}
        </ModalBody>
        <ModalFooter>
          <Button variant="secondary" onClick={() => setViewingTemplate(null)}>
            Close
          </Button>
          {canManage && viewingTemplate && (
            <Button
              variant="primary"
              onClick={() => {
                setViewingTemplate(null);
                openEditModal(viewingTemplate);
              }}
            >
              Edit Template
            </Button>
          )}
        </ModalFooter>
      </Modal>

      {/* Duplicate Modal */}
      <Modal
        isOpen={!!duplicatingTemplate}
        onClose={() => {
          setDuplicatingTemplate(null);
          setDuplicateName('');
        }}
        title="Duplicate Template"
        size="sm"
      >
        <ModalBody>
          <p className="text-sm text-text-secondary mb-4">
            Create a copy of &quot;{duplicatingTemplate?.name}&quot;
          </p>
          <FormInput
            label="New Template Name"
            value={duplicateName}
            onChange={(e) => setDuplicateName(e.target.value)}
            placeholder="Enter name for the copy"
          />
        </ModalBody>
        <ModalFooter>
          <Button
            variant="secondary"
            onClick={() => {
              setDuplicatingTemplate(null);
              setDuplicateName('');
            }}
            disabled={duplicateMutation.isPending}
          >
            Cancel
          </Button>
          <Button
            variant="primary"
            onClick={handleDuplicate}
            isLoading={duplicateMutation.isPending}
          >
            Duplicate
          </Button>
        </ModalFooter>
      </Modal>

      {/* Delete Confirmation */}
      <ConfirmDialog
        isOpen={!!deletingTemplate}
        onClose={() => setDeletingTemplate(null)}
        onConfirm={handleDelete}
        title="Delete Template"
        description={`Are you sure you want to delete "${deletingTemplate?.name}"? This action cannot be undone.`}
        confirmLabel="Delete"
        variant="danger"
        requireReason
        reasonMinLength={10}
        isLoading={deleteMutation.isPending}
      />
    </div>
  );
}

// ============================================================================
// Template Partials Tab
// ============================================================================

function TemplatePartialsTab({
  activeTenantId,
  canManage,
  isSuperAdmin,
}: {
  activeTenantId: string;
  canManage: boolean;
  isSuperAdmin: boolean;
}) {
  const router = useRouter();
  const { success, error: showError } = useToast();

  // Search state
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(20);

  // Modal states (keep duplicate, delete, usage modals - create/edit use full page editor)
  const [isDuplicateOpen, setIsDuplicateOpen] = useState(false);
  const [isDeleteOpen, setIsDeleteOpen] = useState(false);
  const [isUsageOpen, setIsUsageOpen] = useState(false);
  const [selectedPartial, setSelectedPartial] = useState<TemplatePartialWithRelations | null>(null);

  // Form state for duplicate modal
  const [duplicateName, setDuplicateName] = useState('');

  // Queries and mutations
  const { data, isLoading, error } = useTemplatePartials({
    search: search || undefined,
    page,
    limit,
    tenantId: isSuperAdmin ? activeTenantId : undefined,
  });

  // createMutation and updateMutation are now handled by the full-page editor
  const deleteMutation = useDeletePartial();
  const duplicateMutation = useDuplicatePartial();
  const { data: usageData, isLoading: usageLoading } = usePartialUsage(
    isUsageOpen ? selectedPartial?.id || null : null,
    isSuperAdmin ? activeTenantId : undefined
  );

  // Handlers - Navigate to editor page for create/edit (same as templates)
  const openCreate = () => {
    router.push('/admin/template-partials/editor?type=partial');
  };

  const openEdit = (partial: TemplatePartialWithRelations) => {
    router.push(`/admin/template-partials/editor?type=partial&id=${partial.id}`);
  };

  const openDuplicate = (partial: TemplatePartialWithRelations) => {
    setSelectedPartial(partial);
    setDuplicateName(`${partial.name}-copy`);
    setIsDuplicateOpen(true);
  };

  const openDelete = (partial: TemplatePartialWithRelations) => {
    setSelectedPartial(partial);
    setIsDeleteOpen(true);
  };

  const openUsage = (partial: TemplatePartialWithRelations) => {
    setSelectedPartial(partial);
    setIsUsageOpen(true);
  };

  // handleCreate and handleUpdate are now handled by the full-page editor

  const handleDuplicate = async () => {
    if (!selectedPartial) return;
    try {
      await duplicateMutation.mutateAsync({
        id: selectedPartial.id,
        name: duplicateName,
        tenantId: isSuperAdmin ? activeTenantId : undefined,
      });
      success('Partial duplicated successfully');
      setIsDuplicateOpen(false);
    } catch (err) {
      showError(err instanceof Error ? err.message : 'Failed to duplicate partial');
    }
  };

  const handleDelete = async (reason?: string) => {
    if (!selectedPartial) return;
    try {
      await deleteMutation.mutateAsync({
        id: selectedPartial.id,
        reason,
        tenantId: isSuperAdmin ? activeTenantId : undefined,
      });
      success('Partial deleted successfully');
      setIsDeleteOpen(false);
    } catch (err) {
      showError(err instanceof Error ? err.message : 'Failed to delete partial');
    }
  };

  const partials = data?.partials || [];

  return (
    <div>
      {/* Search and Actions */}
      <div className="flex flex-col sm:flex-row sm:items-center gap-3 mb-6">
        <div className="flex-1 max-w-md relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-muted" />
          <input
            type="text"
            placeholder="Search partials..."
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
            className="w-full h-9 pl-9 pr-4 border border-border-primary rounded-md bg-background-primary text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-accent-primary/50 text-sm"
          />
        </div>
        {canManage && (
          <Button variant="primary" className="h-9" leftIcon={<Plus />} onClick={openCreate}>
            New Partial
          </Button>
        )}
      </div>

      {/* Content */}
      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-6 h-6 animate-spin text-text-muted" />
        </div>
      ) : error ? (
        <div className="card p-4 border-status-error bg-status-error/5 mb-6">
          <div className="flex items-center gap-3 text-status-error">
            <AlertCircle className="w-5 h-5" />
            <p>{error instanceof Error ? error.message : 'Failed to load partials'}</p>
          </div>
        </div>
      ) : partials.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-12">
          <Code className="w-12 h-12 mb-3 opacity-50 text-text-muted" />
          <p className="text-sm text-text-muted">
            {search ? 'No partials found matching your search' : 'No partials yet'}
          </p>
          {!search && canManage && (
            <button
              onClick={openCreate}
              className="mt-3 px-4 py-1.5 text-sm text-text-secondary bg-background-tertiary hover:bg-background-elevated rounded-full transition-colors"
            >
              Create your first partial
            </button>
          )}
        </div>
      ) : (
        <>
          {/* Partials List - same style as Templates */}
          <div className="space-y-3">
            {partials.map((partial) => (
              <div
                key={partial.id}
                className="card p-4 hover:border-accent-primary transition-colors"
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <button
                        onClick={() => canManage && openEdit(partial)}
                        className={cn(
                          "font-medium text-text-primary text-left",
                          canManage && "hover:text-accent-primary hover:underline cursor-pointer"
                        )}
                      >
                        {partial.displayName || partial.name}
                      </button>
                      <PartialSyntax name={partial.name} />
                      <UsageCount count={partial._count?.usedInTemplates || 0} />
                    </div>
                    {partial.description && (
                      <p className="text-sm text-text-secondary mt-1 line-clamp-2">
                        {partial.description}
                      </p>
                    )}
                    <div className="flex items-center gap-4 mt-2 text-xs text-text-muted">
                      {partial.createdBy && (
                        <span>
                          Created by {partial.createdBy.firstName} {partial.createdBy.lastName}
                        </span>
                      )}
                      <span>Updated {format(new Date(partial.updatedAt), 'MMM d, yyyy')}</span>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => openUsage(partial)}
                      title="View usage"
                      className="p-1.5 rounded hover:bg-background-tertiary text-text-muted hover:text-text-primary transition-colors"
                    >
                      <Eye className="w-4 h-4" />
                    </button>

                    {canManage && (
                      <Dropdown>
                        <DropdownTrigger asChild>
                          <button className="p-1.5 rounded hover:bg-background-tertiary text-text-muted hover:text-text-primary transition-colors">
                            <MoreVertical className="w-4 h-4" />
                          </button>
                        </DropdownTrigger>
                        <DropdownMenu align="right">
                          <DropdownItem
                            icon={<Pencil className="w-4 h-4" />}
                            onClick={() => openEdit(partial)}
                          >
                            Edit
                          </DropdownItem>
                          <DropdownItem
                            icon={<Copy className="w-4 h-4" />}
                            onClick={() => openDuplicate(partial)}
                          >
                            Duplicate
                          </DropdownItem>
                          <DropdownItem
                            icon={<FileCode className="w-4 h-4" />}
                            onClick={() => openUsage(partial)}
                          >
                            View Usage
                          </DropdownItem>
                          <DropdownItem
                            icon={<Trash2 className="w-4 h-4" />}
                            destructive
                            onClick={() => openDelete(partial)}
                          >
                            Delete
                          </DropdownItem>
                        </DropdownMenu>
                      </Dropdown>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Pagination */}
          {data && data.totalPages > 0 && (
            <div className="mt-6">
              <Pagination
                page={data.page}
                totalPages={data.totalPages}
                total={data.total}
                limit={data.limit}
                onPageChange={setPage}
                onLimitChange={(newLimit: number) => {
                  setLimit(newLimit);
                  setPage(1);
                }}
              />
            </div>
          )}
        </>
      )}

      {/* Create/Edit now handled by full-page editor at /admin/template-partials/editor?type=partial */}

      {/* Duplicate Modal */}
      <Modal
        isOpen={isDuplicateOpen}
        onClose={() => setIsDuplicateOpen(false)}
        title="Duplicate Partial"
      >
        <ModalBody>
          <FormInput
            label="New Name"
            value={duplicateName}
            onChange={(e) => setDuplicateName(e.target.value)}
            placeholder="signing-block-copy"
            hint="Enter a unique name for the duplicate"
          />
        </ModalBody>
        <ModalFooter>
          <Button variant="secondary" onClick={() => setIsDuplicateOpen(false)} disabled={duplicateMutation.isPending}>
            Cancel
          </Button>
          <Button
            variant="primary"
            onClick={handleDuplicate}
            isLoading={duplicateMutation.isPending}
            disabled={!duplicateName}
          >
            Duplicate
          </Button>
        </ModalFooter>
      </Modal>

      {/* Delete Confirmation */}
      <ConfirmDialog
        isOpen={isDeleteOpen}
        onClose={() => setIsDeleteOpen(false)}
        onConfirm={handleDelete}
        title="Delete Partial"
        description={`Are you sure you want to delete "${selectedPartial?.name}"? This action cannot be undone.`}
        variant="danger"
        confirmLabel="Delete"
        isLoading={deleteMutation.isPending}
      />

      {/* Usage Modal */}
      <Modal
        isOpen={isUsageOpen}
        onClose={() => setIsUsageOpen(false)}
        title={`Usage: ${selectedPartial?.name}`}
      >
        <ModalBody>
          {usageLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="w-6 h-6 animate-spin text-text-muted" />
            </div>
          ) : usageData?.templates.length === 0 ? (
            <p className="text-sm text-text-muted text-center py-8">
              This partial is not used in any templates yet.
            </p>
          ) : (
            <div className="space-y-2">
              <p className="text-sm text-text-secondary mb-4">
                Used in {usageData?.usageCount} template{usageData?.usageCount !== 1 ? 's' : ''}:
              </p>
              {usageData?.templates.map((template) => (
                <div
                  key={template.templateId}
                  className="flex items-center justify-between p-3 rounded-md bg-background-tertiary"
                >
                  <div>
                    <p className="text-sm font-medium text-text-primary">{template.templateName}</p>
                    <p className="text-xs text-text-muted capitalize">
                      {template.category.toLowerCase().replace('_', ' ')}
                    </p>
                  </div>
                  <ChevronRight className="w-4 h-4 text-text-muted" />
                </div>
              ))}
            </div>
          )}
        </ModalBody>
        <ModalFooter>
          <Button variant="secondary" onClick={() => setIsUsageOpen(false)}>
            Close
          </Button>
        </ModalFooter>
      </Modal>
    </div>
  );
}

// ============================================================================
// Main Component
// ============================================================================

export default function TemplatesPage() {
  const { data: session } = useSession();
  const searchParams = useSearchParams();
  const [activeTab, setActiveTab] = useState<TabType>('templates');

  // Read tab from URL query parameter
  useEffect(() => {
    const tabParam = searchParams.get('tab');
    if (tabParam === 'partials') {
      setActiveTab('partials');
    }
  }, [searchParams]);

  // Tenant selection (from centralized store for SUPER_ADMIN)
  const { selectedTenantId } = useTenantSelection();
  const activeTenantId = useActiveTenantId(
    session?.isSuperAdmin ?? false,
    session?.tenantId
  );

  const canManage = session?.isSuperAdmin || session?.isTenantAdmin || false;

  return (
    <div className="p-4 sm:p-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
        <div>
          <h1 className="text-xl sm:text-2xl font-semibold text-text-primary">
            Templates
          </h1>
          <p className="text-sm text-text-secondary mt-1">
            Manage document templates and reusable partials
          </p>
        </div>
      </div>

      {/* Tenant context info for SUPER_ADMIN */}
      {session?.isSuperAdmin && !selectedTenantId && (
        <div className="mb-4 p-3 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg">
          <p className="text-sm text-amber-800 dark:text-amber-200">
            Please select a tenant from the sidebar to manage templates.
          </p>
        </div>
      )}

      {/* No tenant selected */}
      {session?.isSuperAdmin && !activeTenantId && (
        <div className="flex flex-col items-center justify-center py-12">
          <FileText className="w-12 h-12 mb-3 opacity-50 text-text-muted" />
          <p className="text-sm text-text-muted">
            Please select a tenant from the sidebar to manage their templates
          </p>
        </div>
      )}

      {/* Tabs and Content */}
      {activeTenantId && (
        <>
          {/* Tab Navigation */}
          <div className="border-b border-border-primary mb-6">
            <nav className="flex gap-6" aria-label="Tabs">
              <button
                onClick={() => setActiveTab('templates')}
                className={cn(
                  'pb-3 text-sm font-medium border-b-2 transition-colors',
                  activeTab === 'templates'
                    ? 'border-accent-primary text-accent-primary'
                    : 'border-transparent text-text-secondary hover:text-text-primary hover:border-border-secondary'
                )}
              >
                <span className="flex items-center gap-2">
                  <FileText className="w-4 h-4" />
                  Document Templates
                </span>
              </button>
              <button
                onClick={() => setActiveTab('partials')}
                className={cn(
                  'pb-3 text-sm font-medium border-b-2 transition-colors',
                  activeTab === 'partials'
                    ? 'border-accent-primary text-accent-primary'
                    : 'border-transparent text-text-secondary hover:text-text-primary hover:border-border-secondary'
                )}
              >
                <span className="flex items-center gap-2">
                  <Code className="w-4 h-4" />
                  Partials
                </span>
              </button>
            </nav>
          </div>

          {/* Tab Content */}
          {activeTab === 'templates' ? (
            <DocumentTemplatesTab activeTenantId={activeTenantId} canManage={canManage} />
          ) : (
            <TemplatePartialsTab
              activeTenantId={activeTenantId}
              canManage={canManage}
              isSuperAdmin={session?.isSuperAdmin ?? false}
            />
          )}
        </>
      )}
    </div>
  );
}
