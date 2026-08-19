'use client';

import { useMemo, useState, type FormEvent } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { FormInput } from '@/components/ui/form-input';
import type { DeadlineRuleDraftInput } from '@/lib/validations/deadline-rule';
import type { DeadlineRuleDto, DeadlineRuleVersionDto } from '@/services/deadline-rule';

type FormNode = Record<string, unknown>;
type DateExpression = DeadlineRuleDraftInput['milestones'][number]['expression'];

const COMPANY_FIELDS = [
  { value: 'entityType', label: 'Company entity type', kind: 'string' },
  { value: 'status', label: 'Company status', kind: 'string' },
  { value: 'primarySsicCode', label: 'Primary SSIC code', kind: 'string' },
  { value: 'isGstRegistered', label: 'GST registered', kind: 'boolean' },
  { value: 'isRegisteredCharity', label: 'Registered charity', kind: 'boolean' },
  { value: 'currentOfficerCount', label: 'Officer count', kind: 'number' },
  { value: 'currentShareholderCount', label: 'Shareholder count', kind: 'number' },
  { value: 'financialYearEnd', label: 'Financial year end', kind: 'date' },
  { value: 'nextAgmDueDate', label: 'Next AGM due date', kind: 'date' },
  { value: 'nextArDueDate', label: 'Next annual return due date', kind: 'date' },
] as const;

const EXPRESSION_KINDS = [
  { value: 'SOURCE', label: 'Direct source' },
  { value: 'ADD_CALENDAR_DAYS', label: 'Add calendar days' },
  { value: 'ADD_BUSINESS_DAYS', label: 'Add business days' },
  { value: 'ADD_MONTHS', label: 'Add months' },
  { value: 'RELATIVE_TO_SOURCE', label: 'Relative to source' },
  { value: 'ADJUST_BUSINESS_DAY', label: 'Adjust business day' },
] as const;

const SOURCE_KINDS = [
  { value: 'COMPANY_FIELD', label: 'Company date' },
  { value: 'CYCLE_START', label: 'Cycle start' },
  { value: 'CYCLE_END', label: 'Cycle end' },
  { value: 'SCHEDULE_ENTRY', label: 'Schedule entry' },
  { value: 'CURRENT_SCHEDULE_ENTRY', label: 'Current schedule entry' },
  { value: 'PARAMETER', label: 'Date parameter' },
  { value: 'MILESTONE', label: 'Earlier milestone' },
] as const;

const MILESTONE_TYPES = [
  { value: 'STATUTORY', label: 'Statutory' },
  { value: 'CLIENT', label: 'Client' },
  { value: 'INTERNAL', label: 'Internal' },
] as const;

function directSource(field = 'nextArDueDate'): FormNode {
  return { kind: 'COMPANY_FIELD', field };
}

function sourceExpression(field = 'nextArDueDate'): FormNode {
  return { kind: 'SOURCE', source: directSource(field) };
}

function asDateExpression(value: FormNode): DateExpression {
  return value as DateExpression;
}

function emptyMilestone(index: number): DeadlineRuleDraftInput['milestones'][number] {
  return {
    key: `milestone-${index + 1}`,
    name: `Milestone ${index + 1}`,
    description: null,
    type: 'CLIENT',
    generationMode: 'ONCE_PER_CYCLE',
    expression: asDateExpression(sourceExpression()),
    businessDayAdjustment: 'NONE',
    displayOrder: index,
    isActive: true,
  };
}

function emptyDraft(): DeadlineRuleDraftInput {
  return {
    code: '',
    name: '',
    description: null,
    recurrence: { schemaVersion: 1, kind: 'ANNUALLY' },
    applicability: { schemaVersion: 1, kind: 'ALL', conditions: [] },
    parameters: [],
    milestones: [emptyMilestone(0)],
  };
}

