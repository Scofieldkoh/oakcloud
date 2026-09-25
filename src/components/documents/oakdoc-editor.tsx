'use client';

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
} from 'react';
import { DocxEditor, type DocxEditorRef, type EditorCommand } from '@docx-editor.dev/react';
import { useQuery } from '@tanstack/react-query';
import { useRouter, useSearchParams } from 'next/navigation';
import { ArrowLeft, Download, FileUp, Loader2, Save, Search } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useSession } from '@/hooks/use-auth';
import { useActiveWorkspaceId } from '@/components/ui/workspace-selector';
import {
  TEMPLATE_FIELD_CATEGORIES,
  type TemplateField,
} from '@/components/documents/template-editor/template-field-catalog';
import {
  inspectOakDocFields,
  normalizeOakDocFields,
  pruneDeletedOakDocFields,
  resolveOakDocFields,
  type OakDocFieldDefinition,
  type OakDocFieldSummary,
} from '@/lib/document-editor/oakdoc-fields';
import {
  buildOakDocResolutionValues,
  type OakDocCompanyDetail,
} from '@/lib/document-editor/oakdoc-context';
import {
  createOakDocRepeater,
  inspectOakDocRepeaters,
  OAKDOC_REPEATER_DEFINITIONS,
  OAKDOC_REPEATER_ITEM_TAGS,
  removeOakDocRepeater,
  resolveOakDocRepeaters,
  type OakDocRepeaterDefinition,
  type OakDocRepeaterSummary,
} from '@/lib/document-editor/oakdoc-repeaters';
import {
  createOakDocCondition,
  inspectOakDocConditions,
  removeOakDocCondition,
  resolveOakDocConditions,
  type OakDocConditionOperator,
  type OakDocConditionSummary,
} from '@/lib/document-editor/oakdoc-conditions';
import {
  readOakDocTemplateMetadata,
  type OakDocTemplateMetadata,
} from '@/lib/document-editor/oakdoc-template';
import {
  oakDocCaretTouchesSectionBoundary,
  oakDocSelectionCrossesSectionBoundary,
  preserveTransferredOakDocSections,
} from '@/lib/document-editor/oakdoc-section-compatibility';

const DOCX_MIME =
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

const TEMPLATE_CATEGORIES = [
  { value: 'RESOLUTION', label: 'Resolution' },
  { value: 'CONTRACT', label: 'Contract' },
  { value: 'LETTER', label: 'Letter' },
  { value: 'MINUTES', label: 'Minutes' },
  { value: 'NOTICE', label: 'Notice' },
  { value: 'CERTIFICATE', label: 'Certificate' },
  { value: 'OTHER', label: 'Other' },
] as const;

const SUPPORTED_FIELD_CATEGORY_KEYS = new Set([
  'company',
  'selected-director',
  'selected-shareholder',
  'system',
]);

const OAKDOC_FIELD_CATEGORIES = TEMPLATE_FIELD_CATEGORIES
  .filter((category) => SUPPORTED_FIELD_CATEGORY_KEYS.has(category.key))
  .map((category) => ({
    ...category,
    fields: category.fields.filter(
      (field) => !field.builder && !field.key.includes('{{'),
    ),
  }))
  .filter((category) => category.fields.length > 0);

const OAKDOC_SIMPLE_FIELDS: readonly OakDocFieldDefinition[] = OAKDOC_FIELD_CATEGORIES.flatMap(
  (category) =>
    category.fields.map((field) => ({
      tag: field.key,
      label: field.label,
      category: category.label,
    })),
);

const OAKDOC_REPEATER_FIELDS: readonly OakDocFieldDefinition[] =
  OAKDOC_REPEATER_DEFINITIONS.flatMap((definition) => definition.fields);

const OAKDOC_FIELDS: readonly OakDocFieldDefinition[] = [
  ...OAKDOC_SIMPLE_FIELDS,
  ...OAKDOC_REPEATER_FIELDS,
];

const OAKDOC_FIELD_BY_TAG = new Map(
  OAKDOC_FIELDS.map((field) => [field.tag, field]),
);

const OAKDOC_FIELD_TAGS = new Set([
  ...OAKDOC_FIELDS.map((field) => field.tag),
  ...OAKDOC_REPEATER_ITEM_TAGS,
]);

const OAKDOC_CONDITION_FIELD_TAGS = new Set(
  OAKDOC_SIMPLE_FIELDS.map((field) => field.tag),
);

interface CompanyOption {
  id: string;
  name: string;
  uen: string;
}

interface CompanyOptionsResponse {
  options: CompanyOption[];
}

interface OakDocTemplateRecord {
  id: string;
  revision: number;
  version: number;
  name: string;
  description?: string | null;
  category: string;
  isActive: boolean;
  contentJson?: unknown;
}

interface LoadedOakDocTemplate {
  template: OakDocTemplateRecord;
  metadata: OakDocTemplateMetadata;
  bytes: Uint8Array;
}

type StatusKind = 'neutral' | 'success' | 'error';

function asUint8Array(buffer: ArrayBuffer): Uint8Array {
  return new Uint8Array(buffer);
}

async function fetchCompanyOptions(): Promise<CompanyOption[]> {
  const response = await fetch('/api/companies/options?limit=50');
  if (!response.ok) throw new Error('Could not load Oakcloud companies.');
  const payload = (await response.json()) as CompanyOptionsResponse;
  return Array.isArray(payload.options) ? payload.options : [];
}

async function fetchCompany(companyId: string): Promise<OakDocCompanyDetail> {
  const response = await fetch(`/api/companies/${encodeURIComponent(companyId)}`);
  if (!response.ok) throw new Error('Could not load the selected company.');
  return response.json() as Promise<OakDocCompanyDetail>;
}

async function fetchOakDocTemplate(
  templateId: string,
  tenantId?: string | null,
): Promise<LoadedOakDocTemplate> {
  const params = new URLSearchParams();
  if (tenantId) params.set('tenantId', tenantId);
  const metadataResponse = await fetch(
    `/api/document-templates/${encodeURIComponent(templateId)}?${params.toString()}`,
  );
  if (!metadataResponse.ok) {
    const payload = await metadataResponse.json().catch(() => ({}));
    throw new Error(payload.error || 'Could not load OakDoc template.');
  }

  const template = await metadataResponse.json() as OakDocTemplateRecord;
  const metadata = readOakDocTemplateMetadata(template.contentJson);
  if (!metadata) throw new Error('This template is not an OakDoc template.');

  params.set('format', 'docx');
  const fileResponse = await fetch(
    `/api/document-templates/${encodeURIComponent(templateId)}?${params.toString()}`,
    { cache: 'no-store' },
  );
  if (!fileResponse.ok) {
    const payload = await fileResponse.json().catch(() => ({}));
    throw new Error(payload.error || 'Could not load the OakDoc DOCX file.');
  }

  return {
    template,
    metadata,
    bytes: new Uint8Array(await fileResponse.arrayBuffer()),
  };
}

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  return copy.buffer;
}

