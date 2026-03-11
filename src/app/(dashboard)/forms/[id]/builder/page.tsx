'use client';

import { type ReactNode, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
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
import { Bell, ChevronDown, ChevronLeft, ChevronRight, CircleHelp, ClipboardCopy, Copy, Globe, Paintbrush, Plus, Save, Sparkles, Users } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { FormInput } from '@/components/ui/form-input';
import { AIModelSelector } from '@/components/ui/ai-model-selector';
import { Modal, ModalBody, ModalFooter } from '@/components/ui/modal';
import { Tooltip } from '@/components/ui/tooltip';
import { useToast } from '@/components/ui/toast';
import { useForm, useUpdateForm } from '@/hooks/use-forms';
import { useUnsavedChangesWarning } from '@/hooks/use-unsaved-changes';
import { useKeyboardShortcuts } from '@/hooks/use-keyboard-shortcuts';
import { FieldEditorDrawer } from '@/components/forms/field-editor-drawer';
import { SortableFieldCard } from '@/components/forms/sortable-field-card';
import { COUNTRY_PRESET_OPTIONS, NATIONALITY_PRESET_OPTIONS } from '@/lib/constants/form-option-presets';
import {
  FIELD_TYPE_LABEL,
  defaultField,
  fromServerField,
  newClientId,
  normalizeKey,
  serializeBuilderState,
  toPayloadFields,
} from '@/components/forms/builder-utils';
import {
  DEFAULT_FORM_DRAFT_AUTO_DELETE_DAYS,
  MAX_FORM_DRAFT_AUTO_DELETE_DAYS,
  MIN_FORM_DRAFT_AUTO_DELETE_DAYS,
  RESPONSE_COLUMN_STATUS_ID,
  RESPONSE_COLUMN_SUBMITTED_ID,
  normalizeLocaleCode,
  parseFormDraftSettings,
  parseFormAiSettings,
  parseFormFileNameSettings,
  parseFormI18nSettings,
  isSummaryEligibleFieldType,
  parseFormNotificationSettings,
  normalizeResponseColumnOrder,
  parseFormResponseTableSettings,
  writeFormDraftSettings,
  writeFormAiSettings,
  writeFormFileNameSettings,
  writeFormI18nSettings,
  sanitizeResponseColumnWidths,
  writeFormNotificationSettings,
  writeFormResponseTableSettings,
  type FormI18nLocaleTranslation,
  type FormI18nSettings,
  type FormI18nFieldTranslation,
} from '@/lib/form-utils';
import type { BuilderField } from '@/components/forms/builder-utils';

function matchesPresetOptionLabels(options: BuilderField['options'], preset: readonly string[]): boolean {
  return options.length === preset.length && options.every((option, index) => option.label === preset[index]);
}

function isRuntimeLocalizedPresetField(field: BuilderField): boolean {
  if (field.type !== 'DROPDOWN' && field.type !== 'SINGLE_CHOICE' && field.type !== 'MULTIPLE_CHOICE') {
    return false;
  }

  return (
    matchesPresetOptionLabels(field.options, COUNTRY_PRESET_OPTIONS)
    || matchesPresetOptionLabels(field.options, NATIONALITY_PRESET_OPTIONS)
  );
}

function resequence(nextFields: BuilderField[]): BuilderField[] {
  return nextFields.map((field, index) => ({ ...field, position: index }));
}

function normalizeSlugSegment(value: string): string {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 80);
}

function parseNotificationEmailInput(value: string): { emails: string[]; invalidEntries: string[] } {
  const parts = value
    .split(/[\n,;]+/)
    .map((entry) => entry.trim())
    .filter(Boolean);
  const emails: string[] = [];
  const invalidEntries: string[] = [];
  const seen = new Set<string>();

  for (const part of parts) {
    const normalized = part.toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized)) {
      invalidEntries.push(part);
      continue;
    }
    if (seen.has(normalized)) continue;
    seen.add(normalized);
    emails.push(normalized);
  }

  return { emails, invalidEntries };
}

function hasValue(value: string | null | undefined): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

const LOCALE_DISPLAY_NAMES: Record<string, string> = {
  en: 'English',
  'zh-CN': '中文（简体）',
  'zh-TW': '中文（繁體）',
  ms: 'Melayu',
  id: 'Indonesia',
  th: 'ภาษาไทย',
  vi: 'Tiếng Việt',
  ja: '日本語',
  ko: '한국어',
  fr: 'Français',
  de: 'Deutsch',
  es: 'Español',
  'pt-BR': 'Português (BR)',
  ar: 'العربية',
};

function getLocaleDisplayName(locale: string): string {
  return LOCALE_DISPLAY_NAMES[locale] ?? locale;
}

const LOCALE_PRESET_OPTIONS = [
  'en',
  'zh-CN',
  'zh-TW',
  'ms',
  'id',
  'th',
  'vi',
  'ja',
  'ko',
  'fr',
  'de',
  'es',
  'pt-BR',
  'ar',
];

const TRANSLATABLE_UI_LABELS: Array<{ key: string; label: string; placeholder: string }> = [
  { key: 'language_label', label: 'Language switch label', placeholder: 'Language' },
  { key: 'back', label: 'Back button', placeholder: 'Back' },
  { key: 'continue', label: 'Continue button', placeholder: 'Continue' },
  { key: 'submit', label: 'Submit button', placeholder: 'Submit' },
  { key: 'preview_mode', label: 'Preview mode button', placeholder: 'Preview mode' },
  { key: 'preview_notice', label: 'Preview notice', placeholder: 'Preview mode. Publish the form to accept uploads and submissions.' },
  { key: 'page_progress', label: 'Page progress label', placeholder: 'Page {current} of {total}' },
  { key: 'page_progress_short', label: 'Page progress short label', placeholder: '{current} of {total}' },
  { key: 'upload_file', label: 'Upload file prompt', placeholder: 'Upload a file' },
  { key: 'upload_files', label: 'Upload files prompt', placeholder: 'Upload files' },
  { key: 'replace_file', label: 'Replace file prompt', placeholder: 'Replace file' },
  { key: 'add_more_files', label: 'Add more files prompt', placeholder: 'Add more files' },
  { key: 'upload_drag_hint', label: 'Drag/drop hint', placeholder: 'or drag and drop here' },
  { key: 'upload_select_prompt', label: 'Upload status (idle)', placeholder: 'Select a file to upload' },
  { key: 'upload_select_multiple_prompt', label: 'Upload status (idle, multiple)', placeholder: 'Select one or more files to upload' },
  { key: 'uploading', label: 'Upload status (uploading)', placeholder: 'Uploading...' },
  { key: 'upload_success', label: 'Upload status (success)', placeholder: 'File uploaded successfully' },
  { key: 'upload_success_plural', label: 'Upload status (success, multiple)', placeholder: 'Files uploaded successfully' },
  { key: 'upload_failed', label: 'Upload failed message', placeholder: 'Upload failed' },
  { key: 'uploaded_file_fallback', label: 'Uploaded file fallback label', placeholder: 'Uploaded file' },
  { key: 'upload_file_for_field', label: 'Upload field aria label', placeholder: 'Upload file for {field}' },
  { key: 'upload_files_for_field', label: 'Upload field aria label (multiple)', placeholder: 'Upload files for {field}' },
  { key: 'remove_file', label: 'Remove file button', placeholder: 'Remove file' },
  { key: 'add_row', label: 'Add row button label', placeholder: 'Add row' },
  { key: 'remove_row', label: 'Remove row button label', placeholder: 'Remove row' },
  { key: 'phone_code_placeholder', label: 'Phone code placeholder', placeholder: 'Code' },
  { key: 'date_placeholder', label: 'Date placeholder', placeholder: 'dd mmm yyyy' },
  { key: 'select_option_placeholder', label: 'Select option placeholder', placeholder: 'Select an option' },
  { key: 'choice_other_placeholder', label: 'Choice detail placeholder', placeholder: 'Please specify' },
  { key: 'loading_form', label: 'Loading form message', placeholder: 'Loading form...' },
  { key: 'information_image_alt', label: 'Information image alt text', placeholder: 'Information image' },
  { key: 'info_image_invalid_url', label: 'Invalid image URL message', placeholder: 'Add a valid image URL in field settings.' },
  { key: 'info_url_invalid_url', label: 'Invalid URL message', placeholder: 'Add a valid URL in field settings.' },
  { key: 'organization_logo_alt', label: 'Organization logo alt text', placeholder: 'Organization logo' },
  { key: 'save_draft', label: 'Save draft button', placeholder: 'Save draft' },
  { key: 'saving_draft', label: 'Saving draft button', placeholder: 'Saving draft...' },
  { key: 'draft_validity_notice_singular', label: 'Draft validity notice (singular)', placeholder: 'Drafts stay available for {days} day.' },
  { key: 'draft_validity_notice_plural', label: 'Draft validity notice (plural)', placeholder: 'Drafts stay available for {days} days.' },
  { key: 'copy_resume_link', label: 'Copy resume link button', placeholder: 'Copy resume link' },
  { key: 'draft_saved_title', label: 'Draft saved title', placeholder: 'Draft saved' },
  { key: 'draft_expires_label', label: 'Draft expiry label', placeholder: 'Expires' },
  { key: 'resume_link_label', label: 'Resume link label', placeholder: 'Resume link' },
  { key: 'continue_editing', label: 'Continue editing button', placeholder: 'Continue editing' },
  { key: 'preview_upload_notice', label: 'Preview upload notice', placeholder: 'Preview mode is read-only. Publish the form to accept uploads.' },
  { key: 'preview_save_draft_notice', label: 'Preview save draft notice', placeholder: 'Preview mode is read-only. Publish the form to save drafts.' },
  { key: 'draft_save_disabled_notice', label: 'Draft disabled notice', placeholder: 'Draft saving is not enabled for this form.' },
  { key: 'save_draft_failed', label: 'Save draft failed message', placeholder: 'Failed to save draft' },
  { key: 'resume_draft_failed', label: 'Resume draft failed message', placeholder: 'Failed to resume draft' },
  { key: 'resume_link_unavailable', label: 'Resume link unavailable message', placeholder: 'Resume link is unavailable on this browser.' },
  { key: 'resume_link_copied', label: 'Resume link copied message', placeholder: 'Resume link copied.' },
  { key: 'resume_link_copy_failed', label: 'Resume link copy failed message', placeholder: 'Failed to copy resume link.' },
  { key: 'response_submitted_title', label: 'Submit success title', placeholder: 'Response submitted' },
  { key: 'response_submitted_description', label: 'Submit success description', placeholder: 'Your response has been recorded.' },
  { key: 'preview_submit_notice', label: 'Preview submit notice', placeholder: 'Preview mode is read-only. Publish the form to accept submissions.' },
  { key: 'submission_failed', label: 'Submission failed message', placeholder: 'Submission failed' },
  { key: 'download_pdf', label: 'Download PDF button', placeholder: 'Download PDF' },
  { key: 'download_expired_hint', label: 'Expired download hint', placeholder: 'Download link expired. Submit the form again to generate a new link.' },
  { key: 'email_pdf_copy', label: 'Email PDF section label', placeholder: 'Email a PDF copy' },
  { key: 'email_pdf_placeholder', label: 'Email PDF placeholder', placeholder: 'name@example.com' },
  { key: 'email_action_expired', label: 'Email action expired message', placeholder: 'This email action has expired. Please resubmit the form to request a PDF email.' },
  { key: 'email_invalid', label: 'Invalid email message', placeholder: 'Enter a valid email address' },
  { key: 'send', label: 'Send email button', placeholder: 'Send' },
  { key: 'email_send_failed', label: 'Send email failed message', placeholder: 'Failed to send email' },
  { key: 'email_sent_feedback', label: 'Send email success message', placeholder: 'PDF link sent to {email}' },
  { key: 'validation_required', label: 'Required validation message', placeholder: '{field} is required' },
  { key: 'validation_email', label: 'Email validation message', placeholder: '{field} must be a valid email' },
  { key: 'validation_choice_detail', label: 'Choice detail validation message', placeholder: '{field}: please specify for {option}' },
  { key: 'invalid_value', label: 'Invalid value fallback', placeholder: 'Invalid value' },
  { key: 'payload_label', label: 'Payload label', placeholder: 'payload' },
  { key: 'dynamic_section_unsupported_field', label: 'Dynamic section unsupported message', placeholder: 'This field type is not supported inside dynamic sections yet.' },
];

