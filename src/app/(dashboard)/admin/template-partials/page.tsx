'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useSession } from '@/hooks/use-auth';
import {
  useTemplatePartials,
  useCreatePartial,
  useUpdatePartial,
  useDeletePartial,
  useDuplicatePartial,
  usePartialUsage,
  type TemplatePartialWithRelations,
} from '@/hooks/use-template-partials';
import { Button } from '@/components/ui/button';
import { FormInput } from '@/components/ui/form-input';
import { Modal, ModalBody, ModalFooter } from '@/components/ui/modal';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { Dropdown, DropdownTrigger, DropdownMenu, DropdownItem } from '@/components/ui/dropdown';
import { TenantSelector, useActiveTenantId } from '@/components/ui/tenant-selector';
import { useToast } from '@/components/ui/toast';
import { Pagination } from '@/components/companies/pagination';
import {
  Plus,
  MoreVertical,
  Pencil,
  Trash2,
  Copy,
  Search,
  Code,
  FileCode,
  ChevronRight,
  Loader2,
  AlertCircle,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { format } from 'date-fns';

// ============================================================================
// Types
// ============================================================================

interface PartialFormData {
  name: string;
  description: string;
  content: string;
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
// Main Page Component
// ============================================================================

export default function TemplatePartialsPage() {
  const { data: session } = useSession();
  const { success, error: showError } = useToast();

  // Tenant selection (for SUPER_ADMIN)
  const [selectedTenantId, setSelectedTenantId] = useState('');
  const activeTenantId = useActiveTenantId(
    session?.isSuperAdmin ?? false,
    selectedTenantId,
    session?.tenantId
  );

  // Search state
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(20);

  // Modal states
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [isDuplicateOpen, setIsDuplicateOpen] = useState(false);
  const [isDeleteOpen, setIsDeleteOpen] = useState(false);
  const [isUsageOpen, setIsUsageOpen] = useState(false);
  const [selectedPartial, setSelectedPartial] = useState<TemplatePartialWithRelations | null>(null);

  // Form state
  const [formData, setFormData] = useState<PartialFormData>({
    name: '',
    description: '',
    content: '',
  });
  const [duplicateName, setDuplicateName] = useState('');

  // Refs for auto-expanding textareas
  const editTextareaRef = useRef<HTMLTextAreaElement>(null);

  // Auto-resize textarea helper
  const autoResizeTextarea = useCallback((textarea: HTMLTextAreaElement | null) => {
    if (textarea) {
      textarea.style.height = 'auto';
      textarea.style.height = `${textarea.scrollHeight}px`;
    }
  }, []);

  // Auto-expand edit textarea when modal opens with content
  useEffect(() => {
    if (isEditOpen && editTextareaRef.current) {
      autoResizeTextarea(editTextareaRef.current);
    }
  }, [isEditOpen, autoResizeTextarea]);

  // Queries and mutations
  const { data, isLoading, error } = useTemplatePartials({
    search: search || undefined,
    page,
    limit,
    tenantId: session?.isSuperAdmin ? activeTenantId : undefined,
  });

  const createMutation = useCreatePartial();
  const updateMutation = useUpdatePartial();
  const deleteMutation = useDeletePartial();
  const duplicateMutation = useDuplicatePartial();
  const { data: usageData, isLoading: usageLoading } = usePartialUsage(
    isUsageOpen ? selectedPartial?.id || null : null,
    session?.isSuperAdmin ? activeTenantId : undefined
  );

  // Handlers
  const openCreate = () => {
    setFormData({ name: '', description: '', content: '' });
    setIsCreateOpen(true);
  };

  const openEdit = (partial: TemplatePartialWithRelations) => {
    setSelectedPartial(partial);
    setFormData({
      name: partial.name,
      description: partial.description || '',
      content: partial.content,
    });
    setIsEditOpen(true);
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

  const handleCreate = async () => {
    try {
      await createMutation.mutateAsync({
        name: formData.name,
        description: formData.description || null,
        content: formData.content,
        placeholders: [],
        tenantId: session?.isSuperAdmin ? activeTenantId : undefined,
      });
      success('Partial created successfully');
      setIsCreateOpen(false);
    } catch (err) {
      showError(err instanceof Error ? err.message : 'Failed to create partial');
    }
  };

  const handleUpdate = async () => {
    if (!selectedPartial) return;
    try {
      await updateMutation.mutateAsync({
        id: selectedPartial.id,
        name: formData.name,
        description: formData.description || null,
        content: formData.content,
        tenantId: session?.isSuperAdmin ? activeTenantId : undefined,
      });
      success('Partial updated successfully');
      setIsEditOpen(false);
    } catch (err) {
      showError(err instanceof Error ? err.message : 'Failed to update partial');
    }
  };

  const handleDuplicate = async () => {
    if (!selectedPartial) return;
    try {
      await duplicateMutation.mutateAsync({
        id: selectedPartial.id,
        name: duplicateName,
        tenantId: session?.isSuperAdmin ? activeTenantId : undefined,
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
        tenantId: session?.isSuperAdmin ? activeTenantId : undefined,
      });
      success('Partial deleted successfully');
      setIsDeleteOpen(false);
    } catch (err) {
      showError(err instanceof Error ? err.message : 'Failed to delete partial');
    }
  };

  const partials = data?.partials || [];
  const canManage = session?.isSuperAdmin || session?.isTenantAdmin;

  return (
    <div className="p-4 sm:p-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
        <div>
          <h1 className="text-xl sm:text-2xl font-semibold text-text-primary flex items-center gap-2">
            <Code className="w-6 h-6" />
            Template Partials
          </h1>
          <p className="text-sm text-text-secondary mt-1">
            Reusable template snippets that can be included in multiple templates
          </p>
        </div>
        {canManage && activeTenantId && (
          <Button variant="primary" size="sm" leftIcon={<Plus />} onClick={openCreate}>
            New Partial
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
            helpText="Select a tenant to manage their template partials"
          />
        </div>
      )}

      {/* Search */}
      <div className="mb-4">
        <div className="relative max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-muted" />
          <input
            type="text"
            placeholder="Search partials..."
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
            className="w-full pl-9 pr-3 py-2 text-sm border border-border-primary rounded-md bg-background-primary text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-accent-primary/50"
          />
        </div>
      </div>

      {/* Content */}
      {session?.isSuperAdmin && !activeTenantId ? (
        <div className="flex flex-col items-center justify-center py-12 text-text-muted">
          <Code className="w-12 h-12 mb-3 opacity-50" />
          <p className="text-sm">Please select a tenant to view template partials</p>
        </div>
      ) : isLoading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-6 h-6 animate-spin text-text-muted" />
        </div>
      ) : error ? (
        <div className="flex flex-col items-center justify-center py-12 text-red-500">
          <AlertCircle className="w-8 h-8 mb-2" />
          <p className="text-sm">{error instanceof Error ? error.message : 'Failed to load partials'}</p>
        </div>
      ) : partials.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-12 text-text-muted">
          <Code className="w-12 h-12 mb-3 opacity-50" />
          <p className="text-sm">
            {search ? 'No partials found matching your search' : 'No partials yet'}
          </p>
          {!search && canManage && (
            <Button variant="ghost" size="sm" onClick={openCreate} className="mt-2">
              Create your first partial
            </Button>
          )}
        </div>
      ) : (
        <>
          {/* Partials Grid */}
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {partials.map((partial) => (
              <div
                key={partial.id}
                className="border border-border-primary rounded-lg bg-background-secondary p-4 hover:border-border-secondary transition-colors"
              >
                <div className="flex items-start justify-between gap-2 mb-2">
                  <div className="flex-1 min-w-0">
                    <h3 className="font-medium text-text-primary truncate">{partial.name}</h3>
                    <div className="mt-1">
                      <PartialSyntax name={partial.name} />
                    </div>
                  </div>
                  {canManage && (
                    <Dropdown>
                      <DropdownTrigger>
                        <button
                          type="button"
                          className="p-1 rounded hover:bg-background-tertiary text-text-muted"
                        >
                          <MoreVertical className="w-4 h-4" />
                        </button>
                      </DropdownTrigger>
                      <DropdownMenu>
                        <DropdownItem icon={<Pencil />} onClick={() => openEdit(partial)}>
                          Edit
                        </DropdownItem>
                        <DropdownItem icon={<Copy />} onClick={() => openDuplicate(partial)}>
                          Duplicate
                        </DropdownItem>
                        <DropdownItem icon={<FileCode />} onClick={() => openUsage(partial)}>
                          View Usage
                        </DropdownItem>
                        <DropdownItem
                          icon={<Trash2 />}
                          destructive
                          onClick={() => openDelete(partial)}
                        >
                          Delete
                        </DropdownItem>
                      </DropdownMenu>
                    </Dropdown>
                  )}
                </div>

                {partial.description && (
                  <p className="text-sm text-text-secondary mb-3 line-clamp-2">
                    {partial.description}
                  </p>
                )}

                <div className="flex items-center justify-between text-xs text-text-muted">
                  <UsageCount count={partial._count?.usedInTemplates || 0} />
                  <span>
                    Updated {format(new Date(partial.updatedAt), 'MMM d, yyyy')}
                  </span>
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

      {/* Create Modal */}
      <Modal isOpen={isCreateOpen} onClose={() => setIsCreateOpen(false)} title="Create Partial">
        <ModalBody>
          <div className="space-y-4">
            <FormInput
              label="Name"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              placeholder="signing-block"
              hint="Use lowercase with hyphens (e.g., signing-block, company-header)"
              inputSize="xs"
            />
            <FormInput
              label="Description"
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              placeholder="Brief description of this partial"
              inputSize="xs"
            />
            <div>
              <label className="text-xs font-medium text-text-secondary block mb-1.5">Content</label>
              <textarea
                value={formData.content}
                onChange={(e) => {
                  setFormData({ ...formData, content: e.target.value });
                  autoResizeTextarea(e.target);
                }}
                placeholder="HTML content with placeholders..."
                className="w-full px-3 py-2 text-xs border border-border-primary rounded-md bg-background-primary text-text-primary placeholder:text-text-muted placeholder:text-xs focus:outline-none focus:ring-2 focus:ring-accent-primary/50 font-mono min-h-[120px] overflow-hidden resize-none"
              />
            </div>
          </div>
        </ModalBody>
        <ModalFooter>
          <Button variant="ghost" onClick={() => setIsCreateOpen(false)}>
            Cancel
          </Button>
          <Button
            variant="primary"
            onClick={handleCreate}
            isLoading={createMutation.isPending}
            disabled={!formData.name || !formData.content}
          >
            Create Partial
          </Button>
        </ModalFooter>
      </Modal>

      {/* Edit Modal */}
      <Modal isOpen={isEditOpen} onClose={() => setIsEditOpen(false)} title="Edit Partial">
        <ModalBody>
          <div className="space-y-4">
            <FormInput
              label="Name"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              placeholder="signing-block"
              hint="Use lowercase with hyphens (e.g., signing-block, company-header)"
              inputSize="xs"
            />
            <FormInput
              label="Description"
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              placeholder="Brief description of this partial"
              inputSize="xs"
            />
            <div>
              <label className="text-xs font-medium text-text-secondary block mb-1.5">Content</label>
              <textarea
                ref={editTextareaRef}
                value={formData.content}
                onChange={(e) => {
                  setFormData({ ...formData, content: e.target.value });
                  autoResizeTextarea(e.target);
                }}
                placeholder="HTML content with placeholders..."
                className="w-full px-3 py-2 text-xs border border-border-primary rounded-md bg-background-primary text-text-primary placeholder:text-text-muted placeholder:text-xs focus:outline-none focus:ring-2 focus:ring-accent-primary/50 font-mono min-h-[120px] overflow-hidden resize-none"
              />
            </div>
          </div>
        </ModalBody>
        <ModalFooter>
          <Button variant="ghost" onClick={() => setIsEditOpen(false)}>
            Cancel
          </Button>
          <Button
            variant="primary"
            onClick={handleUpdate}
            isLoading={updateMutation.isPending}
            disabled={!formData.name || !formData.content}
          >
            Save Changes
          </Button>
        </ModalFooter>
      </Modal>

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
          <Button variant="ghost" onClick={() => setIsDuplicateOpen(false)}>
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
              <Loader2 className="w-5 h-5 animate-spin text-text-muted" />
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
