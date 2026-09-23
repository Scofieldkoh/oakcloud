'use client';

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { DocxEditor, type DocxEditorRef, type EditorCommand } from '@docx-editor.dev/react';
import { useQuery } from '@tanstack/react-query';
import { Download, FileUp, Loader2, Search } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useSession } from '@/hooks/use-auth';
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

const DOCX_MIME =
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

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

const OAKDOC_FIELDS: readonly OakDocFieldDefinition[] = OAKDOC_FIELD_CATEGORIES.flatMap(
  (category) =>
    category.fields.map((field) => ({
      tag: field.key,
      label: field.label,
      category: category.label,
    })),
);

const OAKDOC_FIELD_BY_TAG = new Map(
  OAKDOC_FIELDS.map((field) => [field.tag, field]),
);

const OAKDOC_FIELD_TAGS = new Set(OAKDOC_FIELDS.map((field) => field.tag));

interface CompanyOption {
  id: string;
  name: string;
  uen: string;
}

interface CompanyOptionsResponse {
  options: CompanyOption[];
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

  const { data: session } = useSession();
  const companiesQuery = useQuery({
    queryKey: ['oakdoc', 'company-options'],
    queryFn: fetchCompanyOptions,
    staleTime: 5 * 60 * 1000,
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
  const [status, setStatus] = useState('Import a DOCX to begin.');
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
      } else {
        updateFieldSummary(afterBytes);
        setStatus(`Created ${field.label} field around the selected text.`);
        setStatusKind('success');
      }
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Could not create the Word field.');
      setStatusKind('error');
    } finally {
      setBusy(false);
    }
  }, [currentDocxBytes, replaceDocument, updateFieldSummary]);

  const resolveFields = useCallback(async () => {
    if (!company) {
      setStatus('Select a company before resolving fields.');
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
      const values = buildOakDocResolutionValues({
        company,
        fieldTags: fieldSummary.tags,
        selectedDirectorId: selectedDirectorId || undefined,
        selectedShareholderId: selectedShareholderId || undefined,
        generatedBy,
      });
      const resolved = resolveOakDocFields(cleaned.bytes, values);

      if (resolved.updated === 0) {
        throw new Error('No OakDoc fields could be resolved with the selected context.');
      }

      const unresolvedMessage = resolved.unresolvedTags.length > 0
        ? ` ${resolved.unresolvedTags.length} field type${resolved.unresolvedTags.length === 1 ? '' : 's'} still need additional context.`
        : '';

      replaceDocument(
        resolved.bytes,
        `Resolved ${resolved.updated} field${resolved.updated === 1 ? '' : 's'} from ${company.name}.${unresolvedMessage}`,
        resolved.unresolvedTags.length > 0 ? 'neutral' : 'success',
      );
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Field resolution failed.');
      setStatusKind('error');
    } finally {
      setBusy(false);
    }
  }, [
    company,
    currentDocxBytes,
    fieldSummary.tags,
    replaceDocument,
    selectedDirectorId,
    selectedShareholderId,
    session,
  ]);

  const exportDocx = useCallback(async () => {
    setBusy(true);
    try {
      const bytes = await currentDocxBytes();
      const cleaned = pruneDeletedOakDocFields(bytes, OAKDOC_FIELD_TAGS);
      const blob = new Blob([cleaned.bytes], { type: DOCX_MIME });
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
            disabled={!hasDocument || !company || busy || fieldSummary.count === 0}
            onClick={() => void resolveFields()}
          >
            Resolve fields
          </Button>
          <Button
            variant="primary"
            size="sm"
            leftIcon={<Download className="h-4 w-4" />}
            disabled={!hasDocument || busy}
            onClick={() => void exportDocx()}
          >
            Export DOCX
          </Button>
        </header>

        <main className="grid min-h-0 min-w-0 grid-cols-[320px_minmax(0,1fr)] overflow-hidden">
          <aside className="min-h-0 overflow-y-auto border-r border-border-primary bg-background-primary p-3">
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

          <section className="relative min-h-0 min-w-0 overflow-hidden bg-[#eef0f2]">
            {documentBytes ? (
              <DocxEditor
                key={documentVersion}
                ref={editorRef}
                document={documentBytes}
                title={title}
                onTitleChange={setTitle}
                mode="edit"
                zoomMode="auto"
                locale="en-SG"
                colorMode="light"
                menu={{ reportIssue: false }}
                onOpen={() => fileInputRef.current?.click()}
                onSave={() => void exportDocx()}
                onReady={() => {
                  const message = readyMessageRef.current || 'DOCX ready.';
                  readyMessageRef.current = '';
                  setStatus(message);
                  setStatusKind('success');
                }}
                onChange={() => {
                  if (!readyMessageRef.current) {
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