function draftFromVersion(rule: DeadlineRuleDto, version: DeadlineRuleVersionDto | null): DeadlineRuleDraftInput {
  if (!version) return emptyDraft();
  return {
    code: rule.code,
    name: rule.name,
    description: rule.description,
    recurrence: version.recurrence as DeadlineRuleDraftInput['recurrence'],
    applicability: version.applicability as DeadlineRuleDraftInput['applicability'],
    parameters: version.parameters.map((parameter) => ({
      key: parameter.key,
      label: parameter.label,
      description: parameter.description,
      type: parameter.type,
      required: parameter.required,
      ...(parameter.type === 'ENUM' && Array.isArray((parameter.validation as FormNode | null)?.options)
        ? { options: ((parameter.validation as FormNode).options as unknown[]).filter((option): option is string => typeof option === 'string') }
        : {}),
    })),
    milestones: version.milestones.map((milestone) => ({
      key: milestone.key,
      name: milestone.name,
      description: milestone.description,
      type: milestone.type,
      generationMode: milestone.generationMode,
      expression: milestone.expression as DeadlineRuleDraftInput['milestones'][number]['expression'],
      businessDayAdjustment: milestone.businessDayAdjustment,
      displayOrder: milestone.displayOrder,
      isActive: milestone.isActive,
    })),
  };
}

function fieldDefinition(field: string) {
  return COMPANY_FIELDS.find((candidate) => candidate.value === field) ?? COMPANY_FIELDS[0];
}

function initialPredicate(): FormNode {
  return { kind: 'FIELD_PRESENT', field: 'entityType' };
}

function initialGroup(kind: 'ALL' | 'ANY' = 'ALL'): FormNode {
  return { kind, conditions: [] };
}

function isGroup(node: FormNode): boolean {
  return node.kind === 'ALL' || node.kind === 'ANY';
}

function conditionsOf(node: FormNode): FormNode[] {
  return Array.isArray(node.conditions)
    ? node.conditions.filter((condition): condition is FormNode => typeof condition === 'object' && condition !== null && !Array.isArray(condition))
    : [];
}

function valueForField(field: string): unknown {
  const definition = fieldDefinition(field);
  if (definition.kind === 'boolean') return true;
  if (definition.kind === 'number') return 0;
  if (definition.kind === 'date') return '2026-01-01';
  return '';
}

function defaultPredicateForField(field: string): FormNode {
  const definition = fieldDefinition(field);
  return {
    kind: definition.kind === 'boolean' ? 'FIELD_TRUE' : 'FIELD_EQUALS',
    field,
    ...(definition.kind === 'boolean' ? {} : { value: valueForField(field) }),
  };
}

function predicateForOperator(field: string, operator: string, current: FormNode): FormNode {
  const definition = fieldDefinition(field);
  if (['FIELD_TRUE', 'FIELD_FALSE', 'FIELD_PRESENT', 'FIELD_MISSING'].includes(operator)) {
    return { kind: operator, field };
  }
  if (operator === 'FIELD_COMPARE') {
    return {
      kind: operator,
      field,
      operator: ['GT', 'GTE', 'LT', 'LTE'].includes(String(current.operator)) ? current.operator : 'GTE',
      value: definition.kind === 'number' && typeof current.value === 'number'
        ? current.value
        : definition.kind === 'date' && typeof current.value === 'string'
          ? current.value
          : valueForField(field),
    };
  }
  if (operator === 'FIELD_IN' || operator === 'FIELD_NOT_IN') {
    const values = Array.isArray(current.values)
      ? current.values
      : [current.value ?? valueForField(field)];
    return { kind: operator, field, values };
  }
  return {
    kind: operator,
    field,
    value: current.value ?? valueForField(field),
  };
}

function predicateOperators(field: string) {
  const definition = fieldDefinition(field);
  if (definition.kind === 'boolean') return [
    ['FIELD_TRUE', 'is true'],
    ['FIELD_FALSE', 'is false'],
    ['FIELD_PRESENT', 'is present'],
    ['FIELD_MISSING', 'is missing'],
  ] as const;
  if (definition.kind === 'number' || definition.kind === 'date') return [
    ['FIELD_EQUALS', 'equals'],
    ['FIELD_NOT_EQUALS', 'does not equal'],
    ['FIELD_COMPARE', 'compare'],
    ['FIELD_PRESENT', 'is present'],
    ['FIELD_MISSING', 'is missing'],
  ] as const;
  return [
    ['FIELD_EQUALS', 'equals'],
    ['FIELD_NOT_EQUALS', 'does not equal'],
    ['FIELD_IN', 'is in'],
    ['FIELD_NOT_IN', 'is not in'],
    ['FIELD_PRESENT', 'is present'],
    ['FIELD_MISSING', 'is missing'],
  ] as const;
}

