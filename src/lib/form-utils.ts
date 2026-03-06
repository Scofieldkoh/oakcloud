export interface PublicFormField {
  id: string;
  type: string;
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
}

export interface PublicFormDefinition {
  id: string;
  slug: string;
  title: string;
  description: string | null;
  settings?: unknown;
  fields: PublicFormField[];
  status?: 'DRAFT' | 'PUBLISHED' | 'ARCHIVED';
}

export interface ChoiceOption {
  label: string;
  value: string;
  allowTextInput: boolean;
  textInputLabel: string | null;
  textInputPlaceholder: string | null;
}

export const WIDTH_CLASS: Record<number, string> = {
  25: 'col-span-12 md:col-span-3',
  33: 'col-span-12 md:col-span-4',
  50: 'col-span-12 md:col-span-6',
  66: 'col-span-12 md:col-span-8',
  75: 'col-span-12 md:col-span-9',
  100: 'col-span-12',
};

export const FORM_FIELD_KEY_MAX_LENGTH = 120;

export function normalizeKey(raw: string, maxLength: number = FORM_FIELD_KEY_MAX_LENGTH): string {
  const safeMaxLength = Number.isFinite(maxLength) && maxLength > 0
    ? Math.trunc(maxLength)
    : FORM_FIELD_KEY_MAX_LENGTH;
  let cleaned = raw
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');

  if (!cleaned) {
    return 'field'.slice(0, safeMaxLength);
  }

  if (!/^[a-z]/.test(cleaned)) {
    cleaned = `field_${cleaned}`;
  }

  let normalized = cleaned
    .slice(0, safeMaxLength)
    .replace(/^_+|_+$/g, '');

  if (!normalized) {
    normalized = 'field'.slice(0, safeMaxLength);
  }

  if (!/^[a-z]/.test(normalized)) {
    normalized = `field_${normalized}`
      .slice(0, safeMaxLength)
      .replace(/^_+|_+$/g, '');
  }

  if (!normalized || !/^[a-z]/.test(normalized)) {
    return 'field'.slice(0, safeMaxLength);
  }

  return normalized;
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

export function parseObject(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }
  return value as Record<string, unknown>;
}

function normalizeChoiceOption(input: unknown): ChoiceOption | null {
  if (typeof input === 'string') {
    const trimmed = input.trim();
    if (!trimmed) return null;
    return {
      label: trimmed,
      value: trimmed,
      allowTextInput: false,
      textInputLabel: null,
      textInputPlaceholder: null,
    };
  }

  const raw = parseObject(input);
  if (!raw) return null;

  const label = typeof raw.label === 'string' ? raw.label.trim() : '';
  const valueRaw = typeof raw.value === 'string' ? raw.value.trim() : '';
  const value = valueRaw || label;

  if (!label || !value) return null;

  const allowTextInput = raw.allowTextInput === true;
  const textInputLabel = typeof raw.textInputLabel === 'string' ? raw.textInputLabel.trim() : '';
  const textInputPlaceholder = typeof raw.textInputPlaceholder === 'string' ? raw.textInputPlaceholder.trim() : '';

  return {
    label,
    value,
    allowTextInput,
    textInputLabel: textInputLabel || null,
    textInputPlaceholder: textInputPlaceholder || null,
  };
}

export function parseChoiceOptions(value: unknown): ChoiceOption[] {
  if (!Array.isArray(value)) return [];

  const options: ChoiceOption[] = [];
  for (const item of value) {
    const parsed = normalizeChoiceOption(item);
    if (!parsed) continue;
    options.push(parsed);
  }

  return options;
}

type ChoiceAnswerEntry = {
  value: string;
  detailText: string | null;
};