function getEmptyLocaleTranslation(): FormI18nLocaleTranslation {
  return {
    form: {},
    fields: {},
    ui: {},
  };
}

function withLocaleTranslation(
  translations: FormI18nSettings['translations'],
  locale: string
): FormI18nLocaleTranslation {
  const existing = translations[locale];
  if (!existing) return getEmptyLocaleTranslation();

  return {
    form: { ...(existing.form || {}) },
    fields: { ...(existing.fields || {}) },
    ui: { ...(existing.ui || {}) },
  };
}

function getTranslatedValueByKey(
  translation: FormI18nLocaleTranslation,
  translationKey: string
): string | undefined {
  if (translationKey === 'form.title') {
    return translation.form.title;
  }

  if (translationKey === 'form.description') {
    return translation.form.description;
  }

  if (translationKey.startsWith('ui.')) {
    const uiKey = translationKey.slice(3);
    return uiKey ? translation.ui[uiKey] : undefined;
  }

  const fieldEntryMatch = translationKey.match(/^field\.([a-zA-Z0-9_]+)\.(label|placeholder|subtext|helpText)$/);
  if (fieldEntryMatch) {
    const [, fieldKey, fieldProp] = fieldEntryMatch;
    const fieldTranslation = translation.fields[fieldKey];
    if (!fieldTranslation) return undefined;
    if (fieldProp === 'label') return fieldTranslation.label;
    if (fieldProp === 'placeholder') return fieldTranslation.placeholder;
    if (fieldProp === 'subtext') return fieldTranslation.subtext;
    return fieldTranslation.helpText;
  }

  const optionMatch = translationKey.match(/^field\.([a-zA-Z0-9_]+)\.option\.(\d+)$/);
  if (optionMatch) {
    const [, fieldKey, indexText] = optionMatch;
    const optionIndex = Number.parseInt(indexText, 10);
    if (Number.isNaN(optionIndex) || optionIndex < 0) return undefined;
    return translation.fields[fieldKey]?.options?.[optionIndex];
  }

  return undefined;
}

function getBuilderFieldTypeLabel(field: BuilderField): string {
  if (field.type === 'PAGE_BREAK') {
    if (field.inputType === 'repeat_start') return 'Dynamic section start';
    if (field.inputType === 'repeat_end') return 'Dynamic section end';
    return FIELD_TYPE_LABEL[field.type];
  }

  if (field.type !== 'PARAGRAPH') {
    return FIELD_TYPE_LABEL[field.type];
  }

  if (field.inputType === 'info_image') return 'Information / Image';
  if (field.inputType === 'info_url') return 'Information / URL';
  return 'Information / Text block';
}

function SettingsSection({
  icon,
  title,
  summary,
  defaultOpen = false,
  children,
}: {
  icon: ReactNode;
  title: string;
  summary: ReactNode;
  defaultOpen?: boolean;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="rounded-lg border border-border-primary bg-background-primary">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex w-full items-start gap-2 px-3 py-2.5 text-left"
      >
        <span className="mt-0.5 shrink-0 text-text-muted">{icon}</span>
        <span className="flex-1 min-w-0">
          <span className="block text-xs font-semibold text-text-primary">{title}</span>
          {!open && (
            <span className="block text-2xs text-text-muted truncate">{summary}</span>
          )}
        </span>
        <ChevronDown
          className={`mt-0.5 w-3.5 h-3.5 shrink-0 text-text-muted transition-transform duration-150 ${open ? 'rotate-180' : ''}`}
        />
      </button>
      {open && (
        <div className="space-y-3 border-t border-border-primary px-3 pb-3 pt-3">
          {children}
        </div>
      )}
    </div>
  );
}

type BuilderTab = 'form' | 'language' | 'settings';

type TranslationSourceItem = {
  key: string;
  text: string;
  context: string;
};