function updateNodeAtPath(root: FormNode, path: number[], update: (node: FormNode) => FormNode): FormNode {
  if (path.length === 0) return update(root);
  const [head, ...tail] = path;
  const conditions = conditionsOf(root);
  return {
    ...root,
    conditions: conditions.map((condition, index) => index === head ? updateNodeAtPath(condition, tail, update) : condition),
  };
}

function ApplicabilityNodeEditor({
  node,
  path,
  onChange,
  onRemove,
  disabled,
}: {
  node: FormNode;
  path: number[];
  onChange: (path: number[], node: FormNode) => void;
  onRemove?: () => void;
  disabled: boolean;
}) {
  if (isGroup(node)) {
    const conditions = conditionsOf(node);
    return (
      <div className="space-y-2 rounded-lg border border-border-secondary bg-background-primary p-3">
        <div className="flex flex-wrap items-center gap-2">
          <label className="text-xs font-medium text-text-secondary" htmlFor={`app-group-${path.join('-') || 'root'}`}>
            Group
          </label>
          <select
            id={`app-group-${path.join('-') || 'root'}`}
            className="input input-sm min-h-[44px] w-auto"
            value={String(node.kind)}
            disabled={disabled}
            onChange={(event) => onChange(path, { ...node, kind: event.target.value })}
          >
            <option value="ALL">All conditions</option>
            <option value="ANY">Any condition</option>
          </select>
          {onRemove ? (
            <Button type="button" size="xs" variant="ghost" className="min-h-[44px]" onClick={onRemove} disabled={disabled}>
              Remove group
            </Button>
          ) : null}
        </div>
        <div className="space-y-2">
          {conditions.map((condition, index) => (
            <ApplicabilityNodeEditor
              key={`${path.join('-')}-${index}`}
              node={condition}
              path={[...path, index]}
              onChange={onChange}
              onRemove={() => onChange(path, { ...node, conditions: conditions.filter((_, itemIndex) => itemIndex !== index) })}
              disabled={disabled}
            />
          ))}
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            size="xs"
            variant="secondary"
            className="min-h-[44px]"
            disabled={disabled}
            onClick={() => onChange(path, { ...node, conditions: [...conditions, initialPredicate()] })}
          >
            Add condition
          </Button>
          <Button
            type="button"
            size="xs"
            variant="ghost"
            className="min-h-[44px]"
            disabled={disabled}
            onClick={() => onChange(path, { ...node, conditions: [...conditions, initialGroup('ALL')] })}
          >
            Add nested group
          </Button>
        </div>
      </div>
    );
  }

  const field = typeof node.field === 'string' ? node.field : 'entityType';
  const operators = predicateOperators(field);
  const definition = fieldDefinition(field);
  const value = node.value;
  return (
    <div className="grid grid-cols-1 gap-2 rounded-lg border border-border-secondary bg-background-secondary p-2 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)]">
      <label className="text-xs font-medium text-text-secondary">
        Company field
        <select
          className="input input-sm mt-1 min-h-[44px] w-full"
          value={field}
          disabled={disabled}
          onChange={(event) => onChange(path, defaultPredicateForField(event.target.value))}
        >
          {COMPANY_FIELDS.map((candidate) => <option key={candidate.value} value={candidate.value}>{candidate.label}</option>)}
        </select>
      </label>
      <label className="text-xs font-medium text-text-secondary">
        Operator
        <select
          className="input input-sm mt-1 min-h-[44px] w-full"
          value={String(node.kind ?? operators[0][0])}
          disabled={disabled}
          onChange={(event) => onChange(path, predicateForOperator(field, event.target.value, node))}
        >
          {operators.map(([operator, label]) => <option key={operator} value={operator}>{label}</option>)}
        </select>
      </label>
      {['FIELD_PRESENT', 'FIELD_MISSING', 'FIELD_TRUE', 'FIELD_FALSE'].includes(String(node.kind)) ? (
        <div className="flex items-end">
          <Button type="button" size="xs" variant="ghost" className="min-h-[44px]" onClick={onRemove} disabled={disabled}>Remove condition</Button>
        </div>
      ) : (
        <label className="text-xs font-medium text-text-secondary">
          Value
          <input
            className="input input-sm mt-1 min-h-[44px] w-full"
            type={definition.kind === 'number' ? 'number' : definition.kind === 'date' ? 'date' : 'text'}
            value={Array.isArray(node.values) ? node.values.join(', ') : String(value ?? '')}
            disabled={disabled}
            onChange={(event) => {
              const raw = event.target.value;
              const nextValue = ['FIELD_IN', 'FIELD_NOT_IN'].includes(String(node.kind))
                ? raw.split(',').map((item) => item.trim()).filter(Boolean).map((item) => definition.kind === 'number' ? Number(item) : item)
                : definition.kind === 'number' ? Number(raw) : raw;
              onChange(path, {
                ...node,
                ...(Array.isArray(nextValue) ? { values: nextValue, value: undefined } : { value: nextValue }),
              });
            }}
          />
          <span className="mt-1 block text-[11px] text-text-muted">Use commas for an allow/deny list.</span>
        </label>
      )}
      {['FIELD_PRESENT', 'FIELD_MISSING', 'FIELD_TRUE', 'FIELD_FALSE'].includes(String(node.kind)) ? null : (
        <div className="flex items-end">
          <Button type="button" size="xs" variant="ghost" className="min-h-[44px]" onClick={onRemove} disabled={disabled}>Remove condition</Button>
        </div>
      )}
    </div>
  );
}