function parseChoiceAnswerEntry(input: unknown): ChoiceAnswerEntry | null {
  if (typeof input === 'string') {
    const trimmed = input.trim();
    if (!trimmed) return null;
    return { value: trimmed, detailText: null };
  }

  const raw = parseObject(input);
  if (!raw) return null;
  const value = typeof raw.value === 'string' ? raw.value.trim() : '';
  if (!value) return null;
  const detailText = typeof raw.detailText === 'string' ? raw.detailText.trim() : '';

  return {
    value,
    detailText: detailText || null,
  };
}

export function formatChoiceAnswer(value: unknown): string | null {
  const formatEntry = (entry: ChoiceAnswerEntry): string => {
    if (entry.detailText) return `${entry.value} (${entry.detailText})`;
    return entry.value;
  };

  if (Array.isArray(value)) {
    const groups: string[] = [];
    for (const item of value) {
      if (Array.isArray(item)) {
        const nestedEntries = item
          .map(parseChoiceAnswerEntry)
          .filter((entry): entry is ChoiceAnswerEntry => !!entry);
        if (nestedEntries.length > 0) {
          groups.push(nestedEntries.map(formatEntry).join(', '));
        }
        continue;
      }

      const entry = parseChoiceAnswerEntry(item);
      if (!entry) continue;
      groups.push(formatEntry(entry));
    }

    if (groups.length === 0) return null;
    return groups.join('; ');
  }

  const entry = parseChoiceAnswerEntry(value);
  if (!entry) return null;
  return formatEntry(entry);
}

export const RESPONSE_COLUMN_SUBMITTED_ID = '__submitted';
export const RESPONSE_COLUMN_STATUS_ID = '__status';
const RESPONSE_COLUMN_MIN_WIDTH = 120;
const RESPONSE_COLUMN_MAX_WIDTH = 900;

export interface FormResponseTableSettings {
  summaryFieldKeys: string[];
  columnOrder: string[];
  columnWidths: Record<string, number>;
}

export interface FormNotificationSettings {
  completionRecipientEmails: string[];
}

export interface FormFileNameSettings {
  pdfTemplate: string | null;
}

export interface FormI18nFieldTranslation {
  label?: string;
  placeholder?: string;
  subtext?: string;
  helpText?: string;
  options?: string[];
}

export interface FormI18nLocaleTranslation {
  form: {
    title?: string;
    description?: string;
  };
  fields: Record<string, FormI18nFieldTranslation>;
  ui: Record<string, string>;
}

export interface FormI18nSettings {
  defaultLocale: string;
  enabledLocales: string[];
  allowLocaleSwitch: boolean;
  translations: Record<string, FormI18nLocaleTranslation>;
}

export function isSummaryEligibleFieldType(fieldType: string): boolean {
  return !['PAGE_BREAK', 'PARAGRAPH', 'HTML', 'HIDDEN'].includes(fieldType);
}

function normalizeStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];

  const unique = new Set<string>();
  for (const item of value) {
    if (typeof item !== 'string') continue;
    const trimmed = item.trim();
    if (!trimmed) continue;
    unique.add(trimmed);
  }

  return Array.from(unique);
}

function isValidEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function normalizeFileNameTemplate(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  return trimmed.slice(0, 240);
}

export function normalizeLocaleCode(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed) return null;

  try {
    const [canonical] = Intl.getCanonicalLocales(trimmed);
    return canonical || null;
  } catch {
    return null;
  }
}

function normalizeI18nText(value: unknown, maxLength: number): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  return trimmed.slice(0, maxLength);
}

function normalizeI18nOptionList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];

  return value
    .slice(0, 500)
    .map((entry) => (typeof entry === 'string' ? entry.trim().slice(0, 200) : ''));
}

