'use client';

import { useEffect, useRef, useState, type MouseEvent as ReactMouseEvent } from 'react';
import { X } from 'lucide-react';
import { FormInput } from '@/components/ui/form-input';
import { Toggle } from '@/components/ui/toggle';
import { isSummaryEligibleFieldType } from '@/lib/form-utils';
import { cn } from '@/lib/utils';
import { FIELD_TYPE_OPTIONS, WIDTH_OPTIONS } from './builder-utils';
import type { FormFieldInput } from '@/lib/validations/form-builder';
import type { BuilderField, ConditionConfig, ShortInputType } from './builder-utils';

const FIELD_DRAWER_MIN_WIDTH = 360;
const FIELD_DRAWER_MAX_WIDTH = 860;
const FIELD_DRAWER_DEFAULT_WIDTH = 460;
const FIELD_DRAWER_WIDTH_STORAGE_KEY = 'form_builder_field_drawer_width';
const INFO_INPUT_TYPES: ReadonlyArray<ShortInputType> = ['info_text', 'info_image', 'info_url'];

export function FieldEditorDrawer({
  field,
  allFields,
  onClose,
  onChange,
}: {
  field: BuilderField;
  allFields: BuilderField[];
  onClose: () => void;
  onChange: (next: BuilderField) => void;
}) {
  const [activeTab, setActiveTab] = useState<'general' | 'validation' | 'condition'>('general');
  const [panelWidth, setPanelWidth] = useState(FIELD_DRAWER_DEFAULT_WIDTH);
  const isResizingRef = useRef(false);
  const startXRef = useRef(0);
  const startWidthRef = useRef(FIELD_DRAWER_DEFAULT_WIDTH);

  const conditionalCandidates = allFields.filter(
    (f) => f.clientId !== field.clientId && !['PAGE_BREAK', 'PARAGRAPH', 'HTML'].includes(f.type)
  );
  const canShowOnSummary = isSummaryEligibleFieldType(field.type);

  useEffect(() => {
    const saved = Number(window.localStorage.getItem(FIELD_DRAWER_WIDTH_STORAGE_KEY));
    if (Number.isFinite(saved)) {
      setPanelWidth(Math.min(FIELD_DRAWER_MAX_WIDTH, Math.max(FIELD_DRAWER_MIN_WIDTH, saved)));
    }
  }, []);

  useEffect(() => {
    window.localStorage.setItem(FIELD_DRAWER_WIDTH_STORAGE_KEY, String(panelWidth));
  }, [panelWidth]);

  useEffect(() => {
    function handleMouseMove(event: MouseEvent) {
      if (!isResizingRef.current) return;

      const delta = startXRef.current - event.clientX;
      const nextWidth = startWidthRef.current + delta;
      setPanelWidth(Math.min(FIELD_DRAWER_MAX_WIDTH, Math.max(FIELD_DRAWER_MIN_WIDTH, nextWidth)));
    }

    function stopResize() {
      if (!isResizingRef.current) return;
      isResizingRef.current = false;
      document.body.style.userSelect = '';
      document.body.style.cursor = '';
    }

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', stopResize);

    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', stopResize);
    };
  }, []);

  function startResize(event: ReactMouseEvent<HTMLButtonElement>) {
    event.preventDefault();
    isResizingRef.current = true;
    startXRef.current = event.clientX;
    startWidthRef.current = panelWidth;
    document.body.style.userSelect = 'none';
    document.body.style.cursor = 'col-resize';
  }

  return (
    <div
      className="fixed inset-y-0 right-0 z-40 w-full max-w-[calc(100vw-0.5rem)] border-l border-border-primary bg-background-secondary shadow-elevation-3"
      style={{ width: `min(calc(100vw - 0.5rem), ${panelWidth}px)` }}
    >
      <button
        type="button"
        onMouseDown={startResize}
        className="absolute inset-y-0 left-0 hidden w-2 -translate-x-1 cursor-col-resize sm:block"
        aria-label="Resize field editor"
      />
      <div className="flex h-full flex-col">
        <div className="flex items-center justify-between border-b border-border-primary px-5 py-4">
          <h2 className="text-lg font-semibold text-text-primary">Edit form field</h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded p-2 text-text-secondary hover:bg-background-tertiary hover:text-text-primary"
            aria-label="Close field editor"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="border-b border-border-primary px-5 pt-2">
          <div className="flex items-center gap-5 text-sm">
            {[
              { id: 'general', label: 'General' },
              { id: 'validation', label: 'Validation' },
              { id: 'condition', label: 'Condition' },
            ].map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id as 'general' | 'validation' | 'condition')}
                className={cn(
                  'border-b-2 px-1 py-2 text-sm',
                  activeTab === tab.id
                    ? 'border-oak-primary text-text-primary'
                    : 'border-transparent text-text-secondary hover:text-text-primary'
                )}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
          {activeTab === 'general' && (
            <>
              <div>
                <label className="mb-1.5 block text-xs font-medium text-text-secondary">Element</label>
                <select
                  value={field.type}
                  onChange={(e) => {
                    const nextType = e.target.value as FormFieldInput['type'];
                    const next = { ...field, type: nextType };
                    if (nextType === 'PAGE_BREAK') next.layoutWidth = 100;
                    if (nextType === 'SHORT_TEXT' && (!next.inputType || INFO_INPUT_TYPES.includes(next.inputType))) {
                      next.inputType = 'text';
                    }
                    if (nextType === 'PARAGRAPH' && !INFO_INPUT_TYPES.includes(next.inputType)) {
                      next.inputType = 'info_text';
                    }
                    if (['SINGLE_CHOICE', 'MULTIPLE_CHOICE', 'DROPDOWN'].includes(nextType) && next.options.length === 0) {
                      next.options = ['Option 1', 'Option 2'];
                    }
                    if (!isSummaryEligibleFieldType(nextType)) {
                      next.showOnSummary = false;
                    }
                    onChange(next);
                  }}
                  className="w-full rounded-lg border border-border-primary bg-background-primary px-3 py-2 text-sm text-text-primary"
                >
                  {FIELD_TYPE_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>{option.label}</option>
                  ))}
                </select>
              </div>

              <FormInput
                label="Label"
                value={field.label}
                onChange={(e) => onChange({ ...field, label: e.target.value })}
              />

              <FormInput
                label="Custom key"
                value={field.key}
                onChange={(e) => onChange({ ...field, key: e.target.value })}
              />

              {field.type === 'SHORT_TEXT' && (
                <div>
                  <label className="mb-1.5 block text-xs font-medium text-text-secondary">Type</label>
                  <select
                    value={field.inputType}
                    onChange={(e) => onChange({ ...field, inputType: e.target.value as ShortInputType })}
                    className="w-full rounded-lg border border-border-primary bg-background-primary px-3 py-2 text-sm text-text-primary"
                  >
                    <option value="text">Text</option>
                    <option value="phone">Phone</option>
                    <option value="email">Email</option>
                    <option value="number">Number</option>
                    <option value="date">Datepicker</option>
                  </select>
                </div>
              )}

              {field.type === 'PARAGRAPH' && (
                <>
                  <div>
                    <label className="mb-1.5 block text-xs font-medium text-text-secondary">Information type</label>
                    <select
                      value={INFO_INPUT_TYPES.includes(field.inputType) ? field.inputType : 'info_text'}
                      onChange={(e) => onChange({ ...field, inputType: e.target.value as ShortInputType })}
                      className="w-full rounded-lg border border-border-primary bg-background-primary px-3 py-2 text-sm text-text-primary"
                    >
                      <option value="info_text">Text block</option>
                      <option value="info_image">Image</option>
                      <option value="info_url">URL / Link</option>
                    </select>
                  </div>

                  {(field.inputType === 'info_text' || !INFO_INPUT_TYPES.includes(field.inputType)) && (
                    <div>
                      <label className="mb-1.5 block text-xs font-medium text-text-secondary">Text block content</label>
                      <textarea
                        value={field.subtext}
                        onChange={(e) => onChange({ ...field, subtext: e.target.value })}
                        className="w-full min-h-24 rounded-lg border border-border-primary bg-background-primary px-3 py-2 text-sm text-text-primary"
                        placeholder="Enter informational text shown to respondents"
                      />
                    </div>
                  )}

                  {field.inputType === 'info_image' && (
                    <>
                      <FormInput
                        label="Image URL"
                        value={field.placeholder}
                        onChange={(e) => onChange({ ...field, placeholder: e.target.value })}
                        placeholder="https://example.com/image.png"
                      />
                      <FormInput
                        label="Caption / alt text"
                        value={field.subtext}
                        onChange={(e) => onChange({ ...field, subtext: e.target.value })}
                        placeholder="Optional caption"
                      />
                    </>
                  )}

                  {field.inputType === 'info_url' && (
                    <>
                      <FormInput
                        label="URL"
                        value={field.placeholder}
                        onChange={(e) => onChange({ ...field, placeholder: e.target.value })}
                        placeholder="https://example.com"
                      />
                      <FormInput
                        label="Link label"
                        value={field.subtext}
                        onChange={(e) => onChange({ ...field, subtext: e.target.value })}
                        placeholder="Open resource"
                      />
                    </>
                  )}
                </>
              )}

              {(field.type === 'SINGLE_CHOICE' || field.type === 'MULTIPLE_CHOICE' || field.type === 'DROPDOWN') && (
                <div>
                  <label className="mb-1.5 block text-xs font-medium text-text-secondary">Options</label>
                  <textarea
                    value={field.options.join('\n')}
                    onChange={(e) => onChange({
                      ...field,
                      // Keep blank lines while editing so Enter can create a new option row.
                      // Empty rows are filtered out later during payload serialization.
                      options: e.target.value.split('\n').map((line) => line.trim()),
                    })}
                    className="w-full min-h-24 rounded-lg border border-border-primary bg-background-primary px-3 py-2 text-sm text-text-primary"
                    placeholder="One option per line"
                  />
                </div>
              )}

              {field.type !== 'PAGE_BREAK' && field.type !== 'PARAGRAPH' && (
                <>
                  <FormInput
                    label="Placeholder"
                    value={field.placeholder}
                    onChange={(e) => onChange({ ...field, placeholder: e.target.value })}
                  />

                  <div>
                    <label className="mb-1.5 block text-xs font-medium text-text-secondary">Layout width</label>
                    <select
                      value={field.layoutWidth}
                      onChange={(e) => onChange({ ...field, layoutWidth: Number(e.target.value) as 25 | 33 | 50 | 66 | 75 | 100 })}
                      className="w-full rounded-lg border border-border-primary bg-background-primary px-3 py-2 text-sm text-text-primary"
                    >
                      {WIDTH_OPTIONS.map((width) => (
                        <option key={width} value={width}>{width}%</option>
                      ))}
                    </select>
                  </div>
                </>
              )}

              <div className="space-y-3 rounded-lg border border-border-primary bg-background-elevated p-3">
                <Toggle checked={field.isRequired} onChange={(checked) => onChange({ ...field, isRequired: checked })} label="Field is required" size="sm" />
                <Toggle checked={field.hideLabel} onChange={(checked) => onChange({ ...field, hideLabel: checked })} label="Hide label" size="sm" />
                <Toggle checked={field.isReadOnly} onChange={(checked) => onChange({ ...field, isReadOnly: checked })} label="Read only" size="sm" />
                <Toggle
                  checked={field.validation?.tooltipEnabled === true}
                  onChange={(checked) => onChange({
                    ...field,
                    validation: {
                      ...(field.validation || {}),
                      tooltipEnabled: checked,
                    },
                  })}
                  label="Tooltip"
                  description="Show an information icon beside this field label."
                  size="sm"
                />
                <Toggle
                  checked={field.showOnSummary}
                  onChange={(checked) => onChange({ ...field, showOnSummary: checked })}
                  label="Show on summary"
                  description={canShowOnSummary
                    ? 'Show this field as a column on the Responses page.'
                    : 'This field type cannot be shown on the responses summary table.'}
                  size="sm"
                  disabled={!canShowOnSummary}
                />
              </div>

              {field.validation?.tooltipEnabled === true && (
                <div>
                  <label className="mb-1.5 block text-xs font-medium text-text-secondary">Tooltip content</label>
                  <textarea
                    value={field.helpText}
                    onChange={(e) => onChange({ ...field, helpText: e.target.value })}
                    className="w-full min-h-20 rounded-lg border border-border-primary bg-background-primary px-3 py-2 text-sm text-text-primary"
                    placeholder="Guidance shown when users hover the info icon"
                  />
                </div>
              )}
            </>
          )}

          {activeTab === 'validation' && (
            <>
              {(field.type === 'SHORT_TEXT' || field.type === 'LONG_TEXT') && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <FormInput
                    label="Min length"
                    type="number"
                    value={field.validation?.minLength?.toString() || ''}
                    onChange={(e) => onChange({
                      ...field,
                      validation: {
                        ...(field.validation || {}),
                        minLength: e.target.value ? Number(e.target.value) : undefined,
                      },
                    })}
                  />
                  <FormInput
                    label="Max length"
                    type="number"
                    value={field.validation?.maxLength?.toString() || ''}
                    onChange={(e) => onChange({
                      ...field,
                      validation: {
                        ...(field.validation || {}),
                        maxLength: e.target.value ? Number(e.target.value) : undefined,
                      },
                    })}
                  />
                </div>
              )}

              {field.type === 'FILE_UPLOAD' && (
                <FormInput
                  label="Max file size (MB)"
                  type="number"
                  value={field.validation?.maxFileSizeMb?.toString() || '50'}
                  onChange={(e) => onChange({
                    ...field,
                    validation: {
                      ...(field.validation || {}),
                      maxFileSizeMb: e.target.value ? Number(e.target.value) : 50,
                    },
                  })}
                />
              )}
            </>
          )}

          {activeTab === 'condition' && (
            <>
              <div>
                <label className="mb-1.5 block text-xs font-medium text-text-secondary">Conditional field</label>
                <select
                  value={field.condition?.fieldKey || ''}
                  onChange={(e) => {
                    const fieldKey = e.target.value;
                    if (!fieldKey) {
                      onChange({ ...field, condition: null });
                      return;
                    }
                    onChange({
                      ...field,
                      condition: {
                        fieldKey,
                        operator: field.condition?.operator || 'equals',
                        value: field.condition?.value ?? '',
                      },
                    });
                  }}
                  className="w-full rounded-lg border border-border-primary bg-background-primary px-3 py-2 text-sm text-text-primary"
                >
                  <option value="">Select conditional field</option>
                  {conditionalCandidates.map((candidate) => (
                    <option key={candidate.clientId} value={candidate.key}>
                      {candidate.label || candidate.key}
                    </option>
                  ))}
                </select>
              </div>

              {field.condition && (
                <>
                  <div>
                    <label className="mb-1.5 block text-xs font-medium text-text-secondary">Operator</label>
                    <select
                      value={field.condition.operator}
                      onChange={(e) => onChange({
                        ...field,
                        condition: {
                          ...field.condition!,
                          operator: e.target.value as ConditionConfig['operator'],
                        },
                      })}
                      className="w-full rounded-lg border border-border-primary bg-background-primary px-3 py-2 text-sm text-text-primary"
                    >
                      <option value="equals">Equals</option>
                      <option value="not_equals">Not equals</option>
                      <option value="contains">Contains</option>
                      <option value="is_empty">Is empty</option>
                      <option value="not_empty">Is not empty</option>
                    </select>
                  </div>

                  {!['is_empty', 'not_empty'].includes(field.condition.operator) && (
                    <FormInput
                      label="Conditional value"
                      value={String(field.condition.value ?? '')}
                      onChange={(e) => onChange({
                        ...field,
                        condition: {
                          ...field.condition!,
                          value: e.target.value,
                        },
                      })}
                    />
                  )}
                </>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