function SourceEditor({
  source,
  onChange,
  disabled,
  prefix,
}: {
  source: FormNode;
  onChange: (source: FormNode) => void;
  disabled: boolean;
  prefix: string;
}) {
  const sourceKind = typeof source.kind === 'string' ? source.kind : 'COMPANY_FIELD';
  return (
    <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
      <label className="text-xs font-medium text-text-secondary">
        Date source
        <select
          id={`${prefix}-source`}
          className="input input-sm mt-1 min-h-[44px] w-full"
          value={sourceKind}
          disabled={disabled}
          onChange={(event) => {
            const kind = event.target.value;
            onChange(kind === 'COMPANY_FIELD' ? directSource() : { kind, ...(kind === 'PARAMETER' || kind === 'MILESTONE' || kind === 'SCHEDULE_ENTRY' ? { key: '' } : {}) });
          }}
        >
          {SOURCE_KINDS.map((candidate) => <option key={candidate.value} value={candidate.value}>{candidate.label}</option>)}
        </select>
      </label>
      {sourceKind === 'COMPANY_FIELD' ? (
        <label className="text-xs font-medium text-text-secondary">
          Company date field
          <select
            className="input input-sm mt-1 min-h-[44px] w-full"
            value={typeof source.field === 'string' ? source.field : 'nextArDueDate'}
            disabled={disabled}
            onChange={(event) => onChange({ kind: 'COMPANY_FIELD', field: event.target.value })}
          >
            <option value="financialYearEnd">Financial year end</option>
            <option value="nextAgmDueDate">Next AGM due date</option>
            <option value="nextArDueDate">Next annual return due date</option>
            <option value="accountsDueDate">Accounts due date</option>
            <option value="incorporationDate">Incorporation date</option>
          </select>
        </label>
      ) : ['PARAMETER', 'MILESTONE', 'SCHEDULE_ENTRY'].includes(sourceKind) ? (
        <FormInput
          label="Source key"
          value={typeof source.key === 'string' ? source.key : ''}
          disabled={disabled}
          onChange={(event) => onChange({ ...source, key: event.target.value })}
          className="min-h-[44px]"
        />
      ) : null}
    </div>
  );
}

