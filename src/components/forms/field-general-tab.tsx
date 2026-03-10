'use client';

import { useState } from 'react';
import { FormInput } from '@/components/ui/form-input';
import { RichTextEditor } from '@/components/ui/rich-text-editor';
import { Toggle } from '@/components/ui/toggle';
import { DROPDOWN_PRESETS } from '@/lib/constants/form-option-presets';
import { isSummaryEligibleFieldType } from '@/lib/form-utils';
import { FIELD_TYPE_OPTIONS, WIDTH_OPTIONS, normalizeKey, isRepeatMarkerInputType } from './builder-utils';
import type { FormFieldInput } from '@/lib/validations/form-builder';
import type { BuilderField, ShortInputType } from './builder-utils';

const INFO_INPUT_TYPES: ReadonlyArray<ShortInputType> = ['info_text', 'info_image', 'info_url', 'info_heading_1', 'info_heading_2', 'info_heading_3'];
const PAGE_BREAK_REPEAT_START: ShortInputType = 'repeat_start';
const PAGE_BREAK_REPEAT_END: ShortInputType = 'repeat_end';
const HEX_COLOR_PATTERN = /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;

function normalizeHexColor(value: string): string | undefined {
  const trimmed = value.trim().toLowerCase();
  if (!trimmed) return undefined;
  if (!HEX_COLOR_PATTERN.test(trimmed)) return undefined;
  if (trimmed.length === 4) {
    return `#${trimmed[1]}${trimmed[1]}${trimmed[2]}${trimmed[2]}${trimmed[3]}${trimmed[3]}`;
  }
  return trimmed;
}

function normalizeInfoPaddingPx(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return Math.max(0, Math.min(80, Math.round(value)));
  }
  if (typeof value === 'string') {
    const parsed = Number.parseInt(value, 10);
    if (!Number.isFinite(parsed)) return undefined;
    return Math.max(0, Math.min(80, parsed));
  }
  return undefined;
}

function getDefaultInfoPadding(inputType: ShortInputType): { top: number; right: number; bottom: number; left: number } {
  if (inputType === 'info_image') return { top: 0, right: 0, bottom: 0, left: 0 };
  return { top: 8, right: 12, bottom: 8, left: 12 };
}