function parseI18nFieldTranslations(value: unknown): Record<string, FormI18nFieldTranslation> {
  const fieldsObject = parseObject(value);
  if (!fieldsObject) return {};

  const parsed: Record<string, FormI18nFieldTranslation> = {};

  for (const [rawFieldKey, rawFieldTranslation] of Object.entries(fieldsObject)) {
    const fieldKey = rawFieldKey.trim();
    if (!fieldKey) continue;

    const fieldTranslation = parseObject(rawFieldTranslation);
    if (!fieldTranslation) continue;

    const nextTranslation: FormI18nFieldTranslation = {};
    const label = normalizeI18nText(fieldTranslation.label, 1000);
    const placeholder = normalizeI18nText(fieldTranslation.placeholder, 500);
    const subtext = normalizeI18nText(fieldTranslation.subtext, 10000);
    const helpText = normalizeI18nText(fieldTranslation.helpText, 2000);
    const options = normalizeI18nOptionList(fieldTranslation.options);

    if (label) nextTranslation.label = label;
    if (placeholder) nextTranslation.placeholder = placeholder;
    if (subtext) nextTranslation.subtext = subtext;
    if (helpText) nextTranslation.helpText = helpText;
    if (options.length > 0) nextTranslation.options = options;

    if (Object.keys(nextTranslation).length > 0) {
      parsed[fieldKey] = nextTranslation;
    }
  }

  return parsed;
}

function parseI18nUiTranslations(value: unknown): Record<string, string> {
  const uiObject = parseObject(value);
  if (!uiObject) return {};

  const parsed: Record<string, string> = {};
  for (const [rawKey, rawValue] of Object.entries(uiObject)) {
    const key = rawKey.trim();
    if (!key) continue;
    const text = normalizeI18nText(rawValue, 240);
    if (!text) continue;
    parsed[key] = text;
  }

  return parsed;
}

function parseI18nTranslations(value: unknown): Record<string, FormI18nLocaleTranslation> {
  const translationsObject = parseObject(value);
  if (!translationsObject) return {};

  const parsed: Record<string, FormI18nLocaleTranslation> = {};

  for (const [rawLocale, rawTranslation] of Object.entries(translationsObject)) {
    const locale = normalizeLocaleCode(rawLocale);
    if (!locale) continue;

    const translationObject = parseObject(rawTranslation);
    if (!translationObject) continue;

    const formObject = parseObject(translationObject.form);
    const formTitle = normalizeI18nText(formObject?.title, 120);
    const formDescription = normalizeI18nText(formObject?.description, 2000);
    const fields = parseI18nFieldTranslations(translationObject.fields);
    const ui = parseI18nUiTranslations(translationObject.ui);

    const localeTranslation: FormI18nLocaleTranslation = {
      form: {},
      fields,
      ui,
    };

    if (formTitle) localeTranslation.form.title = formTitle;
    if (formDescription) localeTranslation.form.description = formDescription;

    const hasFormTranslation = Object.keys(localeTranslation.form).length > 0;
    const hasFieldTranslation = Object.keys(localeTranslation.fields).length > 0;
    const hasUiTranslation = Object.keys(localeTranslation.ui).length > 0;

    if (hasFormTranslation || hasFieldTranslation || hasUiTranslation) {
      parsed[locale] = localeTranslation;
    }
  }

  return parsed;
}

export function clampResponseColumnWidth(width: number): number {
  if (!Number.isFinite(width)) return RESPONSE_COLUMN_MIN_WIDTH;
  return Math.min(RESPONSE_COLUMN_MAX_WIDTH, Math.max(RESPONSE_COLUMN_MIN_WIDTH, Math.round(width)));
}

export function normalizeResponseColumnOrder(baseColumnIds: string[], preferredOrder?: string[]): string[] {
  const allowed = new Set(baseColumnIds);
  const ordered: string[] = [];

  for (const id of preferredOrder || []) {
    if (!allowed.has(id)) continue;
    if (ordered.includes(id)) continue;
    ordered.push(id);
  }

  for (const id of baseColumnIds) {
    if (!ordered.includes(id)) {
      ordered.push(id);
    }
  }

  return ordered;
}