function ExpressionEditor({
  value,
  onChange,
  disabled,
  prefix,
}: {
  value: unknown;
  onChange: (value: FormNode) => void;
  disabled: boolean;
  prefix: string;
}) {
  const expression = typeof value === 'object' && value !== null && !Array.isArray(value) ? value as FormNode : sourceExpression();
  const kind = typeof expression.kind === 'string' ? expression.kind : 'SOURCE';
  const source = typeof expression.source === 'object' && expression.source !== null && !Array.isArray(expression.source)
    ? expression.source as FormNode
    : directSource();
  const amount = typeof expression.amount === 'number' ? expression.amount : typeof expression.offset === 'number' ? expression.offset : 0;
  const nextExpression = (nextKind: string): FormNode => {
    if (nextKind === 'SOURCE') return sourceExpression();
    if (nextKind === 'ADJUST_BUSINESS_DAY') return { kind: nextKind, adjustment: 'PREVIOUS' };
    if (nextKind === 'RELATIVE_TO_SOURCE') return { kind: nextKind, source: directSource(), offset: 0, unit: 'CALENDAR_DAY' };
    return { kind: nextKind, source: directSource(), amount: 0 };
  };
  return (
    <div className="space-y-2 rounded-lg border border-border-secondary bg-background-primary p-3">
      <label className="text-xs font-medium text-text-secondary">
        Date expression operation
        <select
          id={`${prefix}-operation`}
          className="input input-sm mt-1 min-h-[44px] w-full"
          value={kind}
          disabled={disabled}
          onChange={(event) => onChange(nextExpression(event.target.value))}
        >
          {EXPRESSION_KINDS.map((candidate) => <option key={candidate.value} value={candidate.value}>{candidate.label}</option>)}
        </select>
      </label>
      {kind === 'SOURCE' ? <SourceEditor source={source} onChange={(next) => onChange({ kind: 'SOURCE', source: next })} disabled={disabled} prefix={prefix} /> : null}
      {['ADD_CALENDAR_DAYS', 'ADD_BUSINESS_DAYS', 'ADD_MONTHS'].includes(kind) ? (
        <>
          <SourceEditor source={source} onChange={(next) => onChange({ ...expression, source: next })} disabled={disabled} prefix={prefix} />
          <FormInput
            label={kind === 'ADD_MONTHS' ? 'Month offset' : 'Day offset'}
            type="number"
            value={String(amount)}
            disabled={disabled}
            onChange={(event) => onChange({ ...expression, amount: Number(event.target.value) })}
            className="min-h-[44px]"
          />
        </>
      ) : null}
      {kind === 'RELATIVE_TO_SOURCE' ? (
        <>
          <SourceEditor source={source} onChange={(next) => onChange({ ...expression, source: next })} disabled={disabled} prefix={prefix} />
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            <FormInput label="Relative offset" type="number" value={String(amount)} disabled={disabled} onChange={(event) => onChange({ ...expression, offset: Number(event.target.value) })} className="min-h-[44px]" />
            <label className="text-xs font-medium text-text-secondary">Offset unit<select className="input input-sm mt-1 min-h-[44px] w-full" value={expression.unit === 'BUSINESS_DAY' ? 'BUSINESS_DAY' : 'CALENDAR_DAY'} disabled={disabled} onChange={(event) => onChange({ ...expression, unit: event.target.value })}><option value="CALENDAR_DAY">Calendar day</option><option value="BUSINESS_DAY">Business day</option></select></label>
          </div>
        </>
      ) : null}
      {kind === 'ADJUST_BUSINESS_DAY' ? <label className="text-xs font-medium text-text-secondary">Adjustment<select className="input input-sm mt-1 min-h-[44px] w-full" value={expression.adjustment === 'NEXT' ? 'NEXT' : 'PREVIOUS'} disabled={disabled} onChange={(event) => onChange({ ...expression, adjustment: event.target.value })}><option value="PREVIOUS">Previous business day</option><option value="NEXT">Next business day</option></select></label> : null}
    </div>
  );
}

export interface DeadlineRuleFormProps {
  initialValue?: DeadlineRuleDto;
  onCancel: () => void;
  onSubmit: (input: DeadlineRuleDraftInput) => Promise<void>;
  onDirtyChange?: () => void;
  isSubmitting?: boolean;
  disabled?: boolean;
}