export function FieldGeneralTab({
  field,
  onChange,
}: {
  field: BuilderField;
  onChange: (next: BuilderField) => void;
}) {
  const [dropdownPresetId, setDropdownPresetId] = useState('');

  const canShowOnSummary = isSummaryEligibleFieldType(field.type);
  const selectedDropdownPreset = DROPDOWN_PRESETS.find((preset) => preset.id === dropdownPresetId) || null;
  const normalizedInfoBackgroundColor = normalizeHexColor(field.validation?.infoBackgroundColor || '');
  const normalizedInfoPaddingTopPx = normalizeInfoPaddingPx(field.validation?.infoPaddingTopPx);
  const normalizedInfoPaddingRightPx = normalizeInfoPaddingPx(field.validation?.infoPaddingRightPx);
  const normalizedInfoPaddingBottomPx = normalizeInfoPaddingPx(field.validation?.infoPaddingBottomPx);
  const normalizedInfoPaddingLeftPx = normalizeInfoPaddingPx(field.validation?.infoPaddingLeftPx);
  const defaultInfoPadding = getDefaultInfoPadding(
    INFO_INPUT_TYPES.includes(field.inputType) ? field.inputType : 'info_text'
  );

  return (
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
            if (nextType === 'PAGE_BREAK' && !isRepeatMarkerInputType(next.inputType)) {
              next.inputType = 'text';
            }
            if (['SINGLE_CHOICE', 'MULTIPLE_CHOICE', 'DROPDOWN'].includes(nextType) && next.options.length === 0) {
              next.options = [
                { label: 'Option 1', value: 'Option 1' },
                { label: 'Option 2', value: 'Option 2' },
              ];
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
        onChange={(e) => {
          const nextLabel = e.target.value;
          const keyFromCurrentLabel = normalizeKey(field.label || '');
          const keyFromCurrentKey = normalizeKey(field.key || '');
          const shouldSyncKey = !field.key.trim() || keyFromCurrentKey === keyFromCurrentLabel;
          onChange({
            ...field,
            label: nextLabel,
            key: shouldSyncKey ? normalizeKey(nextLabel) : field.key,
          });
        }}
      />

      <FormInput
        label="Custom key"
        value={field.key}
        onChange={(e) => onChange({ ...field, key: e.target.value })}
      />

      {field.type === 'PAGE_BREAK' && (
        <>
          <div>
            <label className="mb-1.5 block text-xs font-medium text-text-secondary">Page break mode</label>
            <select
              value={isRepeatMarkerInputType(field.inputType) ? field.inputType : 'text'}
              onChange={(e) => {
                const nextMode = e.target.value as ShortInputType;
                if (nextMode === PAGE_BREAK_REPEAT_START) {
                  onChange({
                    ...field,
                    inputType: PAGE_BREAK_REPEAT_START,
                    label: field.label || 'Dynamic section',
                    subtext: field.subtext || 'Repeat this section for multiple records.',
                    validation: {
                      ...(field.validation || {}),
                      repeatMinItems: field.validation?.repeatMinItems || 1,
                      repeatMaxItems: field.validation?.repeatMaxItems,
                      repeatAddLabel: field.validation?.repeatAddLabel || 'Add row',
                    },
                  });
                  return;
                }
                if (nextMode === PAGE_BREAK_REPEAT_END) {
                  onChange({
                    ...field,
                    inputType: PAGE_BREAK_REPEAT_END,
                    label: field.label || 'Dynamic section end',
                    validation: field.validation || null,
                  });
                  return;
                }
                onChange({ ...field, inputType: 'text' });
              }}
              className="w-full rounded-lg border border-border-primary bg-background-primary px-3 py-2 text-sm text-text-primary"
            >
              <option value="text">Page break</option>
              <option value={PAGE_BREAK_REPEAT_START}>Dynamic section start</option>
              <option value={PAGE_BREAK_REPEAT_END}>Dynamic section end</option>
            </select>
          </div>

          {field.inputType === PAGE_BREAK_REPEAT_START && (
            <>
              <FormInput
                label="Section title"
                value={field.label}
                onChange={(e) => onChange({ ...field, label: e.target.value })}
                placeholder="Items"
              />
              <FormInput
                label="Add button label"
                value={field.validation?.repeatAddLabel || ''}
                onChange={(e) => onChange({
                  ...field,
                  validation: {
                    ...(field.validation || {}),
                    repeatAddLabel: e.target.value.trim() || undefined,
                  },
                })}
                placeholder="Add item"
              />
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <FormInput
                  label="Min rows"
                  type="number"
                  value={field.validation?.repeatMinItems?.toString() || '1'}
                  onChange={(e) => onChange({
                    ...field,
                    validation: {
                      ...(field.validation || {}),
                      repeatMinItems: e.target.value ? Number(e.target.value) : 1,
                    },
                  })}
                />
                <FormInput
                  label="Max rows"
                  type="number"
                  value={field.validation?.repeatMaxItems?.toString() || ''}
                  onChange={(e) => onChange({
                    ...field,
                    validation: {
                      ...(field.validation || {}),
                      repeatMaxItems: e.target.value ? Number(e.target.value) : undefined,
                    },
                  })}
                  placeholder="Unlimited"
                />
              </div>
              <div>
                <label className="mb-1.5 block text-xs font-medium text-text-secondary">Section hint</label>
                <textarea
                  value={field.subtext}
                  onChange={(e) => onChange({ ...field, subtext: e.target.value })}
                  className="w-full min-h-16 rounded-lg border border-border-primary bg-background-primary px-3 py-2 text-sm text-text-primary"
                  placeholder="Explain what each row/card should capture."
                />
              </div>
            </>
          )}

          {field.inputType === PAGE_BREAK_REPEAT_END && (
            <p className="rounded-lg border border-border-primary bg-background-elevated p-3 text-xs text-text-secondary">
              This marks the end of a dynamic section. All fields between start and end become repeatable cards.
            </p>
          )}
        </>
      )}

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
              <option value="info_heading_1">Heading 1</option>
              <option value="info_heading_2">Heading 2</option>
              <option value="info_heading_3">Heading 3</option>
            </select>
          </div>

          {(field.inputType === 'info_text' || !INFO_INPUT_TYPES.includes(field.inputType)) && (
            <div className="space-y-2">
              <label className="mb-1.5 block text-xs font-medium text-text-secondary">Text block content</label>
              <div className="overflow-hidden rounded-lg border border-border-primary">
                <RichTextEditor
                  value={field.subtext || ''}
                  onChange={(nextHtml) => onChange({ ...field, subtext: nextHtml })}
                  minHeight={140}
                />
              </div>
              <p className="text-2xs text-text-muted">
                Supports rich text formatting (headings, bold, lists, links).
              </p>
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

          {!['info_heading_1', 'info_heading_2', 'info_heading_3'].includes(field.inputType) && (
            <div className="rounded-lg border border-border-primary bg-background-elevated p-3">
              <div className="space-y-3">
                <div>
                  <label className="mb-1.5 block text-xs font-medium text-text-secondary">Background color</label>
                  <div className="flex flex-wrap items-center gap-2">
                    <input
                      type="color"
                      value={normalizedInfoBackgroundColor || '#f8fafc'}
                      onChange={(e) => onChange({
                        ...field,
                        validation: {
                          ...(field.validation || {}),
                          infoBackgroundColor: normalizeHexColor(e.target.value),
                        },
                      })}
                      className="h-8 w-10 cursor-pointer rounded border border-border-primary bg-background-primary p-1"
                      aria-label="Choose information block background color"
                    />
                    <div className="rounded border border-border-primary bg-background-primary px-2 py-1 text-xs font-mono text-text-secondary">
                      {normalizedInfoBackgroundColor || 'Default'}
                    </div>
                    {normalizedInfoBackgroundColor && (
                      <button
                        type="button"
                        className="rounded border border-border-primary px-2 py-1 text-xs text-text-secondary hover:text-text-primary"
                        onClick={() => onChange({
                          ...field,
                          validation: {
                            ...(field.validation || {}),
                            infoBackgroundColor: undefined,
                          },
                        })}
                      >
                        Reset
                      </button>
                    )}
                  </div>
                </div>

                <div>
                  <div className="mb-1.5 flex items-center justify-between gap-2">
                    <label className="block text-xs font-medium text-text-secondary">Content padding (px)</label>
                    {(normalizedInfoPaddingTopPx !== undefined
                      || normalizedInfoPaddingRightPx !== undefined
                      || normalizedInfoPaddingBottomPx !== undefined
                      || normalizedInfoPaddingLeftPx !== undefined) && (
                      <button
                        type="button"
                        className="rounded border border-border-primary px-2 py-1 text-xs text-text-secondary hover:text-text-primary"
                        onClick={() => onChange({
                          ...field,
                          validation: {
                            ...(field.validation || {}),
                            infoPaddingTopPx: undefined,
                            infoPaddingRightPx: undefined,
                            infoPaddingBottomPx: undefined,
                            infoPaddingLeftPx: undefined,
                          },
                        })}
                      >
                        Reset
                      </button>
                    )}
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    {[
                      { key: 'infoPaddingTopPx', label: 'Top', value: normalizedInfoPaddingTopPx },
                      { key: 'infoPaddingRightPx', label: 'Right', value: normalizedInfoPaddingRightPx },
                      { key: 'infoPaddingBottomPx', label: 'Bottom', value: normalizedInfoPaddingBottomPx },
                      { key: 'infoPaddingLeftPx', label: 'Left', value: normalizedInfoPaddingLeftPx },
                    ].map((paddingField) => (
                      <div key={paddingField.key}>
                        <label className="mb-1 block text-2xs font-medium uppercase tracking-[0.08em] text-text-muted">
                          {paddingField.label}
                        </label>
                        <input
                          type="number"
                          min={0}
                          max={80}
                          step={1}
                          value={paddingField.value ?? ''}
                          onChange={(e) => onChange({
                            ...field,
                            validation: {
                              ...(field.validation || {}),
                              [paddingField.key]: normalizeInfoPaddingPx(e.target.value),
                            },
                          })}
                          className="w-full rounded border border-border-primary bg-background-primary px-2.5 py-1.5 text-xs text-text-primary"
                          placeholder={String(
                            paddingField.label === 'Top'
                              ? defaultInfoPadding.top
                              : paddingField.label === 'Right'
                                ? defaultInfoPadding.right
                                : paddingField.label === 'Bottom'
                                  ? defaultInfoPadding.bottom
                                  : defaultInfoPadding.left
                          )}
                          aria-label={`Set ${paddingField.label.toLowerCase()} padding in pixels`}
                        />
                      </div>
                    ))}
                  </div>
                  <p className="mt-1 text-2xs text-text-muted">
                    Override internal padding for this information block. Leave empty for default spacing.
                  </p>
                </div>
              </div>
            </div>
          )}
        </>
      )}

      {(field.type === 'SINGLE_CHOICE' || field.type === 'MULTIPLE_CHOICE') && (
        <div>
          <label className="mb-1.5 block text-xs font-medium text-text-secondary">Options</label>
          <div className="space-y-2">
            {field.options.map((option, optionIndex) => (
              <div key={`${field.clientId}-option-${optionIndex}`} className="rounded-lg border border-border-primary bg-background-elevated p-2.5">
                <div className="flex items-start gap-2">
                  <div className="min-w-0 flex-1">
                    <FormInput
                      label={`Option ${optionIndex + 1}`}
                      value={option.label}
                      onChange={(e) => {
                        const nextLabel = e.target.value;
                        const nextOptions = field.options.map((candidate, idx) => (
                          idx === optionIndex
                            ? { ...candidate, label: nextLabel, value: nextLabel }
                            : candidate
                        ));
                        onChange({ ...field, options: nextOptions });
                      }}
                    />
                    <Toggle
                      checked={option.allowTextInput === true}
                      onChange={(checked) => {
                        const nextOptions = field.options.map((candidate, idx) => (
                          idx === optionIndex ? {
                            ...candidate,
                            allowTextInput: checked,
                            textInputLabel: checked ? candidate.textInputLabel : null,
                            textInputPlaceholder: checked ? candidate.textInputPlaceholder : null,
                          } : candidate
                        ));
                        onChange({ ...field, options: nextOptions });
                      }}
                      description="Shows a text field when this option is selected."
                      className="pt-1"
                      size="sm"
                    />
                    {option.allowTextInput === true && (
                      <div className="mt-2 grid grid-cols-1 gap-2">
                        <FormInput
                          label="Details field label"
                          value={option.textInputLabel || ''}
                          onChange={(e) => {
                            const nextOptions = field.options.map((candidate, idx) => (
                              idx === optionIndex ? { ...candidate, textInputLabel: e.target.value } : candidate
                            ));
                            onChange({ ...field, options: nextOptions });
                          }}
                          placeholder="Please specify"
                        />
                        <FormInput
                          label="Details placeholder"
                          value={option.textInputPlaceholder || ''}
                          onChange={(e) => {
                            const nextOptions = field.options.map((candidate, idx) => (
                              idx === optionIndex ? { ...candidate, textInputPlaceholder: e.target.value } : candidate
                            ));
                            onChange({ ...field, options: nextOptions });
                          }}
                          placeholder="Enter details"
                        />
                      </div>
                    )}
                  </div>
                  <button
                    type="button"
                    className="rounded border border-border-primary px-2 py-1 text-xs text-text-secondary hover:text-status-error"
                    onClick={() => {
                      const nextOptions = field.options.filter((_, idx) => idx !== optionIndex);
                      onChange({ ...field, options: nextOptions });
                    }}
                  >
                    Remove
                  </button>
                </div>
              </div>
            ))}
          </div>
          <button
            type="button"
            className="mt-2 rounded border border-border-primary bg-background-primary px-2.5 py-1.5 text-xs text-text-secondary hover:text-text-primary"
            onClick={() => {
              const nextIndex = field.options.length + 1;
              onChange({
                ...field,
                options: [
                  ...field.options,
                  { label: `Option ${nextIndex}`, value: `Option ${nextIndex}` },
                ],
              });
            }}
          >
            Add option
          </button>
          <div className="mt-3 rounded-lg border border-border-primary bg-background-elevated p-3">
            <Toggle
              checked={field.validation?.choiceInlineRight === true}
              onChange={(checked) => onChange({
                ...field,
                validation: {
                  ...(field.validation || {}),
                  choiceInlineRight: checked ? true : undefined,
                },
              })}
              label="Inline options on right"
              description="Show the question label on the left and options side by side on the right."
              size="sm"
            />
          </div>
        </div>
      )}

      {field.type === 'DROPDOWN' && (
        <div className="space-y-3">
          <div className="rounded-lg border border-border-primary bg-background-elevated p-3">
            <label className="mb-1.5 block text-xs font-medium text-text-secondary">Preset list</label>
            <div className="flex flex-wrap items-end gap-2">
              <select
                value={dropdownPresetId}
                onChange={(e) => setDropdownPresetId(e.target.value)}
                className="min-w-48 flex-1 rounded-lg border border-border-primary bg-background-primary px-3 py-2 text-sm text-text-primary"
              >
                <option value="">Select preset</option>
                {DROPDOWN_PRESETS.map((preset) => (
                  <option key={preset.id} value={preset.id}>{preset.label}</option>
                ))}
              </select>
              <button
                type="button"
                disabled={!selectedDropdownPreset}
                onClick={() => {
                  if (!selectedDropdownPreset) return;
                  onChange({
                    ...field,
                    options: selectedDropdownPreset.options.map((option) => ({ label: option, value: option })),
                  });
                }}
                className="rounded border border-border-primary bg-background-primary px-3 py-2 text-xs text-text-secondary hover:text-text-primary disabled:cursor-not-allowed disabled:opacity-60"
              >
                Apply preset
              </button>
            </div>
            {selectedDropdownPreset?.description && (
              <p className="mt-2 text-xs text-text-tertiary">{selectedDropdownPreset.description}</p>
            )}
          </div>

          <div>
            <label className="mb-1.5 block text-xs font-medium text-text-secondary">Options</label>
            <textarea
              value={field.options.map((option) => option.label).join('\n')}
              onChange={(e) => onChange({
                ...field,
                options: e.target.value
                  .split('\n')
                  .map((line) => ({ label: line, value: line })),
              })}
              className="w-full min-h-24 rounded-lg border border-border-primary bg-background-primary px-3 py-2 text-sm text-text-primary"
              placeholder="One option per line"
            />
          </div>
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

      {field.type !== 'PAGE_BREAK' && (
        <>
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
    </>
  );
}
