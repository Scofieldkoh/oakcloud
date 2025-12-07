'use client';

import { useState, useCallback } from 'react';
import { useSession } from '@/hooks/use-auth';
import { Button } from '@/components/ui/button';
import { FormInput } from '@/components/ui/form-input';
import { Modal, ModalBody, ModalFooter } from '@/components/ui/modal';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { Dropdown, DropdownTrigger, DropdownMenu, DropdownItem } from '@/components/ui/dropdown';
import { TenantSelector, useActiveTenantId } from '@/components/ui/tenant-selector';
import { useToast } from '@/components/ui/toast';
import { Pagination } from '@/components/companies/pagination';
import { RichTextEditor, RichTextDisplay } from '@/components/ui/rich-text-editor';
import {
  Plus,
  MoreVertical,
  Pencil,
  Trash2,
  Copy,
  Search,
  FileText,
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
  type: 'text' | 'date' | 'number' | 'currency' | 'list' | 'conditional';
  source: 'company' | 'contact' | 'officer' | 'shareholder' | 'custom' | 'system';
  path?: string;
  defaultValue?: string;
  format?: string;
  required: boolean;
}

interface SearchResult {
  templates: DocumentTemplate[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

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
// API Functions
// ============================================================================

async function fetchTemplates(
  params: { search?: string; category?: string; page: number; limit: number },
  tenantId?: string
): Promise<SearchResult> {
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

async function fetchTemplate(id: string, tenantId?: string): Promise<DocumentTemplate> {
  const searchParams = new URLSearchParams();
  if (tenantId) searchParams.set('tenantId', tenantId);
  const response = await fetch(`/api/document-templates/${id}?${searchParams}`);
  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || 'Failed to fetch template');
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
// Main Component
// ============================================================================

export default function DocumentTemplatesPage() {
  const { data: session } = useSession();
  const { success, error: showError } = useToast();
  const queryClient = useQueryClient();

  // Tenant selection (for SUPER_ADMIN)
  const [selectedTenantId, setSelectedTenantId] = useState('');
  const activeTenantId = useActiveTenantId(
    session?.isSuperAdmin ?? false,
    selectedTenantId,
    session?.tenantId
  );

  // List state
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('');
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(20);

  // Modal states
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<DocumentTemplate | null>(null);
  const [viewingTemplate, setViewingTemplate] = useState<DocumentTemplate | null>(null);
  const [deletingTemplate, setDeletingTemplate] = useState<DocumentTemplate | null>(null);
  const [duplicatingTemplate, setDuplicatingTemplate] = useState<DocumentTemplate | null>(null);

  // Form state
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    category: 'OTHER',
    content: '',
    isActive: true,
  });
  const [duplicateName, setDuplicateName] = useState('');
  const [formError, setFormError] = useState('');

  // Query
  const { data, isLoading, error } = useQuery({
    queryKey: ['document-templates', { search, categoryFilter, page, limit }, activeTenantId],
    queryFn: () => fetchTemplates({ search, category: categoryFilter, page, limit }, activeTenantId),
    enabled: !!activeTenantId,
  });

  // Mutations
  const createMutation = useMutation({
    mutationFn: createTemplate,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['document-templates'] });
      success('Template created successfully');
      closeCreateModal();
    },
    onError: (err: Error) => showError(err.message),
  });

  const updateMutation = useMutation({
    mutationFn: updateTemplate,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['document-templates'] });
      success('Template updated successfully');
      closeEditModal();
    },
    onError: (err: Error) => showError(err.message),
  });

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

  // Handlers
  const openCreateModal = () => {
    setFormData({
      name: '',
      description: '',
      category: 'OTHER',
      content: '',
      isActive: true,
    });
    setFormError('');
    setIsCreateModalOpen(true);
  };

  const closeCreateModal = () => {
    setIsCreateModalOpen(false);
    setFormData({ name: '', description: '', category: 'OTHER', content: '', isActive: true });
    setFormError('');
  };

  const openEditModal = (template: DocumentTemplate) => {
    setFormData({
      name: template.name,
      description: template.description || '',
      category: template.category,
      content: template.content,
      isActive: template.isActive,
    });
    setFormError('');
    setEditingTemplate(template);
  };

  const closeEditModal = () => {
    setEditingTemplate(null);
    setFormData({ name: '', description: '', category: 'OTHER', content: '', isActive: true });
    setFormError('');
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError('');

    if (!formData.name.trim()) {
      setFormError('Name is required');
      return;
    }
    if (!formData.content.trim()) {
      setFormError('Template content is required');
      return;
    }

    createMutation.mutate({
      ...formData,
      tenantId: activeTenantId,
    });
  };

  const handleUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingTemplate) return;
    setFormError('');

    if (!formData.name.trim()) {
      setFormError('Name is required');
      return;
    }
    if (!formData.content.trim()) {
      setFormError('Template content is required');
      return;
    }

    updateMutation.mutate({
      id: editingTemplate.id,
      ...formData,
      tenantId: activeTenantId,
      reason: 'Updated template',
    });
  };

  const handleDelete = (reason?: string) => {
    if (!deletingTemplate || !reason) return;
    deleteMutation.mutate({ id: deletingTemplate.id, reason });
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

  const canManage = session?.isSuperAdmin || session?.isTenantAdmin;
  const templates = data?.templates || [];

  return (
    <div className="p-4 sm:p-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
        <div>
          <h1 className="text-xl sm:text-2xl font-semibold text-text-primary flex items-center gap-2">
            <FileText className="w-6 h-6" />
            Document Templates
          </h1>
          <p className="text-sm text-text-secondary mt-1">
            Create and manage templates for document generation
          </p>
        </div>
        {canManage && activeTenantId && (
          <Button variant="primary" size="sm" leftIcon={<Plus />} onClick={openCreateModal}>
            New Template
          </Button>
        )}
      </div>

      {/* Tenant Selector for SUPER_ADMIN */}
      {session?.isSuperAdmin && (
        <div className="mb-6">
          <TenantSelector
            value={selectedTenantId}
            onChange={setSelectedTenantId}
            label="Select Tenant"
            helpText="Select a tenant to manage their document templates"
          />
        </div>
      )}

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3 mb-6">
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
            className="w-full pl-9 pr-4 py-2 border border-border-primary rounded-lg bg-background-elevated text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-1 focus:ring-accent-primary focus:border-accent-primary text-sm"
            disabled={!activeTenantId}
          />
        </div>
        <select
          value={categoryFilter}
          onChange={(e) => {
            setCategoryFilter(e.target.value);
            setPage(1);
          }}
          className="input input-sm w-full sm:w-48"
          disabled={!activeTenantId}
        >
          <option value="">All Categories</option>
          {CATEGORIES.map((cat) => (
            <option key={cat.value} value={cat.value}>
              {cat.label}
            </option>
          ))}
        </select>
      </div>

      {/* Loading */}
      {isLoading && activeTenantId && (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-6 h-6 animate-spin text-text-muted" />
          <span className="ml-2 text-text-muted">Loading templates...</span>
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

      {/* Empty state - No tenant selected */}
      {!activeTenantId && session?.isSuperAdmin && (
        <div className="py-16 text-center">
          <FileText className="w-16 h-16 mx-auto text-text-muted opacity-50 mb-4" />
          <h3 className="text-lg font-medium text-text-primary mb-2">Select a Tenant</h3>
          <p className="text-text-muted">
            Please select a tenant to manage their document templates
          </p>
        </div>
      )}

      {/* Empty state - No templates */}
      {!isLoading && !error && activeTenantId && templates.length === 0 && (
        <div className="py-16 text-center">
          <FileText className="w-16 h-16 mx-auto text-text-muted opacity-50 mb-4" />
          <h3 className="text-lg font-medium text-text-primary mb-2">No Templates Found</h3>
          <p className="text-text-muted mb-4">
            {search || categoryFilter
              ? 'Try adjusting your search or filters'
              : 'Get started by creating your first document template'}
          </p>
          {canManage && !search && !categoryFilter && (
            <Button variant="primary" size="sm" leftIcon={<Plus />} onClick={openCreateModal}>
              Create Template
            </Button>
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
                    <h3 className="font-medium text-text-primary">{template.name}</h3>
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
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setViewingTemplate(template)}
                    aria-label="Preview template"
                  >
                    <Eye className="w-4 h-4" />
                  </Button>

                  {canManage && (
                    <Dropdown>
                      <DropdownTrigger>
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

      {/* Create Modal */}
      <Modal
        isOpen={isCreateModalOpen}
        onClose={closeCreateModal}
        title="Create Template"
        size="xl"
      >
        <form onSubmit={handleCreate}>
          <ModalBody>
            <div className="space-y-4">
              {formError && (
                <div className="p-3 bg-status-error/10 border border-status-error/30 rounded-lg text-status-error text-sm">
                  {formError}
                </div>
              )}

              <FormInput
                label="Template Name"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                placeholder="e.g., Board Resolution - Director Appointment"
                required
              />

              <div>
                <label className="label">Category</label>
                <select
                  value={formData.category}
                  onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                  className="input w-full"
                >
                  {CATEGORIES.map((cat) => (
                    <option key={cat.value} value={cat.value}>
                      {cat.label}
                    </option>
                  ))}
                </select>
              </div>

              <FormInput
                label="Description"
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                placeholder="Brief description of what this template is used for"
              />

              <div>
                <label className="label">Template Content</label>
                <p className="text-xs text-text-muted mb-2">
                  Use {`{{placeholder}}`} syntax for dynamic content. e.g., {`{{company.name}}`}, {`{{today}}`}
                </p>
                <RichTextEditor
                  value={formData.content}
                  onChange={(html) => setFormData({ ...formData, content: html })}
                  placeholder="Enter template content..."
                  minHeight={300}
                />
              </div>

              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="isActive"
                  checked={formData.isActive}
                  onChange={(e) => setFormData({ ...formData, isActive: e.target.checked })}
                  className="w-4 h-4 rounded border-border-primary text-accent-primary focus:ring-accent-primary"
                />
                <label htmlFor="isActive" className="text-sm text-text-primary">
                  Active (available for document generation)
                </label>
              </div>
            </div>
          </ModalBody>
          <ModalFooter>
            <Button variant="secondary" onClick={closeCreateModal} disabled={createMutation.isPending}>
              Cancel
            </Button>
            <Button type="submit" variant="primary" isLoading={createMutation.isPending}>
              Create Template
            </Button>
          </ModalFooter>
        </form>
      </Modal>

      {/* Edit Modal */}
      <Modal
        isOpen={!!editingTemplate}
        onClose={closeEditModal}
        title="Edit Template"
        size="xl"
      >
        <form onSubmit={handleUpdate}>
          <ModalBody>
            <div className="space-y-4">
              {formError && (
                <div className="p-3 bg-status-error/10 border border-status-error/30 rounded-lg text-status-error text-sm">
                  {formError}
                </div>
              )}

              <FormInput
                label="Template Name"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                required
              />

              <div>
                <label className="label">Category</label>
                <select
                  value={formData.category}
                  onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                  className="input w-full"
                >
                  {CATEGORIES.map((cat) => (
                    <option key={cat.value} value={cat.value}>
                      {cat.label}
                    </option>
                  ))}
                </select>
              </div>

              <FormInput
                label="Description"
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              />

              <div>
                <label className="label">Template Content</label>
                <p className="text-xs text-text-muted mb-2">
                  Use {`{{placeholder}}`} syntax for dynamic content. e.g., {`{{company.name}}`}, {`{{today}}`}
                </p>
                <RichTextEditor
                  value={formData.content}
                  onChange={(html) => setFormData({ ...formData, content: html })}
                  minHeight={300}
                />
              </div>

              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="editIsActive"
                  checked={formData.isActive}
                  onChange={(e) => setFormData({ ...formData, isActive: e.target.checked })}
                  className="w-4 h-4 rounded border-border-primary text-accent-primary focus:ring-accent-primary"
                />
                <label htmlFor="editIsActive" className="text-sm text-text-primary">
                  Active (available for document generation)
                </label>
              </div>
            </div>
          </ModalBody>
          <ModalFooter>
            <Button variant="secondary" onClick={closeEditModal} disabled={updateMutation.isPending}>
              Cancel
            </Button>
            <Button type="submit" variant="primary" isLoading={updateMutation.isPending}>
              Save Changes
            </Button>
          </ModalFooter>
        </form>
      </Modal>

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