export function DeadlineRuleForm({
  initialValue,
  onCancel,
  onSubmit,
  onDirtyChange,
  isSubmitting = false,
  disabled = false,
}: DeadlineRuleFormProps) {
  const [draft, setDraft] = useState<DeadlineRuleDraftInput>(() => initialValue
    ? draftFromVersion(initialValue, initialValue.draft ?? initialValue.currentVersion)
    : emptyDraft());
  const [validationError, setValidationError] = useState<string | null>(null);
  const [applicability, setApplicability] = useState<FormNode>(() => draft.applicability as unknown as FormNode);
  const parameters = draft.parameters;
  const milestones = draft.milestones;
  const hasDraft = Boolean(initialValue?.draft);
  const title = initialValue ? (hasDraft ? 'Edit deadline rule' : 'Create draft from published rule') : 'Create deadline rule';

  const updateDraft = (update: (current: DeadlineRuleDraftInput) => DeadlineRuleDraftInput) => {
    setDraft((current) => update(current));
    onDirtyChange?.();
  };

  const updateApplicability = (path: number[], node: FormNode) => {
    setApplicability((current) => updateNodeAtPath(current, path, () => node));
    updateDraft((current) => ({ ...current, applicability: updateNodeAtPath(current.applicability as unknown as FormNode, path, () => node) as unknown as DeadlineRuleDraftInput['applicability'] }));
  };

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    const candidate = { ...draft, applicability: applicability as unknown as DeadlineRuleDraftInput['applicability'], expectedDraftRevision: initialValue?.draft?.draftRevision };
    const parsed = await import('@/lib/validations/deadline-rule').then(({ deadlineRuleDraftSchema }) => deadlineRuleDraftSchema.safeParse(candidate));
    if (!parsed.success) {
      const issue = parsed.error.issues[0];
      setValidationError(issue ? `${issue.message}${issue.path.length > 0 ? ` (${issue.path.join('.')})` : ''}` : 'Review the highlighted rule fields.');
      return;
    }
    setValidationError(null);
    await onSubmit(parsed.data);
  };

  const recurrenceKind = draft.recurrence.kind;
  const rootApplicability = useMemo(() => isGroup(applicability) ? applicability : initialGroup(), [applicability]);

  return (
    <form onSubmit={handleSubmit} aria-label={title}>
      <div className="max-h-[76vh] space-y-6 overflow-y-auto p-4">
        {validationError ? <div role="alert" className="rounded-lg border border-status-error/40 bg-status-error/10 p-3 text-sm text-status-error">{validationError}</div> : null}
        <section className="space-y-3" aria-labelledby="rule-identity-heading">
          <h3 id="rule-identity-heading" className="text-sm font-semibold text-text-primary">Rule identity</h3>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <FormInput label="Rule code" value={draft.code} disabled={disabled || Boolean(initialValue)} required onChange={(event) => updateDraft((current) => ({ ...current, code: event.target.value }))} />
            <FormInput label="Rule name" value={draft.name} disabled={disabled} required onChange={(event) => updateDraft((current) => ({ ...current, name: event.target.value }))} />
          </div>
          <label className="block text-xs font-medium text-text-secondary">Description<textarea className="input mt-2 min-h-[44px] w-full" rows={2} value={draft.description ?? ''} disabled={disabled} onChange={(event) => updateDraft((current) => ({ ...current, description: event.target.value || null }))} /></label>
        </section>

        <section className="space-y-3" aria-labelledby="recurrence-heading">
          <h3 id="recurrence-heading" className="text-sm font-semibold text-text-primary">Recurrence</h3>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <label className="text-xs font-medium text-text-secondary">Cycle recurrence<select className="input mt-2 min-h-[44px] w-full" value={recurrenceKind} disabled={disabled} onChange={(event) => updateDraft((current) => ({ ...current, recurrence: event.target.value === 'ONE_TIME' ? { schemaVersion: 1, kind: 'ONE_TIME' } : event.target.value === 'CUSTOM' ? { schemaVersion: 1, kind: 'CUSTOM', interval: 1, unit: 'MONTH' } : { schemaVersion: 1, kind: event.target.value as 'MONTHLY' | 'QUARTERLY' | 'SEMI_ANNUALLY' | 'ANNUALLY', interval: 1 } }))}><option value="MONTHLY">Monthly</option><option value="QUARTERLY">Quarterly</option><option value="SEMI_ANNUALLY">Semi-annually</option><option value="ANNUALLY">Annually</option><option value="ONE_TIME">One time</option><option value="CUSTOM">Custom interval</option></select></label>
            {recurrenceKind !== 'ONE_TIME' ? <FormInput label="Interval" type="number" min={1} max={120} value={String('interval' in draft.recurrence ? draft.recurrence.interval ?? 1 : 1)} disabled={disabled} onChange={(event) => updateDraft((current) => ({ ...current, recurrence: { ...current.recurrence, interval: Number(event.target.value) } as DeadlineRuleDraftInput['recurrence'] }))} /> : <p className="self-end text-xs text-text-muted">One-time rules create one cycle when activated.</p>}
          </div>
        </section>

        <section className="space-y-3" aria-labelledby="applicability-heading">
          <div><h3 id="applicability-heading" className="text-sm font-semibold text-text-primary">Applicability groups</h3><p className="text-xs text-text-muted">Use whitelisted Company fields and validated predicates only.</p></div>
          <ApplicabilityNodeEditor node={rootApplicability} path={[]} onChange={updateApplicability} disabled={disabled} />
        </section>

        <section className="space-y-3" aria-labelledby="parameters-heading">
          <div className="flex flex-wrap items-center justify-between gap-2"><div><h3 id="parameters-heading" className="text-sm font-semibold text-text-primary">Typed parameters</h3><p className="text-xs text-text-muted">Parameters are validated by type before publication.</p></div><Button type="button" size="xs" variant="secondary" className="min-h-[44px]" leftIcon={<Plus className="h-3.5 w-3.5" />} disabled={disabled} onClick={() => updateDraft((current) => ({ ...current, parameters: [...current.parameters, { key: `parameter${current.parameters.length + 1}`, label: 'New parameter', description: null, type: 'STRING', required: false }] }))}>Add parameter</Button></div>
          {parameters.length === 0 ? <p className="rounded-lg border border-dashed border-border-primary p-3 text-xs text-text-muted">No typed parameters.</p> : parameters.map((parameter, index) => <div key={`${parameter.key}-${index}`} className="grid grid-cols-1 gap-2 rounded-lg border border-border-primary bg-background-primary p-3 sm:grid-cols-[1fr_1fr_160px_auto]"><FormInput label="Parameter key" value={parameter.key} disabled={disabled} onChange={(event) => updateDraft((current) => ({ ...current, parameters: current.parameters.map((item, itemIndex) => itemIndex === index ? { ...item, key: event.target.value } : item) }))} /><FormInput label="Label" value={parameter.label} disabled={disabled} onChange={(event) => updateDraft((current) => ({ ...current, parameters: current.parameters.map((item, itemIndex) => itemIndex === index ? { ...item, label: event.target.value } : item) }))} /><label className="text-xs font-medium text-text-secondary">Type<select className="input mt-2 min-h-[44px] w-full" value={parameter.type} disabled={disabled} onChange={(event) => updateDraft((current) => ({ ...current, parameters: current.parameters.map((item, itemIndex) => itemIndex === index ? { ...item, type: event.target.value as typeof item.type, ...(event.target.value === 'ENUM' ? { options: item.options ?? ['Option 1'] } : { options: undefined }) } : item) }))}><option value="STRING">String</option><option value="INTEGER">Integer</option><option value="DECIMAL">Decimal</option><option value="BOOLEAN">Boolean</option><option value="DATE">Date</option><option value="ENUM">Enum</option></select></label><label className="flex min-h-[44px] items-center gap-2 text-xs text-text-secondary"><input type="checkbox" checked={parameter.required} disabled={disabled} onChange={(event) => updateDraft((current) => ({ ...current, parameters: current.parameters.map((item, itemIndex) => itemIndex === index ? { ...item, required: event.target.checked } : item) }))} />Required</label><div className="flex items-end"><Button type="button" size="xs" variant="ghost" className="min-h-[44px]" aria-label={`Remove parameter ${parameter.label}`} onClick={() => updateDraft((current) => ({ ...current, parameters: current.parameters.filter((_, itemIndex) => itemIndex !== index) }))} disabled={disabled}><Trash2 className="h-4 w-4 text-status-error" /></Button></div>{parameter.type === 'ENUM' ? <FormInput label="Allowed options (comma separated)" value={(parameter.options ?? []).join(', ')} disabled={disabled} onChange={(event) => updateDraft((current) => ({ ...current, parameters: current.parameters.map((item, itemIndex) => itemIndex === index ? { ...item, options: event.target.value.split(',').map((option) => option.trim()).filter(Boolean) } : item) }))} className="sm:col-span-3" /> : null}</div>)}
        </section>

        <section className="space-y-3" aria-labelledby="milestones-heading">
          <div className="flex flex-wrap items-center justify-between gap-2"><div><h3 id="milestones-heading" className="text-sm font-semibold text-text-primary">Milestones</h3><p className="text-xs text-text-muted">Expressions use the validated date-source and business-day language.</p></div><Button type="button" size="xs" variant="secondary" className="min-h-[44px]" leftIcon={<Plus className="h-3.5 w-3.5" />} disabled={disabled} onClick={() => updateDraft((current) => ({ ...current, milestones: [...current.milestones, emptyMilestone(current.milestones.length)] }))}>Add milestone</Button></div>
          <div className="space-y-3">{milestones.map((milestone, index) => <div key={`${milestone.key}-${index}`} className="space-y-3 rounded-lg border border-border-primary bg-background-primary p-3"><div className="grid grid-cols-1 gap-3 sm:grid-cols-2"><FormInput label="Milestone key" value={milestone.key} disabled={disabled} onChange={(event) => updateDraft((current) => ({ ...current, milestones: current.milestones.map((item, itemIndex) => itemIndex === index ? { ...item, key: event.target.value } : item) }))} /><FormInput label="Milestone name" value={milestone.name} disabled={disabled} onChange={(event) => updateDraft((current) => ({ ...current, milestones: current.milestones.map((item, itemIndex) => itemIndex === index ? { ...item, name: event.target.value } : item) }))} /><label className="text-xs font-medium text-text-secondary">Type<select className="input mt-2 min-h-[44px] w-full" value={milestone.type} disabled={disabled} onChange={(event) => updateDraft((current) => ({ ...current, milestones: current.milestones.map((item, itemIndex) => itemIndex === index ? { ...item, type: event.target.value as typeof item.type } : item) }))}>{MILESTONE_TYPES.map((type) => <option key={type.value} value={type.value}>{type.label}</option>)}</select></label><label className="text-xs font-medium text-text-secondary">Generation<select className="input mt-2 min-h-[44px] w-full" value={milestone.generationMode} disabled={disabled} onChange={(event) => updateDraft((current) => ({ ...current, milestones: current.milestones.map((item, itemIndex) => itemIndex === index ? { ...item, generationMode: event.target.value as typeof item.generationMode, expression: event.target.value === 'ONCE_PER_SCHEDULE_ENTRY' ? asDateExpression({ kind: 'SOURCE', source: { kind: 'CURRENT_SCHEDULE_ENTRY' } }) : item.expression } : item) }))}><option value="ONCE_PER_CYCLE">Once per cycle</option><option value="ONCE_PER_SCHEDULE_ENTRY">Once per schedule entry</option></select></label></div><ExpressionEditor value={milestone.expression} onChange={(expression) => updateDraft((current) => ({ ...current, milestones: current.milestones.map((item, itemIndex) => itemIndex === index ? { ...item, expression: asDateExpression(expression) } : item) }))} disabled={disabled} prefix={`milestone-${index}`} /><div className="flex flex-wrap items-center justify-between gap-2"><label className="text-xs font-medium text-text-secondary">Business-day adjustment<select className="input mt-1 min-h-[44px]" value={milestone.businessDayAdjustment} disabled={disabled} onChange={(event) => updateDraft((current) => ({ ...current, milestones: current.milestones.map((item, itemIndex) => itemIndex === index ? { ...item, businessDayAdjustment: event.target.value as typeof item.businessDayAdjustment } : item) }))}><option value="NONE">No adjustment</option><option value="PREVIOUS">Previous business day</option><option value="NEXT">Next business day</option></select></label><div className="flex gap-2"><Button type="button" size="xs" variant="ghost" className="min-h-[44px]" aria-label={`Toggle ${milestone.name}`} disabled={disabled} onClick={() => updateDraft((current) => ({ ...current, milestones: current.milestones.map((item, itemIndex) => itemIndex === index ? { ...item, isActive: !item.isActive } : item) }))}>{milestone.isActive ? 'Active' : 'Inactive'}</Button>{milestones.length > 1 ? <Button type="button" size="xs" variant="ghost" className="min-h-[44px]" aria-label={`Remove milestone ${milestone.name}`} disabled={disabled} onClick={() => updateDraft((current) => ({ ...current, milestones: current.milestones.filter((_, itemIndex) => itemIndex !== index).map((item, itemIndex) => ({ ...item, displayOrder: itemIndex })) }))}><Trash2 className="h-4 w-4 text-status-error" /></Button> : null}</div></div></div>)}</div>
        </section>
      </div>
      <div className="flex flex-wrap items-center justify-end gap-3 border-t border-border-primary p-4"><Button type="button" variant="secondary" className="min-h-[44px]" onClick={onCancel} disabled={isSubmitting}>Cancel</Button><Button type="submit" className="min-h-[44px]" isLoading={isSubmitting} disabled={disabled}>{initialValue ? 'Save draft' : 'Create rule'}</Button></div>
    </form>
  );
}