export function sanitizeResponseColumnWidths(
  columnWidths: Record<string, number>,
  allowedColumnIds: string[]
): Record<string, number> {
  const allowed = new Set(allowedColumnIds);
  const sanitized: Record<string, number> = {};

  for (const [key, value] of Object.entries(columnWidths)) {
    if (!allowed.has(key)) continue;
    if (!Number.isFinite(value)) continue;
    sanitized[key] = clampResponseColumnWidth(value);
  }

  return sanitized;
}

export function parseFormResponseTableSettings(settings: unknown): FormResponseTableSettings {
  const root = parseObject(settings);
  const responseTable = parseObject(root?.responseTable);

  const summaryFieldKeys = normalizeStringArray(responseTable?.summaryFieldKeys);
  const columnOrder = normalizeStringArray(responseTable?.columnOrder);
  const rawWidths = parseObject(responseTable?.columnWidths);
  const columnWidths: Record<string, number> = {};

  if (rawWidths) {
    for (const [key, value] of Object.entries(rawWidths)) {
      if (typeof value !== 'number' || !Number.isFinite(value)) continue;
      columnWidths[key] = clampResponseColumnWidth(value);
    }
  }

  return {
    summaryFieldKeys,
    columnOrder,
    columnWidths,
  };
}

export function writeFormResponseTableSettings(
  settings: unknown,
  responseTable: FormResponseTableSettings
): Record<string, unknown> {
  const root = parseObject(settings) ? { ...(settings as Record<string, unknown>) } : {};
  root.responseTable = {
    summaryFieldKeys: [...responseTable.summaryFieldKeys],
    columnOrder: [...responseTable.columnOrder],
    columnWidths: { ...responseTable.columnWidths },
  };
  return root;
}

export function parseFormNotificationSettings(settings: unknown): FormNotificationSettings {
  const root = parseObject(settings);
  const notifications = parseObject(root?.notifications);
  const rawRecipients = normalizeStringArray(notifications?.completionRecipientEmails);

  const recipientSet = new Set<string>();
  for (const email of rawRecipients) {
    const normalized = email.trim().toLowerCase();
    if (!isValidEmail(normalized)) continue;
    recipientSet.add(normalized);
  }

  return {
    completionRecipientEmails: Array.from(recipientSet),
  };
}

export function writeFormNotificationSettings(
  settings: unknown,
  notifications: FormNotificationSettings
): Record<string, unknown> {
  const root = parseObject(settings) ? { ...(settings as Record<string, unknown>) } : {};
  const existingNotifications = parseObject(root.notifications) ? { ...(root.notifications as Record<string, unknown>) } : {};

  root.notifications = {
    ...existingNotifications,
    completionRecipientEmails: [...notifications.completionRecipientEmails],
  };

  return root;
}

export function parseFormFileNameSettings(settings: unknown): FormFileNameSettings {
  const root = parseObject(settings);
  const fileNaming = parseObject(root?.fileNaming);

  return {
    pdfTemplate: normalizeFileNameTemplate(fileNaming?.pdfTemplate),
  };
}

export function writeFormFileNameSettings(
  settings: unknown,
  fileNameSettings: FormFileNameSettings
): Record<string, unknown> {
  const root = parseObject(settings) ? { ...(settings as Record<string, unknown>) } : {};
  const existingFileNaming = parseObject(root.fileNaming) ? { ...(root.fileNaming as Record<string, unknown>) } : {};
  const nextFileNaming = { ...existingFileNaming };

  const nextPdfTemplate = normalizeFileNameTemplate(fileNameSettings.pdfTemplate);

  if (nextPdfTemplate) {
    nextFileNaming.pdfTemplate = nextPdfTemplate;
  } else {
    delete nextFileNaming.pdfTemplate;
  }
  delete nextFileNaming.uploadTemplate;

  if (Object.keys(nextFileNaming).length > 0) {
    root.fileNaming = nextFileNaming;
  } else {
    delete root.fileNaming;
  }

  return root;
}

