'use client';

import { FormInput } from '@/components/ui/form-input';
import { Toggle } from '@/components/ui/toggle';
import { DEFAULT_PHONE_COUNTRY_CODE, PHONE_COUNTRY_CODE_OPTIONS } from '@/lib/constants/phone-country-codes';
import type { BuilderField } from './builder-utils';

export function FieldValidationTab({
  field,
  onChange,
}: {
  field: BuilderField;
  onChange: (next: BuilderField) => void;
}) {
  const phoneDefaultCountryCode = typeof field.validation?.phoneDefaultCountryCode === 'string'
    ? field.validation.phoneDefaultCountryCode
    : DEFAULT_PHONE_COUNTRY_CODE;

  return (
    <>
      {((field.type === 'SHORT_TEXT' && field.inputType !== 'date' && field.inputType !== 'number') || field.type === 'LONG_TEXT') && (
        <div className="space-y-3">
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
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <FormInput
              label="Begins with"
              value={field.validation?.startsWith || ''}
              onChange={(e) => onChange({
                ...field,
                validation: {
                  ...(field.validation || {}),
                  startsWith: e.target.value.trim() || undefined,
                },
              })}
            />
            <FormInput
              label="Ends with"
              value={field.validation?.endsWith || ''}
              onChange={(e) => onChange({
                ...field,
                validation: {
                  ...(field.validation || {}),
                  endsWith: e.target.value.trim() || undefined,
                },
              })}
            />
            <FormInput
              label="Contains"
              value={field.validation?.containsText || ''}
              onChange={(e) => onChange({
                ...field,
                validation: {
                  ...(field.validation || {}),
                  containsText: e.target.value || undefined,
                },
              })}
            />
            <FormInput
              label="Does not contain"
              value={field.validation?.notContainsText || ''}
              onChange={(e) => onChange({
                ...field,
                validation: {
                  ...(field.validation || {}),
                  notContainsText: e.target.value || undefined,
                },
              })}
            />
          </div>
        </div>
      )}

      {field.type === 'SHORT_TEXT' && field.inputType === 'number' && (
        <div className="space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <FormInput
              label="Min amount"
              type="number"
              value={field.validation?.min?.toString() || ''}
              onChange={(e) => onChange({
                ...field,
                validation: {
                  ...(field.validation || {}),
                  min: e.target.value ? Number(e.target.value) : undefined,
                },
              })}
            />
            <FormInput
              label="Max amount"
              type="number"
              value={field.validation?.max?.toString() || ''}
              onChange={(e) => onChange({
                ...field,
                validation: {
                  ...(field.validation || {}),
                  max: e.target.value ? Number(e.target.value) : undefined,
                },
              })}
            />
            <FormInput
              label="Equal to"
              type="number"
              value={field.validation?.equal?.toString() || ''}
              onChange={(e) => onChange({
                ...field,
                validation: {
                  ...(field.validation || {}),
                  equal: e.target.value ? Number(e.target.value) : undefined,
                },
              })}
            />
          </div>
          <div className="grid grid-cols-1 gap-3">
            <FormInput
              label="Min formula"
              value={field.validation?.minFormula || ''}
              onChange={(e) => onChange({
                ...field,
                validation: {
                  ...(field.validation || {}),
                  minFormula: e.target.value.trim() || undefined,
                },
              })}
              placeholder=">= [amount1] + [amount2]"
            />
            <FormInput
              label="Max formula"
              value={field.validation?.maxFormula || ''}
              onChange={(e) => onChange({
                ...field,
                validation: {
                  ...(field.validation || {}),
                  maxFormula: e.target.value.trim() || undefined,
                },
              })}
              placeholder="<= [budget] * 1.1"
            />
            <FormInput
              label="Equal formula"
              value={field.validation?.equalFormula || ''}
              onChange={(e) => onChange({
                ...field,
                validation: {
                  ...(field.validation || {}),
                  equalFormula: e.target.value.trim() || undefined,
                },
              })}
              placeholder="= [amount1] + [amount2]"
            />
          </div>
          <p className="text-2xs text-text-muted">Use field keys in square brackets. You can enter expressions like `&gt;= [amount1] + [amount2]`, `&lt;= [budget] * 1.1`, or `= [amount1] + [amount2]`.</p>
        </div>
      )}

      {field.type === 'SHORT_TEXT' && field.inputType === 'date' && (
        <div className="space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <FormInput
                label="Min date"
                value={field.validation?.minDate || ''}
                onChange={(e) => onChange({
                  ...field,
                  validation: {
                    ...(field.validation || {}),
                    minDate: e.target.value.trim() || undefined,
                  },
                })}
                placeholder="YYYY-MM-DD or today"
              />
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  className="rounded border border-border-primary bg-background-primary px-2.5 py-1 text-xs text-text-secondary hover:text-text-primary"
                  onClick={() => onChange({
                    ...field,
                    validation: { ...(field.validation || {}), minDate: 'today' },
                  })}
                >
                  Use today
                </button>
                <button
                  type="button"
                  className="rounded border border-border-primary bg-background-primary px-2.5 py-1 text-xs text-text-secondary hover:text-text-primary"
                  onClick={() => onChange({
                    ...field,
                    validation: { ...(field.validation || {}), minDate: undefined },
                  })}
                >
                  Clear
                </button>
              </div>
            </div>
            <div className="space-y-1.5">
              <FormInput
                label="Max date"
                value={field.validation?.maxDate || ''}
                onChange={(e) => onChange({
                  ...field,
                  validation: {
                    ...(field.validation || {}),
                    maxDate: e.target.value.trim() || undefined,
                  },
                })}
                placeholder="YYYY-MM-DD or today"
              />
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  className="rounded border border-border-primary bg-background-primary px-2.5 py-1 text-xs text-text-secondary hover:text-text-primary"
                  onClick={() => onChange({
                    ...field,
                    validation: { ...(field.validation || {}), maxDate: 'today' },
                  })}
                >
                  Use today
                </button>
                <button
                  type="button"
                  className="rounded border border-border-primary bg-background-primary px-2.5 py-1 text-xs text-text-secondary hover:text-text-primary"
                  onClick={() => onChange({
                    ...field,
                    validation: { ...(field.validation || {}), maxDate: undefined },
                  })}
                >
                  Clear
                </button>
              </div>
            </div>
          </div>
          <p className="text-2xs text-text-muted">Use a fixed date like `2026-03-08` or the variable `today`.</p>
          <div className="rounded-lg border border-border-primary bg-background-elevated p-3">
            <Toggle
              checked={field.validation?.defaultToday === true}
              onChange={(checked) => onChange({
                ...field,
                validation: {
                  ...(field.validation || {}),
                  defaultToday: checked ? true : undefined,
                },
              })}
              label="Default to today's date"
              description="Pre-fill this date field with today's date for new responses."
              size="sm"
            />
          </div>
        </div>
      )}

      {field.type === 'SHORT_TEXT' && field.inputType === 'phone' && (
        <div className="space-y-3 rounded-lg border border-border-primary bg-background-elevated p-3">
          <Toggle
            checked={field.validation?.splitPhoneCountryCode === true}
            onChange={(checked) => onChange({
              ...field,
              validation: {
                ...(field.validation || {}),
                splitPhoneCountryCode: checked ? true : undefined,
                phoneDefaultCountryCode: checked
                  ? (field.validation?.phoneDefaultCountryCode || DEFAULT_PHONE_COUNTRY_CODE)
                  : field.validation?.phoneDefaultCountryCode,
              },
            })}
            label="Split country code"
            description="Show a separate country code selector before the phone number input."
            size="sm"
          />

          {field.validation?.splitPhoneCountryCode === true && (
            <div>
              <label className="mb-1.5 block text-xs font-medium text-text-secondary">Default country code</label>
              <select
                value={phoneDefaultCountryCode}
                onChange={(e) => onChange({
                  ...field,
                  validation: {
                    ...(field.validation || {}),
                    splitPhoneCountryCode: true,
                    phoneDefaultCountryCode: e.target.value || DEFAULT_PHONE_COUNTRY_CODE,
                  },
                })}
                className="w-full rounded-lg border border-border-primary bg-background-primary px-3 py-2 text-sm text-text-primary"
              >
                {PHONE_COUNTRY_CODE_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>{option.label}</option>
                ))}
              </select>
            </div>
          )}
        </div>
      )}

      {field.type === 'FILE_UPLOAD' && (
        <div className="space-y-3">
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
          <div className="rounded-lg border border-border-primary bg-background-elevated p-3">
            <Toggle
              checked={field.validation?.allowMultipleFiles === true}
              onChange={(checked) => onChange({
                ...field,
                validation: {
                  ...(field.validation || {}),
                  allowMultipleFiles: checked ? true : undefined,
                },
              })}
              label="Allow multiple files"
              description="Users can upload more than one file for this field and remove files before submitting."
              size="sm"
            />
          </div>
          <FormInput
            label="Attachment filename template"
            value={field.validation?.uploadFileNameTemplate || ''}
            onChange={(e) => {
              const nextTemplate = e.target.value;
              onChange({
                ...field,
                validation: {
                  ...(field.validation || {}),
                  uploadFileNameTemplate: nextTemplate.length > 0 ? nextTemplate : undefined,
                },
              });
            }}
            placeholder="Attachment - [full_name] - [datetime_stamp]"
            hint="Use [field_key], [upload_id], [original_filename], [original_basename], [original_extension], [file_index], plus [datetime_stamp], [date_stamp], [time_stamp], [submission_id], [form_title], [form_slug], and any [field_key]. [datetime_stamp] uses the tenant timezone (for example: 6 Mar 26 - 9.51PM)."
          />
        </div>
      )}
    </>
  );
}
