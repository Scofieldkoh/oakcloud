import { normalizeKey, isRecord } from '@/lib/form-utils';
import type { FormFieldInput } from '@/lib/validations/form-builder';

export { normalizeKey, WIDTH_CLASS } from '@/lib/form-utils';

export const FIELD_TYPE_OPTIONS: Array<{ value: FormFieldInput['type']; label: string }> = [
  { value: 'SHORT_TEXT', label: 'Short answer (Input)' },
  { value: 'LONG_TEXT', label: 'Long answer (Textarea)' },
  { value: 'SINGLE_CHOICE', label: 'Single choice' },
  { value: 'MULTIPLE_CHOICE', label: 'Multiple choice' },
  { value: 'DROPDOWN', label: 'Dropdown' },
  { value: 'PARAGRAPH', label: 'Information block' },
  { value: 'HTML', label: 'HTML / Code' },
  { value: 'FILE_UPLOAD', label: 'File upload' },
  { value: 'SIGNATURE', label: 'eSignature' },
  { value: 'HIDDEN', label: 'Hidden field' },
  { value: 'PAGE_BREAK', label: 'Page break' },
];

export const FIELD_TYPE_LABEL: Record<FormFieldInput['type'], string> = FIELD_TYPE_OPTIONS.reduce(
  (acc, item) => ({ ...acc, [item.value]: item.label }),
  {} as Record<FormFieldInput['type'], string>
);

export const WIDTH_OPTIONS: Array<25 | 33 | 50 | 66 | 75 | 100> = [25, 33, 50, 66, 75, 100];


export type ShortInputType =
  | 'text'
  | 'email'
  | 'phone'
  | 'number'
  | 'date'
  | 'info_text'
  | 'info_image'
  | 'info_url'
  | 'info_heading_1'
  | 'info_heading_2'
  | 'info_heading_3';

export type ValidationConfig = {
  minLength?: number;
  maxLength?: number;
  min?: number;
  max?: number;
  pattern?: string;
  maxFileSizeMb?: number;
  allowedMimeTypes?: string[];
  tooltipEnabled?: boolean;
};

export type ConditionConfig = {
  fieldKey: string;
  operator: 'equals' | 'not_equals' | 'contains' | 'is_empty' | 'not_empty';
  value?: string | number | boolean | null;
};

export interface BuilderField {
  clientId: string;
  id?: string;
  type: FormFieldInput['type'];
  label: string;
  key: string;
  placeholder: string;
  subtext: string;
  helpText: string;
  inputType: ShortInputType;
  options: string[];
  validation: ValidationConfig | null;
  condition: ConditionConfig | null;
  isRequired: boolean;
  hideLabel: boolean;
  isReadOnly: boolean;
  showOnSummary: boolean;
  layoutWidth: 25 | 33 | 50 | 66 | 75 | 100;
  position: number;
}

