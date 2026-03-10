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
  | 'info_heading_3'
  | 'repeat_start'
  | 'repeat_end';

export function isRepeatMarkerInputType(value: string): value is 'repeat_start' | 'repeat_end' {
  return value === 'repeat_start' || value === 'repeat_end';
}

export type ValidationConfig = {
  minLength?: number;
  maxLength?: number;
  min?: number;
  max?: number;
  equal?: number;
  minFormula?: string;
  maxFormula?: string;
  equalFormula?: string;
  minDate?: string;
  maxDate?: string;
  startsWith?: string;
  containsText?: string;
  notContainsText?: string;
  endsWith?: string;
  pattern?: string;
  maxFileSizeMb?: number;
  allowMultipleFiles?: boolean;
  allowedMimeTypes?: string[];
  uploadFileNameTemplate?: string;
  tooltipEnabled?: boolean;
  choiceInlineRight?: boolean;
  defaultToday?: boolean;
  splitPhoneCountryCode?: boolean;
  phoneDefaultCountryCode?: string;
  infoBackgroundColor?: string;
  infoPaddingPx?: number;
  infoPaddingTopPx?: number;
  infoPaddingRightPx?: number;
  infoPaddingBottomPx?: number;
  infoPaddingLeftPx?: number;
  repeatMinItems?: number;
  repeatMaxItems?: number;
  repeatAddLabel?: string;
};

export type ChoiceOptionConfig = {
  label: string;
  value: string;
  allowTextInput?: boolean;
  textInputLabel?: string | null;
  textInputPlaceholder?: string | null;
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
  options: ChoiceOptionConfig[];
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
  const key = normalizeKey(label);

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
      ? [
        { label: 'Option 1', value: 'Option 1' },
        { label: 'Option 2', value: 'Option 2' },
      ]
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


function parseFieldOptions(value: unknown): ChoiceOptionConfig[] {
  if (!Array.isArray(value)) return [];

  const parsed: ChoiceOptionConfig[] = [];
  for (const item of value) {
    if (typeof item === 'string') {
      const text = item.trim();
      if (!text) continue;
      parsed.push({ label: text, value: text });
      continue;
    }

    if (!item || typeof item !== 'object' || Array.isArray(item)) continue;

    const optionRecord = item as Record<string, unknown>;
    const label = typeof optionRecord.label === 'string' ? optionRecord.label.trim() : '';
    const valueText = typeof optionRecord.value === 'string' ? optionRecord.value.trim() : '';
    const value = valueText || label;
    if (!label || !value) continue;

    parsed.push({
      label,
      value,
      allowTextInput: optionRecord.allowTextInput === true,
      textInputLabel: typeof optionRecord.textInputLabel === 'string' ? optionRecord.textInputLabel.trim() || null : null,
      textInputPlaceholder: typeof optionRecord.textInputPlaceholder === 'string' ? optionRecord.textInputPlaceholder.trim() || null : null,
    });
  }

  return parsed;
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
    inputType: field.type === 'SHORT_TEXT' || field.type === 'PARAGRAPH'
      ? field.inputType
      : (field.type === 'PAGE_BREAK' && isRepeatMarkerInputType(field.inputType) ? field.inputType : null),
    options: (field.type === 'SINGLE_CHOICE' || field.type === 'MULTIPLE_CHOICE')
      ? field.options
        .map((option) => {
          const label = option.label?.trim();
          const value = label;
          if (!label || !value) return null;
          return {
            label,
            value,
            ...(option.allowTextInput ? { allowTextInput: true } : {}),
            ...(option.textInputLabel ? { textInputLabel: option.textInputLabel.trim() } : {}),
            ...(option.textInputPlaceholder ? { textInputPlaceholder: option.textInputPlaceholder.trim() } : {}),
          };
        })
        .filter((option): option is NonNullable<typeof option> => !!option)
      : (field.type === 'DROPDOWN'
        ? field.options
          .map((option) => option.label.trim())
          .filter(Boolean)
        : null),
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
  notificationRecipientEmails?: string[];
  notificationRecipientText?: string;
  draftSaveEnabled?: boolean;
  draftAutoDeleteDays?: number;
  pdfFileNameTemplate?: string;
  i18nDefaultLocale?: string;
  i18nEnabledLocales?: string[];
  i18nAllowLocaleSwitch?: boolean;
  i18nTranslations?: unknown;
  hideLogo?: boolean;
  hideFooter?: boolean;
  aiParsingEnabled?: boolean;
  aiParsingCustomContext?: string;
}): string {
  return JSON.stringify({
    title: input.title.trim(),
    description: input.description.trim(),
    slug: input.slug.trim(),
    status: input.status,
    tags: input.tags,
    notificationRecipientEmails: (input.notificationRecipientEmails || []).map((email) => email.trim().toLowerCase()).filter(Boolean),
    notificationRecipientText: (input.notificationRecipientText || '').trim(),
    draftSaveEnabled: input.draftSaveEnabled === true,
    draftAutoDeleteDays: typeof input.draftAutoDeleteDays === 'number' && Number.isFinite(input.draftAutoDeleteDays)
      ? Math.max(1, Math.min(365, Math.trunc(input.draftAutoDeleteDays)))
      : 14,
    pdfFileNameTemplate: (input.pdfFileNameTemplate || '').trim(),
    i18nDefaultLocale: (input.i18nDefaultLocale || '').trim(),
    i18nEnabledLocales: (input.i18nEnabledLocales || []).map((locale) => locale.trim()).filter(Boolean),
    i18nAllowLocaleSwitch: input.i18nAllowLocaleSwitch !== false,
    i18nTranslations: input.i18nTranslations || {},
    hideLogo: input.hideLogo === true,
    hideFooter: input.hideFooter === true,
    aiParsingEnabled: input.aiParsingEnabled === true,
    aiParsingCustomContext: (input.aiParsingCustomContext || '').trim(),
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
