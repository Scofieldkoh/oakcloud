'use client';

import { useMemo, useState } from 'react';
import { DndContext, KeyboardSensor, PointerSensor, closestCenter, useSensor, useSensors, type DragEndEvent } from '@dnd-kit/core';
import { SortableContext, arrayMove, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { CheckSquare, FileText, GripVertical, Mail, PenLine, Plus, Trash2, Building2, CircleCheckBig } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { FormInput } from '@/components/ui/form-input';
import { Toggle } from '@/components/ui/toggle';
import type { TaskPipeline } from '@/hooks/use-task-pipelines';
import type { TaskPipelineCreatePayload } from '@/services/tasks/types';
import { createTaskPipelineSchema } from '@/lib/validations/task-pipeline';
import type { ZodIssue } from 'zod';

type ActionType = 'MANUAL' | 'COMPANY_PROFILE' | 'DOCUMENT_GENERATION' | 'ESIGNING';
type ChecklistItem = { label: string; position?: number };
type ActionConfigs = Partial<Record<ActionType, Record<string, unknown>>>;
type StageDraft = { id: string; name: string; description: string; actionType: ActionType; icon: string; isRequired: boolean; actionConfig: Record<string, unknown>; actionConfigs?: ActionConfigs; checklistItems: ChecklistItem[] };
export type PipelineDraft = { name: string; description: string; stages: StageDraft[] };
export type TemplateOption = { id: string; name: string };

const ACTION_DEFAULTS: Record<ActionType, string> = { MANUAL: 'CircleCheckBig', COMPANY_PROFILE: 'Building2', DOCUMENT_GENERATION: 'FileText', ESIGNING: 'PenLine' };
const ICONS = [{ name: 'CircleCheckBig', Icon: CircleCheckBig }, { name: 'Building2', Icon: Building2 }, { name: 'FileText', Icon: FileText }, { name: 'PenLine', Icon: PenLine }, { name: 'Mail', Icon: Mail }, { name: 'CheckSquare', Icon: CheckSquare }];

function id() { return `stage-${Date.now()}-${Math.random().toString(36).slice(2)}`; }
function blankStage(index: number): StageDraft { return { id: id(), name: `Stage ${index + 1}`, description: '', actionType: 'MANUAL', icon: 'CircleCheckBig', isRequired: true, actionConfig: {}, actionConfigs: { MANUAL: {} }, checklistItems: [] }; }
function checklistFromConfig(config: Record<string, unknown> | null) { return Array.isArray(config?.checklistItems) ? config.checklistItems.filter((item): item is ChecklistItem => Boolean(item && typeof item === 'object' && typeof (item as ChecklistItem).label === 'string')) : []; }

function activeConfig(stage: StageDraft) {
  return stage.actionConfigs?.[stage.actionType] ?? stage.actionConfig;
}

function updateActionConfig(stage: StageDraft, patch: Record<string, unknown>): StageDraft {
  const nextConfig = { ...activeConfig(stage), ...patch };
  return {
    ...stage,
    actionConfig: nextConfig,
    actionConfigs: { ...stage.actionConfigs, [stage.actionType]: nextConfig },
  };
}

function changeActionType(stage: StageDraft, actionType: ActionType): StageDraft {
  const actionConfigs = { ...stage.actionConfigs, [stage.actionType]: activeConfig(stage) };
  const nextConfig = actionConfigs[actionType] ?? {};
  return { ...stage, actionType, icon: ACTION_DEFAULTS[actionType], actionConfig: nextConfig, actionConfigs };
}

function validationMessage(issue: ZodIssue) {
  const [field, stageIndex, stageField, checklistIndex, checklistField] = issue.path;
  if (field === 'name') return issue.code === 'too_big' ? 'Pipeline name must be 200 characters or fewer' : 'Pipeline name is required';
  if (field === 'description') return 'Pipeline description must be 2000 characters or fewer';
  if (field === 'stages' && typeof stageIndex !== 'number') return issue.code === 'too_big' ? 'A pipeline can have at most 100 stages' : 'Add at least one stage';
  const prefix = `Stage ${Number(stageIndex) + 1}`;
  if (stageField === 'name') return issue.code === 'too_big' ? `${prefix} name must be 200 characters or fewer` : `${prefix} name is required`;
  if (stageField === 'description') return `${prefix} description must be 2000 characters or fewer`;
  if (stageField === 'icon') return issue.code === 'too_big' ? `${prefix} icon must be 100 characters or fewer` : `${prefix} icon is required`;
  if (stageField === 'checklistItems' && typeof checklistIndex === 'number' && checklistField === 'label') {
    return issue.code === 'too_big'
      ? `${prefix} checklist item ${checklistIndex + 1} must be 300 characters or fewer`
      : `${prefix} checklist item ${checklistIndex + 1} is required`;
  }
  return issue.message;
}

export function pipelineToDraft(pipeline: TaskPipeline): PipelineDraft {
  const version = pipeline.versions[0];
  return { name: pipeline.name, description: pipeline.description ?? '', stages: (version?.stages ?? []).slice().sort((a, b) => a.position - b.position).map((stage) => {
    const actionConfig = { ...(stage.actionConfig ?? {}) };
    return { id: stage.id, name: stage.name, description: stage.description ?? '', actionType: stage.actionType, icon: stage.icon, isRequired: stage.isRequired, actionConfig, actionConfigs: { [stage.actionType]: actionConfig }, checklistItems: checklistFromConfig(stage.actionConfig) };
  }) };
}

function SortableStage({ stage, index, templates, onChange, onRemove, onMove }: { stage: StageDraft; index: number; templates: TemplateOption[]; onChange: (next: StageDraft) => void; onRemove: () => void; onMove: (direction: -1 | 1) => void }) {
  const { attributes, listeners, setActivatorNodeRef, setNodeRef, transform, transition } = useSortable({ id: stage.id });
  const [iconSearch, setIconSearch] = useState('');
  const config = activeConfig(stage);
  const iconOptions = useMemo(() => ICONS.filter(({ name }) => name.toLowerCase().includes(iconSearch.toLowerCase())), [iconSearch]);
  const updateConfig = (patch: Record<string, unknown>) => onChange(updateActionConfig(stage, patch));
  return <article ref={setNodeRef} style={{ transform: CSS.Transform.toString(transform), transition }} className="rounded-lg border border-border-primary bg-background-elevated p-3">
    <div className="mb-3 flex items-center gap-2"><button ref={setActivatorNodeRef} type="button" aria-label="Drag stage" className="cursor-grab rounded p-1 text-text-muted focus-visible:ring-2 focus-visible:ring-oak-primary" {...attributes} {...listeners}><GripVertical className="h-4 w-4" /></button><span data-testid="pipeline-stage-name" className="flex-1 text-sm font-semibold text-text-primary">{stage.name}</span><Button variant="ghost" size="xs" iconOnly aria-label="Move stage up" disabled={index === 0} onClick={() => onMove(-1)}>↑</Button><Button variant="ghost" size="xs" iconOnly aria-label="Move stage down" onClick={() => onMove(1)}>↓</Button><Button variant="ghost" size="xs" iconOnly aria-label="Remove stage" className="text-status-error" onClick={onRemove}><Trash2 /></Button></div>
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2"><FormInput label="Stage name" value={stage.name} onChange={(event) => onChange({ ...stage, name: event.target.value })} /><FormInput label="Description" value={stage.description} onChange={(event) => onChange({ ...stage, description: event.target.value })} /></div>
    <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2"><label className="text-xs font-medium text-text-secondary">Action type<select aria-label="Action type" value={stage.actionType} onChange={(event) => onChange(changeActionType(stage, event.target.value as ActionType))} className="mt-2 h-8 w-full rounded-lg border border-border-primary bg-background-primary px-3 text-sm text-text-primary"><option value="MANUAL">Manual</option><option value="COMPANY_PROFILE">Company profile</option><option value="DOCUMENT_GENERATION">Document generation</option><option value="ESIGNING">E-signing</option></select></label><Toggle size="sm" label={stage.isRequired ? 'Required stage' : 'Optional stage'} checked={stage.isRequired} onChange={(isRequired) => onChange({ ...stage, isRequired })} /></div>
    <div className="mt-3"><FormInput label="Search icons" value={iconSearch} onChange={(event) => setIconSearch(event.target.value)} placeholder="Search curated icons" /><div className="mt-2 flex flex-wrap gap-2">{iconOptions.map(({ name, Icon }) => <button key={name} type="button" aria-label={name} onClick={() => onChange({ ...stage, icon: name })} className={`inline-flex h-8 w-8 items-center justify-center rounded border ${stage.icon === name ? 'border-oak-primary bg-oak-primary/10' : 'border-border-primary'} text-text-secondary focus-visible:ring-2 focus-visible:ring-oak-primary`}><Icon className="h-4 w-4" /></button>)}</div></div>
    {stage.actionType === 'COMPANY_PROFILE' && <div className="mt-3"><Toggle size="sm" label="Allow creating a company" checked={config.allowCreate === true} onChange={(allowCreate) => updateConfig({ allowCreate })} /></div>}
    {stage.actionType === 'DOCUMENT_GENERATION' && <label className="mt-3 block text-xs font-medium text-text-secondary">Default document template <span className="font-normal text-text-muted">(optional)</span><select aria-label="Default document template" value={typeof config.templateId === 'string' ? config.templateId : ''} onChange={(event) => updateConfig({ templateId: event.target.value || undefined })} className="mt-2 h-8 w-full rounded-lg border border-border-primary bg-background-primary px-3 text-sm text-text-primary"><option value="">Let task users choose</option>{templates.map((template) => <option key={template.id} value={template.id}>{template.name}</option>)}</select></label>}
    {stage.actionType === 'ESIGNING' && <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2"><label className="text-xs font-medium text-text-secondary">Signing order<select aria-label="Signing order" value={typeof config.signingOrder === 'string' ? config.signingOrder : 'PARALLEL'} onChange={(event) => updateConfig({ signingOrder: event.target.value })} className="mt-2 h-8 w-full rounded-lg border border-border-primary bg-background-primary px-3 text-sm text-text-primary"><option value="PARALLEL">Parallel</option><option value="SEQUENTIAL">Sequential</option><option value="MIXED">Mixed</option></select></label><label className="text-xs font-medium text-text-secondary">Expires in days<input aria-label="Expires in days" type="number" min={1} step={1} value={typeof config.expiresInDays === 'number' ? config.expiresInDays : ''} onChange={(event) => updateConfig({ expiresInDays: event.target.value === '' ? undefined : Number(event.target.value) })} className="mt-2 h-8 w-full rounded-lg border border-border-primary bg-background-primary px-3 text-sm text-text-primary" /></label></div>}
    <div className="mt-3 border-t border-border-primary pt-3"><div className="flex items-center justify-between"><span className="text-xs font-medium text-text-secondary">Checklist</span><Button variant="ghost" size="xs" leftIcon={<Plus />} onClick={() => onChange({ ...stage, checklistItems: [...stage.checklistItems, { label: '' }] })} aria-label="Add checklist item">Add item</Button></div><div className="mt-2 space-y-2">{stage.checklistItems.map((item, itemIndex) => <div key={`${stage.id}-${itemIndex}`} className="flex gap-2"><input aria-label={`Checklist item ${itemIndex + 1}`} value={item.label} onChange={(event) => onChange({ ...stage, checklistItems: stage.checklistItems.map((entry, entryIndex) => entryIndex === itemIndex ? { ...entry, label: event.target.value } : entry) })} className="h-8 min-w-0 flex-1 rounded-lg border border-border-primary bg-background-primary px-3 text-sm text-text-primary" /><Button variant="ghost" size="xs" iconOnly aria-label="Remove checklist item" onClick={() => onChange({ ...stage, checklistItems: stage.checklistItems.filter((_, entryIndex) => entryIndex !== itemIndex) })}><Trash2 /></Button></div>)}</div></div>
  </article>;
}

export function PipelineBuilder({ initialDraft, templates, onCancel, onSave, isSaving = false }: { initialDraft: PipelineDraft; templates: TemplateOption[]; onCancel: () => void; onSave: (draft: TaskPipelineCreatePayload) => void | Promise<void>; isSaving?: boolean }) {
  const [draft, setDraft] = useState(initialDraft); const [errors, setErrors] = useState<string[]>([]);
  const sensors = useSensors(useSensor(PointerSensor), useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }));
  const move = (from: number, to: number) => setDraft((value) => ({ ...value, stages: to < 0 || to >= value.stages.length ? value.stages : arrayMove(value.stages, from, to) }));
  const save = () => { const payload = { name: draft.name.trim(), description: draft.description.trim() || null, stages: draft.stages.map((stage, position) => ({ name: stage.name.trim(), description: stage.description.trim() || null, position, actionType: stage.actionType, icon: stage.icon.trim(), isRequired: stage.isRequired, actionConfig: { ...activeConfig(stage) }, checklistItems: stage.checklistItems.map((item, itemPosition) => ({ label: item.label.trim(), position: itemPosition })) })) }; const schemaResult = createTaskPipelineSchema.safeParse(payload); const schemaErrors = schemaResult.success ? [] : schemaResult.error.issues.map(validationMessage); const nextErrors = Array.from(new Set([...schemaErrors, ...draft.stages.flatMap((stage, index) => {
    const prefix = `Stage ${index + 1}`; const config = activeConfig(stage); const stageErrors = [!stage.name.trim() && `${prefix} name is required`, stage.name.trim().length > 200 && `${prefix} name must be 200 characters or fewer`, stage.description.trim().length > 2000 && `${prefix} description must be 2000 characters or fewer`, !stage.icon.trim() && `${prefix} icon is required`, ...stage.checklistItems.flatMap((item, itemIndex) => [!item.label.trim() && `${prefix} checklist item ${itemIndex + 1} is required`, item.label.trim().length > 300 && `${prefix} checklist item ${itemIndex + 1} must be 300 characters or fewer`])];
    if (stage.actionType === 'COMPANY_PROFILE' && config.allowCreate !== undefined && typeof config.allowCreate !== 'boolean') stageErrors.push(`${prefix} allow-create setting must be true or false`);
    if (stage.actionType === 'DOCUMENT_GENERATION' && config.templateId !== undefined && (typeof config.templateId !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(config.templateId))) stageErrors.push(`${prefix} template must be a valid document template`);
    if (stage.actionType === 'ESIGNING' && config.signingOrder !== undefined && !['PARALLEL', 'SEQUENTIAL', 'MIXED'].includes(String(config.signingOrder))) stageErrors.push(`${prefix} signing order is invalid`);
    if (stage.actionType === 'ESIGNING' && config.expiresInDays !== undefined && (!Number.isInteger(config.expiresInDays) || Number(config.expiresInDays) <= 0)) stageErrors.push(`${prefix} expiry must be a whole number of days`);
    return stageErrors;
  })].filter(Boolean) as string[])); setErrors(nextErrors); if (nextErrors.length) return; void Promise.resolve(onSave(payload)).catch(() => undefined); };
  return <form noValidate onSubmit={(event) => { event.preventDefault(); save(); }} className="mx-auto max-w-4xl space-y-4"><div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"><div><h1 className="text-xl font-semibold text-text-primary">{initialDraft.name ? 'Edit pipeline' : 'New pipeline'}</h1><p className="mt-1 text-sm text-text-secondary">Saving publishes a new version for future tasks.</p></div><div className="flex gap-2"><Button variant="secondary" onClick={onCancel}>Cancel</Button><Button type="submit" isLoading={isSaving} aria-label="Save pipeline">Save pipeline</Button></div></div>{errors.length > 0 && <div role="alert" className="rounded-lg border border-status-error/30 bg-status-error/10 p-3 text-sm text-status-error">{errors.map((error) => <p key={error}>{error}</p>)}</div>}<div className="card space-y-3 p-4"><FormInput label="Pipeline name" value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} /><label className="block text-xs font-medium text-text-secondary">Description<textarea aria-label="Pipeline description" value={draft.description} onChange={(event) => setDraft({ ...draft, description: event.target.value })} rows={3} className="mt-2 w-full rounded-lg border border-border-primary bg-background-primary px-3 py-2 text-sm text-text-primary" /></label></div><section aria-label="Pipeline stages" className="space-y-3"><div className="flex items-center justify-between"><h2 className="text-lg font-semibold text-text-primary">Stages</h2><Button variant="secondary" size="sm" leftIcon={<Plus />} onClick={() => setDraft({ ...draft, stages: [...draft.stages, blankStage(draft.stages.length)] })} aria-label="Add stage">Add stage</Button></div><DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={(event: DragEndEvent) => { const oldIndex = draft.stages.findIndex((stage) => stage.id === event.active.id); const newIndex = draft.stages.findIndex((stage) => stage.id === event.over?.id); if (oldIndex >= 0 && newIndex >= 0) move(oldIndex, newIndex); }}><SortableContext items={draft.stages.map((stage) => stage.id)} strategy={verticalListSortingStrategy}>{draft.stages.map((stage, index) => <SortableStage key={stage.id} stage={stage} index={index} templates={templates} onChange={(next) => setDraft({ ...draft, stages: draft.stages.map((entry) => entry.id === next.id ? next : entry) })} onRemove={() => setDraft({ ...draft, stages: draft.stages.filter((entry) => entry.id !== stage.id) })} onMove={(direction) => move(index, index + direction)} />)}</SortableContext></DndContext></section></form>;
}
