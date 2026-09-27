'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { FormInput } from '@/components/ui/form-input';
import { Modal, ModalBody, ModalFooter } from '@/components/ui/modal';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { Dropdown, DropdownTrigger, DropdownMenu, DropdownItem } from '@/components/ui/dropdown';
import { useToast } from '@/components/ui/toast';
import { Pagination } from '@/components/ui/pagination';
import { RichTextDisplay } from '@/components/ui/rich-text-editor';
import {
  usePersistSessionListSnapshot,
  useSessionListRestore,
} from '@/hooks/use-session-query-restore';
import {
  Plus,
  MoreVertical,
  Pencil,
  Trash2,
  Copy,
  Search,
  FileText,
  Loader2,
  AlertCircle,
  Check,
  X,
  Eye,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { format } from 'date-fns';
import { isOakDocTemplate as isOakDocContentJson } from '@/lib/document-editor/oakdoc-template';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { LibraryViewSelect, TemplateLibraryShell, type LibraryView } from '../template-library-shell';

// ============================================================================
// Types
// ============================================================================

interface DocumentTemplate {
  id: string;
  name: string;
  description?: string | null;
  category: string;
  content: string;
  contentJson?: unknown;
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

function isOakDocTemplate(template: Pick<DocumentTemplate, 'contentJson'>): boolean {
  return isOakDocContentJson(template.contentJson);
}

interface PlaceholderDefinition {
  key: string;
  label: string;
  type: 'text' | 'textarea' | 'date' | 'number' | 'currency' | 'boolean' | 'list' | 'conditional';
  source: 'company' | 'contact' | 'officer' | 'shareholder' | 'service' | 'custom' | 'system';
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

function isTemplateSearchResult(value: unknown): value is TemplateSearchResult {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Partial<TemplateSearchResult>;
  return (
    !!candidate.templates &&
    Array.isArray(candidate.templates) &&
    typeof candidate.total === 'number' &&
    typeof candidate.totalPages === 'number'
  );
}

interface TemplateStats {
  health?: {
    activeTemplatesCanGenerateCleanly: number;
    activeTemplatesWithMissingPartials: number;
    missingPartialReferences: Array<{ templateId: string; templateName: string; partialName: string }>;
    requiredCustomFields: Array<{ templateId: string; templateName: string; key: string; label: string }>;
  };
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
  params: { search?: string; category?: string; isActive?: boolean; editor?: 'oakdoc' | 'a4'; page: number; limit: number },
  tenantId?: string
): Promise<TemplateSearchResult> {
  const searchParams = new URLSearchParams();
  if (params.search) searchParams.set('query', params.search);
  if (params.category) searchParams.set('category', params.category);
  if (params.isActive !== undefined) searchParams.set('isActive', String(params.isActive));
  if (params.editor) searchParams.set('editor', params.editor);
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

async function fetchTemplateStats(tenantId?: string): Promise<TemplateStats> {
  const searchParams = new URLSearchParams();
  if (tenantId) searchParams.set('tenantId', tenantId);

  const response = await fetch(`/api/document-templates/stats?${searchParams}`);
  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || 'Failed to fetch template stats');
  }
  return response.json();
}

async function _createTemplate(
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
    expectedRevision?: number;
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

async function deleteTemplate(
  id: string,
  reason: string,
  tenantId?: string,
  expectedRevision?: number,
): Promise<void> {
  const searchParams = new URLSearchParams({ reason });
  if (tenantId) searchParams.set('tenantId', tenantId);
  if (expectedRevision !== undefined) searchParams.set('expectedRevision', String(expectedRevision));
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
// Document Templates List
// ============================================================================

function DocumentTemplatesTab({
  activeTenantId,
  canCreate,
  canUpdate,
  canDelete,
}: {
  activeTenantId: string;
  canCreate: boolean;
  canUpdate: boolean;
  canDelete: boolean;
}) {
  const router = useRouter();
  const { success, error: showError } = useToast();
  const queryClient = useQueryClient();

  // List state
  const [view, setView] = useState<LibraryView>('word');
  const oakDocOnly = view === 'word';
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(20);

  // Modal states (only for view, delete, duplicate - create/edit use full page)
  const [viewingTemplate, setViewingTemplate] = useState<DocumentTemplate | null>(null);
  const [deletingTemplate, setDeletingTemplate] = useState<DocumentTemplate | null>(null);
  const [duplicatingTemplate, setDuplicatingTemplate] = useState<DocumentTemplate | null>(null);

  // Form state for duplicate modal
  const [duplicateName, setDuplicateName] = useState('');

  // Query
  const queryKey = [
    'document-templates',
    { search, categoryFilter, statusFilter, page, limit, oakDocOnly },
    activeTenantId,
  ] as const;
  const { initialData, restoredFromSession } = useSessionListRestore<TemplateSearchResult>(
    queryClient,
    queryKey,
    { enabled: !!activeTenantId, validate: isTemplateSearchResult },
  );
  const { data, isLoading, error } = useQuery({
    queryKey,
    queryFn: () => fetchTemplates({
      search,
      category: categoryFilter,
      isActive: statusFilter === 'active' ? true : statusFilter === 'inactive' ? false : undefined,
      editor: oakDocOnly ? 'oakdoc' : 'a4',
      page,
      limit,
    }, activeTenantId),
    enabled: !!activeTenantId,
    initialData,
    initialDataUpdatedAt: restoredFromSession ? 0 : undefined,
  });
  usePersistSessionListSnapshot(queryKey, data);

  const { data: templateStats } = useQuery({
    queryKey: ['document-templates-stats', activeTenantId],
    queryFn: () => fetchTemplateStats(activeTenantId),
    enabled: !!activeTenantId && !oakDocOnly,
  });

  // Mutations
  const deleteMutation = useMutation({
    mutationFn: ({ id, reason, revision }: { id: string; reason: string; revision: number }) =>
      deleteTemplate(id, reason, activeTenantId, revision),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['document-templates'] });
      queryClient.invalidateQueries({ queryKey: ['document-templates-stats'] });
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
      queryClient.invalidateQueries({ queryKey: ['document-templates-stats'] });
      success('Template duplicated successfully');
      setDuplicatingTemplate(null);
      setDuplicateName('');
    },
    onError: (err: Error) => showError(err.message),
  });

  const toggleActiveMutation = useMutation({
    mutationFn: ({ id, isActive, revision }: { id: string; isActive: boolean; revision: number }) =>
      updateTemplate({
        id,
        isActive,
        expectedRevision: revision,
        tenantId: activeTenantId,
        reason: isActive ? 'Activated template' : 'Deactivated template',
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['document-templates'] });
      queryClient.invalidateQueries({ queryKey: ['document-templates-stats'] });
      success('Template status updated');
    },
    onError: (err: Error) => showError(err.message),
  });

  // Handlers - Navigate to editor page for create/edit
  const openCreateModal = () => {
    router.push('/generated-documents/generate?editor=oakdoc');
  };

  const openEditModal = (template: DocumentTemplate) => {
    if (isOakDocTemplate(template)) {
      router.push(
        `/generated-documents/generate?editor=oakdoc&templateId=${encodeURIComponent(template.id)}`,
      );
      return;
    }
    router.push(`/template-partials/editor?id=${template.id}&tab=templates`);
  };

  const handleDelete = (reason?: string) => {
    if (!deletingTemplate) return;
    deleteMutation.mutate({
      id: deletingTemplate.id,
      reason: reason || 'Deleted by user',
      revision: deletingTemplate.version,
    });
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
  const health = templateStats?.health;

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
            placeholder={oakDocOnly ? 'Search Word templates...' : 'Search archived A4 templates...'}
            className="w-full h-9 pl-9 pr-4 border border-border-primary rounded-md bg-background-primary text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-accent-primary/50 text-sm"
          />
        </div>
        <LibraryViewSelect
          value={view}
          noun="templates"
          onChange={(next) => {
            setView(next);
            setPage(1);
          }}
        />
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
        {oakDocOnly && (
          <select
            value={statusFilter}
            onChange={(e) => {
              setStatusFilter(e.target.value);
              setPage(1);
            }}
            className="h-9 px-3 text-sm border border-border-primary rounded-md bg-background-primary text-text-primary focus:outline-none focus:ring-2 focus:ring-accent-primary/50 w-full sm:w-40"
          >
            <option value="">All Statuses</option>
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
          </select>
        )}
        {canCreate && oakDocOnly && (
          <Button
            variant="primary"
            className="h-9"
            leftIcon={<Plus />}
            onClick={() => router.push('/generated-documents/generate?editor=oakdoc')}
          >
            New Word Template
          </Button>
        )}
      </div>

      {!oakDocOnly && health && (
        <div className="card mb-6 border-border-primary bg-background-secondary">
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
            <div>
              <div className="flex items-center gap-2">
                <FileText className="w-4 h-4 text-accent-primary" />
                <h3 className="text-sm font-medium text-text-primary">Template Health</h3>
              </div>
              <p className="text-xs text-text-muted mt-1">
                {health.activeTemplatesCanGenerateCleanly} active templates can render without missing partials.
              </p>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-sm">
              <div>
                <p className="text-text-muted text-xs">Missing Partials</p>
                <p className={cn(
                  'font-semibold',
                  health.activeTemplatesWithMissingPartials > 0 ? 'text-status-error' : 'text-status-success'
                )}>
                  {health.activeTemplatesWithMissingPartials}
                </p>
              </div>
              <div>
                <p className="text-text-muted text-xs">Required Fields</p>
                <p className="font-semibold text-text-primary">{health.requiredCustomFields.length}</p>
              </div>
              <div>
                <p className="text-text-muted text-xs">Last Successful Test</p>
                <p className="font-semibold text-text-primary">Not tracked</p>
              </div>
            </div>
          </div>
          {health.missingPartialReferences.length > 0 && (
            <p className="mt-3 text-xs text-status-error">
              Missing: {health.missingPartialReferences.slice(0, 3).map((item) => (
                `${item.templateName} -> ${item.partialName}`
              )).join(', ')}
              {health.missingPartialReferences.length > 3 ? '...' : ''}
            </p>
          )}
        </div>
      )}

      {/* Loading */}
      {isLoading && (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-6 h-6 animate-spin text-text-muted" />
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="card border-status-error bg-status-error/5 mb-4">
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
            {search || categoryFilter || statusFilter
              ? oakDocOnly
                ? 'No Word templates found matching your search'
                : 'No archived A4 templates found matching your search'
              : oakDocOnly
                ? 'No Word templates yet'
                : 'No archived A4 templates'}
          </p>
          {canCreate && oakDocOnly && !search && !categoryFilter && !statusFilter && (
            <button
              onClick={openCreateModal}
              className="mt-3 px-4 py-1.5 text-sm text-text-secondary bg-background-tertiary hover:bg-background-elevated rounded-full transition-colors"
            >
              Create your first Word template
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
              className="card hover:border-accent-primary transition-colors"
            >
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <button
                      onClick={() => canUpdate && openEditModal(template)}
                      className={cn(
                        "font-medium text-text-primary text-left",
                        canUpdate && "hover:text-accent-primary hover:underline cursor-pointer"
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
                    {isOakDocTemplate(template) && (
                      <span className="badge bg-background-tertiary text-text-secondary text-xs">
                        Word / OakDoc
                      </span>
                    )}
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
                    onClick={() => {
                      if (oakDocOnly) {
                        openEditModal(template);
                      } else {
                        setViewingTemplate(template);
                      }
                    }}
                    title={oakDocOnly ? 'Open in OakDoc' : 'Preview template'}
                    className="p-1.5 rounded hover:bg-background-tertiary text-text-muted hover:text-text-primary transition-colors"
                  >
                    <Eye className="w-4 h-4" />
                  </button>

                  {(canCreate || canUpdate || canDelete) && (
                    <Dropdown>
                      <DropdownTrigger asChild>
                        <button className="p-1.5 rounded hover:bg-background-tertiary text-text-muted hover:text-text-primary transition-colors">
                          <MoreVertical className="w-4 h-4" />
                        </button>
                      </DropdownTrigger>
                      <DropdownMenu align="right">
                        {canUpdate && <DropdownItem icon={<Pencil className="w-4 h-4" />} onClick={() => openEditModal(template)}>{isOakDocTemplate(template) ? 'Edit' : 'View'}</DropdownItem>}
                        {canCreate && isOakDocTemplate(template) && <DropdownItem icon={<Copy className="w-4 h-4" />} onClick={() => openDuplicateDialog(template)}>Duplicate</DropdownItem>}
                        {canUpdate && <DropdownItem
                          icon={template.isActive ? <X className="w-4 h-4" /> : <Check className="w-4 h-4" />}
                          onClick={() => toggleActiveMutation.mutate({
                            id: template.id,
                            isActive: !template.isActive,
                            revision: template.version,
                          })}
                        >{template.isActive ? 'Deactivate' : 'Activate'}</DropdownItem>}
                        {canDelete && <DropdownItem icon={<Trash2 className="w-4 h-4" />} destructive onClick={() => setDeletingTemplate(template)}>Delete</DropdownItem>}
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
                {isOakDocTemplate(viewingTemplate) ? (
                  <div className="py-8 text-center">
                    <FileText className="mx-auto h-8 w-8 text-accent-primary" />
                    <p className="mt-2 text-sm font-medium text-text-primary">
                      DOCX-native OakDoc template
                    </p>
                    <p className="mt-1 text-xs text-text-muted">
                      Open this template in OakDoc to view and edit the Word document.
                    </p>
                  </div>
                ) : (
                  <RichTextDisplay content={viewingTemplate.content} />
                )}
              </div>
            </div>
          )}
        </ModalBody>
        <ModalFooter>
          <Button variant="secondary" onClick={() => setViewingTemplate(null)}>
            Close
          </Button>
          {canUpdate && viewingTemplate && (
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

export default function DocumentTemplatesPage() {
  return (
    <TemplateLibraryShell title="Document Templates" description="Manage the Word templates used to generate documents.">
      {({ activeTenantId, can }) => (
        <DocumentTemplatesTab
          activeTenantId={activeTenantId}
          canCreate={can.createDocument}
          canUpdate={can.updateDocument}
          canDelete={can.deleteDocument}
        />
      )}
    </TemplateLibraryShell>
  );
}