export default function FormBuilderPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const { success, error: showError } = useToast();
  const formId = params.id;

  const { data: form, isLoading, error } = useForm(formId);
  const updateForm = useUpdateForm(formId);

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [slug, setSlug] = useState('');
  const [status, setStatus] = useState<'DRAFT' | 'PUBLISHED' | 'ARCHIVED'>('DRAFT');
  const [tagsText, setTagsText] = useState('');
  const [notificationRecipientsText, setNotificationRecipientsText] = useState('');
  const [draftSaveEnabled, setDraftSaveEnabled] = useState(false);
  const [draftAutoDeleteDays, setDraftAutoDeleteDays] = useState(DEFAULT_FORM_DRAFT_AUTO_DELETE_DAYS);
  const [aiParsingEnabled, setAiParsingEnabled] = useState(false);
  const [aiParsingCustomContext, setAiParsingCustomContext] = useState('');
  const [pdfFileNameTemplate, setPdfFileNameTemplate] = useState('');
  const [i18nDefaultLocale, setI18nDefaultLocale] = useState('en');
  const [i18nEnabledLocales, setI18nEnabledLocales] = useState<string[]>(['en']);
  const [i18nAllowLocaleSwitch, setI18nAllowLocaleSwitch] = useState(true);
  const [i18nTranslations, setI18nTranslations] = useState<FormI18nSettings['translations']>({});
  const [editingLocale, setEditingLocale] = useState('en');
  const [hideLogo, setHideLogo] = useState(false);
  const [hideFooter, setHideFooter] = useState(false);
  const [fields, setFields] = useState<BuilderField[]>([]);
  const [selectedFieldId, setSelectedFieldId] = useState<string | null>(null);
  const [dragActiveId, setDragActiveId] = useState<string | null>(null);
  const [dragOverId, setDragOverId] = useState<string | null>(null);
  const [dragDropPosition, setDragDropPosition] = useState<'before' | 'after' | null>(null);
  const [dragOverlayWidth, setDragOverlayWidth] = useState<number | null>(null);
  const [activeTab, setActiveTab] = useState<BuilderTab>('form');
  const [showAiTranslateModal, setShowAiTranslateModal] = useState(false);
  const [aiTranslateModel, setAiTranslateModel] = useState('');
  const [aiTranslateInstructions, setAiTranslateInstructions] = useState('');
  const [aiTranslateFillEmptyOnly, setAiTranslateFillEmptyOnly] = useState(true);
  const [isAiTranslating, setIsAiTranslating] = useState(false);
  const [showAiAssistModal, setShowAiAssistModal] = useState(false);
  const [aiAssistSourceText, setAiAssistSourceText] = useState('');
  const [aiAssistGeneratedContext, setAiAssistGeneratedContext] = useState('');
  const [isGeneratingAiAssistContext, setIsGeneratingAiAssistContext] = useState(false);
  const [expandedTranslationSections, setExpandedTranslationSections] = useState<string[]>([]);
  const [isHydrated, setIsHydrated] = useState(false);
  const baselineSnapshot = useRef<string>('');

  useEffect(() => {
    setIsHydrated(true);
  }, []);

  useEffect(() => {
    if (!form) return;

    const responseTableSettings = parseFormResponseTableSettings(form.settings);
    const notificationSettings = parseFormNotificationSettings(form.settings);
    const draftSettings = parseFormDraftSettings(form.settings);
    const aiSettings = parseFormAiSettings(form.settings);
    const fileNameSettings = parseFormFileNameSettings(form.settings);
    const i18nSettings = parseFormI18nSettings(form.settings);
    const summaryFieldKeySet = new Set(responseTableSettings.summaryFieldKeys);

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
    }, {
      showOnSummary: summaryFieldKeySet.has(field.key) && isSummaryEligibleFieldType(field.type),
    }));

    setTitle(form.title);
    setDescription(form.description || '');
    setSlug(form.slug);
    setStatus(form.status as 'DRAFT' | 'PUBLISHED' | 'ARCHIVED');
    setTagsText(form.tags.join(', '));
    setNotificationRecipientsText(notificationSettings.completionRecipientEmails.join('\n'));
    setDraftSaveEnabled(draftSettings.enabled);
    setDraftAutoDeleteDays(draftSettings.autoDeleteDays);
    setAiParsingEnabled(aiSettings.enabled);
    setAiParsingCustomContext(aiSettings.customContext || '');
    setPdfFileNameTemplate(fileNameSettings.pdfTemplate || '');
    setI18nDefaultLocale(i18nSettings.defaultLocale);
    setI18nEnabledLocales(i18nSettings.enabledLocales);
    setI18nAllowLocaleSwitch(i18nSettings.allowLocaleSwitch);
    setI18nTranslations(i18nSettings.translations);
    setEditingLocale(i18nSettings.enabledLocales.find((locale) => locale !== i18nSettings.defaultLocale) || i18nSettings.defaultLocale);
    const settingsObj = (form.settings && typeof form.settings === 'object' && !Array.isArray(form.settings))
      ? form.settings as Record<string, unknown>
      : {};
    setHideLogo(settingsObj.hideLogo === true);
    setHideFooter(settingsObj.hideFooter === true);
    setFields(mappedFields);
    setSelectedFieldId(null);

    baselineSnapshot.current = serializeBuilderState({
      title: form.title,
      description: form.description || '',
      slug: form.slug,
      status: form.status as 'DRAFT' | 'PUBLISHED' | 'ARCHIVED',
      tags: form.tags,
      notificationRecipientEmails: notificationSettings.completionRecipientEmails,
      notificationRecipientText: notificationSettings.completionRecipientEmails.join('\n'),
      draftSaveEnabled: draftSettings.enabled,
      draftAutoDeleteDays: draftSettings.autoDeleteDays,
      aiParsingEnabled: aiSettings.enabled,
      aiParsingCustomContext: aiSettings.customContext || '',
      pdfFileNameTemplate: fileNameSettings.pdfTemplate || '',
      i18nDefaultLocale: i18nSettings.defaultLocale,
      i18nEnabledLocales: i18nSettings.enabledLocales,
      i18nAllowLocaleSwitch: i18nSettings.allowLocaleSwitch,
      i18nTranslations: i18nSettings.translations,
      hideLogo: settingsObj.hideLogo === true,
      hideFooter: settingsObj.hideFooter === true,
      fields: mappedFields,
    });
  }, [form]);

  const tags = useMemo(
    () => tagsText.split(',').map((tag) => tag.trim()).filter(Boolean),
    [tagsText]
  );

  const notificationEmailParse = useMemo(
    () => parseNotificationEmailInput(notificationRecipientsText),
    [notificationRecipientsText]
  );

  const localeOptionValues = useMemo(
    () => Array.from(new Set([
      ...LOCALE_PRESET_OPTIONS,
      ...i18nEnabledLocales,
      i18nDefaultLocale,
      ...Object.keys(i18nTranslations),
    ])),
    [i18nDefaultLocale, i18nEnabledLocales, i18nTranslations]
  );

  const editableLocales = useMemo(
    () => i18nEnabledLocales.filter((locale) => locale !== i18nDefaultLocale),
    [i18nDefaultLocale, i18nEnabledLocales]
  );

  const activeEditingLocale = useMemo(
    () => (
      editableLocales.includes(editingLocale)
        ? editingLocale
        : (editableLocales[0] || i18nDefaultLocale)
    ),
    [editableLocales, editingLocale, i18nDefaultLocale]
  );

  const activeLocaleTranslation = useMemo(
    () => withLocaleTranslation(i18nTranslations, activeEditingLocale),
    [i18nTranslations, activeEditingLocale]
  );

  const translatableFields = useMemo(
    () => fields.filter((field) => field.type !== 'PAGE_BREAK' && field.type !== 'HIDDEN'),
    [fields]
  );

  const aiTranslationSourceItems = useMemo<TranslationSourceItem[]>(() => {
    const items: TranslationSourceItem[] = [];

    if (hasValue(title)) {
      items.push({
        key: 'form.title',
        text: title,
        context: 'Form title',
      });
    }

    if (hasValue(description)) {
      items.push({
        key: 'form.description',
        text: description,
        context: 'Form description',
      });
    }

    for (const uiItem of TRANSLATABLE_UI_LABELS) {
      if (!hasValue(uiItem.placeholder)) continue;
      items.push({
        key: `ui.${uiItem.key}`,
        text: uiItem.placeholder,
        context: `UI label: ${uiItem.label}`,
      });
    }

    for (const field of translatableFields) {
      if (!hasValue(field.key)) continue;
      const fieldKey = field.key;
      const fieldDisplayName = hasValue(field.label) ? field.label : fieldKey;
      const textEntries = [
        { key: 'label' as const, label: 'Label', value: field.label || '' },
        { key: 'placeholder' as const, label: 'Placeholder', value: field.placeholder || '' },
        { key: 'subtext' as const, label: 'Subtext', value: field.subtext || '' },
        { key: 'helpText' as const, label: 'Help text', value: field.helpText || '' },
      ];

      for (const entry of textEntries) {
        if (!hasValue(entry.value)) continue;
        items.push({
          key: `field.${fieldKey}.${entry.key}`,
          text: entry.value,
          context: `Field "${fieldDisplayName}" (${fieldKey}) ${entry.label}`,
        });
      }

      const supportsOptions = (
        field.type === 'SINGLE_CHOICE'
        || field.type === 'MULTIPLE_CHOICE'
        || field.type === 'DROPDOWN'
      ) && !isRuntimeLocalizedPresetField(field);
      if (!supportsOptions) continue;
      for (let optionIndex = 0; optionIndex < field.options.length; optionIndex += 1) {
        const option = field.options[optionIndex];
        if (!hasValue(option?.label)) continue;
        items.push({
          key: `field.${fieldKey}.option.${optionIndex}`,
          text: option.label,
          context: `Field "${fieldDisplayName}" (${fieldKey}) option ${optionIndex + 1}`,
        });
      }
    }

    return items;
  }, [title, description, translatableFields]);

  const aiTranslationTargetItems = useMemo<TranslationSourceItem[]>(() => {
    if (!aiTranslateFillEmptyOnly) {
      return aiTranslationSourceItems;
    }

    return aiTranslationSourceItems.filter((item) => !hasValue(getTranslatedValueByKey(activeLocaleTranslation, item.key)));
  }, [activeLocaleTranslation, aiTranslateFillEmptyOnly, aiTranslationSourceItems]);

  const translatableUiItems = useMemo(
    () => TRANSLATABLE_UI_LABELS.filter((item) => hasValue(item.placeholder)),
    []
  );

  const translatableFieldGroups = useMemo(() => (
    translatableFields.flatMap((field) => {
      if (!hasValue(field.key)) return [];

      const supportsOptions = (
        field.type === 'SINGLE_CHOICE'
        || field.type === 'MULTIPLE_CHOICE'
        || field.type === 'DROPDOWN'
      ) && !isRuntimeLocalizedPresetField(field);
      const textEntries = [
        { key: 'label' as const, label: 'Label', value: field.label || '' },
        { key: 'placeholder' as const, label: 'Placeholder', value: field.placeholder || '' },
        { key: 'subtext' as const, label: 'Subtext', value: field.subtext || '' },
        { key: 'helpText' as const, label: 'Help text', value: field.helpText || '' },
      ].filter((entry) => hasValue(entry.value));

      const englishOptions = supportsOptions
        ? field.options
            .map((option, index) => ({ index, label: option.label || '' }))
            .filter((option) => hasValue(option.label))
        : [];

      if (textEntries.length === 0 && englishOptions.length === 0) {
        return [];
      }

      return [{
        field,
        fieldKey: field.key,
        textEntries,
        englishOptions,
      }];
    })
  ), [translatableFields]);

  const availableTranslationSectionIds = useMemo(() => {
    const ids: string[] = [];
    if (hasValue(title) || hasValue(description)) ids.push('form-text');
    if (translatableUiItems.length > 0) ids.push('ui-labels');
    if (translatableFieldGroups.length > 0) {
      ids.push('field-translations');
      ids.push(...translatableFieldGroups.map((group) => `field-${group.field.clientId}`));
    }
    return ids;
  }, [description, title, translatableFieldGroups, translatableUiItems.length]);

  function isTranslationSectionExpanded(sectionId: string): boolean {
    return expandedTranslationSections.includes(sectionId);
  }

  function toggleTranslationSection(sectionId: string) {
    setExpandedTranslationSections((prev) => (
      prev.includes(sectionId)
        ? prev.filter((id) => id !== sectionId)
        : [...prev, sectionId]
    ));
  }

  function setAllTranslationSectionsExpanded(expanded: boolean) {
    setExpandedTranslationSections(expanded ? availableTranslationSectionIds : []);
  }

  useEffect(() => {
    if (editableLocales.includes(editingLocale)) return;
    setEditingLocale(editableLocales[0] || i18nDefaultLocale);
  }, [editableLocales, editingLocale, i18nDefaultLocale]);

  const stateSnapshot = useMemo(
    () => serializeBuilderState({
      title,
      description,
      slug,
      status,
      tags,
      notificationRecipientEmails: notificationEmailParse.emails,
      notificationRecipientText: notificationRecipientsText,
      draftSaveEnabled,
      draftAutoDeleteDays,
      aiParsingEnabled,
      aiParsingCustomContext,
      pdfFileNameTemplate,
      i18nDefaultLocale,
      i18nEnabledLocales,
      i18nAllowLocaleSwitch,
      i18nTranslations,
      hideLogo,
      hideFooter,
      fields,
    }),
    [
      title,
      description,
      slug,
      status,
        tags,
        notificationEmailParse.emails,
        notificationRecipientsText,
        draftSaveEnabled,
        draftAutoDeleteDays,
        aiParsingEnabled,
        aiParsingCustomContext,
        pdfFileNameTemplate,
        i18nDefaultLocale,
        i18nEnabledLocales,
      i18nAllowLocaleSwitch,
      i18nTranslations,
      hideLogo,
      hideFooter,
      fields,
    ]
  );

  const isDirty = isHydrated && !!baselineSnapshot.current && stateSnapshot !== baselineSnapshot.current;
  useUnsavedChangesWarning(isDirty, true);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 8 } }));
  const collisionDetection: CollisionDetection = (args) => {
    const pointerCollisions = pointerWithin(args).filter((collision) => collision.id !== args.active.id);
    if (pointerCollisions.length > 0) {
      return pointerCollisions;
    }
    return closestCenter(args).filter((collision) => collision.id !== args.active.id);
  };
  const selectedField = fields.find((field) => field.clientId === selectedFieldId) || null;
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
    const activeInitialRect = event.active.rect.current.initial;
    const overRect = event.over?.rect;

    if (activeInitialRect && overRect) {
      const activeCenterX = activeInitialRect.left + event.delta.x + activeInitialRect.width / 2;
      const activeCenterY = activeInitialRect.top + event.delta.y + activeInitialRect.height / 2;
      const overCenterX = overRect.left + overRect.width / 2;
      const overCenterY = overRect.top + overRect.height / 2;
      const sameRow = Math.abs(activeCenterY - overCenterY) < Math.min(activeInitialRect.height, overRect.height) * 0.6;

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
    const createdClientId = newClientId();
    setFields((prev) => {
      const created = { ...defaultField(type, prev.length), clientId: createdClientId };
      const next = [...prev, created];
      return resequence(next);
    });
    setSelectedFieldId(createdClientId);
  }

  function insertFieldAfter(afterClientId: string, type: BuilderField['type'] = 'SHORT_TEXT') {
    const createdClientId = newClientId();
    setFields((prev) => {
      const afterIndex = prev.findIndex((field) => field.clientId === afterClientId);
      const insertAt = afterIndex >= 0 ? afterIndex + 1 : prev.length;
      const created = { ...defaultField(type, insertAt), clientId: createdClientId };
      const next = [...prev];
      next.splice(insertAt, 0, created);
      return resequence(next);
    });
    setSelectedFieldId(createdClientId);
  }

  function addDynamicSection() {
    const startClientId = newClientId();
    const itemClientId = newClientId();
    const endClientId = newClientId();

    setFields((prev) => {
      const sectionIndex = prev.filter((field) => field.type === 'PAGE_BREAK' && field.inputType === 'repeat_start').length + 1;

      const startField: BuilderField = {
        ...defaultField('PAGE_BREAK', prev.length),
        clientId: startClientId,
        label: `Dynamic section ${sectionIndex}`,
        key: `dynamic_section_${sectionIndex}_start`,
        inputType: 'repeat_start',
        subtext: 'Capture one item per card. Click Add row to include another item.',
        validation: {
          repeatMinItems: 1,
          repeatAddLabel: 'Add row',
        },
      };

      const sampleField: BuilderField = {
        ...defaultField('SHORT_TEXT', prev.length + 1),
        clientId: itemClientId,
        label: 'Item name',
        key: `item_name_${sectionIndex}`,
      };

      const endField: BuilderField = {
        ...defaultField('PAGE_BREAK', prev.length + 2),
        clientId: endClientId,
        label: `Dynamic section ${sectionIndex} end`,
        key: `dynamic_section_${sectionIndex}_end`,
        inputType: 'repeat_end',
      };

      return resequence([...prev, startField, sampleField, endField]);
    });

    setSelectedFieldId(startClientId);
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
      setSelectedFieldId(copy.clientId);
      return resequence(next);
    });
  }

  function deleteField(clientId: string) {
    const target = fields.find((field) => field.clientId === clientId);
    const isDynamicMarker = target?.type === 'PAGE_BREAK' && (target.inputType === 'repeat_start' || target.inputType === 'repeat_end');
    const confirmMessage = isDynamicMarker
      ? 'Delete this dynamic section? This will remove the start/end markers and enclosed fields.'
      : 'Delete this field?';

    if (!window.confirm(confirmMessage)) return;

    setFields((prev) => {
      const index = prev.findIndex((field) => field.clientId === clientId);
      if (index < 0) return prev;

      const toRemove = new Set<string>([clientId]);
      const selected = prev[index];

      if (selected.type === 'PAGE_BREAK' && selected.inputType === 'repeat_start') {
        let endIndex = -1;
        for (let cursor = index + 1; cursor < prev.length; cursor += 1) {
          const candidate = prev[cursor];
          if (candidate.type === 'PAGE_BREAK' && candidate.inputType === 'repeat_end') {
            endIndex = cursor;
            break;
          }
        }

        if (endIndex >= 0) {
          for (let cursor = index; cursor <= endIndex; cursor += 1) {
            toRemove.add(prev[cursor].clientId);
          }
        }
      } else if (selected.type === 'PAGE_BREAK' && selected.inputType === 'repeat_end') {
        let startIndex = -1;
        for (let cursor = index - 1; cursor >= 0; cursor -= 1) {
          const candidate = prev[cursor];
          if (candidate.type === 'PAGE_BREAK' && candidate.inputType === 'repeat_start') {
            startIndex = cursor;
            break;
          }
        }

        if (startIndex >= 0) {
          for (let cursor = startIndex; cursor <= index; cursor += 1) {
            toRemove.add(prev[cursor].clientId);
          }
        }
      }

      const next = prev.filter((field) => !toRemove.has(field.clientId));
      if (!selectedFieldId || toRemove.has(selectedFieldId)) {
        setSelectedFieldId(next.find((field) => field.type !== 'PAGE_BREAK')?.clientId || next[0]?.clientId || null);
      }
      return resequence(next);
    });
  }

  function setFieldWidth(clientId: string, width: BuilderField['layoutWidth']) {
    updateField(clientId, (field) => ({ ...field, layoutWidth: width }));
  }

  function updateLocaleTranslation(
    locale: string,
    updater: (current: FormI18nLocaleTranslation) => FormI18nLocaleTranslation
  ) {
    setI18nTranslations((prev) => {
      const current = withLocaleTranslation(prev, locale);
      const nextLocaleTranslation = updater(current);
      const hasFormTranslation = Object.values(nextLocaleTranslation.form || {}).some((value) => typeof value === 'string' && value.trim().length > 0);
      const hasFieldTranslation = Object.keys(nextLocaleTranslation.fields || {}).length > 0;
      const hasUiTranslation = Object.keys(nextLocaleTranslation.ui || {}).length > 0;

      const next = { ...prev };
      if (!hasFormTranslation && !hasFieldTranslation && !hasUiTranslation) {
        delete next[locale];
      } else {
        next[locale] = nextLocaleTranslation;
      }
      return next;
    });
  }

  function updateFieldTranslation(
    locale: string,
    fieldKey: string,
    updater: (current: FormI18nFieldTranslation) => FormI18nFieldTranslation
  ) {
    updateLocaleTranslation(locale, (currentLocaleTranslation) => {
      const currentFieldTranslation = currentLocaleTranslation.fields[fieldKey] || {};
      const nextFieldTranslation = updater(currentFieldTranslation);
      const hasFieldContent = (
        (nextFieldTranslation.label && nextFieldTranslation.label.trim().length > 0) ||
        (nextFieldTranslation.placeholder && nextFieldTranslation.placeholder.trim().length > 0) ||
        (nextFieldTranslation.subtext && nextFieldTranslation.subtext.trim().length > 0) ||
        (nextFieldTranslation.helpText && nextFieldTranslation.helpText.trim().length > 0) ||
        ((nextFieldTranslation.options || []).some((text) => text.trim().length > 0))
      );

      const nextFields = { ...(currentLocaleTranslation.fields || {}) };
      if (!hasFieldContent) {
        delete nextFields[fieldKey];
      } else {
        nextFields[fieldKey] = nextFieldTranslation;
      }

      return {
        ...currentLocaleTranslation,
        fields: nextFields,
      };
    });
  }

  function applyAiTranslations(
    locale: string,
    translations: Record<string, string>,
    options?: { fillEmptyOnly?: boolean }
  ) {
    updateLocaleTranslation(locale, (current) => {
      const nextForm = { ...(current.form || {}) };
      const nextUi = { ...(current.ui || {}) };
      const nextFields = { ...(current.fields || {}) };
      const fillEmptyOnly = options?.fillEmptyOnly === true;

      const shouldWriteValue = (existingValue: string | undefined) => (
        !fillEmptyOnly || !hasValue(existingValue)
      );

      for (const [translationKey, translatedText] of Object.entries(translations)) {
        if (!hasValue(translatedText)) continue;

        if (translationKey === 'form.title') {
          if (shouldWriteValue(nextForm.title)) {
            nextForm.title = translatedText;
          }
          continue;
        }

        if (translationKey === 'form.description') {
          if (shouldWriteValue(nextForm.description)) {
            nextForm.description = translatedText;
          }
          continue;
        }

        if (translationKey.startsWith('ui.')) {
          const uiKey = translationKey.slice(3);
          if (uiKey && shouldWriteValue(nextUi[uiKey])) {
            nextUi[uiKey] = translatedText;
          }
          continue;
        }

        const fieldEntryMatch = translationKey.match(/^field\.([a-zA-Z0-9_]+)\.(label|placeholder|subtext|helpText)$/);
        if (fieldEntryMatch) {
          const [, fieldKey, fieldProp] = fieldEntryMatch;
          const nextFieldTranslation: FormI18nFieldTranslation = { ...(nextFields[fieldKey] || {}) };
          if (fieldProp === 'label' && shouldWriteValue(nextFieldTranslation.label)) nextFieldTranslation.label = translatedText;
          if (fieldProp === 'placeholder' && shouldWriteValue(nextFieldTranslation.placeholder)) nextFieldTranslation.placeholder = translatedText;
          if (fieldProp === 'subtext' && shouldWriteValue(nextFieldTranslation.subtext)) nextFieldTranslation.subtext = translatedText;
          if (fieldProp === 'helpText' && shouldWriteValue(nextFieldTranslation.helpText)) nextFieldTranslation.helpText = translatedText;
          nextFields[fieldKey] = nextFieldTranslation;
          continue;
        }

        const optionMatch = translationKey.match(/^field\.([a-zA-Z0-9_]+)\.option\.(\d+)$/);
        if (optionMatch) {
          const [, fieldKey, indexText] = optionMatch;
          const optionIndex = Number.parseInt(indexText, 10);
          if (Number.isNaN(optionIndex) || optionIndex < 0) continue;
          const nextFieldTranslation: FormI18nFieldTranslation = { ...(nextFields[fieldKey] || {}) };
          const nextOptions = [...(nextFieldTranslation.options || [])];
          if (shouldWriteValue(nextOptions[optionIndex])) {
            nextOptions[optionIndex] = translatedText;
          }
          nextFieldTranslation.options = nextOptions;
          nextFields[fieldKey] = nextFieldTranslation;
        }
      }

      return {
        ...current,
        form: nextForm,
        ui: nextUi,
        fields: nextFields,
      };
    });
  }

  function toApiErrorMessage(payload: unknown, fallback: string): string {
    if (!payload || typeof payload !== 'object') return fallback;
    const body = payload as {
      error?: string;
      details?: { fieldErrors?: Record<string, string[] | undefined> };
    };
    if (!body.error) return fallback;
    const fieldErrors = body.details?.fieldErrors
      ? Object.values(body.details.fieldErrors).flatMap((messages) => messages || [])
      : [];
    if (fieldErrors.length === 0) {
      return body.error;
    }
    return `${body.error}: ${fieldErrors.slice(0, 3).join(' | ')}`;
  }

  function openAiAssistModal() {
    setAiAssistSourceText(aiParsingCustomContext);
    setAiAssistGeneratedContext('');
    setShowAiAssistModal(true);
  }

  async function handleRunAiTranslation() {
    if (!form) return;

    if (!aiTranslateModel) {
      showError('Select an AI model first.');
      return;
    }

    if (!activeEditingLocale || activeEditingLocale === i18nDefaultLocale) {
      showError('Select a non-default language to translate.');
      return;
    }

    if (aiTranslationSourceItems.length === 0) {
      showError('No English source text is available to translate.');
      return;
    }

    if (aiTranslationTargetItems.length === 0) {
      showError(
        aiTranslateFillEmptyOnly
          ? 'No empty translated values are available to fill for the active language.'
          : 'No source text is available to translate.'
      );
      return;
    }

    setIsAiTranslating(true);
    try {
      const chunkedItems: TranslationSourceItem[][] = [];
      const maxItemsPerChunk = 120;
      const maxCharsPerChunk = 16000;
      let currentChunk: TranslationSourceItem[] = [];
      let currentChunkChars = 0;

      for (const item of aiTranslationTargetItems) {
        const itemChars = item.text.length + item.context.length;
        const shouldStartNewChunk = (
          currentChunk.length > 0
          && (currentChunk.length >= maxItemsPerChunk || currentChunkChars + itemChars > maxCharsPerChunk)
        );
        if (shouldStartNewChunk) {
          chunkedItems.push(currentChunk);
          currentChunk = [];
          currentChunkChars = 0;
        }
        currentChunk.push(item);
        currentChunkChars += itemChars;
      }
      if (currentChunk.length > 0) {
        chunkedItems.push(currentChunk);
      }

      const mergedTranslations: Record<string, string> = {};
      for (let chunkIndex = 0; chunkIndex < chunkedItems.length; chunkIndex += 1) {
        const response = await fetch(`/api/forms/${form.id}/translations/ai`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            tenantId: form.tenantId,
            model: aiTranslateModel,
            targetLocale: activeEditingLocale,
            items: chunkedItems[chunkIndex],
            instructions: aiTranslateInstructions,
          }),
        });

        const payload = await response.json().catch(() => ({}));
        if (!response.ok) {
          const message = toApiErrorMessage(payload, 'Failed to translate with AI');
          throw new Error(chunkedItems.length > 1 ? `Batch ${chunkIndex + 1}/${chunkedItems.length}: ${message}` : message);
        }

        const translations = payload?.translations as Record<string, string> | undefined;
        if (!translations || typeof translations !== 'object') {
          throw new Error('AI response did not include translations');
        }

        Object.assign(mergedTranslations, translations);
      }

      applyAiTranslations(activeEditingLocale, mergedTranslations, { fillEmptyOnly: aiTranslateFillEmptyOnly });
      setShowAiTranslateModal(false);
      success(
        aiTranslateFillEmptyOnly
          ? `AI filled ${aiTranslationTargetItems.length} empty translated values.`
          : `AI translated ${aiTranslationTargetItems.length} values.`
      );
    } catch (err) {
      showError(err instanceof Error ? err.message : 'Failed to translate with AI');
    } finally {
      setIsAiTranslating(false);
    }
  }

  async function handleGenerateAiAssistContext() {
    if (!form) return;

    if (!aiAssistSourceText.trim()) {
      showError('Enter rough notes or instructions first.');
      return;
    }

    setIsGeneratingAiAssistContext(true);
    try {
      const response = await fetch(`/api/forms/${form.id}/ai-context-assist`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tenantId: form.tenantId,
          notes: aiAssistSourceText,
        }),
      });

      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(toApiErrorMessage(payload, 'Failed to generate AI custom context'));
      }

      const customContext = typeof payload?.customContext === 'string' ? payload.customContext.trim() : '';
      if (!customContext) {
        throw new Error('AI response did not include a usable custom context');
      }

      setAiAssistGeneratedContext(customContext);
      success('AI draft generated');
    } catch (err) {
      showError(err instanceof Error ? err.message : 'Failed to generate AI custom context');
    } finally {
      setIsGeneratingAiAssistContext(false);
    }
  }

  function handleUseAiAssistContext() {
    if (!aiAssistGeneratedContext.trim()) {
      showError('Generate a draft first.');
      return;
    }

    setAiParsingCustomContext(aiAssistGeneratedContext.trim());
    setShowAiAssistModal(false);
    success('Custom context updated');
  }

  function selectField(clientId: string) {
    const candidate = fields.find((field) => field.clientId === clientId);
    if (!candidate) {
      setSelectedFieldId(null);
      return;
    }

    setSelectedFieldId(clientId);
  }

  async function persistForm(nextStatus: 'DRAFT' | 'PUBLISHED' | 'ARCHIVED', successMessage: string) {
    try {
      if (!form) return;

      if (!title.trim()) {
        showError('Form title is required');
        return;
      }

      if (notificationEmailParse.invalidEntries.length > 0) {
        showError(`Invalid notification email(s): ${notificationEmailParse.invalidEntries.join(', ')}`);
        return;
      }

      const normalizedDraftAutoDeleteDays = Math.min(
        MAX_FORM_DRAFT_AUTO_DELETE_DAYS,
        Math.max(MIN_FORM_DRAFT_AUTO_DELETE_DAYS, Math.trunc(draftAutoDeleteDays || DEFAULT_FORM_DRAFT_AUTO_DELETE_DAYS))
      );

      if (!Number.isFinite(normalizedDraftAutoDeleteDays)) {
        showError('Draft auto-delete days must be a valid number');
        return;
      }

      setDraftAutoDeleteDays(normalizedDraftAutoDeleteDays);

      const normalizedEnabledLocales = Array.from(new Set(
        i18nEnabledLocales
          .map((locale) => normalizeLocaleCode(locale))
          .filter((locale): locale is string => !!locale)
      ));

      const normalizedDefaultLocale = normalizeLocaleCode(i18nDefaultLocale) || normalizedEnabledLocales[0] || 'en';
      const nextEnabledLocales = normalizedEnabledLocales.includes(normalizedDefaultLocale)
        ? normalizedEnabledLocales
        : [normalizedDefaultLocale, ...normalizedEnabledLocales];

      const normalizedSlug = normalizeSlugSegment(slug);
      if (normalizedSlug.length < 3) {
        showError('Custom URL segment must be at least 3 characters');
        return;
      }

      setSlug(normalizedSlug);

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

      const fieldKeyRemap = new Map<string, string>();
      for (let index = 0; index < correctedFields.length; index += 1) {
        const previousKey = fields[index]?.key?.trim();
        const nextKey = correctedFields[index]?.key?.trim();
        if (!previousKey || !nextKey || previousKey === nextKey) continue;
        fieldKeyRemap.set(previousKey, nextKey);
      }

      const remappedI18nTranslations: FormI18nSettings['translations'] = {};
      for (const [locale, localeTranslation] of Object.entries(i18nTranslations)) {
        const nextFields: Record<string, FormI18nFieldTranslation> = {};
        for (const [fieldKey, fieldTranslation] of Object.entries(localeTranslation.fields || {})) {
          const remappedFieldKey = fieldKeyRemap.get(fieldKey) || fieldKey;
          nextFields[remappedFieldKey] = fieldTranslation;
        }

        remappedI18nTranslations[locale] = {
          ...localeTranslation,
          fields: nextFields,
        };
      }

      const responseTableSettings = parseFormResponseTableSettings(form.settings);
      const enabledSummaryFieldKeys = correctedFields
        .filter((field) => field.showOnSummary && isSummaryEligibleFieldType(field.type))
        .map((field) => field.key);

      const enabledSummaryFieldSet = new Set(enabledSummaryFieldKeys);
      const nextSummaryFieldKeys: string[] = [];

      for (const key of responseTableSettings.summaryFieldKeys) {
        if (!enabledSummaryFieldSet.has(key)) continue;
        nextSummaryFieldKeys.push(key);
        enabledSummaryFieldSet.delete(key);
      }

      for (const field of correctedFields) {
        if (!enabledSummaryFieldSet.has(field.key)) continue;
        nextSummaryFieldKeys.push(field.key);
        enabledSummaryFieldSet.delete(field.key);
      }

      const baseColumnIds = [
        RESPONSE_COLUMN_SUBMITTED_ID,
        ...nextSummaryFieldKeys,
        RESPONSE_COLUMN_STATUS_ID,
      ];

      const nextColumnOrder = normalizeResponseColumnOrder(baseColumnIds, responseTableSettings.columnOrder);
      const nextColumnWidths = sanitizeResponseColumnWidths(responseTableSettings.columnWidths, baseColumnIds);

      const responseTableSettingsPayload = writeFormResponseTableSettings(form.settings, {
        summaryFieldKeys: nextSummaryFieldKeys,
        columnOrder: nextColumnOrder,
        columnWidths: nextColumnWidths,
      });
      const notificationSettingsPayload = writeFormNotificationSettings(responseTableSettingsPayload, {
        completionRecipientEmails: notificationEmailParse.emails,
      });
      const draftSettingsPayload = writeFormDraftSettings(notificationSettingsPayload, {
        enabled: draftSaveEnabled,
        autoDeleteDays: normalizedDraftAutoDeleteDays,
      });
        const aiSettingsPayload = writeFormAiSettings(draftSettingsPayload, {
          enabled: aiParsingEnabled,
          customContext: aiParsingCustomContext,
        });
        const fileNameSettingsPayload = writeFormFileNameSettings(aiSettingsPayload, {
          pdfTemplate: pdfFileNameTemplate,
        });
      let nextSettings = writeFormI18nSettings(fileNameSettingsPayload, {
        defaultLocale: normalizedDefaultLocale,
        enabledLocales: nextEnabledLocales,
        allowLocaleSwitch: i18nAllowLocaleSwitch,
        translations: remappedI18nTranslations,
      });

      // Persist hideLogo — false means show logo (default), true means hide
      const settingsRecord = (nextSettings && typeof nextSettings === 'object' && !Array.isArray(nextSettings))
        ? nextSettings as Record<string, unknown>
        : {};
      nextSettings = { ...settingsRecord, hideLogo: hideLogo === true, hideFooter: hideFooter === true };

      const saved = await updateForm.mutateAsync({
        title: title.trim(),
        description: description.trim() || null,
        slug: normalizedSlug,
        status: nextStatus,
        tags,
        settings: nextSettings,
        fields: toPayloadFields(correctedFields),
        reason: 'Manual form builder save',
      });

      setStatus(saved.status as 'DRAFT' | 'PUBLISHED' | 'ARCHIVED');
      const savedDraftSettings = parseFormDraftSettings(saved.settings);
      const savedAiSettings = parseFormAiSettings(saved.settings);
      const savedFileNameSettings = parseFormFileNameSettings(saved.settings);
      const savedI18nSettings = parseFormI18nSettings(saved.settings);
      setDraftSaveEnabled(savedDraftSettings.enabled);
      setDraftAutoDeleteDays(savedDraftSettings.autoDeleteDays);
      setAiParsingEnabled(savedAiSettings.enabled);
      setAiParsingCustomContext(savedAiSettings.customContext || '');
      setPdfFileNameTemplate(savedFileNameSettings.pdfTemplate || '');
      setI18nDefaultLocale(savedI18nSettings.defaultLocale);
      setI18nEnabledLocales(savedI18nSettings.enabledLocales);
      setI18nAllowLocaleSwitch(savedI18nSettings.allowLocaleSwitch);
      setI18nTranslations(savedI18nSettings.translations);
      setEditingLocale(savedI18nSettings.enabledLocales.find((locale) => locale !== savedI18nSettings.defaultLocale) || savedI18nSettings.defaultLocale);

      baselineSnapshot.current = serializeBuilderState({
        title: saved.title,
        description: saved.description || '',
        slug: saved.slug,
        status: saved.status as 'DRAFT' | 'PUBLISHED' | 'ARCHIVED',
        tags: saved.tags,
        notificationRecipientEmails: notificationEmailParse.emails,
        notificationRecipientText: notificationRecipientsText,
        draftSaveEnabled: savedDraftSettings.enabled,
        draftAutoDeleteDays: savedDraftSettings.autoDeleteDays,
        aiParsingEnabled: savedAiSettings.enabled,
        aiParsingCustomContext: savedAiSettings.customContext || '',
        pdfFileNameTemplate: savedFileNameSettings.pdfTemplate || '',
        i18nDefaultLocale: savedI18nSettings.defaultLocale,
        i18nEnabledLocales: savedI18nSettings.enabledLocales,
        i18nAllowLocaleSwitch: savedI18nSettings.allowLocaleSwitch,
        i18nTranslations: savedI18nSettings.translations,
        hideLogo,
        hideFooter,
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
      const link = `${origin}/forms/f/${slug || form.slug}`;
      await navigator.clipboard.writeText(link);
      success('Public link copied');
    } catch {
      showError('Failed to copy public link');
    }
  }

  function handleOpenPreview() {
    window.open(viewHref, '_blank', 'noopener,noreferrer');
  }

  useKeyboardShortcuts(
    [
      {
        key: 's',
        ctrl: true,
        handler: () => {
          void handleSave();
        },
        description: 'Save form',
      },
      {
        key: 'e',
        ctrl: true,
        shift: true,
        handler: () => addField('SHORT_TEXT'),
        description: 'Add element',
      },
      {
        key: 'b',
        ctrl: true,
        shift: true,
        handler: () => addField('PAGE_BREAK'),
        description: 'Add page break',
      },
      {
        key: 'p',
        ctrl: true,
        shift: true,
        handler: () => {
          if (status !== 'PUBLISHED') {
            void handlePublish();
          }
        },
        description: 'Publish form',
      },
    ],
    !!form
  );

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
  const effectiveSlug = normalizeSlugSegment(slug) || form.slug;
  const publicOrigin = isHydrated ? window.location.origin : 'https://service.oakcloud.app';
  const publicUrlPreview = `${publicOrigin}/forms/f/${effectiveSlug || 'your-form-url'}`;
  const viewHref = isPublished
    ? `/forms/f/${effectiveSlug}`
    : `/forms/f/${effectiveSlug}?preview=1&formId=${form.id}&tenantId=${form.tenantId}`;

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
          <Button variant="secondary" size="sm" onClick={handleOpenPreview}>
            {isPublished ? 'View' : 'Preview'}
          </Button>
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
          <Button variant="secondary" size="sm" onClick={() => router.push(`/forms/${form.id}/responses`)}>
            Responses
          </Button>
          {!isPublished && (
            <Button variant="primary" size="sm" onClick={handlePublish} isLoading={updateForm.isPending}>
              Publish
            </Button>
          )}
          <Button variant={isDirty ? 'primary' : 'secondary'} size="sm" leftIcon={<Save className="w-4 h-4" />} onClick={handleSave} isLoading={updateForm.isPending}>
            {isDirty ? 'Save changes' : 'Saved'}
          </Button>
        </div>
      </div>

      <div className="mb-3 inline-flex rounded-lg border border-border-primary bg-background-primary p-1">
        {[
          { key: 'form' as const, label: 'Form' },
          { key: 'language' as const, label: 'Language' },
          { key: 'settings' as const, label: 'Settings' },
        ].map((tab) => (
          <button
            key={tab.key}
            type="button"
            onClick={() => setActiveTab(tab.key)}
            className={`rounded-md px-3 py-1.5 text-sm transition-colors ${
              activeTab === tab.key
                ? 'bg-background-elevated text-text-primary shadow-sm'
                : 'text-text-secondary hover:text-text-primary'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <div className="rounded-lg border border-border-primary bg-background-elevated p-3 sm:p-4">
        <div className="mb-4 flex flex-col gap-3">
          {activeTab === 'form' && (
            <FormInput label="Form title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Client Intake Form" />
          )}

          {activeTab === 'settings' && (
            <>
              {/* Publishing */}
              <SettingsSection
                icon={<Globe className="w-3.5 h-3.5" />}
                title="Publishing"
                summary={`${status.charAt(0) + status.slice(1).toLowerCase()} · ${slug || 'no slug'}`}
                defaultOpen
              >
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
                <FormInput label="Tags" value={tagsText} onChange={(e) => setTagsText(e.target.value)} placeholder="intake, registration" />
                <FormInput
                  label="Custom URL segment"
                  value={slug}
                  onChange={(e) => setSlug(e.target.value.toLowerCase())}
                  onBlur={(e) => setSlug(normalizeSlugSegment(e.target.value))}
                  placeholder="client-intake-form"
                  hint="Use lowercase letters, numbers, and hyphens."
                />
                <div className="text-2xs text-text-muted">
                  Public URL: <span className="font-mono text-text-secondary">{publicUrlPreview}</span>
                </div>
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
              </SettingsSection>

              {/* Notifications */}
              <SettingsSection
                icon={<Bell className="w-3.5 h-3.5" />}
                title="Notifications"
                summary={notificationEmailParse.emails.length === 0
                  ? 'No recipients'
                  : `${notificationEmailParse.emails.length} recipient${notificationEmailParse.emails.length === 1 ? '' : 's'}`}
                defaultOpen
              >
                <div>
                  <label className="mb-1.5 block text-xs font-medium text-text-secondary">Completion notification emails</label>
                  <textarea
                    value={notificationRecipientsText}
                    onChange={(e) => setNotificationRecipientsText(e.target.value)}
                    className="w-full min-h-24 rounded-lg border border-border-primary bg-background-secondary px-3 py-2 text-sm text-text-primary"
                    placeholder={'ops@example.com\nowner@example.com'}
                  />
                  <p className="mt-1 text-2xs text-text-muted">
                    One email per line (or comma-separated). Each recipient gets a completion email with response PDF and uploaded files.
                  </p>
                  {notificationEmailParse.invalidEntries.length > 0 && (
                    <p className="mt-1 text-2xs text-status-error">
                      Invalid emails: {notificationEmailParse.invalidEntries.join(', ')}
                    </p>
                  )}
                </div>
              </SettingsSection>

              {/* Respondent */}
              <SettingsSection
                icon={<Users className="w-3.5 h-3.5" />}
                title="Respondent"
                summary={draftSaveEnabled ? `Save draft enabled · ${draftAutoDeleteDays} days` : 'Save draft off'}
              >
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-xs font-medium text-text-secondary">Enable save draft</p>
                    <p className="text-2xs text-text-muted">Allow respondents to save progress and resume later with a draft code and secure resume link.</p>
                  </div>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={draftSaveEnabled}
                    onClick={() => setDraftSaveEnabled((value) => !value)}
                    className={`relative inline-flex h-5 w-9 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                      draftSaveEnabled ? 'bg-oak-primary' : 'bg-border-primary'
                    }`}
                  >
                    <span
                      className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                        draftSaveEnabled ? 'translate-x-4' : 'translate-x-0'
                      }`}
                    />
                  </button>
                </div>
                {draftSaveEnabled && (
                  <div>
                    <label className="mb-1.5 block text-xs font-medium text-text-secondary">Draft auto-delete (days)</label>
                    <input
                      type="number"
                      min={MIN_FORM_DRAFT_AUTO_DELETE_DAYS}
                      max={MAX_FORM_DRAFT_AUTO_DELETE_DAYS}
                      value={draftAutoDeleteDays}
                      onChange={(e) => {
                        const nextValue = Number.parseInt(e.target.value, 10);
                        if (!Number.isFinite(nextValue)) {
                          setDraftAutoDeleteDays(DEFAULT_FORM_DRAFT_AUTO_DELETE_DAYS);
                          return;
                        }
                        setDraftAutoDeleteDays(nextValue);
                      }}
                      className="w-full rounded-lg border border-border-primary bg-background-secondary px-3 py-2 text-sm text-text-primary"
                    />
                    <p className="mt-1 text-2xs text-text-muted">
                      Drafts and their uploaded files are deleted after this many days. Allowed range: {MIN_FORM_DRAFT_AUTO_DELETE_DAYS}-{MAX_FORM_DRAFT_AUTO_DELETE_DAYS}.
                    </p>
                  </div>
                )}
              </SettingsSection>

              {/* AI Review */}
              <SettingsSection
                icon={<Sparkles className="w-3.5 h-3.5" />}
                title="AI Review"
                summary={aiParsingEnabled ? (aiParsingCustomContext ? 'Enabled · Custom context set' : 'Enabled') : 'Disabled'}
              >
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-xs font-medium text-text-secondary">Enable AI parsing</p>
                    <p className="text-2xs text-text-muted">Run an internal AI review on each completed response using the default AI model from the server environment.</p>
                  </div>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={aiParsingEnabled}
                    onClick={() => setAiParsingEnabled((value) => !value)}
                    className={`relative inline-flex h-5 w-9 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                      aiParsingEnabled ? 'bg-oak-primary' : 'bg-border-primary'
                    }`}
                  >
                    <span
                      className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                        aiParsingEnabled ? 'translate-x-4' : 'translate-x-0'
                      }`}
                    />
                  </button>
                </div>
                {aiParsingEnabled && (
                  <div>
                    <div className="mb-1.5 flex items-center justify-between gap-3">
                      <label className="block text-xs font-medium text-text-secondary">Custom context</label>
                      <Button
                        variant="secondary"
                        size="xs"
                        leftIcon={<Sparkles className="w-3.5 h-3.5" />}
                        onClick={openAiAssistModal}
                      >
                        AI assist
                      </Button>
                    </div>
                    <textarea
                      value={aiParsingCustomContext}
                      onChange={(e) => setAiParsingCustomContext(e.target.value)}
                      rows={5}
                      className="w-full rounded-lg border border-border-primary bg-background-secondary px-3 py-2 text-sm text-text-primary"
                      placeholder="Example: Verify the declared identity details against the uploaded identification documents and flag any mismatches, PEP declarations, or unusual risk indicators."
                    />
                    <p className="mt-1 text-2xs text-text-muted">
                      Internal only. This is used for staff review and is never shown on the public form.
                    </p>
                  </div>
                )}
              </SettingsSection>

              {/* Appearance & PDF */}
              <SettingsSection
                icon={<Paintbrush className="w-3.5 h-3.5" />}
                title="Appearance & PDF"
                summary={[
                  ...(!hideLogo ? ['Logo'] : []),
                  ...(!hideFooter ? ['Footer'] : []),
                  ...(pdfFileNameTemplate ? ['PDF template'] : []),
                ].join(' · ') || 'Default appearance'}
              >
                <FormInput
                  label="PDF filename template"
                  value={pdfFileNameTemplate}
                  onChange={(e) => setPdfFileNameTemplate(e.target.value)}
                  placeholder="Form response - [full_name] - [datetime_stamp]"
                  hint="Use [field_key] plus standard variables: [datetime_stamp], [date_stamp], [time_stamp], [submission_id], [form_title], [form_slug]. [datetime_stamp] uses the tenant timezone (for example: 6 Mar 26 - 9.51PM)."
                />
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-xs font-medium text-text-secondary">Show tenant logo</p>
                    <p className="text-2xs text-text-muted">Display your organization logo beside the form title.</p>
                  </div>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={!hideLogo}
                    onClick={() => setHideLogo((v) => !v)}
                    className={`relative inline-flex h-5 w-9 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                      !hideLogo ? 'bg-oak-primary' : 'bg-border-primary'
                    }`}
                  >
                    <span
                      className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                        !hideLogo ? 'translate-x-4' : 'translate-x-0'
                      }`}
                    />
                  </button>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-xs font-medium text-text-secondary">Show copyright footer</p>
                    <p className="text-2xs text-text-muted">Display © [Tenant Name] at the bottom of the form</p>
                  </div>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={!hideFooter}
                    onClick={() => setHideFooter((v) => !v)}
                    className={`relative inline-flex h-5 w-9 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                      !hideFooter ? 'bg-oak-primary' : 'bg-border-primary'
                    }`}
                  >
                    <span
                      className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                        !hideFooter ? 'translate-x-4' : 'translate-x-0'
                      }`}
                    />
                  </button>
                </div>
              </SettingsSection>
            </>
          )}

          {activeTab === 'language' && (
            <>
              <div>
                <p className="text-sm font-semibold text-text-primary">Translations</p>
                <p className="mt-0.5 text-2xs text-text-muted">
                  English source values are shown on the left. Enter localized values on the right.
                </p>
              </div>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div>
                  <label className="mb-1.5 block text-xs font-medium text-text-secondary">Default language</label>
                  <select
                    value={i18nDefaultLocale}
                    onChange={(e) => {
                      const nextDefault = normalizeLocaleCode(e.target.value) || 'en';
                      setI18nDefaultLocale(nextDefault);
                      setI18nEnabledLocales((prev) => (
                        prev.includes(nextDefault) ? prev : [nextDefault, ...prev]
                      ));
                    }}
                    className="w-full rounded-lg border border-border-primary bg-background-secondary px-3 py-2 text-sm text-text-primary"
                  >
                    {localeOptionValues.map((locale) => (
                      <option key={locale} value={locale}>{getLocaleDisplayName(locale)} ({locale})</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="mb-1.5 block text-xs font-medium text-text-secondary">Enabled languages</label>
                  <div className="rounded-lg border border-border-primary bg-background-secondary p-2 space-y-0.5 max-h-40 overflow-y-auto">
                    {localeOptionValues.map((locale) => {
                      const isDefault = locale === i18nDefaultLocale;
                      const isEnabled = i18nEnabledLocales.includes(locale);
                      return (
                        <label key={locale} className={`flex items-center gap-2 rounded px-2 py-1 text-sm cursor-pointer select-none hover:bg-background-tertiary ${isDefault ? 'opacity-60' : ''}`}>
                          <input
                            type="checkbox"
                            checked={isEnabled}
                            disabled={isDefault}
                            onChange={(e) => {
                              const selectedSet = new Set(i18nEnabledLocales);
                              if (e.target.checked) {
                                selectedSet.add(locale);
                              } else {
                                selectedSet.delete(locale);
                              }
                              selectedSet.add(i18nDefaultLocale);
                              setI18nEnabledLocales(Array.from(selectedSet));
                            }}
                            className="h-3.5 w-3.5 rounded border-border-primary bg-background-secondary accent-oak-primary"
                          />
                          <span className="text-text-primary">{getLocaleDisplayName(locale)}</span>
                          <span className="text-text-muted font-mono text-2xs">{locale}</span>
                          {isDefault && <span className="ml-auto text-2xs text-text-muted">default</span>}
                        </label>
                      );
                    })}
                  </div>
                </div>
              </div>

              <label className="inline-flex items-center gap-2 text-xs text-text-secondary">
                <input
                  type="checkbox"
                  checked={i18nAllowLocaleSwitch}
                  onChange={(e) => setI18nAllowLocaleSwitch(e.target.checked)}
                  className="h-4 w-4 rounded border-border-primary bg-background-secondary accent-oak-primary"
                />
                Allow respondents to switch language on public form
              </label>

              <div className="space-y-1.5">
                <p className="text-2xs font-medium text-text-secondary">Language-specific links</p>
                {i18nEnabledLocales.map((locale) => {
                  const localizedUrl = locale === i18nDefaultLocale
                    ? publicUrlPreview
                    : `${publicUrlPreview}?lang=${encodeURIComponent(locale)}`;
                  return (
                    <div key={locale} className="flex items-center gap-2 rounded-lg border border-border-primary bg-background-primary px-2.5 py-1.5">
                      <span className="shrink-0 w-12 font-mono text-2xs font-medium text-text-secondary">{locale}</span>
                      <span className="flex-1 truncate text-2xs text-text-muted font-mono">{localizedUrl}</span>
                      <button
                        type="button"
                        onClick={async () => {
                          try {
                            await navigator.clipboard.writeText(localizedUrl);
                            success('Link copied');
                          } catch {
                            showError('Failed to copy link');
                          }
                        }}
                        className="shrink-0 text-text-muted hover:text-text-secondary transition-colors"
                        aria-label={`Copy ${locale} link`}
                      >
                        <Copy className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  );
                })}
              </div>

              {editableLocales.length === 0 ? (
                <p className="text-2xs text-text-muted">
                  Add at least one non-default language to configure translations.
                </p>
              ) : (
                <div className="space-y-4">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
                    <div>
                      <p className="text-xs font-semibold text-text-secondary">English source</p>
                      <p className="mt-0.5 text-2xs text-text-muted">Read-only values from the base form.</p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <button
                        type="button"
                        onClick={() => setAllTranslationSectionsExpanded(expandedTranslationSections.length !== availableTranslationSectionIds.length)}
                        className="rounded-lg border border-border-primary bg-background-primary px-3 py-1.5 text-xs text-text-secondary transition-colors hover:text-text-primary"
                      >
                        {expandedTranslationSections.length === availableTranslationSectionIds.length ? 'Collapse all' : 'Expand all'}
                      </button>
                      {editableLocales.length > 1 ? (
                        <select
                          value={activeEditingLocale}
                          onChange={(e) => setEditingLocale(e.target.value)}
                          className="rounded-lg border border-border-primary bg-background-secondary px-3 py-1.5 text-sm text-text-primary"
                        >
                          {editableLocales.map((locale) => (
                            <option key={locale} value={locale}>{getLocaleDisplayName(locale)} ({locale})</option>
                          ))}
                        </select>
                      ) : (
                        <div className="rounded-lg border border-border-primary bg-background-primary px-3 py-1.5 text-sm text-text-primary">
                          {getLocaleDisplayName(activeEditingLocale)} <span className="font-mono text-xs text-text-muted">({activeEditingLocale})</span>
                        </div>
                      )}
                      <Button
                        variant="secondary"
                        size="sm"
                        leftIcon={<Sparkles className="w-3.5 h-3.5" />}
                        onClick={() => setShowAiTranslateModal(true)}
                        disabled={aiTranslationSourceItems.length === 0 || isAiTranslating}
                      >
                        AI Translate
                      </Button>
                    </div>
                  </div>

                  {(hasValue(title) || hasValue(description)) && (
                    <div className="space-y-2">
                      <button
                        type="button"
                        onClick={() => toggleTranslationSection('form-text')}
                        className="flex w-full items-center justify-between rounded-lg border border-border-primary bg-background-primary px-3 py-2 text-left"
                      >
                        <span className="text-xs font-semibold text-text-primary">Form text</span>
                        {isTranslationSectionExpanded('form-text') ? <ChevronDown className="h-4 w-4 text-text-muted" /> : <ChevronRight className="h-4 w-4 text-text-muted" />}
                      </button>
                      {isTranslationSectionExpanded('form-text') && (
                        <>
                          {hasValue(title) && (
                            <div className="grid grid-cols-1 gap-2 lg:grid-cols-2">
                              <div className="min-w-0 rounded-lg border border-border-primary bg-background-primary px-3 py-2">
                                <p className="text-2xs font-medium text-text-muted">Form title</p>
                                <p className="mt-1 break-words text-sm text-text-primary">{title}</p>
                              </div>
                              <div className="min-w-0 rounded-lg border border-border-primary bg-background-secondary px-3 py-2">
                                <p className="text-2xs font-medium text-text-muted">Translated form title</p>
                                <input
                                  type="text"
                                  value={activeLocaleTranslation.form.title || ''}
                                  onChange={(e) => updateLocaleTranslation(activeEditingLocale, (current) => ({
                                    ...current,
                                    form: {
                                      ...(current.form || {}),
                                      title: e.target.value,
                                    },
                                  }))}
                                  className="mt-1 w-full bg-transparent text-sm text-text-primary outline-none placeholder:text-text-muted"
                                  placeholder="Enter translation..."
                                />
                              </div>
                            </div>
                          )}
                          {hasValue(description) && (
                            <div className="grid grid-cols-1 gap-2 lg:grid-cols-2">
                              <div className="min-w-0 rounded-lg border border-border-primary bg-background-primary px-3 py-2">
                                <p className="text-2xs font-medium text-text-muted">Form description</p>
                                <p className="mt-1 whitespace-pre-wrap break-words text-sm text-text-primary">{description}</p>
                              </div>
                              <div className="min-w-0 rounded-lg border border-border-primary bg-background-secondary px-3 py-2">
                                <p className="text-2xs font-medium text-text-muted">Translated form description</p>
                                <textarea
                                  value={activeLocaleTranslation.form.description || ''}
                                  onChange={(e) => updateLocaleTranslation(activeEditingLocale, (current) => ({
                                    ...current,
                                    form: {
                                      ...(current.form || {}),
                                      description: e.target.value,
                                    },
                                  }))}
                                  className="mt-1 w-full min-h-20 bg-transparent text-sm text-text-primary outline-none resize-none placeholder:text-text-muted"
                                  placeholder="Enter translation..."
                                />
                              </div>
                            </div>
                          )}
                        </>
                      )}
                    </div>
                  )}

                  <div className="space-y-2">
                    <button
                      type="button"
                      onClick={() => toggleTranslationSection('ui-labels')}
                      className="flex w-full items-center justify-between rounded-lg border border-border-primary bg-background-primary px-3 py-2 text-left"
                    >
                      <span className="text-xs font-semibold text-text-primary">UI labels</span>
                      {isTranslationSectionExpanded('ui-labels') ? <ChevronDown className="h-4 w-4 text-text-muted" /> : <ChevronRight className="h-4 w-4 text-text-muted" />}
                    </button>
                    {isTranslationSectionExpanded('ui-labels') && translatableUiItems.map((item) => (
                        <div key={item.key} className="grid grid-cols-1 gap-2 lg:grid-cols-2">
                          <div className="min-w-0 rounded-lg border border-border-primary bg-background-primary px-3 py-2">
                            <p className="text-2xs font-medium text-text-muted">{item.label}</p>
                            <p className="mt-1 break-words text-sm text-text-primary">{item.placeholder}</p>
                          </div>
                          <div className="min-w-0 rounded-lg border border-border-primary bg-background-secondary px-3 py-2">
                            <p className="text-2xs font-medium text-text-muted">Translated value</p>
                            <input
                              type="text"
                              value={activeLocaleTranslation.ui[item.key] || ''}
                              onChange={(e) => updateLocaleTranslation(activeEditingLocale, (current) => {
                                const nextUi = { ...(current.ui || {}) };
                                if (e.target.value.trim().length === 0) {
                                  delete nextUi[item.key];
                                } else {
                                  nextUi[item.key] = e.target.value;
                                }
                                return {
                                  ...current,
                                  ui: nextUi,
                                };
                              })}
                              className="mt-1 w-full bg-transparent text-sm text-text-primary outline-none placeholder:text-text-muted"
                              placeholder={`Translate "${item.placeholder}"`}
                            />
                          </div>
                        </div>
                      ))}
                  </div>

                  <div className="space-y-3">
                    <button
                      type="button"
                      onClick={() => toggleTranslationSection('field-translations')}
                      className="flex w-full items-center justify-between rounded-lg border border-border-primary bg-background-primary px-3 py-2 text-left"
                    >
                      <span className="text-xs font-semibold text-text-primary">Field translations</span>
                      {isTranslationSectionExpanded('field-translations') ? <ChevronDown className="h-4 w-4 text-text-muted" /> : <ChevronRight className="h-4 w-4 text-text-muted" />}
                    </button>
                    {isTranslationSectionExpanded('field-translations') && (
                      <>
                        <p className="text-2xs text-text-muted">
                          Only fields with existing English values are shown.
                        </p>
                        {translatableFieldGroups.map(({ field, fieldKey, textEntries, englishOptions }) => {
                          const fieldTranslation = activeLocaleTranslation.fields[fieldKey] || {};
                          const optionTranslations = fieldTranslation.options || [];
                          const fieldDisplayName = hasValue(field.label) ? field.label : fieldKey;
                          const fieldSectionId = `field-${field.clientId}`;

                          return (
                            <div key={`i18n-${field.clientId}`} className="space-y-2 border-t border-border-primary pt-3">
                              <button
                                type="button"
                                onClick={() => toggleTranslationSection(fieldSectionId)}
                                className="flex w-full items-center justify-between rounded-lg border border-border-primary bg-background-primary px-3 py-2 text-left"
                              >
                                <span className="text-xs font-semibold text-text-primary">
                                  {fieldDisplayName} <span className="font-mono font-normal text-text-muted">({fieldKey})</span>
                                </span>
                                {isTranslationSectionExpanded(fieldSectionId) ? <ChevronDown className="h-4 w-4 text-text-muted" /> : <ChevronRight className="h-4 w-4 text-text-muted" />}
                              </button>
                              {isTranslationSectionExpanded(fieldSectionId) && (
                                <>
                                  {textEntries.map((entry) => {
                                    const translatedValue = entry.key === 'label'
                                      ? (fieldTranslation.label || '')
                                      : entry.key === 'placeholder'
                                        ? (fieldTranslation.placeholder || '')
                                        : entry.key === 'subtext'
                                          ? (fieldTranslation.subtext || '')
                                          : (fieldTranslation.helpText || '');

                                    return (
                                      <div key={`${field.clientId}-${entry.key}`} className="grid grid-cols-1 gap-2 lg:grid-cols-2">
                                        <div className="min-w-0 rounded-lg border border-border-primary bg-background-primary px-3 py-2">
                                          <p className="text-2xs font-medium text-text-muted">{entry.label}</p>
                                          <p className="mt-1 whitespace-pre-wrap break-words text-sm text-text-primary">{entry.value}</p>
                                        </div>
                                        <div className="min-w-0 rounded-lg border border-border-primary bg-background-secondary px-3 py-2">
                                          <p className="text-2xs font-medium text-text-muted">Translated {entry.label.toLowerCase()}</p>
                                          <textarea
                                            value={translatedValue}
                                            onChange={(e) => updateFieldTranslation(activeEditingLocale, fieldKey, (current) => ({
                                              ...current,
                                              [entry.key]: e.target.value,
                                            }))}
                                            rows={Math.max(2, translatedValue.split('\n').length)}
                                            className="mt-1 w-full bg-transparent text-sm text-text-primary outline-none resize-none placeholder:text-text-muted"
                                            placeholder="Enter translation..."
                                          />
                                        </div>
                                      </div>
                                    );
                                  })}

                                  {englishOptions.length > 0 && (
                                    <div className="space-y-2">
                                      <p className="text-2xs font-medium text-text-muted">Options</p>
                                      {englishOptions.map((option) => (
                                        <div key={`${field.clientId}-i18n-option-${option.index}`} className="grid grid-cols-1 gap-2 lg:grid-cols-2">
                                          <div className="min-w-0 rounded-lg border border-border-primary bg-background-primary px-3 py-2 text-sm text-text-primary break-words">
                                            {option.label}
                                          </div>
                                          <div className="min-w-0 rounded-lg border border-border-primary bg-background-secondary px-3 py-2">
                                            <input
                                              type="text"
                                              value={optionTranslations[option.index] || ''}
                                              onChange={(e) => {
                                                const nextOptions = [...optionTranslations];
                                                nextOptions[option.index] = e.target.value;
                                                updateFieldTranslation(activeEditingLocale, fieldKey, (current) => ({
                                                  ...current,
                                                  options: nextOptions,
                                                }));
                                              }}
                                              className="w-full bg-transparent text-sm text-text-primary outline-none placeholder:text-text-muted"
                                              placeholder="Enter translation..."
                                            />
                                          </div>
                                        </div>
                                      ))}
                                    </div>
                                  )}
                                </>
                              )}
                            </div>
                          );
                        })}
                      </>
                    )}
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        {activeTab === 'form' && (
          <>
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
                      selected={selectedFieldId === field.clientId}
                      isDropTarget={dragActiveId !== null && dragOverId === field.clientId && dragActiveId !== field.clientId}
                      dropPosition={dragActiveId !== null && dragOverId === field.clientId && dragActiveId !== field.clientId ? dragDropPosition : null}
                      onSelect={selectField}
                      onAddBelow={(clientId) => insertFieldAfter(clientId, 'SHORT_TEXT')}
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
                      {getBuilderFieldTypeLabel(dragActiveField)}
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
              <Button
                variant="secondary"
                size="sm"
                leftIcon={<Plus className="w-4 h-4" />}
                onClick={() => addField('SHORT_TEXT')}
                className="!bg-background-secondary hover:!bg-background-tertiary"
              >
                Element <span className="ml-1 text-2xs text-text-muted">Ctrl/Cmd+Shift+E</span>
              </Button>
              <Tooltip content="Add a repeatable dynamic section">
                <div>
                  <Button
                    variant="secondary"
                    size="sm"
                    leftIcon={<Plus className="w-4 h-4" />}
                    onClick={addDynamicSection}
                    className="!bg-background-secondary hover:!bg-background-tertiary"
                  >
                    Dynamic Section
                  </Button>
                </div>
              </Tooltip>
              <Tooltip content="Add page break">
                <div>
                  <Button
                    variant="secondary"
                    size="sm"
                    leftIcon={<Plus className="w-4 h-4" />}
                    onClick={() => addField('PAGE_BREAK')}
                    className="!bg-background-secondary hover:!bg-background-tertiary"
                  >
                    Page <span className="ml-1 text-2xs text-text-muted">Ctrl/Cmd+Shift+B</span>
                  </Button>
                </div>
              </Tooltip>
            </div>
          </>
        )}
      </div>

      <Modal
        isOpen={showAiTranslateModal}
        onClose={() => {
          if (isAiTranslating) return;
          setShowAiTranslateModal(false);
        }}
        title="AI Translation"
        description={`Translate English source values into ${activeEditingLocale}.`}
        size="2xl"
      >
        <ModalBody className="space-y-4">
          <p className="text-sm text-text-secondary">
            The AI will translate and populate <span className="font-medium text-text-primary">{aiTranslationTargetItems.length}</span> {aiTranslateFillEmptyOnly ? 'empty' : ''} values for the active language.
          </p>
          <AIModelSelector
            value={aiTranslateModel}
            onChange={setAiTranslateModel}
            label="AI Model"
            helpText="Select the model used for translation."
            variant="compact"
            tenantId={form.tenantId}
          />
          <div>
            <label className="mb-1.5 block text-xs font-medium text-text-secondary">Additional instructions (optional)</label>
            <textarea
              value={aiTranslateInstructions}
              onChange={(e) => setAiTranslateInstructions(e.target.value)}
              rows={3}
              className="w-full rounded-lg border border-border-primary bg-background-secondary px-3 py-2 text-sm text-text-primary"
              placeholder="Example: Use simple, conversational phrasing suitable for external clients."
            />
          </div>
          <label className="inline-flex items-center gap-2 text-sm text-text-secondary">
            <input
              type="checkbox"
              checked={aiTranslateFillEmptyOnly}
              onChange={(e) => setAiTranslateFillEmptyOnly(e.target.checked)}
              className="h-4 w-4 rounded border-border-primary bg-background-secondary accent-oak-primary"
            />
            Fill empty translated values only
          </label>
          <p className="text-2xs text-text-muted">
            Turn this off to overwrite existing translated values for the active language.
          </p>
        </ModalBody>
        <ModalFooter>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => setShowAiTranslateModal(false)}
            disabled={isAiTranslating}
          >
            Cancel
          </Button>
          <Button
            variant="primary"
            size="sm"
            leftIcon={<Sparkles className="w-3.5 h-3.5" />}
            onClick={handleRunAiTranslation}
            isLoading={isAiTranslating}
            disabled={!aiTranslateModel || aiTranslationTargetItems.length === 0}
          >
            Translate and Populate
          </Button>
        </ModalFooter>
      </Modal>

      <Modal
        isOpen={showAiAssistModal}
        onClose={() => {
          if (isGeneratingAiAssistContext) return;
          setShowAiAssistModal(false);
        }}
        title="AI Assist for Custom Context"
        description="Paste rough notes and convert them into the structured custom-context format used for form AI review."
        size="2xl"
      >
        <ModalBody className="space-y-4">
          <p className="text-sm text-text-secondary">
            The default server AI model will rewrite your notes into a cleaner prompt for the form&apos;s internal AI review. You can review and edit the result before applying it.
          </p>
          <div>
            <label className="mb-1.5 block text-xs font-medium text-text-secondary">Raw notes or instructions</label>
            <textarea
              value={aiAssistSourceText}
              onChange={(e) => setAiAssistSourceText(e.target.value)}
              rows={7}
              className="w-full rounded-lg border border-border-primary bg-background-secondary px-3 py-2 text-sm text-text-primary"
              placeholder="Example: Review this as a Singapore CSP KYC/CDD form. Cross-check names, ID numbers, DOB, address, beneficial ownership, nominee arrangements, PEP declarations, and whether any supporting document is missing or expired."
            />
            <p className="mt-1 text-2xs text-text-muted">
              Include rough requirements, jurisdiction, risk checks, or document checks. The generated draft will preserve these and rewrite them into the recommended structure.
            </p>
          </div>
          <div>
            <div className="mb-1.5 flex items-center justify-between gap-3">
              <label className="block text-xs font-medium text-text-secondary">Generated custom context</label>
              {aiAssistGeneratedContext && (
                <span className="text-2xs text-text-muted">Editable before applying</span>
              )}
            </div>
            <textarea
              value={aiAssistGeneratedContext}
              onChange={(e) => setAiAssistGeneratedContext(e.target.value)}
              rows={12}
              className="w-full rounded-lg border border-border-primary bg-background-secondary px-3 py-2 text-sm text-text-primary"
              placeholder="Generate a draft to preview it here."
            />
          </div>
        </ModalBody>
        <ModalFooter>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => setShowAiAssistModal(false)}
            disabled={isGeneratingAiAssistContext}
          >
            Cancel
          </Button>
          <Button
            variant="secondary"
            size="sm"
            leftIcon={<Sparkles className="w-3.5 h-3.5" />}
            onClick={handleGenerateAiAssistContext}
            isLoading={isGeneratingAiAssistContext}
            disabled={!aiAssistSourceText.trim()}
          >
            {aiAssistGeneratedContext ? 'Regenerate draft' : 'Generate draft'}
          </Button>
          <Button
            variant="primary"
            size="sm"
            onClick={handleUseAiAssistContext}
            disabled={!aiAssistGeneratedContext.trim() || isGeneratingAiAssistContext}
          >
            Use result
          </Button>
        </ModalFooter>
      </Modal>

      {activeTab === 'form' && selectedField && (
        <FieldEditorDrawer
          field={selectedField}
          allFields={fields}
          onClose={() => setSelectedFieldId(null)}
          onChange={(next) => updateField(selectedField.clientId, () => next)}
        />
      )}

      {activeTab === 'form' && selectedField && <div className="fixed inset-0 z-30 bg-black/20" onClick={() => setSelectedFieldId(null)} aria-hidden="true" />}
    </div>
  );
}