export function parseFormI18nSettings(settings: unknown): FormI18nSettings {
  const root = parseObject(settings);
  const i18n = parseObject(root?.i18n);

  const fallbackDefaultLocale = 'en';
  const parsedDefaultLocale = normalizeLocaleCode(i18n?.defaultLocale) || fallbackDefaultLocale;
  const rawEnabledLocales = Array.isArray(i18n?.enabledLocales) ? i18n.enabledLocales : [];
  const enabledLocaleSet = new Set<string>();

  for (const locale of rawEnabledLocales) {
    const normalized = normalizeLocaleCode(locale);
    if (!normalized) continue;
    enabledLocaleSet.add(normalized);
  }

  enabledLocaleSet.add(parsedDefaultLocale);

  const translations = parseI18nTranslations(i18n?.translations);
  for (const locale of Object.keys(translations)) {
    enabledLocaleSet.add(locale);
  }

  const enabledLocales = Array.from(enabledLocaleSet);
  const allowLocaleSwitch = i18n?.allowLocaleSwitch !== false;

  return {
    defaultLocale: parsedDefaultLocale,
    enabledLocales,
    allowLocaleSwitch,
    translations,
  };
}

export function writeFormI18nSettings(
  settings: unknown,
  i18nSettings: FormI18nSettings
): Record<string, unknown> {
  const root = parseObject(settings) ? { ...(settings as Record<string, unknown>) } : {};

  const defaultLocale = normalizeLocaleCode(i18nSettings.defaultLocale) || 'en';
  const enabledLocaleSet = new Set<string>([defaultLocale]);

  for (const locale of i18nSettings.enabledLocales || []) {
    const normalized = normalizeLocaleCode(locale);
    if (!normalized) continue;
    enabledLocaleSet.add(normalized);
  }

  const translations = parseI18nTranslations(i18nSettings.translations);
  for (const locale of Object.keys(translations)) {
    enabledLocaleSet.add(locale);
  }

  root.i18n = {
    defaultLocale,
    enabledLocales: Array.from(enabledLocaleSet),
    allowLocaleSwitch: i18nSettings.allowLocaleSwitch !== false,
    translations,
  };

  return root;
}

export function parseOptions(value: unknown): string[] {
  return parseChoiceOptions(value).map((option) => option.label);
}

export function isEmptyValue(value: unknown): boolean {
  if (value === null || value === undefined) return true;
  if (typeof value === 'string') return value.trim().length === 0;
  if (Array.isArray(value)) {
    if (value.length === 0) return true;
    return value.every((item) => isEmptyValue(item));
  }
  if (isRecord(value) && 'value' in value) {
    return isEmptyValue(value.value);
  }
  return false;
}

export function evaluateCondition(
  condition: unknown,
  answers: Record<string, unknown>
): boolean {
  if (!condition) return true;
  const cond = isRecord(condition) ? condition : null;
  if (!cond) return true;

  const fieldKey = typeof cond.fieldKey === 'string' ? cond.fieldKey : null;
  const operator = typeof cond.operator === 'string' ? cond.operator : null;

  if (!fieldKey || !operator) return true;

  const normalizeActual = (value: unknown): unknown => {
    const record = parseObject(value);
    if (record && typeof record.value === 'string') {
      return record.value;
    }
    return value;
  };

  const actual = normalizeActual(answers[fieldKey]);
  const expected = cond.value;

  switch (operator) {
    case 'equals':
      return actual === expected;
    case 'not_equals':
      return actual !== expected;
    case 'contains':
      if (Array.isArray(actual)) return actual.map((item) => normalizeActual(item)).includes(expected);
      if (typeof actual === 'string' && typeof expected === 'string') {
        return actual.toLowerCase().includes(expected.toLowerCase());
      }
      return false;
    case 'is_empty':
      return isEmptyValue(actual);
    case 'not_empty':
      return !isEmptyValue(actual);
    default:
      return true;
  }
}
