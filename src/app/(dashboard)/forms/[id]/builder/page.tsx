'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import {
  closestCenter,
  DndContext,
  DragOverlay,
  PointerSensor,
  pointerWithin,
  useSensor,
  useSensors,
  type DragCancelEvent,
  type DragOverEvent,
  type DragStartEvent,
  type CollisionDetection,
  type DragEndEvent,
} from '@dnd-kit/core';
import { arrayMove, rectSortingStrategy, SortableContext } from '@dnd-kit/sortable';
import { ChevronLeft, CircleHelp, ClipboardCopy, Plus, Save, Settings2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { FormInput } from '@/components/ui/form-input';
import { useToast } from '@/components/ui/toast';
import { useForm, useUpdateForm } from '@/hooks/use-forms';
import { useUnsavedChangesWarning } from '@/hooks/use-unsaved-changes';
import { FieldEditorDrawer } from '@/components/forms/field-editor-drawer';
import { SortableFieldCard } from '@/components/forms/sortable-field-card';
import {
  FIELD_TYPE_LABEL,
  defaultField,
  fromServerField,
  normalizeKey,
  serializeBuilderState,
  toPayloadFields,
} from '@/components/forms/builder-utils';
import type { BuilderField } from '@/components/forms/builder-utils';

function resequence(nextFields: BuilderField[]): BuilderField[] {
  return nextFields.map((field, index) => ({ ...field, position: index }));
}

export default function FormBuilderPage() {
  const params = useParams<{ id: string }>();
  const { success, error: showError } = useToast();
  const formId = params.id;

  const { data: form, isLoading, error } = useForm(formId);
  const updateForm = useUpdateForm(formId);

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [status, setStatus] = useState<'DRAFT' | 'PUBLISHED' | 'ARCHIVED'>('DRAFT');
  const [tagsText, setTagsText] = useState('');
  const [fields, setFields] = useState<BuilderField[]>([]);
  const [selectedFieldId, setSelectedFieldId] = useState<string | null>(null);
  const [dragActiveId, setDragActiveId] = useState<string | null>(null);
  const [dragOverId, setDragOverId] = useState<string | null>(null);
  const [dragDropPosition, setDragDropPosition] = useState<'before' | 'after' | null>(null);
  const [dragOverlayWidth, setDragOverlayWidth] = useState<number | null>(null);
  const [showSettings, setShowSettings] = useState(false);
  const [isHydrated, setIsHydrated] = useState(false);
  const baselineSnapshot = useRef<string>('');

  useEffect(() => {
    setIsHydrated(true);
  }, []);

  useEffect(() => {
    if (!form) return;

    const mappedFields = form.fields.map((field) => fromServerField({
      id: field.id,
      type: field.type,
      label: field.label,
      key: field.key,
      placeholder: field.placeholder,
      subtext: field.subtext,
      helpText: field.helpText,
      inputType: field.inputType,
      options: field.options,
      validation: field.validation,
      condition: field.condition,
      isRequired: field.isRequired,
      hideLabel: field.hideLabel,
      isReadOnly: field.isReadOnly,
      layoutWidth: field.layoutWidth,
      position: field.position,
    }));

    setTitle(form.title);
    setDescription(form.description || '');
    setStatus(form.status as 'DRAFT' | 'PUBLISHED' | 'ARCHIVED');
    setTagsText(form.tags.join(', '));
    setFields(mappedFields);
    setSelectedFieldId(null);

    baselineSnapshot.current = serializeBuilderState({
      title: form.title,
      description: form.description || '',
      status: form.status as 'DRAFT' | 'PUBLISHED' | 'ARCHIVED',
      tags: form.tags,
      fields: mappedFields,
    });
  }, [form]);

  const tags = useMemo(
    () => tagsText.split(',').map((tag) => tag.trim()).filter(Boolean),
    [tagsText]
  );

  const stateSnapshot = serializeBuilderState({
    title,
    description,
    status,
    tags,
    fields,
  });

  const isDirty = isHydrated && !!baselineSnapshot.current && stateSnapshot !== baselineSnapshot.current;
  useUnsavedChangesWarning(isDirty, true);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 8 } }));
  const collisionDetection: CollisionDetection = (args) => {
    const pointerCollisions = pointerWithin(args);
    if (pointerCollisions.length > 0) {
      return pointerCollisions;
    }
    return closestCenter(args);
  };
  const selectedField = fields.find(
    (field) => field.clientId === selectedFieldId && field.type !== 'PAGE_BREAK'
  ) || null;
  const dragActiveField = fields.find((field) => field.clientId === dragActiveId) || null;

  function updateField(clientId: string, updater: (field: BuilderField) => BuilderField) {
    setFields((prev) => prev.map((field) => (field.clientId === clientId ? updater(field) : field)));
  }

  function clearDragPreview() {
    setDragActiveId(null);
    setDragOverId(null);
    setDragDropPosition(null);
    setDragOverlayWidth(null);
  }

  function handleDragStart(event: DragStartEvent) {
    setDragActiveId(String(event.active.id));
    setDragOverId(null);
    setDragDropPosition(null);
    setDragOverlayWidth(event.active.rect.current.initial?.width ?? null);
  }

  function handleDragOver(event: DragOverEvent) {
    const overId = event.over ? String(event.over.id) : null;
    if (!overId) {
      setDragOverId(null);
      setDragDropPosition(null);
      return;
    }

    const activeId = String(event.active.id);
    const activeIndex = fields.findIndex((field) => field.clientId === activeId);
    const overIndex = fields.findIndex((field) => field.clientId === overId);

    if (activeIndex < 0 || overIndex < 0 || activeId === overId) {
      setDragOverId(overId);
      setDragDropPosition(null);
      return;
    }

    setDragOverId(overId);
    const activeRect = event.active.rect.current.translated ?? event.active.rect.current.initial;
    const overRect = event.over?.rect;

    if (activeRect && overRect) {
      const activeCenterX = activeRect.left + activeRect.width / 2;
      const activeCenterY = activeRect.top + activeRect.height / 2;
      const overCenterX = overRect.left + overRect.width / 2;
      const overCenterY = overRect.top + overRect.height / 2;
      const sameRow = Math.abs(activeCenterY - overCenterY) < Math.min(activeRect.height, overRect.height) * 0.6;

      setDragDropPosition(
        sameRow
          ? (activeCenterX < overCenterX ? 'before' : 'after')
          : (activeCenterY < overCenterY ? 'before' : 'after')
      );
      return;
    }

    setDragDropPosition(activeIndex < overIndex ? 'after' : 'before');
  }

  function handleDragCancel(_event: DragCancelEvent) {
    clearDragPreview();
  }

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) {
      clearDragPreview();
      return;
    }

    setFields((prev) => {
      const activeId = String(active.id);
      const overId = String(over.id);
      const oldIndex = prev.findIndex((field) => field.clientId === activeId);
      const newIndex = prev.findIndex((field) => field.clientId === overId);
      if (oldIndex < 0 || newIndex < 0) return prev;

      if (!dragDropPosition) {
        return resequence(arrayMove(prev, oldIndex, newIndex));
      }

      const next = [...prev];
      const [moved] = next.splice(oldIndex, 1);
      const overIndexAfterRemoval = next.findIndex((field) => field.clientId === overId);
      if (!moved || overIndexAfterRemoval < 0) return prev;

      const insertIndex = dragDropPosition === 'after' ? overIndexAfterRemoval + 1 : overIndexAfterRemoval;
      next.splice(Math.max(0, Math.min(insertIndex, next.length)), 0, moved);
      return resequence(next);
    });

    clearDragPreview();
  }

  function addField(type: BuilderField['type']) {
    setFields((prev) => {
      const next = [...prev, defaultField(type, prev.length)];
      const created = next[next.length - 1];
      setSelectedFieldId(type === 'PAGE_BREAK' ? null : created.clientId);
      return resequence(next);
    });
  }

  function duplicateField(clientId: string) {
    setFields((prev) => {
      const index = prev.findIndex((field) => field.clientId === clientId);
      if (index < 0) return prev;

      const source = prev[index];
      const copy: BuilderField = {
        ...source,
        clientId: `copy_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
        id: undefined,
        label: source.label ? `${source.label} (Copy)` : 'Untitled field',
        key: `${source.key}_copy`,
      };

      const next = [...prev.slice(0, index + 1), copy, ...prev.slice(index + 1)];
      setSelectedFieldId(copy.type === 'PAGE_BREAK' ? null : copy.clientId);
      return resequence(next);
    });
  }

  function deleteField(clientId: string) {
    setFields((prev) => {
      const next = prev.filter((field) => field.clientId !== clientId);
      if (selectedFieldId === clientId) {
        setSelectedFieldId(next.find((field) => field.type !== 'PAGE_BREAK')?.clientId || null);
      }
      return resequence(next);
    });
  }

  function setFieldWidth(clientId: string, width: BuilderField['layoutWidth']) {
    updateField(clientId, (field) => ({ ...field, layoutWidth: width }));
  }

  function selectField(clientId: string) {
    const candidate = fields.find((field) => field.clientId === clientId);
    if (!candidate || candidate.type === 'PAGE_BREAK') {
      setSelectedFieldId(null);
      return;
    }

    setSelectedFieldId(clientId);
  }

  async function persistForm(nextStatus: 'DRAFT' | 'PUBLISHED' | 'ARCHIVED', successMessage: string) {
    try {
      if (!title.trim()) {
        showError('Form title is required');
        return;
      }

      const normalizedKeys = new Set<string>();
      const correctedFields = fields.map((field, index) => {
        let key = normalizeKey(field.key || field.label || `field_${index + 1}`);
        let suffix = 1;
        while (normalizedKeys.has(key)) {
          suffix += 1;
          key = `${key}_${suffix}`;
        }
        normalizedKeys.add(key);
        return { ...field, key, position: index };
      });

      setFields(correctedFields);

      const saved = await updateForm.mutateAsync({
        title: title.trim(),
        description: description.trim() || null,
        status: nextStatus,
        tags,
        fields: toPayloadFields(correctedFields),
        reason: 'Manual form builder save',
      });

      setStatus(saved.status as 'DRAFT' | 'PUBLISHED' | 'ARCHIVED');

      baselineSnapshot.current = serializeBuilderState({
        title: saved.title,
        description: saved.description || '',
        status: saved.status as 'DRAFT' | 'PUBLISHED' | 'ARCHIVED',
        tags: saved.tags,
        fields: correctedFields,
      });

      success(successMessage);
    } catch (err) {
      showError(err instanceof Error ? err.message : 'Failed to save form');
    }
  }

  async function handleSave() {
    await persistForm(status, 'Form saved');
  }

  async function handlePublish() {
    await persistForm('PUBLISHED', 'Form published');
  }

  async function handleCopyPublicLink() {
    if (!form) return;

    try {
      const origin = window.location.origin;
      const link = `${origin}/forms/f/${form.slug}`;
      await navigator.clipboard.writeText(link);
      success('Public link copied');
    } catch {
      showError('Failed to copy public link');
    }
  }

  if (isLoading) {
    return (
      <div className="p-4 sm:p-6">
        <div className="h-10 w-72 animate-pulse rounded bg-background-tertiary mb-4" />
        <div className="h-80 animate-pulse rounded-lg border border-border-primary bg-background-elevated" />
      </div>
    );
  }

  if (error || !form) {
    return (
      <div className="p-4 sm:p-6">
        <div className="rounded-lg border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-900/20 p-4 text-sm text-red-700 dark:text-red-300">
          {error instanceof Error ? error.message : 'Form not found'}
        </div>
      </div>
    );
  }

  const isPublished = status === 'PUBLISHED';
  const viewHref = isPublished
    ? `/forms/f/${form.slug}`
    : `/forms/f/${form.slug}?preview=1&formId=${form.id}&tenantId=${form.tenantId}`;

  return (
    <div className="p-4 sm:p-6">
      <div className="mb-4 flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
        <div>
          <Link href="/forms" className="inline-flex items-center gap-1.5 text-sm text-text-secondary hover:text-text-primary">
            <ChevronLeft className="w-4 h-4" />
            Back to Forms
          </Link>
          <h1 className="mt-1 text-xl sm:text-2xl font-semibold text-text-primary">{title || 'Untitled form'}</h1>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <a href={viewHref} target="_blank" rel="noreferrer" className="inline-flex">
            <Button variant="secondary" size="sm">{isPublished ? 'View' : 'Preview'}</Button>
          </a>
          {isPublished && (
            <Button
              variant="secondary"
              size="sm"
              leftIcon={<ClipboardCopy className="w-4 h-4" />}
              onClick={handleCopyPublicLink}
            >
              Copy Public Link
            </Button>
          )}
          <Link href={`/forms/${form.id}/responses`}>
            <Button variant="secondary" size="sm">Responses</Button>
          </Link>
          {!isPublished && (
            <Button variant="primary" size="sm" onClick={handlePublish} isLoading={updateForm.isPending}>
              Publish
            </Button>
          )}
          <Button variant="secondary" size="sm" leftIcon={<Settings2 className="w-4 h-4" />} onClick={() => setShowSettings((v) => !v)}>
            Settings
          </Button>
          <Button variant={isDirty ? 'primary' : 'secondary'} size="sm" leftIcon={<Save className="w-4 h-4" />} onClick={handleSave} isLoading={updateForm.isPending}>
            {isDirty ? 'Save changes' : 'Saved'}
          </Button>
        </div>
      </div>

      <div className="rounded-lg border border-border-primary bg-background-elevated p-3 sm:p-4">
        <div className="mb-4 flex flex-col gap-3">
          <FormInput label="Form title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="KYC" />

          {showSettings && (
            <div className="rounded-lg border border-border-primary bg-background-primary p-3 space-y-3">
              <div>
                <label className="mb-1.5 block text-xs font-medium text-text-secondary">Status</label>
                <select
                  value={status}
                  onChange={(e) => setStatus(e.target.value as 'DRAFT' | 'PUBLISHED' | 'ARCHIVED')}
                  className="w-full rounded-lg border border-border-primary bg-background-secondary px-3 py-2 text-sm text-text-primary"
                >
                  <option value="DRAFT">Draft</option>
                  <option value="PUBLISHED">Published</option>
                  <option value="ARCHIVED">Archived</option>
                </select>
              </div>
              <FormInput label="Tags" value={tagsText} onChange={(e) => setTagsText(e.target.value)} placeholder="kyc, onboarding" />
              <div>
                <label className="mb-1.5 block text-xs font-medium text-text-secondary">Description</label>
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  className="w-full min-h-24 rounded-lg border border-border-primary bg-background-secondary px-3 py-2 text-sm text-text-primary"
                  placeholder="Describe this form"
                />
              </div>
              <p className="text-2xs text-text-muted inline-flex items-center gap-1">
                <CircleHelp className="w-3 h-3" />
                Publish to make this form available at public URL and embed code.
              </p>
            </div>
          )}
        </div>

        <DndContext
          sensors={sensors}
          collisionDetection={collisionDetection}
          onDragStart={handleDragStart}
          onDragOver={handleDragOver}
          onDragCancel={handleDragCancel}
          onDragEnd={handleDragEnd}
        >
          <SortableContext items={fields.map((field) => field.clientId)} strategy={rectSortingStrategy}>
            <div className="grid grid-cols-12 gap-3">
              {fields.map((field) => (
                <SortableFieldCard
                  key={field.clientId}
                  field={field}
                  selected={field.type !== 'PAGE_BREAK' && selectedFieldId === field.clientId}
                  isDropTarget={dragActiveId !== null && dragOverId === field.clientId && dragActiveId !== field.clientId}
                  dropPosition={dragActiveId !== null && dragOverId === field.clientId && dragActiveId !== field.clientId ? dragDropPosition : null}
                  onSelect={selectField}
                  onDuplicate={duplicateField}
                  onDelete={deleteField}
                  onSetWidth={setFieldWidth}
                />
              ))}
            </div>
          </SortableContext>
          <DragOverlay>
            {dragActiveField ? (
              <div
                style={{ width: dragOverlayWidth ?? 280 }}
                className="rounded-lg border border-border-primary bg-background-elevated px-3 py-3 shadow-elevation-2"
              >
                <div className="truncate font-semibold text-sm text-text-primary">
                  {dragActiveField.label || 'Untitled field'}
                </div>
                <div className="truncate text-xs text-text-secondary">
                  {FIELD_TYPE_LABEL[dragActiveField.type]}
                  {dragActiveField.key ? ` | ${dragActiveField.key}` : ''}
                </div>
              </div>
            ) : null}
          </DragOverlay>
        </DndContext>

        {fields.length === 0 && (
          <div className="mt-2 rounded-lg border border-dashed border-border-primary bg-background-primary p-4 text-sm text-text-secondary">
            This form has no fields yet. Add the first field below.
          </div>
        )}

        <div className="mt-4 flex flex-wrap items-center gap-2">
          <Button variant="secondary" size="sm" leftIcon={<Plus className="w-4 h-4" />} onClick={() => addField('SHORT_TEXT')}>
            Element
          </Button>
          <Button variant="secondary" size="sm" leftIcon={<Plus className="w-4 h-4" />} onClick={() => addField('PAGE_BREAK')}>
            Page
          </Button>
          <div className="text-xs text-text-muted">
            To publish: click <span className="font-medium text-text-primary">Publish</span> at the top right.
          </div>
        </div>
      </div>

      {selectedField && (
        <FieldEditorDrawer
          field={selectedField}
          allFields={fields}
          onClose={() => setSelectedFieldId(null)}
          onChange={(next) => updateField(selectedField.clientId, () => next)}
        />
      )}

      {selectedField && <div className="fixed inset-0 z-30 bg-black/20" onClick={() => setSelectedFieldId(null)} aria-hidden="true" />}
    </div>
  );
}
