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
import { SearchableSelect } from '@/components/ui/searchable-select';
import {
  TEMPLATE_PARTIAL_CATEGORY_OPTIONS,
  templatePartialCategoryLabel,
  type TemplatePartialCategoryValue,
} from '@/lib/validations/template-partial';
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
  Code,
  FileCode,
  ChevronRight,
  Loader2,
  AlertCircle,
  Eye,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { format } from 'date-fns';
import { isOakDocTemplate as isOakDocContentJson } from '@/lib/document-editor/oakdoc-template';
import { LibraryViewSelect, TemplateLibraryShell, type LibraryView } from '../template-library-shell';

function isWordPartial(partial: { contentJson?: unknown }): boolean {
  return isOakDocContentJson(partial.contentJson);
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
// Partial Templates List
// ============================================================================

function TemplatePartialsTab({
  activeTenantId,
  canCreate,
  canUpdate,
  canDelete,
  isSuperAdmin,
}: {
  activeTenantId: string;
  canCreate: boolean;
  canUpdate: boolean;
  canDelete: boolean;
  isSuperAdmin: boolean;
}) {
  const router = useRouter();
  const { success, error: showError } = useToast();

  // Search state
  const [view, setView] = useState<LibraryView>('word');
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState<TemplatePartialCategoryValue | ''>('');
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
    editor: view === 'word' ? 'oakdoc' : 'a4',
    category: category || undefined,
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
    router.push('/template-partials/editor?type=partial&tab=partials');
  };

  const openEdit = (partial: TemplatePartialWithRelations) => {
    router.push(`/template-partials/editor?type=partial&tab=partials&id=${partial.id}`);
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
            placeholder={view === 'word' ? 'Search Word partials...' : 'Search archived A4 partials...'}
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
            className="w-full h-9 pl-9 pr-4 border border-border-primary rounded-md bg-background-primary text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-accent-primary/50 text-sm"
          />
        </div>
        <div className="w-full sm:w-44">
          <SearchableSelect
            ariaLabel="Category"
            options={[{ value: '', label: 'All categories' }, ...TEMPLATE_PARTIAL_CATEGORY_OPTIONS]}
            value={category}
            onChange={(next) => {
              setCategory(TEMPLATE_PARTIAL_CATEGORY_OPTIONS.find((option) => option.value === next)?.value ?? '');
              setPage(1);
            }}
            clearable={false}
            size="sm"
          />
        </div>
        <LibraryViewSelect
          value={view}
          noun="partials"
          onChange={(next) => {
            setView(next);
            setPage(1);
          }}
        />
        {canCreate && (
          <Button variant="primary" className="h-9" leftIcon={<Plus />} onClick={openCreate}>
            New Word partial
          </Button>
        )}
      </div>

      {/* Content */}
      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-6 h-6 animate-spin text-text-muted" />
        </div>
      ) : error ? (
        <div className="card border-status-error bg-status-error/5 mb-4">
          <div className="flex items-center gap-3 text-status-error">
            <AlertCircle className="w-5 h-5" />
            <p>{error instanceof Error ? error.message : 'Failed to load partials'}</p>
          </div>
        </div>
      ) : partials.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-12">
          <Code className="w-12 h-12 mb-3 opacity-50 text-text-muted" />
          <p className="text-sm text-text-muted">
            {view === 'archived'
              ? search ? 'No archived A4 partials found matching your search' : 'No archived A4 partials'
              : search ? 'No Word partials found matching your search' : 'No Word partials yet'}
          </p>
          {!search && canCreate && view === 'word' && (
            <button
              onClick={openCreate}
              className="mt-3 px-4 py-1.5 text-sm text-text-secondary bg-background-tertiary hover:bg-background-elevated rounded-full transition-colors"
            >
              Create your first Word partial
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
                className="card hover:border-accent-primary transition-colors"
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <button
                        onClick={() => canUpdate && openEdit(partial)}
                        className={cn(
                          "font-medium text-text-primary text-left",
                          canUpdate && "hover:text-accent-primary hover:underline cursor-pointer"
                        )}
                      >
                        {partial.displayName || partial.name}
                      </button>
                      <span className="inline-flex items-center rounded-full bg-background-tertiary px-2 py-0.5 text-xs text-text-secondary">
                        {templatePartialCategoryLabel(partial.category)}
                      </span>
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

                    {(canCreate || canUpdate || canDelete) && (
                      <Dropdown>
                        <DropdownTrigger asChild>
                          <button className="p-1.5 rounded hover:bg-background-tertiary text-text-muted hover:text-text-primary transition-colors">
                            <MoreVertical className="w-4 h-4" />
                          </button>
                        </DropdownTrigger>
                        <DropdownMenu align="right">
                          {canUpdate && <DropdownItem icon={<Pencil className="w-4 h-4" />} onClick={() => openEdit(partial)}>{isWordPartial(partial) ? 'Edit' : 'View'}</DropdownItem>}
                          {canCreate && isWordPartial(partial) && <DropdownItem icon={<Copy className="w-4 h-4" />} onClick={() => openDuplicate(partial)}>Duplicate</DropdownItem>}
                          <DropdownItem
                            icon={<FileCode className="w-4 h-4" />}
                            onClick={() => openUsage(partial)}
                          >
                            View Usage
                          </DropdownItem>
                          {canDelete && <DropdownItem icon={<Trash2 className="w-4 h-4" />} destructive onClick={() => openDelete(partial)}>Delete</DropdownItem>}
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

      {/* Create/Edit now handled by full-page editor at /template-partials/editor?type=partial */}

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
          ) : usageData?.templates.length === 0 && usageData.serviceVariants.length === 0 ? (
            <p className="text-sm text-text-muted text-center py-8">
              This partial is not used in any templates or service variants yet.
            </p>
          ) : (
            <div className="space-y-4">
              {usageData?.templates.length ? <div className="space-y-2">
                <p className="text-sm text-text-secondary">
                  Used in {usageData.usageCount} template{usageData.usageCount !== 1 ? 's' : ''}:
                </p>
                {usageData.templates.map((template) => (
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
              </div> : null}
              {usageData?.serviceVariants.length ? <div className="space-y-2">
                <p className="text-sm text-text-secondary">
                  Linked to {usageData.serviceVariantCount} service variant{usageData.serviceVariantCount !== 1 ? 's' : ''}:
                </p>
                {usageData.serviceVariants.map((variant) => (
                  <div
                    key={variant.id}
                    className="flex items-center justify-between p-3 rounded-md bg-background-tertiary"
                  >
                    <p className="text-sm font-medium text-text-primary">{variant.name}</p>
                    <span className={variant.isActive ? 'badge badge-success' : 'badge badge-neutral'}>
                      {variant.isActive ? 'Active' : 'Inactive'}
                    </span>
                  </div>
                ))}
              </div> : null}
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

export default function PartialTemplatesPage() {
  return (
    <TemplateLibraryShell title="Partials" description="Manage reusable Word partials used inside document templates.">
      {({ activeTenantId, can, isSuperAdmin }) => (
        <TemplatePartialsTab
          activeTenantId={activeTenantId}
          canCreate={can.createDocument}
          canUpdate={can.updateDocument}
          canDelete={can.deleteDocument}
          isSuperAdmin={isSuperAdmin}
        />
      )}
    </TemplateLibraryShell>
  );
}