export function newClientId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `tmp_${crypto.randomUUID()}`;
  }
  return `tmp_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}


export function defaultField(type: FormFieldInput['type'], position: number): BuilderField {
  const label = type === 'PAGE_BREAK' ? 'Page break' : 'Untitled field';
  const key = type === 'PAGE_BREAK' ? `page_break_${position + 1}` : `field_${position + 1}`;

  return {
    clientId: newClientId(),
    type,
    label,
    key,
    placeholder: '',
    subtext: '',
    helpText: '',
    inputType: type === 'PARAGRAPH' ? 'info_text' : 'text',
    options: type === 'SINGLE_CHOICE' || type === 'MULTIPLE_CHOICE' || type === 'DROPDOWN'
      ? ['Option 1', 'Option 2']
      : [],
    validation: type === 'FILE_UPLOAD' ? { maxFileSizeMb: 50 } : null,
    condition: null,
    isRequired: false,
    hideLabel: false,
    isReadOnly: false,
    showOnSummary: false,
    layoutWidth: 100,
    position,
  };
}


function parseFieldOptions(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === 'string');
}

export function fromServerField(field: {
  id: string;
  type: FormFieldInput['type'];
  label: string | null;
  key: string;
  placeholder: string | null;
  subtext: string | null;
  helpText: string | null;
  inputType: string | null;
  options: unknown;
  validation: unknown;
  condition: unknown;
  isRequired: boolean;
  hideLabel: boolean;
  isReadOnly: boolean;
  layoutWidth: number;
  position: number;
}, options?: { showOnSummary?: boolean }): BuilderField {
  const validation = isRecord(field.validation) ? field.validation as ValidationConfig : null;
  const condition = isRecord(field.condition) ? field.condition as ConditionConfig : null;
  const inputType = (field.inputType || (field.type === 'PARAGRAPH' ? 'info_text' : 'text')) as ShortInputType;

  return {
    clientId: field.id,
    id: field.id,
    type: field.type,
    label: field.label || '',
    key: field.key,
    placeholder: field.placeholder || '',
    subtext: field.subtext || '',
    helpText: field.helpText || '',
    inputType,
    options: parseFieldOptions(field.options),
    validation,
    condition,
    isRequired: field.isRequired,
    hideLabel: field.hideLabel,
    isReadOnly: field.isReadOnly,
    showOnSummary: options?.showOnSummary ?? false,
    layoutWidth: WIDTH_OPTIONS.includes(field.layoutWidth as 25 | 33 | 50 | 66 | 75 | 100)
      ? (field.layoutWidth as 25 | 33 | 50 | 66 | 75 | 100)
      : 100,
    position: field.position,
  };
}

export function toPayloadFields(fields: BuilderField[]): FormFieldInput[] {
  return fields.map((field, idx) => ({
    id: field.id,
    type: field.type,
    label: field.label || null,
    key: normalizeKey(field.key || field.label || `field_${idx + 1}`),
    placeholder: field.placeholder || null,
    subtext: field.subtext || null,
    helpText: field.helpText || null,
    inputType: field.type === 'SHORT_TEXT' || field.type === 'PARAGRAPH' ? field.inputType : null,
    options: (field.type === 'SINGLE_CHOICE' || field.type === 'MULTIPLE_CHOICE' || field.type === 'DROPDOWN')
      ? field.options.filter(Boolean)
      : null,
    validation: field.validation,
    condition: field.condition,
    isRequired: field.isRequired,
    hideLabel: field.hideLabel,
    isReadOnly: field.isReadOnly,
    layoutWidth: field.layoutWidth,
    position: idx,
  }));
}

export function serializeBuilderState(input: {
  title: string;
  description: string;
  slug: string;
  status: 'DRAFT' | 'PUBLISHED' | 'ARCHIVED';
  tags: string[];
  fields: BuilderField[];
}): string {
  return JSON.stringify({
    title: input.title.trim(),
    description: input.description.trim(),
    slug: input.slug.trim(),
    status: input.status,
    tags: input.tags,
    fields: input.fields.map((field, idx) => ({
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
      showOnSummary: field.showOnSummary,
      layoutWidth: field.layoutWidth,
      position: idx,
    })),
  });
}

export function suggestFieldsFromPrompt(prompt: string): BuilderField[] {
  const lowered = prompt.toLowerCase();
  const generated: BuilderField[] = [];

  const maybePush = (condition: boolean, field: BuilderField) => {
    if (condition) generated.push(field);
  };

  maybePush(/name|full name|first name|last name/.test(lowered), {
    ...defaultField('SHORT_TEXT', generated.length),
    label: 'Full Name',
    key: 'full_name',
    isRequired: true,
  });

  maybePush(/email/.test(lowered), {
    ...defaultField('SHORT_TEXT', generated.length),
    label: 'Email address',
    key: 'email_address',
    inputType: 'email',
    isRequired: true,
    layoutWidth: 50,
  });

  maybePush(/phone|contact/.test(lowered), {
    ...defaultField('SHORT_TEXT', generated.length),
    label: 'Contact number',
    key: 'contact_number',
    inputType: 'phone',
    layoutWidth: 50,
  });

  maybePush(/upload|attach|file/.test(lowered), {
    ...defaultField('FILE_UPLOAD', generated.length),
    label: 'Attachment',
    key: 'attachment',
    validation: { maxFileSizeMb: 50 },
  });

  maybePush(/signature|sign/.test(lowered), {
    ...defaultField('SIGNATURE', generated.length),
    label: 'Signature',
    key: 'signature',
  });

  if (generated.length === 0) {
    generated.push(defaultField('SHORT_TEXT', 0));
  }

  return generated.map((field, index) => ({ ...field, position: index }));
}