function downloadDocx(bytes: Uint8Array, fileName: string): void {
  const blob = new Blob([toArrayBuffer(bytes)], { type: DOCX_MIME });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function safeDocxName(value: string): string {
  const base = value.replace(/[\\/:*?"<>|]/g, '_').trim() || 'OakDoc';
  return base.toLowerCase().endsWith('.docx') ? base : `${base}.docx`;
}

function fieldDefinition(field: TemplateField, category: string): OakDocFieldDefinition {
  return {
    tag: field.key,
    label: field.label,
    category,
  };
}

function fieldMatches(field: TemplateField, query: string): boolean {
  if (!query) return true;
  const normalized = query.toLowerCase();
  return (
    field.label.toLowerCase().includes(normalized)
    || field.key.toLowerCase().includes(normalized)
    || field.category.toLowerCase().includes(normalized)
  );
}

function statusClasses(kind: StatusKind): string {
  if (kind === 'success') {
    return 'border-status-success/20 bg-status-success/10 text-status-success';
  }
  if (kind === 'error') {
    return 'border-status-error/20 bg-status-error/10 text-status-error';
  }
  return 'border-border-primary bg-background-secondary text-text-secondary';
}

export function OakDocEditor() {
  const editorRef = useRef<DocxEditorRef>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const readyMessageRef = useRef('');
  const loadedTemplateRevisionRef = useRef<number | null>(null);

  const router = useRouter();
  const searchParams = useSearchParams();
  const { data: session } = useSession();
  const activeTenantId = useActiveWorkspaceId(
    session?.isSuperAdmin ?? false,
    session?.tenantId,
  );

  const [templateId, setTemplateId] = useState<string | null>(
    searchParams.get('templateId'),
  );
  const [templateRevision, setTemplateRevision] = useState<number | null>(null);
  const [templateCategory, setTemplateCategory] = useState('OTHER');
  const [templateDescription, setTemplateDescription] = useState('');
  const [templateIsActive, setTemplateIsActive] = useState(true);
  const [isDirty, setIsDirty] = useState(false);

  const companiesQuery = useQuery({
    queryKey: ['oakdoc', 'company-options'],
    queryFn: fetchCompanyOptions,
    staleTime: 5 * 60 * 1000,
  });

  const templateQuery = useQuery({
    queryKey: ['oakdoc', 'template', templateId, activeTenantId],
    queryFn: () => fetchOakDocTemplate(templateId!, activeTenantId),
    enabled: Boolean(templateId && activeTenantId),
    staleTime: 60 * 1000,
  });

  const [documentBytes, setDocumentBytes] = useState<Uint8Array | null>(null);
  const [documentVersion, setDocumentVersion] = useState(0);
  const [fileName, setFileName] = useState('');
  const [title, setTitle] = useState('OakDoc document');
  const [companyId, setCompanyId] = useState('');
  const [selectedDirectorId, setSelectedDirectorId] = useState('');
  const [selectedShareholderId, setSelectedShareholderId] = useState('');
  const [fieldSearch, setFieldSearch] = useState('');
  const [fieldSummary, setFieldSummary] = useState<OakDocFieldSummary>({
    count: 0,
    tags: [],
  });
  const [repeaterSummary, setRepeaterSummary] = useState<OakDocRepeaterSummary>({
    count: 0,
    tags: [],
  });
  const [conditionSummary, setConditionSummary] = useState<OakDocConditionSummary>({
    count: 0,
    fieldTags: [],
    conditions: [],
  });
  const [conditionField, setConditionField] = useState(
    OAKDOC_SIMPLE_FIELDS[0]?.tag ?? '',
  );
  const [conditionOperator, setConditionOperator] = useState<OakDocConditionOperator>('truthy');
  const [conditionValue, setConditionValue] = useState('');
  const [status, setStatus] = useState(
    templateId ? 'Loading OakDoc template...' : 'Import a DOCX to begin.',
  );
  const [statusKind, setStatusKind] = useState<StatusKind>('neutral');
  const [busy, setBusy] = useState(false);

  const companyQuery = useQuery({
    queryKey: ['oakdoc', 'company', companyId],
    queryFn: () => fetchCompany(companyId),
    enabled: Boolean(companyId),
    staleTime: 2 * 60 * 1000,
  });

  const company = companyQuery.data;
  const directors = useMemo(
    () => company?.officers?.filter(
      (officer) => officer.isCurrent !== false && officer.role === 'DIRECTOR',
    ) ?? [],
    [company?.officers],
  );
  const shareholders = useMemo(
    () => company?.shareholders?.filter(
      (shareholder) => shareholder.isCurrent !== false,
    ) ?? [],
    [company?.shareholders],
  );

  const visibleCategories = useMemo(() => {
    const query = fieldSearch.trim().toLowerCase();
    return OAKDOC_FIELD_CATEGORIES
      .map((category) => ({
        ...category,
        fields: category.fields.filter((field) => fieldMatches(field, query)),
      }))
      .filter((category) => category.fields.length > 0);
  }, [fieldSearch]);

  useEffect(() => {
    setSelectedDirectorId('');
    setSelectedShareholderId('');
  }, [companyId]);

  const updateFieldSummary = useCallback((bytes: Uint8Array) => {
    setFieldSummary(inspectOakDocFields(bytes, OAKDOC_FIELD_TAGS));
    setRepeaterSummary(inspectOakDocRepeaters(bytes));
    setConditionSummary(inspectOakDocConditions(bytes));
  }, []);

  const replaceDocument = useCallback((
    bytes: Uint8Array,
    message: string,
    kind: StatusKind = 'success',
  ) => {
    readyMessageRef.current = message;
    setDocumentBytes(bytes);
    setDocumentVersion((value) => value + 1);
    updateFieldSummary(bytes);
    setStatus(message);
    setStatusKind(kind);
  }, [updateFieldSummary]);

  useEffect(() => {
    const loaded = templateQuery.data;
    if (!loaded) return;
    const revision = loaded.template.revision ?? loaded.template.version;
    if (loadedTemplateRevisionRef.current === revision) return;

    loadedTemplateRevisionRef.current = revision;
    setTemplateRevision(revision);
    setTitle(loaded.template.name);
    setTemplateDescription(loaded.template.description ?? '');
    setTemplateCategory(loaded.template.category || 'OTHER');
    setTemplateIsActive(loaded.template.isActive);
    setFileName(loaded.metadata.fileName);
    replaceDocument(
      loaded.bytes,
      `Loaded OakDoc template "${loaded.template.name}" version ${revision}.`,
    );
    setIsDirty(false);
  }, [replaceDocument, templateQuery.data]);

  useEffect(() => {
    if (!templateQuery.error) return;
    setStatus(
      templateQuery.error instanceof Error
        ? templateQuery.error.message
        : 'Could not load OakDoc template.',
    );
    setStatusKind('error');
  }, [templateQuery.error]);

  useEffect(() => {
    if (!isDirty) return;

    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = '';
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [isDirty]);

  const selectionCrossesSectionBoundary = useCallback((): boolean => {
    const handle = editorRef.current;
    if (!handle || !documentBytes) return false;

    const snapshot = handle.snapshot();
    if (snapshot.selectionCollapsed || !snapshot.selection) return false;

    const from = snapshot.selection.from;
    const to = snapshot.selection.to;
    if (!('paraId' in from) || !('paraId' in to)) return false;

    const fromId = from.paraId.toUpperCase();
    const toId = to.paraId.toUpperCase();
    if (fromId === toId) return false;

    return oakDocSelectionCrossesSectionBoundary({
      docxBytes: documentBytes,
      fromParagraphId: fromId,
      toParagraphId: toId,
    });
  }, [documentBytes]);

  const collapsedCaretTouchesSectionBoundary = useCallback((): boolean => {
    const handle = editorRef.current;
    if (!handle || !documentBytes) return false;

    const snapshot = handle.snapshot();
    if (!snapshot.selectionCollapsed || !snapshot.selection) return false;
    const from = snapshot.selection.from;
    if (!('paraId' in from)) return false;

    return oakDocCaretTouchesSectionBoundary({
      docxBytes: documentBytes,
      paragraphId: from.paraId,
    });
  }, [documentBytes]);

  const repairSectionBoundaryDelete = useCallback(async () => {
    const handle = editorRef.current;
    if (!handle) return;

    setBusy(true);
    setStatus('Deleting content while preserving Word section layout...');
    setStatusKind('neutral');

    try {
      const beforeBuffer = await handle.save();
      if (!beforeBuffer) throw new Error('OakDoc could not snapshot the document before deletion.');
      const beforeBytes = new Uint8Array(beforeBuffer);

      const editor = handle.getEditor();
      const selection = editor?.snapshot().selection;
      if (!editor || !selection) {
        throw new Error('OakDoc could not resolve the selected content.');
      }

      const deleted = editor.exec({
        type: 'deleteText',
        target: selection,
      } as EditorCommand);
      if (!deleted.ok) {
        throw new Error(deleted.reason || 'OakDoc could not delete the selected content.');
      }

      const afterBuffer = await handle.save();
      if (!afterBuffer) throw new Error('OakDoc could not snapshot the document after deletion.');

      const repaired = preserveTransferredOakDocSections({
        beforeBytes,
        afterBytes: new Uint8Array(afterBuffer),
      });
      const cleaned = pruneDeletedOakDocFields(repaired.bytes, OAKDOC_FIELD_TAGS);

      if (repaired.restored > 0 || cleaned.removed > 0) {
        const sectionMessage = repaired.restored > 0
          ? ' Word section layout was preserved.'
          : '';
        const fieldMessage = cleaned.removed > 0
          ? ` Removed ${cleaned.removed} deleted OakDoc field${cleaned.removed === 1 ? '' : 's'}.`
          : '';
        replaceDocument(
          cleaned.bytes,
          `Content deleted.${sectionMessage}${fieldMessage}`,
          'success',
        );
      } else {
        setStatus('Document changed.');
        setStatusKind('neutral');
      }
      setIsDirty(true);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Could not safely delete the selection.');
      setStatusKind('error');
    } finally {
      setBusy(false);
    }
  }, [replaceDocument]);

  const repairNativeCollapsedSectionDelete = useCallback((
    beforeSave: Promise<ArrayBuffer | null>,
  ) => {
    // A collapsed caret exposes no character offset through the public editor
    // API. Start a live pre-delete serialization during capture, let the native
    // one-key delete run, then compare it with the post-transaction document.
    // The strict repair below is a no-op unless joinParagraphs transferred an
    // exact deleted w:sectPr.
    queueMicrotask(() => {
      void (async () => {
        const handle = editorRef.current;
        if (!handle) return;

        try {
          const beforeBuffer = await beforeSave;
          if (!beforeBuffer) return;
          const afterBuffer = await handle.save();
          if (!afterBuffer) return;

          const repaired = preserveTransferredOakDocSections({
            beforeBytes: new Uint8Array(beforeBuffer),
            afterBytes: new Uint8Array(afterBuffer),
          });
          if (repaired.restored === 0) return;

          const cleaned = pruneDeletedOakDocFields(repaired.bytes, OAKDOC_FIELD_TAGS);
          replaceDocument(
            cleaned.bytes,
            'Content deleted. Word section layout was preserved.',
            'success',
          );
          setIsDirty(true);
        } catch (error) {
          setStatus(
            error instanceof Error
              ? error.message
              : 'Could not verify Word section layout after deletion.',
          );
          setStatusKind('error');
        }
      })();
    });
  }, [replaceDocument]);

  const handleEditorKeyDownCapture = useCallback((
    event: ReactKeyboardEvent<HTMLElement>,
  ) => {
    if (busy || (event.key !== 'Backspace' && event.key !== 'Delete')) return;

    if (selectionCrossesSectionBoundary()) {
      // @docx-editor.dev currently transfers the later paragraph's w:sectPr
      // onto the surviving paragraph when a range delete joins across a
      // section boundary. Handle that confirmed structural case ourselves.
      event.preventDefault();
      event.stopPropagation();
      void repairSectionBoundaryDelete();
      return;
    }

    if (!collapsedCaretTouchesSectionBoundary()) return;

    const handle = editorRef.current;
    if (!handle) return;

    // For a collapsed caret, keep native Word-like Backspace/Delete semantics.
    // Begin capturing the LIVE pre-delete bytes before the native handler runs;
    // they are used only as structural evidence after the transaction.
    repairNativeCollapsedSectionDelete(handle.save());
  }, [
    busy,
    collapsedCaretTouchesSectionBoundary,
    repairNativeCollapsedSectionDelete,
    repairSectionBoundaryDelete,
    selectionCrossesSectionBoundary,
  ]);

  const currentDocxBytes = useCallback(async (): Promise<Uint8Array> => {
    const handle = editorRef.current;
    if (!handle) throw new Error('OakDoc is not ready.');
    const buffer = await handle.save();
    if (!buffer) throw new Error('OakDoc did not return a DOCX file.');
    return asUint8Array(buffer);
  }, []);

  const handleImport = useCallback(async (file: File) => {
    if (!file.name.toLowerCase().endsWith('.docx')) {
      setStatus('Please choose a Microsoft Word .docx file.');
      setStatusKind('error');
      return;
    }

    setBusy(true);
    try {
      const bytes = asUint8Array(await file.arrayBuffer());
      setFileName(file.name);
      setTitle(file.name.replace(/\.docx$/i, ''));
      readyMessageRef.current =
        'DOCX loaded. Highlight text or place the caret, then assign an Oakcloud field.';
      setDocumentBytes(bytes);
      setDocumentVersion((value) => value + 1);
      updateFieldSummary(bytes);
      setStatus(`Opening ${file.name}...`);
      setStatusKind('neutral');
      setIsDirty(true);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Could not read the DOCX file.');
      setStatusKind('error');
    } finally {
      setBusy(false);
    }
  }, [updateFieldSummary]);

  const assignField = useCallback(async (field: OakDocFieldDefinition) => {
    const handle = editorRef.current;
    const editor = handle?.getEditor();
    if (!handle || !editor) {
      setStatus('OakDoc is not ready.');
      setStatusKind('error');
      return;
    }

    setBusy(true);
    try {
      const beforeBytes = await currentDocxBytes();
      const command = {
        type: 'insertContentControl',
        subtype: 'plainText',
        tag: field.tag,
        title: field.label,
      } as EditorCommand;

      const allowed = editor.can(command);
      if (!allowed.ok) {
        throw new Error(allowed.reason || 'The current selection cannot be made into a field.');
      }

      const result = handle.exec(command);
      if (!result.ok) {
        throw new Error(result.reason || 'OakDoc could not create the Word content control.');
      }

      const afterBytes = await currentDocxBytes();
      const normalized = normalizeOakDocFields({
        beforeBytes,
        afterBytes,
        insertedField: field,
        knownTags: OAKDOC_FIELD_TAGS,
      });

      const cleanupMessage = normalized.removed > 0
        ? ` Removed ${normalized.removed} deleted field${normalized.removed === 1 ? '' : 's'}.`
        : '';

      if (normalized.seeded > 0 || normalized.removed > 0) {
        replaceDocument(
          normalized.bytes,
          `Created ${field.label} field. Empty fields display {{${field.tag}}} until resolved.${cleanupMessage}`,
        );
        setIsDirty(true);
      } else {
        updateFieldSummary(afterBytes);
        setStatus(`Created ${field.label} field around the selected text.`);
        setStatusKind('success');
        setIsDirty(true);
      }
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Could not create the Word field.');
      setStatusKind('error');
    } finally {
      setBusy(false);
    }
  }, [currentDocxBytes, replaceDocument, updateFieldSummary]);

  const addRepeater = useCallback(async (definition: OakDocRepeaterDefinition) => {
    const handle = editorRef.current;
    const editor = handle?.getEditor();
    if (!handle || !editor) {
      setStatus('OakDoc is not ready.');
      setStatusKind('error');
      return;
    }

    const selection = editor.snapshot().selection;
    if (!selection) {
      setStatus('Place the caret inside the paragraph or table row you want to repeat.');
      setStatusKind('error');
      return;
    }

    if (!('paraId' in selection.from) || !('paraId' in selection.to)) {
      setStatus(
        'OakDoc cannot create a repeating section from this structural selection. '
        + 'Place the caret inside a normal paragraph or table row.',
      );
      setStatusKind('error');
      return;
    }

    setBusy(true);
    try {
      const bytes = await currentDocxBytes();
      const created = createOakDocRepeater({
        docxBytes: bytes,
        fromParaId: selection.from.paraId,
        toParaId: selection.to.paraId,
        definition,
      });
      replaceDocument(
        created.bytes,
        `Created ${definition.label} repeating section around the current ${created.targetKind}. `
        + `Add ${definition.itemLabel.toLowerCase()} fields inside that structure, then save the template.`,
      );
      setIsDirty(true);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Could not create repeating section.');
      setStatusKind('error');
    } finally {
      setBusy(false);
    }
  }, [currentDocxBytes, replaceDocument]);

  const removeRepeaterAtCaret = useCallback(async () => {
    const handle = editorRef.current;
    const editor = handle?.getEditor();
    if (!handle || !editor) {
      setStatus('OakDoc is not ready.');
      setStatusKind('error');
      return;
    }

    const selection = editor.snapshot().selection;
    if (!selection || !('paraId' in selection.from)) {
      setStatus('Place the caret inside the repeating section you want to remove.');
      setStatusKind('error');
      return;
    }

    setBusy(true);
    try {
      const bytes = await currentDocxBytes();
      const removed = removeOakDocRepeater({
        docxBytes: bytes,
        paraId: selection.from.paraId,
      });
      const definition = OAKDOC_REPEATER_DEFINITIONS.find(
        (candidate) => candidate.tag === removed.tag,
      );
      replaceDocument(
        removed.bytes,
        `Removed ${definition?.label ?? 'OakDoc'} repeating section and kept its template row or paragraph.`,
      );
      setIsDirty(true);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Could not remove repeating section.');
      setStatusKind('error');
    } finally {
      setBusy(false);
    }
  }, [currentDocxBytes, replaceDocument]);

  const addCondition = useCallback(async () => {
    const handle = editorRef.current;
    const editor = handle?.getEditor();
    if (!handle || !editor) {
      setStatus('OakDoc is not ready.');
      setStatusKind('error');
      return;
    }

    if (!conditionField || !OAKDOC_CONDITION_FIELD_TAGS.has(conditionField)) {
      setStatus('Choose a field for the condition.');
      setStatusKind('error');
      return;
    }

    const selection = editor.snapshot().selection;
    if (!selection || !('paraId' in selection.from) || !('paraId' in selection.to)) {
      setStatus(
        'Place the caret inside the paragraph or table row you want to make conditional.',
      );
      setStatusKind('error');
      return;
    }

    setBusy(true);
    try {
      const bytes = await currentDocxBytes();
      const created = createOakDocCondition({
        docxBytes: bytes,
        fromParaId: selection.from.paraId,
        toParaId: selection.to.paraId,
        condition: {
          field: conditionField,
          operator: conditionOperator,
          ...(conditionOperator === 'truthy' ? {} : { value: conditionValue }),
        },
        allowedFields: OAKDOC_CONDITION_FIELD_TAGS,
      });
      const fieldLabel = OAKDOC_FIELD_BY_TAG.get(conditionField)?.label ?? conditionField;
      const comparison = conditionOperator === 'truthy'
        ? 'has a value'
        : conditionOperator === 'equals'
          ? `equals "${conditionValue}"`
          : `does not equal "${conditionValue}"`;
      replaceDocument(
        created.bytes,
        `Made the current ${created.targetKind} conditional: ${fieldLabel} ${comparison}.`,
      );
      setIsDirty(true);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Could not create conditional section.');
      setStatusKind('error');
    } finally {
      setBusy(false);
    }
  }, [
    conditionField,
    conditionOperator,
    conditionValue,
    currentDocxBytes,
    replaceDocument,
  ]);

  const removeConditionAtCaret = useCallback(async () => {
    const handle = editorRef.current;
    const editor = handle?.getEditor();
    if (!handle || !editor) {
      setStatus('OakDoc is not ready.');
      setStatusKind('error');
      return;
    }

    const selection = editor.snapshot().selection;
    if (!selection || !('paraId' in selection.from)) {
      setStatus('Place the caret inside the conditional section you want to remove.');
      setStatusKind('error');
      return;
    }

    setBusy(true);
    try {
      const bytes = await currentDocxBytes();
      const removed = removeOakDocCondition({
        docxBytes: bytes,
        paraId: selection.from.paraId,
      });
      const fieldLabel = OAKDOC_FIELD_BY_TAG.get(removed.condition.field)?.label
        ?? removed.condition.field;
      replaceDocument(
        removed.bytes,
        `Removed the condition based on ${fieldLabel} and kept the document content.`,
      );
      setIsDirty(true);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Could not remove conditional section.');
      setStatusKind('error');
    } finally {
      setBusy(false);
    }
  }, [currentDocxBytes, replaceDocument]);

  const generateResolvedCopy = useCallback(async () => {
    if (!company) {
      setStatus('Select a company before generating a document.');
      setStatusKind('error');
      return;
    }

    setBusy(true);
    try {
      const bytes = await currentDocxBytes();
      const cleaned = pruneDeletedOakDocFields(bytes, OAKDOC_FIELD_TAGS);
      const generatedBy = session
        ? [session.firstName, session.lastName].filter(Boolean).join(' ')
        : undefined;
      const resolutionTags = Array.from(new Set([
        ...fieldSummary.tags,
        ...conditionSummary.fieldTags,
      ]));
      const values = buildOakDocResolutionValues({
        company,
        fieldTags: resolutionTags,
        selectedDirectorId: selectedDirectorId || undefined,
        selectedShareholderId: selectedShareholderId || undefined,
        generatedBy,
      });
      const conditioned = resolveOakDocConditions({
        docxBytes: cleaned.bytes,
        values,
        allowedFields: OAKDOC_CONDITION_FIELD_TAGS,
      });
      if (conditioned.unresolvedFields.length > 0) {
        throw new Error(
          `Conditional fields are unavailable: ${conditioned.unresolvedFields.join(', ')}.`,
        );
      }
      const repeated = resolveOakDocRepeaters({
        docxBytes: conditioned.bytes,
        company,
      });
      const resolved = resolveOakDocFields(repeated.bytes, values);

      if (
        resolved.updated === 0
        && repeated.repeatersResolved === 0
        && conditioned.resolved === 0
      ) {
        throw new Error(
          'No OakDoc fields, conditional sections, or repeating sections could be resolved with the selected context.',
        );
      }

      const generatedName = safeDocxName(`${title} - ${company.name}`);
      downloadDocx(resolved.bytes, generatedName);
      const unresolvedMessage = resolved.unresolvedTags.length > 0
        ? ` ${resolved.unresolvedTags.length} field type${resolved.unresolvedTags.length === 1 ? '' : 's'} still need additional context.`
        : '';
      const conditionMessage = conditioned.resolved > 0
        ? ` Evaluated ${conditioned.resolved} conditional section${conditioned.resolved === 1 ? '' : 's'} (${conditioned.kept} kept, ${conditioned.removed} removed).`
        : '';
      const repeaterMessage = repeated.repeatersResolved > 0
        ? ` Expanded ${repeated.repeatersResolved} repeating section${repeated.repeatersResolved === 1 ? '' : 's'} into ${repeated.itemsCreated} item${repeated.itemsCreated === 1 ? '' : 's'}.`
        : '';
      setStatus(
        `Generated a resolved DOCX from ${company.name} without changing the master template.${conditionMessage}${repeaterMessage}${unresolvedMessage}`,
      );
      setStatusKind(resolved.unresolvedTags.length > 0 ? 'neutral' : 'success');
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Document generation failed.');
      setStatusKind('error');
    } finally {
      setBusy(false);
    }
  }, [
    company,
    currentDocxBytes,
    conditionSummary.fieldTags,
    fieldSummary.tags,
    selectedDirectorId,
    selectedShareholderId,
    session,
    title,
  ]);

  const saveTemplate = useCallback(async () => {
    if (!activeTenantId) {
      setStatus('Select a workspace before saving the template.');
      setStatusKind('error');
      return;
    }
    if (!title.trim()) {
      setStatus('Template name is required.');
      setStatusKind('error');
      return;
    }
    if (templateId && templateRevision === null) {
      setStatus('Template revision is still loading.');
      setStatusKind('error');
      return;
    }

    setBusy(true);
    try {
      const bytes = await currentDocxBytes();
      const cleaned = pruneDeletedOakDocFields(bytes, OAKDOC_FIELD_TAGS);
      const savedFileName = safeDocxName(fileName || title);
      const formData = new FormData();
      formData.set(
        'file',
        new File([toArrayBuffer(cleaned.bytes)], savedFileName, { type: DOCX_MIME }),
      );
      formData.set('name', title.trim());
      formData.set('description', templateDescription);
      formData.set('category', templateCategory);
      formData.set('isActive', String(templateIsActive));
      formData.set('tenantId', activeTenantId);
      const savedFields = inspectOakDocFields(cleaned.bytes, OAKDOC_FIELD_TAGS).tags;
      const savedRepeaters = inspectOakDocRepeaters(cleaned.bytes).tags;
      const savedConditions = inspectOakDocConditions(cleaned.bytes).fieldTags;
      formData.set('fieldTags', JSON.stringify(
        Array.from(new Set([
          ...savedFields,
          ...savedRepeaters,
          ...savedConditions,
        ])).sort(),
      ));
      if (templateId && templateRevision !== null) {
        formData.set('expectedRevision', String(templateRevision));
      }

      const response = await fetch(
        templateId
          ? `/api/document-templates/${encodeURIComponent(templateId)}`
          : '/api/document-templates',
        {
          method: templateId ? 'PUT' : 'POST',
          body: formData,
        },
      );
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(payload.error || 'Could not save OakDoc template.');
      }

      const savedId = String(payload.id);
      const savedRevision = Number(payload.revision ?? payload.version);
      setTemplateId(savedId);
      setTemplateRevision(savedRevision);
      loadedTemplateRevisionRef.current = savedRevision;
      setFileName(savedFileName);
      replaceDocument(
        cleaned.bytes,
        `Saved OakDoc template "${title.trim()}" version ${savedRevision}.`,
      );
      setIsDirty(false);

      if (!templateId) {
        router.replace(
          `/generated-documents/generate?editor=oakdoc&templateId=${encodeURIComponent(savedId)}`,
        );
      }
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Could not save OakDoc template.');
      setStatusKind('error');
    } finally {
      setBusy(false);
    }
  }, [
    activeTenantId,
    currentDocxBytes,
    fileName,
    replaceDocument,
    router,
    templateCategory,
    templateDescription,
    templateId,
    templateIsActive,
    templateRevision,
    title,
  ]);

  const exportDocx = useCallback(async () => {
    setBusy(true);
    try {
      const bytes = await currentDocxBytes();
      const cleaned = pruneDeletedOakDocFields(bytes, OAKDOC_FIELD_TAGS);
      const blob = new Blob([toArrayBuffer(cleaned.bytes)], { type: DOCX_MIME });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `${(fileName || 'oakdoc.docx').replace(/\.docx$/i, '')}-oakdoc.docx`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
      setStatus('Exported DOCX with native Oakcloud Word fields.');
      setStatusKind('success');
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'DOCX export failed.');
      setStatusKind('error');
    } finally {
      setBusy(false);
    }
  }, [currentDocxBytes, fileName]);

  const hasDocument = documentBytes !== null;
  const companyOptions = companiesQuery.data ?? [];

  return (
    <div className="h-[calc(100vh-1rem)] min-h-[720px] overflow-hidden bg-background-primary p-2">
      <div className="grid h-full min-h-0 grid-rows-[auto_minmax(0,1fr)] overflow-hidden rounded-lg border border-border-primary bg-background-secondary">
        <header className="flex min-w-0 flex-wrap items-center gap-2 border-b border-border-primary bg-background-primary px-3 py-2">
          <div className="mr-auto min-w-0">
            <div className="text-sm font-semibold text-text-primary">OakDoc</div>
            <div className="text-[11px] text-text-muted">
              DOCX-native Oakcloud document editor
            </div>
          </div>

          <Button
            variant="secondary"
            size="sm"
            leftIcon={<ArrowLeft className="h-4 w-4" />}
            disabled={busy}
            onClick={() => {
              if (isDirty && !window.confirm('You have unsaved OakDoc changes. Leave without saving them?')) {
                return;
              }
              router.push('/template-partials?editor=oakdoc');
            }}
          >
            Templates
          </Button>

          <input
            ref={fileInputRef}
            type="file"
            accept=".docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
            className="hidden"
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) void handleImport(file);
              event.currentTarget.value = '';
            }}
          />

          <Button
            variant="secondary"
            size="sm"
            leftIcon={<FileUp className="h-4 w-4" />}
            disabled={busy}
            onClick={() => fileInputRef.current?.click()}
          >
            Import Word
          </Button>
          <Button
            variant="secondary"
            size="sm"
            disabled={
              !hasDocument
              || !company
              || busy
              || (
                fieldSummary.count === 0
                && repeaterSummary.count === 0
                && conditionSummary.count === 0
              )
            }
            onClick={() => void generateResolvedCopy()}
          >
            Generate copy
          </Button>
          <Button
            variant="secondary"
            size="sm"
            leftIcon={<Download className="h-4 w-4" />}
            disabled={!hasDocument || busy}
            onClick={() => void exportDocx()}
          >
            Export master
          </Button>
          <Button
            variant="primary"
            size="sm"
            leftIcon={<Save className="h-4 w-4" />}
            disabled={!hasDocument || busy || !activeTenantId || !title.trim()}
            onClick={() => void saveTemplate()}
          >
            {templateId ? 'Save Template' : 'Save as Template'}
          </Button>
        </header>

        <main className="grid min-h-0 min-w-0 grid-cols-[320px_minmax(0,1fr)] overflow-hidden">
          <aside className="min-h-0 overflow-y-auto border-r border-border-primary bg-background-primary p-3">
            <section className="space-y-2">
              <div className="flex items-center justify-between gap-2">
                <div>
                  <h2 className="text-xs font-semibold uppercase tracking-wide text-text-muted">
                    Template
                  </h2>
                  <p className="mt-1 text-xs text-text-secondary">
                    Save the DOCX as the reusable Oakcloud master template.
                  </p>
                </div>
                <span className="text-[10px] text-text-muted">
                  {templateId
                    ? `v${templateRevision ?? '...'}${isDirty ? ' · Unsaved' : ''}`
                    : isDirty ? 'New · Unsaved' : 'New'}
                </span>
              </div>
              <input
                value={title}
                onChange={(event) => {
                  setTitle(event.target.value);
                  setIsDirty(true);
                }}
                placeholder="Template name"
                className="h-9 w-full rounded-lg border border-border-primary bg-background-primary px-2.5 text-sm text-text-primary placeholder:text-text-muted focus:border-oak-primary focus:outline-none focus:ring-2 focus:ring-oak-primary/20"
              />
              <select
                value={templateCategory}
                onChange={(event) => {
                  setTemplateCategory(event.target.value);
                  setIsDirty(true);
                }}
                className="h-9 w-full rounded-lg border border-border-primary bg-background-primary px-2.5 text-sm text-text-primary focus:border-oak-primary focus:outline-none focus:ring-2 focus:ring-oak-primary/20"
              >
                {TEMPLATE_CATEGORIES.map((category) => (
                  <option key={category.value} value={category.value}>
                    {category.label}
                  </option>
                ))}
              </select>
              <textarea
                value={templateDescription}
                rows={2}
                onChange={(event) => {
                  setTemplateDescription(event.target.value);
                  setIsDirty(true);
                }}
                placeholder="Description (optional)"
                className="w-full rounded-lg border border-border-primary bg-background-primary px-2.5 py-2 text-sm text-text-primary placeholder:text-text-muted focus:border-oak-primary focus:outline-none focus:ring-2 focus:ring-oak-primary/20"
              />
              <label className="flex items-center gap-2 text-xs text-text-secondary">
                <input
                  type="checkbox"
                  checked={templateIsActive}
                  onChange={(event) => {
                    setTemplateIsActive(event.target.checked);
                    setIsDirty(true);
                  }}
                />
                Active template
              </label>
            </section>

            <div className="my-4 border-t border-border-secondary" />

            <section className="space-y-2">
              <div>
                <h2 className="text-xs font-semibold uppercase tracking-wide text-text-muted">
                  Company context
                </h2>
                <p className="mt-1 text-xs text-text-secondary">
                  Select the company used when resolving OakDoc fields.
                </p>
              </div>

              <select
                className="h-9 w-full rounded-lg border border-border-primary bg-background-primary px-2.5 text-sm text-text-primary focus:border-oak-primary focus:outline-none focus:ring-2 focus:ring-oak-primary/20"
                value={companyId}
                disabled={companiesQuery.isLoading}
                onChange={(event) => setCompanyId(event.target.value)}
              >
                <option value="">
                  {companiesQuery.isLoading ? 'Loading companies...' : 'Select company...'}
                </option>
                {companyOptions.map((option) => (
                  <option key={option.id} value={option.id}>
                    {option.name}{option.uen ? ` · ${option.uen}` : ''}
                  </option>
                ))}
              </select>

              {companyId && companyQuery.isLoading ? (
                <div className="flex items-center gap-2 text-xs text-text-muted">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  Loading company context...
                </div>
              ) : null}

              {directors.length > 0 ? (
                <select
                  className="h-9 w-full rounded-lg border border-border-primary bg-background-primary px-2.5 text-sm text-text-primary focus:border-oak-primary focus:outline-none focus:ring-2 focus:ring-oak-primary/20"
                  value={selectedDirectorId}
                  onChange={(event) => setSelectedDirectorId(event.target.value)}
                >
                  <option value="">Selected director (optional)...</option>
                  {directors.map((director) => (
                    <option key={director.id} value={director.id}>
                      {director.name}
                    </option>
                  ))}
                </select>
              ) : null}

              {shareholders.length > 0 ? (
                <select
                  className="h-9 w-full rounded-lg border border-border-primary bg-background-primary px-2.5 text-sm text-text-primary focus:border-oak-primary focus:outline-none focus:ring-2 focus:ring-oak-primary/20"
                  value={selectedShareholderId}
                  onChange={(event) => setSelectedShareholderId(event.target.value)}
                >
                  <option value="">Selected shareholder (optional)...</option>
                  {shareholders.map((shareholder) => (
                    <option key={shareholder.id} value={shareholder.id}>
                      {shareholder.name}
                    </option>
                  ))}
                </select>
              ) : null}
            </section>

            <div className="my-4 border-t border-border-secondary" />

            <section className="space-y-3">
              <div>
                <div className="flex items-end justify-between gap-2">
                  <h2 className="text-xs font-semibold uppercase tracking-wide text-text-muted">
                    Repeating sections
                  </h2>
                  <span className="text-[11px] text-text-muted">
                    {repeaterSummary.count} in document
                  </span>
                </div>
                <p className="mt-1 text-xs text-text-secondary">
                  Put the caret in a paragraph or table row, then make that structure repeat for every current person.
                </p>
              </div>

              <div className="grid grid-cols-2 gap-2">
                {OAKDOC_REPEATER_DEFINITIONS.map((definition) => {
                  const present = repeaterSummary.tags.includes(definition.tag);
                  return (
                    <button
                      key={definition.tag}
                      type="button"
                      disabled={!hasDocument || busy}
                      onPointerDown={(event) => event.preventDefault()}
                      onClick={() => void addRepeater(definition)}
                      className="rounded-lg border border-border-primary bg-background-primary px-2.5 py-2 text-left transition-colors hover:border-oak-primary/40 hover:bg-oak-primary/5 disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      <span className="flex items-center justify-between gap-2">
                        <span className="text-xs font-medium text-text-primary">{definition.label}</span>
                        {present ? (
                          <span className="h-1.5 w-1.5 rounded-full bg-oak-primary" title="Used in this document" />
                        ) : null}
                      </span>
                      <span className="mt-0.5 block text-[10px] text-text-muted">{definition.tag}</span>
                    </button>
                  );
                })}
              </div>

              {repeaterSummary.count > 0 ? (
                <button
                  type="button"
                  disabled={!hasDocument || busy}
                  onClick={() => void removeRepeaterAtCaret()}
                  className="w-full rounded-md border border-border-primary px-2.5 py-2 text-xs text-text-secondary transition-colors hover:border-status-error/40 hover:bg-status-error/5 hover:text-status-error disabled:cursor-not-allowed disabled:opacity-40"
                >
                  Remove repeater at caret
                </button>
              ) : null}

              {OAKDOC_REPEATER_DEFINITIONS
                .filter((definition) => repeaterSummary.tags.includes(definition.tag))
                .map((definition) => (
                  <div key={definition.tag} className="rounded-lg border border-border-primary p-2.5">
                    <div className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-text-muted">
                      {definition.itemLabel} fields
                    </div>
                    <p className="mb-2 text-[10px] leading-relaxed text-text-muted">
                      Select sample text inside the repeated row or paragraph, then assign the matching field.
                    </p>
                    <div className="space-y-1">
                      {definition.fields.map((field) => {
                        const present = fieldSummary.tags.includes(field.tag);
                        return (
                          <button
                            key={field.tag}
                            type="button"
                            disabled={!hasDocument || busy}
                            onPointerDown={(event) => event.preventDefault()}
                            onClick={() => void assignField(field)}
                            className="flex w-full items-center justify-between gap-2 rounded-md px-2 py-1.5 text-left transition-colors hover:bg-oak-primary/5 disabled:cursor-not-allowed disabled:opacity-40"
                          >
                            <span className="min-w-0">
                              <span className="block truncate text-xs font-medium text-text-primary">
                                {field.label}
                              </span>
                              <span className="block truncate text-[10px] text-text-muted">
                                {field.tag}
                              </span>
                            </span>
                            {present ? (
                              <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-oak-primary" title="Used in this document" />
                            ) : null}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ))}
            </section>

            <div className="my-4 border-t border-border-secondary" />

            <section className="space-y-3">
              <div>
                <div className="flex items-end justify-between gap-2">
                  <h2 className="text-xs font-semibold uppercase tracking-wide text-text-muted">
                    Conditional sections
                  </h2>
                  <span className="text-[11px] text-text-muted">
                    {conditionSummary.count} in document
                  </span>
                </div>
                <p className="mt-1 text-xs text-text-secondary">
                  Choose a rule, place the caret in a paragraph or table row, then apply the condition.
                </p>
              </div>

              <select
                value={conditionField}
                onChange={(event) => setConditionField(event.target.value)}
                className="h-9 w-full rounded-lg border border-border-primary bg-background-primary px-2.5 text-sm text-text-primary focus:border-oak-primary focus:outline-none focus:ring-2 focus:ring-oak-primary/20"
              >
                {OAKDOC_FIELD_CATEGORIES.map((category) => (
                  <optgroup key={category.key} label={category.label}>
                    {category.fields.map((field) => (
                      <option key={field.key} value={field.key}>
                        {field.label}
                      </option>
                    ))}
                  </optgroup>
                ))}
              </select>

              <select
                value={conditionOperator}
                onChange={(event) => {
                  setConditionOperator(event.target.value as OakDocConditionOperator);
                  if (event.target.value === 'truthy') setConditionValue('');
                }}
                className="h-9 w-full rounded-lg border border-border-primary bg-background-primary px-2.5 text-sm text-text-primary focus:border-oak-primary focus:outline-none focus:ring-2 focus:ring-oak-primary/20"
              >
                <option value="truthy">Has a value / is true</option>
                <option value="equals">Equals</option>
                <option value="notEquals">Does not equal</option>
              </select>

              {conditionOperator !== 'truthy' ? (
                <input
                  value={conditionValue}
                  onChange={(event) => setConditionValue(event.target.value)}
                  placeholder="Comparison value"
                  className="h-9 w-full rounded-lg border border-border-primary bg-background-primary px-2.5 text-sm text-text-primary placeholder:text-text-muted focus:border-oak-primary focus:outline-none focus:ring-2 focus:ring-oak-primary/20"
                />
              ) : null}

              <button
                type="button"
                disabled={!hasDocument || busy || !conditionField}
                onPointerDown={(event) => event.preventDefault()}
                onClick={() => void addCondition()}
                className="w-full rounded-md border border-oak-primary/30 bg-oak-primary/5 px-2.5 py-2 text-xs font-medium text-oak-primary transition-colors hover:bg-oak-primary/10 disabled:cursor-not-allowed disabled:opacity-40"
              >
                Apply condition at caret
              </button>

              {conditionSummary.count > 0 ? (
                <>
                  <button
                    type="button"
                    disabled={!hasDocument || busy}
                    onPointerDown={(event) => event.preventDefault()}
                    onClick={() => void removeConditionAtCaret()}
                    className="w-full rounded-md border border-border-primary px-2.5 py-2 text-xs text-text-secondary transition-colors hover:border-status-error/40 hover:bg-status-error/5 hover:text-status-error disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    Remove condition at caret
                  </button>

                  <div className="space-y-1.5">
                    {conditionSummary.conditions.map((condition) => {
                      const fieldLabel = OAKDOC_FIELD_BY_TAG.get(condition.field)?.label
                        ?? condition.field;
                      const rule = condition.operator === 'truthy'
                        ? 'has a value'
                        : condition.operator === 'equals'
                          ? `equals "${condition.value ?? ''}"`
                          : `does not equal "${condition.value ?? ''}"`;
                      return (
                        <div
                          key={condition.id}
                          className="rounded-lg border border-border-primary bg-background-primary px-2.5 py-2"
                        >
                          <div className="truncate text-xs font-medium text-text-primary">
                            {fieldLabel}
                          </div>
                          <div className="mt-0.5 truncate text-[10px] text-text-muted">
                            {rule}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </>
              ) : null}
            </section>

            <div className="my-4 border-t border-border-secondary" />

            <section>
              <div className="mb-2 flex items-end justify-between gap-2">
                <div>
                  <h2 className="text-xs font-semibold uppercase tracking-wide text-text-muted">
                    Oakcloud fields
                  </h2>
                  <p className="mt-1 text-xs text-text-secondary">
                    Highlight text to wrap it, or place the caret to insert a field.
                  </p>
                </div>
                <span className="shrink-0 text-[11px] text-text-muted">
                  {fieldSummary.count} in document
                </span>
              </div>

              <label className="relative mb-3 block">
                <span className="sr-only">Search Oakcloud fields</span>
                <Search
                  className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-text-muted"
                  aria-hidden="true"
                />
                <input
                  type="search"
                  value={fieldSearch}
                  onChange={(event) => setFieldSearch(event.target.value)}
                  placeholder="Search fields..."
                  className="h-9 w-full rounded-lg border border-border-primary bg-background-primary pl-8 pr-2.5 text-sm text-text-primary placeholder:text-text-muted focus:border-oak-primary focus:outline-none focus:ring-2 focus:ring-oak-primary/20"
                />
              </label>

              <div className="space-y-4">
                {visibleCategories.map((category) => (
                  <div key={category.key}>
                    <h3 className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-text-muted">
                      {category.label}
                    </h3>
                    <div className="space-y-1">
                      {category.fields.map((field) => {
                        const definition = fieldDefinition(field, category.label);
                        const present = fieldSummary.tags.includes(field.key);
                        return (
                          <button
                            key={field.key}
                            type="button"
                            disabled={!hasDocument || busy}
                            onPointerDown={(event) => event.preventDefault()}
                            onClick={() => void assignField(definition)}
                            className="flex w-full items-center justify-between gap-2 rounded-md border border-transparent px-2.5 py-2 text-left transition-colors hover:border-oak-primary/20 hover:bg-oak-primary/5 disabled:cursor-not-allowed disabled:opacity-40"
                          >
                            <span className="min-w-0">
                              <span className="block truncate text-xs font-medium text-text-primary">
                                {field.label}
                              </span>
                              <span className="block truncate text-[10px] text-text-muted">
                                {field.key}
                              </span>
                            </span>
                            {present ? (
                              <span
                                className="h-1.5 w-1.5 shrink-0 rounded-full bg-oak-primary"
                                title="Used in this document"
                              />
                            ) : null}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            </section>

            <div className="my-4 border-t border-border-secondary" />

            <section className="space-y-2">
              <h2 className="text-xs font-semibold uppercase tracking-wide text-text-muted">
                Document fields
              </h2>
              {fieldSummary.tags.length > 0 ? (
                <div className="flex flex-wrap gap-1.5">
                  {fieldSummary.tags.map((tag) => (
                    <span
                      key={tag}
                      className="rounded-md bg-background-tertiary px-1.5 py-1 text-[10px] text-text-secondary"
                      title={OAKDOC_FIELD_BY_TAG.get(tag)?.label ?? tag}
                    >
                      {tag}
                    </span>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-text-muted">No OakDoc fields yet.</p>
              )}

              <div className={`rounded-lg border p-2.5 text-xs leading-relaxed ${statusClasses(statusKind)}`}>
                {busy ? (
                  <span className="inline-flex items-center gap-2">
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    {status}
                  </span>
                ) : status}
              </div>
            </section>
          </aside>

          <section
            className="relative min-h-0 min-w-0 overflow-hidden bg-[#eef0f2]"
            onKeyDownCapture={handleEditorKeyDownCapture}
          >
            {documentBytes ? (
              <DocxEditor
                key={documentVersion}
                ref={editorRef}
                document={documentBytes}
                title={title}
                onTitleChange={(value) => {
                  setTitle(value);
                  setIsDirty(true);
                }}
                mode="edit"
                zoomMode="auto"
                locale="en-SG"
                colorMode="light"
                menu={{ reportIssue: false }}
                onOpen={() => fileInputRef.current?.click()}
                onSave={() => void saveTemplate()}
                onReady={() => {
                  const message = readyMessageRef.current || 'DOCX ready.';
                  readyMessageRef.current = '';
                  setStatus(message);
                  setStatusKind('success');
                }}
                onChange={() => {
                  if (!readyMessageRef.current) {
                    setIsDirty(true);
                    setStatus('Document changed.');
                    setStatusKind('neutral');
                  }
                }}
                className="h-full min-h-0"
              />
            ) : (
              <div className="absolute inset-6 grid place-items-center">
                <div className="max-w-lg rounded-xl border border-dashed border-border-primary bg-background-primary p-8 text-center shadow-sm">
                  <div className="text-sm font-semibold text-text-primary">
                    Import an existing Microsoft Word template
                  </div>
                  <p className="mt-2 text-sm leading-relaxed text-text-secondary">
                    OakDoc keeps DOCX as the native document format and uses Word content controls
                    for Oakcloud fields.
                  </p>
                  <Button
                    variant="primary"
                    size="sm"
                    className="mt-4"
                    leftIcon={<FileUp className="h-4 w-4" />}
                    onClick={() => fileInputRef.current?.click()}
                  >
                    Import Word .docx
                  </Button>
                </div>
              </div>
            )}
          </section>
        </main>
      </div>
    </div>
  );
}
