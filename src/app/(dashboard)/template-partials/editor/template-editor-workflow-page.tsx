'use client';

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type MouseEvent,
} from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  AlertCircle,
  ArrowLeft,
  Code,
  FileText,
  Loader2,
  Save,
  TestTube2,
} from 'lucide-react';
import { useSession } from '@/hooks/use-auth';
import { useUnsavedNavigationGuard } from '@/hooks/use-unsaved-navigation-guard';
import { useActiveWorkspaceId } from '@/components/ui/workspace-selector';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/toast';
import {
  A4PageEditor,
  type A4PageEditorRef,
} from '@/components/documents/a4-page-editor';
import type { A4EditorSnapshot } from '@/components/documents/a4-pagination/editor-session';
import {
  DEFAULT_A4_DOCUMENT_LAYOUT,
  extractA4DocumentLayout,
  mergeA4DocumentLayout,
  type A4DocumentLayout,
} from '@/components/documents/a4-pagination/layout';
import {
  AISidebar,
  useAISidebar,
  type DocumentCategory,
} from '@/components/documents/ai-sidebar';
import { PlaceholderPanel } from '@/components/documents/template-editor/placeholder-panel';
import {
  TemplateEditorPanel,
  type ResizablePanelState,
} from '@/components/documents/template-editor/template-editor-panel';
import type {
  TemplateEditorPartialForm,
  TemplateEditorTemplateForm,
} from '@/components/documents/template-editor/template-details-panel';
import {
  removeCustomPlaceholderReferences,
} from '@/components/documents/template-editor/template-editor-state';
import { insertTemplateSnippet } from '@/components/documents/template-editor/template-insertion';
import {
  inferLegacyCustomPlaceholders,
  standardTemplateKeys,
} from '@/components/documents/template-editor/template-field-catalog';
import {
  validateTemplate,
  validateTemplateSyntax,
} from '@/components/documents/template-editor/template-validation';
import {
  editorPlaceholdersToStorage,
  storagePlaceholdersToEditor,
  type StoredEditorPlaceholder,
} from '@/lib/template-placeholder-storage';
import type {
  CustomPlaceholderDefinition,
  MergedPlaceholder,
  MockDataValues,
  TemplatePartialData,
} from '@/types/placeholders';

const DEFAULT_PANEL_WIDTH = 380;
const MIN_PANEL_WIDTH = 320;
const MAX_PANEL_WIDTH = 600;

const DEFAULT_MOCK_DATA: MockDataValues = {
  company: {
    name: 'Sample Company Pte Ltd',
    uen: '202312345A',
    registeredAddress: '123 Sample Street, Singapore 123456',
    address: {
      block: '123',
      street: 'Sample Street',
      level: '',
      unit: '',
      building: '',
      postalCode: '123456',
    },
    incorporationDate: new Date('2023-01-15'),
    entityType: 'Private Limited Company',
    capital: 100000,
  },
  directors: [],
  shareholders: [],
  custom: {},
  system: {
    currentDate: new Date(),
    generatedBy: 'System User',
  },
};

type EditorType = 'template' | 'partial';

type TemplateFormData = TemplateEditorTemplateForm & {
  customPlaceholders: CustomPlaceholderDefinition[];
};

type PartialFormData = TemplateEditorPartialForm & {
  customPlaceholders: CustomPlaceholderDefinition[];
};

interface ExistingTemplate {
  id: string;
  revision: number;
  version: number;
  name: string;
  description?: string | null;
  category: string;
  compositionType: 'STANDARD' | 'SERVICE_AGREEMENT';
  content: string;
  contentJson?: unknown;
  placeholders?: unknown;
  isActive: boolean;
  sharePointRelativeFolderPath?: string | null;
}

interface ExistingPartial {
  id: string;
  revision: number;
  version: number;
  name: string;
  displayName?: string | null;
  description?: string | null;
  content: string;
  placeholders?: unknown;
}

interface ApiErrorPayload {
  error?: string;
  details?: { currentRevision?: number };
}

interface SaveAcknowledgement {
  sessionKey: string;
  localRevision: number;
  formRevision: number;
}

function randomKey(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? { ...(value as Record<string, unknown>) }
    : {};
}

function asStoredPlaceholders(value: unknown): StoredEditorPlaceholder[] {
  let parsed = value;
  if (typeof parsed === 'string') {
    try {
      parsed = JSON.parse(parsed);
    } catch {
      parsed = [];
    }
  }
  return Array.isArray(parsed) ? parsed as StoredEditorPlaceholder[] : [];
}

function useResizablePanel(): ResizablePanelState {
  const [width, setWidth] = useState(DEFAULT_PANEL_WIDTH);
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [isResizing, setIsResizing] = useState(false);
  const widthRef = useRef(width);
  widthRef.current = width;

  const startResize = useCallback((event: MouseEvent, direction: 'left' | 'right') => {
    event.preventDefault();
    const startX = event.clientX;
    const startWidth = widthRef.current;
    setIsResizing(true);
    const onMove = (move: globalThis.MouseEvent) => {
      const delta = direction === 'right'
        ? move.clientX - startX
        : startX - move.clientX;
      setWidth(Math.min(MAX_PANEL_WIDTH, Math.max(MIN_PANEL_WIDTH, startWidth + delta)));
    };
    const onUp = () => {
      setIsResizing(false);
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
    };
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  }, []);

  return {
    width: isCollapsed ? 40 : width,
    isCollapsed,
    isResizing,
    startResize,
    toggle: () => setIsCollapsed((value) => !value),
  };
}

function PreviewDataPanel({
  mockData,
  onMockDataChange,
  customPlaceholders,
  onPreview,
  isPreviewLoading,
  previewError,
}: {
  mockData: MockDataValues;
  onMockDataChange: (data: MockDataValues) => void;
  customPlaceholders: CustomPlaceholderDefinition[];
  onPreview(): void;
  isPreviewLoading: boolean;
  previewError: string | null;
}) {
  const custom = mockData.custom as Record<string, string | number | Date | undefined>;
  return (
    <div className="space-y-3">
      <div className="rounded-md border border-border-primary bg-background-secondary p-3">
        <p className="text-xs font-medium text-text-primary">Preview context</p>
        <p className="mt-1 text-[11px] text-text-muted">
          Test renders use the current unsaved editor snapshot and the values below.
        </p>
      </div>
      <label className="block text-xs font-medium text-text-secondary">
        Sample company name
        <input
          value={mockData.company.name}
          onChange={(event) => onMockDataChange({
            ...mockData,
            company: { ...mockData.company, name: event.target.value },
          })}
          className="mt-1 h-8 w-full rounded-md border border-border-primary bg-background-primary px-2 text-xs text-text-primary"
        />
      </label>
      <label className="block text-xs font-medium text-text-secondary">
        Sample UEN
        <input
          value={mockData.company.uen}
          onChange={(event) => onMockDataChange({
            ...mockData,
            company: { ...mockData.company, uen: event.target.value },
          })}
          className="mt-1 h-8 w-full rounded-md border border-border-primary bg-background-primary px-2 text-xs text-text-primary"
        />
      </label>
      {customPlaceholders.map((field) => {
        const raw = custom[field.key] ?? field.defaultValue ?? '';
        const value = raw instanceof Date ? raw.toISOString().slice(0, 10) : String(raw);
        return (
          <label key={field.fieldIdentity ?? field.id} className="block text-xs font-medium text-text-secondary">
            {field.label}
            {field.type === 'textarea' ? (
              <textarea
                value={value}
                rows={2}
                onChange={(event) => onMockDataChange({
                  ...mockData,
                  custom: { ...mockData.custom, [field.key]: event.target.value },
                })}
                className="mt-1 w-full rounded-md border border-border-primary bg-background-primary px-2 py-1 text-xs text-text-primary"
              />
            ) : field.type === 'boolean' ? (
              <input
                type="checkbox"
                checked={value === 'true' || value === '1'}
                onChange={(event) => onMockDataChange({
                  ...mockData,
                  custom: { ...mockData.custom, [field.key]: event.target.checked ? 'true' : 'false' },
                })}
                className="ml-2 align-middle"
              />
            ) : (
              <input
                type={field.type === 'date' ? 'date' : field.type === 'number' || field.type === 'currency' ? 'number' : 'text'}
                value={value}
                onChange={(event) => onMockDataChange({
                  ...mockData,
                  custom: { ...mockData.custom, [field.key]: event.target.value },
                })}
                className="mt-1 h-8 w-full rounded-md border border-border-primary bg-background-primary px-2 text-xs text-text-primary"
              />
            )}
          </label>
        );
      })}
      {previewError && (
        <div role="alert" className="rounded-md border border-status-error/30 bg-status-error/10 p-2 text-xs text-status-error">
          {previewError}
        </div>
      )}
      <Button
        variant="primary"
        size="sm"
        onClick={onPreview}
        isLoading={isPreviewLoading}
        disabled={isPreviewLoading}
        leftIcon={<TestTube2 className="h-4 w-4" />}
      >
        Render current snapshot
      </Button>
    </div>
  );
}

export function TemplateEditorWorkflowPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const queryClient = useQueryClient();
  const { data: session } = useSession();
  const { success, error: toastError } = useToast();
  const editorRef = useRef<A4PageEditorRef>(null);
  const editorInstanceRef = useRef<string | null>(null);
  if (editorInstanceRef.current === null) editorInstanceRef.current = randomKey();

  const editorType: EditorType = searchParams.get('type') === 'partial' ? 'partial' : 'template';
  const isPartialMode = editorType === 'partial';
  const itemId = searchParams.get('id');
  const isEditMode = Boolean(itemId);
  const sourceTab = searchParams.get('tab');
  const backTab = sourceTab === 'services' || sourceTab === 'partials'
    ? sourceTab
    : isPartialMode ? 'partials' : null;
  const backHref = backTab ? `/template-partials?tab=${backTab}` : '/template-partials';
  const backLabel = backTab === 'services'
    ? 'Back to Services'
    : backTab === 'partials' ? 'Back to Partials' : 'Back to Templates';
  const activeTenantId = useActiveWorkspaceId(
    session?.isSuperAdmin ?? false,
    session?.tenantId,
  );
  const editorSessionKey = useMemo(
    () => `${editorType}:${itemId ?? `new:${editorInstanceRef.current}`}`,
    [editorType, itemId],
  );

  const [formData, setFormData] = useState<TemplateFormData>({
    name: '',
    description: '',
    category: 'OTHER',
    compositionType: 'STANDARD',
    content: '',
    isActive: true,
    sharePointRelativeFolderPath: null,
    titleDateFieldKey: null,
    layout: DEFAULT_A4_DOCUMENT_LAYOUT,
    customPlaceholders: [],
  });
  const [partialFormData, setPartialFormData] = useState<PartialFormData>({
    name: '',
    displayName: '',
    description: '',
    content: '',
    customPlaceholders: [],
  });
  const [templateContentJson, setTemplateContentJson] = useState<Record<string, unknown>>({});
  const [partialPlaceholderLinkings, setPartialPlaceholderLinkings] = useState<Record<string, string>>({});
  const [isDirty, setIsDirty] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [formError, setFormError] = useState('');
  const [previewContent, setPreviewContent] = useState('');
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [isPreviewLoading, setIsPreviewLoading] = useState(false);
  const [mockData, setMockData] = useState<MockDataValues>(DEFAULT_MOCK_DATA);

  const navigationGuard = useUnsavedNavigationGuard(isDirty, {
    description: 'You have unsaved changes. Leave without saving them?',
  });
  const panel = useResizablePanel();
  const formRevisionRef = useRef(0);
  const serverRevisionRef = useRef<number | null>(null);
  const persistedIdRef = useRef<string | null>(itemId);
  const hydratedEntityRef = useRef<string | null>(null);
  const latestSnapshotRef = useRef<A4EditorSnapshot | null>(null);
  const acknowledgedRef = useRef<SaveAcknowledgement | null>(null);
  const saveInFlightRef = useRef<Promise<void> | null>(null);
  const previewSequenceRef = useRef(0);

  const aiSidebar = useAISidebar({
    mode: 'template_editor',
    templateCategory: formData.category as DocumentCategory,
    templateName: formData.name,
    tenantId: activeTenantId,
  });

  const existingTemplateQuery = useQuery({
    queryKey: ['document-template', itemId, activeTenantId],
    queryFn: async (): Promise<ExistingTemplate | null> => {
      if (!itemId || !activeTenantId) return null;
      const response = await fetch(`/api/document-templates/${itemId}?tenantId=${activeTenantId}`);
      if (!response.ok) throw new Error('Failed to fetch template');
      return response.json();
    },
    enabled: Boolean(itemId && !isPartialMode && activeTenantId),
  });

  const existingPartialQuery = useQuery({
    queryKey: ['template-partial', itemId, activeTenantId],
    queryFn: async (): Promise<ExistingPartial | null> => {
      if (!itemId || !activeTenantId) return null;
      const response = await fetch(`/api/template-partials/${itemId}?tenantId=${activeTenantId}`);
      if (!response.ok) throw new Error('Failed to fetch partial');
      return response.json();
    },
    enabled: Boolean(itemId && isPartialMode && activeTenantId),
  });

  const partialsQuery = useQuery({
    queryKey: ['template-partials', activeTenantId, 'all'],
    queryFn: async (): Promise<{ partials: TemplatePartialData[] }> => {
      if (!activeTenantId) return { partials: [] };
      const response = await fetch(`/api/template-partials?tenantId=${activeTenantId}&all=true`);
      if (!response.ok) throw new Error('Failed to fetch partials');
      return response.json();
    },
    enabled: Boolean(activeTenantId),
  });

  const markFormChanged = useCallback(() => {
    formRevisionRef.current += 1;
    setIsDirty(true);
  }, []);

  const recomputeDirty = useCallback((snapshot: A4EditorSnapshot | null = latestSnapshotRef.current) => {
    const acknowledged = acknowledgedRef.current;
    if (!acknowledged || !snapshot) return;
    setIsDirty(
      snapshot.sessionKey !== acknowledged.sessionKey
      || snapshot.revision !== acknowledged.localRevision
      || formRevisionRef.current !== acknowledged.formRevision,
    );
  }, []);

  useEffect(() => {
    const existing = existingTemplateQuery.data;
    if (!existing || isPartialMode) return;
    const hydrateKey = `template:${existing.id}:${activeTenantId}`;
    if (hydratedEntityRef.current === hydrateKey) return;
    hydratedEntityRef.current = hydrateKey;

    const stored = asStoredPlaceholders(existing.placeholders);
    const ownStored = stored.filter((field) => !field.sourcePartial);
    const ownFields = inferLegacyCustomPlaceholders(
      existing.content ?? '',
      storagePlaceholdersToEditor(ownStored),
    );
    const linkings: Record<string, string> = {};
    for (const field of stored) {
      if (!field.sourcePartial || !field.linkedTo || typeof field.key !== 'string') continue;
      linkings[field.key.replace(/^custom\./, '')] = field.linkedTo;
    }
    const contentJson = asRecord(existing.contentJson);
    setTemplateContentJson(contentJson);
    setFormData({
      name: existing.name ?? '',
      description: existing.description ?? '',
      category: existing.category ?? 'OTHER',
      compositionType: existing.compositionType ?? 'STANDARD',
      content: existing.content ?? '',
      isActive: existing.isActive ?? true,
      sharePointRelativeFolderPath: existing.sharePointRelativeFolderPath ?? null,
      titleDateFieldKey: typeof contentJson.documentTitleDateFieldKey === 'string'
        ? contentJson.documentTitleDateFieldKey
        : null,
      layout: extractA4DocumentLayout(contentJson),
      customPlaceholders: ownFields,
    });
    setPartialPlaceholderLinkings(linkings);
    persistedIdRef.current = existing.id;
    serverRevisionRef.current = existing.revision ?? existing.version;
    formRevisionRef.current = 0;
    latestSnapshotRef.current = null;
    acknowledgedRef.current = null;
    setIsDirty(false);
  }, [activeTenantId, existingTemplateQuery.data, isPartialMode]);

  useEffect(() => {
    const existing = existingPartialQuery.data;
    if (!existing || !isPartialMode) return;
    const hydrateKey = `partial:${existing.id}:${activeTenantId}`;
    if (hydratedEntityRef.current === hydrateKey) return;
    hydratedEntityRef.current = hydrateKey;
    setPartialFormData({
      name: existing.name ?? '',
      displayName: existing.displayName ?? existing.name ?? '',
      description: existing.description ?? '',
      content: existing.content ?? '',
      customPlaceholders: storagePlaceholdersToEditor(asStoredPlaceholders(existing.placeholders)),
    });
    persistedIdRef.current = existing.id;
    serverRevisionRef.current = existing.revision ?? existing.version;
    formRevisionRef.current = 0;
    latestSnapshotRef.current = null;
    acknowledgedRef.current = null;
    setIsDirty(false);
  }, [activeTenantId, existingPartialQuery.data, isPartialMode]);

  const partials = partialsQuery.data?.partials ?? [];

  const extractPartialReferences = useCallback((content: string): string[] => {
    const matches = content.matchAll(/\{\{(?:>|&gt;|&#62;|&#x3[eE];)\s*([a-zA-Z][a-zA-Z0-9_-]*)\s*\}\}/g);
    return Array.from(new Set(Array.from(matches, (match) => match[1]).filter(Boolean)));
  }, []);

  const mergedPlaceholders = useMemo<MergedPlaceholder[]>(() => {
    if (isPartialMode) return [];
    const result: MergedPlaceholder[] = formData.customPlaceholders.map((field) => ({
      ...field,
      source: 'template' as const,
    }));
    const seen = new Set(result.map((field) => field.key));
    for (const partialName of extractPartialReferences(formData.content)) {
      const partial = partials.find((candidate) => candidate.name === partialName);
      if (!partial) continue;
      for (const field of storagePlaceholdersToEditor(asStoredPlaceholders(partial.placeholders))) {
        const key = seen.has(field.key) ? `${partialName}_${field.key}` : field.key;
        result.push({
          ...field,
          key,
          source: 'partial',
          sourceName: partialName,
          sourceDisplayName: partial.displayName ?? partialName,
          sourcePartial: partialName,
          linkedTo: partialPlaceholderLinkings[key],
        });
        seen.add(key);
      }
    }
    return result;
  }, [extractPartialReferences, formData.content, formData.customPlaceholders, isPartialMode, partialPlaceholderLinkings, partials]);

  const titleDateFields = useMemo(
    () => mergedPlaceholders.filter((field) => field.type === 'date'),
    [mergedPlaceholders],
  );
  const templateBooleanPlaceholders = useMemo(
    () => formData.customPlaceholders.filter((field) => field.type === 'boolean'),
    [formData.customPlaceholders],
  );

  const validationIssues = useMemo(() => {
    const currentContent = isPartialMode ? partialFormData.content : formData.content;
    const ownFields = isPartialMode
      ? partialFormData.customPlaceholders
      : formData.customPlaceholders;
    const knownKeys = new Set(standardTemplateKeys());
    for (const field of [...ownFields, ...mergedPlaceholders]) {
      knownKeys.add(field.storageSource === 'service' ? field.key : `custom.${field.key}`);
    }
    for (const partial of partials) {
      knownKeys.add(partial.name);
      knownKeys.add(`partial.${partial.name}`);
    }
    if (isPartialMode) return validateTemplateSyntax(currentContent, knownKeys);
    return validateTemplate({
      compositionType: formData.compositionType,
      content: currentContent,
      placeholders: Array.from(knownKeys, (key) => ({ key })),
    });
  }, [formData.compositionType, formData.content, formData.customPlaceholders, isPartialMode, mergedPlaceholders, partialFormData.content, partialFormData.customPlaceholders, partials]);

  const handleSnapshotChange = useCallback((snapshot: A4EditorSnapshot) => {
    latestSnapshotRef.current = snapshot;
    if (isPartialMode) {
      setPartialFormData((previous) => previous.content === snapshot.content
        ? previous
        : { ...previous, content: snapshot.content });
    } else {
      setFormData((previous) => previous.content === snapshot.content
        ? previous
        : { ...previous, content: snapshot.content });
      setTemplateContentJson((previous) => ({ ...previous, ...snapshot.contentJson }));
    }

    if (!acknowledgedRef.current) {
      acknowledgedRef.current = {
        sessionKey: snapshot.sessionKey,
        localRevision: snapshot.revision,
        formRevision: formRevisionRef.current,
      };
      setIsDirty(false);
      return;
    }
    recomputeDirty(snapshot);
  }, [isPartialMode, recomputeDirty]);

  const handleTemplateChange = useCallback((changes: Partial<TemplateEditorTemplateForm>) => {
    setFormData((previous) => ({ ...previous, ...changes }));
    markFormChanged();
  }, [markFormChanged]);

  const handlePartialChange = useCallback((changes: Partial<TemplateEditorPartialForm>) => {
    setPartialFormData((previous) => ({ ...previous, ...changes }));
    markFormChanged();
  }, [markFormChanged]);

  const handleCustomPlaceholdersChange = useCallback((fields: CustomPlaceholderDefinition[]) => {
    if (isPartialMode) {
      setPartialFormData((previous) => {
        const removed = previous.customPlaceholders
          .filter((field) => !fields.some((next) => next.id === field.id))
          .map((field) => field.key);
        return {
          ...previous,
          customPlaceholders: fields,
          content: removeCustomPlaceholderReferences(previous.content, removed),
        };
      });
    } else {
      setFormData((previous) => {
        const removed = previous.customPlaceholders
          .filter((field) => !fields.some((next) => next.id === field.id))
          .map((field) => field.key);
        return {
          ...previous,
          customPlaceholders: fields,
          content: removeCustomPlaceholderReferences(previous.content, removed),
        };
      });
    }
    markFormChanged();
  }, [isPartialMode, markFormChanged]);

  const handlePreview = useCallback(async () => {
    if (isPartialMode) return;
    const snapshotResult = editorRef.current?.prepareSnapshot();
    if (!snapshotResult?.ok) {
      const message = snapshotResult?.message ?? 'The editor is still reconciling input.';
      setPreviewError(message);
      return;
    }
    const snapshot = snapshotResult.snapshot;
    if (!snapshot.content.trim()) {
      setPreviewError('Add content before rendering a preview.');
      return;
    }
    const requestSequence = ++previewSequenceRef.current;
    const requestFormRevision = formRevisionRef.current;
    const contextFingerprint = JSON.stringify(mockData);
    setIsPreviewLoading(true);
    setPreviewError(null);

    const templatePlaceholders = editorPlaceholdersToStorage(formData.customPlaceholders);
    const partialPlaceholders = editorPlaceholdersToStorage(
      mergedPlaceholders
        .filter((field) => field.source === 'partial' && field.storageSource !== 'service')
        .map((field) => ({
          ...field,
          sourcePartial: field.sourcePartial || field.sourceName,
        })),
    );
    const contentJson = {
      ...mergeA4DocumentLayout(
        { ...templateContentJson, ...snapshot.contentJson },
        formData.layout,
      ),
      documentTitleDateFieldKey: formData.titleDateFieldKey || null,
    };

    try {
      const response = await fetch('/api/document-templates/render-test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          content: snapshot.content,
          contentJson,
          placeholders: [...templatePlaceholders, ...partialPlaceholders],
          compositionType: formData.compositionType,
          name: formData.name || 'Unsaved template',
          category: formData.category,
          customData: mockData.custom,
          context: mockData,
        }),
      });
      if (!response.ok) {
        const payload = await response.json().catch(() => ({})) as ApiErrorPayload;
        throw new Error(payload.error || 'Failed to generate preview');
      }
      const payload = await response.json() as {
        preview?: { content?: string; contentHtml?: string };
      };
      const currentSnapshot = latestSnapshotRef.current;
      const stillCurrent = requestSequence === previewSequenceRef.current
        && currentSnapshot?.sessionKey === snapshot.sessionKey
        && currentSnapshot.revision === snapshot.revision
        && formRevisionRef.current === requestFormRevision
        && JSON.stringify(mockData) === contextFingerprint;
      if (!stillCurrent) return;
      setPreviewContent(
        payload.preview?.content
        ?? payload.preview?.contentHtml
        ?? '<p>No content to preview</p>',
      );
    } catch (caught) {
      if (requestSequence !== previewSequenceRef.current) return;
      const message = caught instanceof Error ? caught.message : 'Failed to generate preview';
      setPreviewError(message);
    } finally {
      if (requestSequence === previewSequenceRef.current) setIsPreviewLoading(false);
    }
  }, [formData.category, formData.compositionType, formData.customPlaceholders, formData.layout, formData.name, formData.titleDateFieldKey, isPartialMode, mergedPlaceholders, mockData, templateContentJson]);

  const handleSave = useCallback(async () => {
    if (saveInFlightRef.current) return saveInFlightRef.current;

    const run = async () => {
      setFormError('');
      if (!activeTenantId) {
        setFormError('Please select a workspace');
        return;
      }
      const blocking = validationIssues.find((issue) => issue.severity === 'error');
      if (blocking) {
        setFormError(blocking.message);
        return;
      }
      const snapshotResult = editorRef.current?.prepareSnapshot();
      if (!snapshotResult?.ok) {
        setFormError(snapshotResult?.message ?? 'The editor is still reconciling input.');
        return;
      }
      const snapshot = snapshotResult.snapshot;
      const savedFormRevision = formRevisionRef.current;

      if (isPartialMode) {
        if (!partialFormData.displayName.trim()) {
          setFormError('Partial name is required');
          return;
        }
        if (!partialFormData.name.trim()) {
          setFormError('Partial identifier is required');
          return;
        }
      } else if (!formData.name.trim()) {
        setFormError('Template name is required');
        return;
      }
      if (!snapshot.content.trim()) {
        setFormError(`${isPartialMode ? 'Partial' : 'Template'} content is required`);
        return;
      }

      setIsSaving(true);
      try {
        let response: Response;
        const persistedId = persistedIdRef.current;
        const expectedRevision = serverRevisionRef.current;
        if (isPartialMode) {
          const body = {
            name: partialFormData.name,
            displayName: partialFormData.displayName,
            description: partialFormData.description || null,
            content: snapshot.content,
            placeholders: editorPlaceholdersToStorage(partialFormData.customPlaceholders),
            ...(persistedId && expectedRevision !== null ? { expectedRevision } : {}),
            ...(!persistedId ? { tenantId: activeTenantId } : {}),
          };
          response = await fetch(
            persistedId ? `/api/template-partials/${persistedId}` : '/api/template-partials',
            {
              method: persistedId ? 'PATCH' : 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(body),
            },
          );
        } else {
          const templatePlaceholders = editorPlaceholdersToStorage(formData.customPlaceholders);
          const partialPlaceholders = editorPlaceholdersToStorage(
            mergedPlaceholders
              .filter((field) => field.source === 'partial' && field.storageSource !== 'service')
              .map((field) => ({
                ...field,
                sourcePartial: field.sourcePartial || field.sourceName,
              })),
          );
          const contentJson = {
            ...mergeA4DocumentLayout(
              { ...templateContentJson, ...snapshot.contentJson },
              formData.layout,
            ),
            documentTitleDateFieldKey: formData.titleDateFieldKey || null,
          };
          const body = {
            name: formData.name,
            description: formData.description,
            category: formData.category,
            compositionType: formData.compositionType,
            content: snapshot.content,
            isActive: formData.isActive,
            sharePointRelativeFolderPath: formData.sharePointRelativeFolderPath || null,
            placeholders: [...templatePlaceholders, ...partialPlaceholders],
            contentJson,
            ...(persistedId && expectedRevision !== null ? { expectedRevision } : {}),
            ...(!persistedId ? { tenantId: activeTenantId } : {}),
          };
          response = await fetch(
            persistedId ? `/api/document-templates/${persistedId}` : '/api/document-templates',
            {
              method: persistedId ? 'PUT' : 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(body),
            },
          );
        }

        if (!response.ok) {
          const payload = await response.json().catch(() => ({})) as ApiErrorPayload;
          const serverRevision = payload.details?.currentRevision;
          throw new Error(
            serverRevision === undefined
              ? payload.error || `Failed to save ${isPartialMode ? 'partial' : 'template'}`
              : `${payload.error || 'Revision conflict'} Current server revision is ${serverRevision}.`,
          );
        }

        const saved = await response.json() as { id: string; revision?: number; version?: number };
        persistedIdRef.current = saved.id;
        serverRevisionRef.current = saved.revision ?? saved.version ?? expectedRevision ?? 0;
        acknowledgedRef.current = {
          sessionKey: snapshot.sessionKey,
          localRevision: snapshot.revision,
          formRevision: savedFormRevision,
        };
        await queryClient.invalidateQueries({
          queryKey: [isPartialMode ? 'template-partials' : 'document-templates'],
        });
        const currentSnapshot = latestSnapshotRef.current;
        const newerLocalChanges = !currentSnapshot
          || currentSnapshot.sessionKey !== snapshot.sessionKey
          || currentSnapshot.revision !== snapshot.revision
          || formRevisionRef.current !== savedFormRevision;
        setIsDirty(newerLocalChanges);

        if (newerLocalChanges) {
          success(`${isPartialMode ? 'Partial' : 'Template'} saved; newer changes remain unsaved`);
          return;
        }

        success(`${isPartialMode ? 'Partial' : 'Template'} saved successfully`);
        navigationGuard.disarm();
        router.push(backHref);
      } catch (caught) {
        const message = caught instanceof Error ? caught.message : 'Save failed';
        setFormError(message);
        toastError(message);
      } finally {
        setIsSaving(false);
      }
    };

    const promise = run();
    saveInFlightRef.current = promise;
    try {
      await promise;
    } finally {
      saveInFlightRef.current = null;
    }
  }, [activeTenantId, backHref, formData, isPartialMode, mergedPlaceholders, navigationGuard, partialFormData, queryClient, router, success, templateContentJson, toastError, validationIssues]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's') {
        event.preventDefault();
        void handleSave();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [handleSave]);

  const loadingExisting = isPartialMode
    ? existingPartialQuery.isLoading
    : existingTemplateQuery.isLoading;
  if (isEditMode && loadingExisting) {
    return (
      <div className="flex h-screen items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-accent-primary" />
      </div>
    );
  }

  const currentFields = isPartialMode
    ? partialFormData.customPlaceholders
    : formData.customPlaceholders;
  const currentContent = isPartialMode ? partialFormData.content : formData.content;

  return (
    <div className="flex h-screen flex-col bg-background-primary">
      <header className="flex shrink-0 items-center justify-between border-b border-border-primary bg-background-secondary px-4 py-3">
        <div className="flex min-w-0 items-center gap-3">
          <button
            type="button"
            onClick={() => navigationGuard.requestNavigation(backHref)}
            className="inline-flex shrink-0 items-center gap-2 text-sm text-text-secondary transition-colors hover:text-text-primary"
          >
            <ArrowLeft className="h-4 w-4" />
            {backLabel}
          </button>
          <span className="h-5 w-px bg-border-primary" aria-hidden="true" />
          <div className="flex items-center gap-2">
            {isPartialMode
              ? <Code className="h-5 w-5 text-accent-primary" />
              : <FileText className="h-5 w-5 text-accent-primary" />}
            <h1 className="text-lg font-semibold text-text-primary">
              {isPartialMode
                ? isEditMode ? 'Edit Partial' : 'Create Partial'
                : isEditMode ? 'Edit Template' : 'Create Template'}
            </h1>
            {isDirty && (
              <span className="rounded-full bg-status-warning/15 px-2 py-0.5 text-[11px] font-medium text-status-warning">
                Unsaved changes
              </span>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="secondary"
            size="sm"
            onClick={() => navigationGuard.requestNavigation(backHref)}
            disabled={isSaving}
          >
            Cancel
          </Button>
          <Button
            variant="primary"
            size="sm"
            onClick={() => void handleSave()}
            isLoading={isSaving}
            disabled={isSaving || validationIssues.some((issue) => issue.severity === 'error')}
            leftIcon={<Save className="h-4 w-4" />}
          >
            {isPartialMode ? 'Save Partial' : 'Save Template'}
          </Button>
        </div>
      </header>

      {formError && (
        <div className="shrink-0 border-b border-status-error/30 bg-status-error/10 px-4 py-3">
          <div className="flex items-center gap-2 text-sm text-status-error">
            <AlertCircle className="h-4 w-4" />
            {formError}
          </div>
        </div>
      )}

      <div className="flex min-h-0 flex-1 overflow-hidden">
        <div className="min-w-0 flex-1">
          <A4PageEditor
            ref={editorRef}
            key={editorSessionKey}
            sessionKey={editorSessionKey}
            value={currentContent}
            contentJson={isPartialMode ? undefined : templateContentJson}
            fields={currentFields}
            onChange={(html) => {
              if (isPartialMode) {
                setPartialFormData((previous) => ({ ...previous, content: html }));
              } else {
                setFormData((previous) => ({ ...previous, content: html }));
              }
            }}
            onSnapshotChange={handleSnapshotChange}
            placeholder={isPartialMode
              ? 'Start typing your partial content...'
              : 'Start typing your template content...'}
            tenantId={activeTenantId}
            previewContent={isPartialMode ? '' : previewContent}
            showPreviewToggle={!isPartialMode}
            onPreview={isPartialMode ? undefined : handlePreview}
            isPreviewLoading={isPreviewLoading}
            layout={isPartialMode ? undefined : formData.layout}
            onLayoutChange={isPartialMode ? undefined : (layout: A4DocumentLayout) => {
              setFormData((previous) => ({ ...previous, layout }));
              markFormChanged();
            }}
          />
        </div>

        <TemplateEditorPanel
          mode={isPartialMode ? 'partial' : 'template'}
          templateForm={formData}
          partialForm={partialFormData}
          onTemplateChange={handleTemplateChange}
          onPartialChange={handlePartialChange}
          panel={panel}
          isDirty={isDirty}
          isSuperAdmin={session?.isSuperAdmin}
          activeTenantId={activeTenantId}
          dateFields={titleDateFields}
          fieldsContent={
            <PlaceholderPanel
              onInsert={(snippet) => insertTemplateSnippet(editorRef.current, snippet)}
              partials={partials}
              isLoadingPartials={partialsQuery.isLoading}
              customPlaceholders={currentFields}
              onCustomPlaceholdersChange={handleCustomPlaceholdersChange}
              mergedPlaceholders={mergedPlaceholders}
              templateBooleanPlaceholders={templateBooleanPlaceholders}
              partialPlaceholderLinkings={partialPlaceholderLinkings}
              onPartialPlaceholderLinkingChange={(key, linkedTo) => {
                setPartialPlaceholderLinkings((previous) => {
                  if (linkedTo) return { ...previous, [key]: linkedTo };
                  const { [key]: _removed, ...rest } = previous;
                  return rest;
                });
                markFormChanged();
              }}
              isPartialMode={isPartialMode}
            />
          }
          validationIssues={validationIssues}
          onFocusIssue={(flowId) => editorRef.current?.focusFlowBlock?.(flowId)}
          testPreviewContent={isPartialMode ? (
            <p className="text-xs text-text-muted">
              Preview this partial from a parent template so the full scoped context is available.
            </p>
          ) : (
            <PreviewDataPanel
              mockData={mockData}
              onMockDataChange={setMockData}
              customPlaceholders={formData.customPlaceholders}
              onPreview={() => void handlePreview()}
              isPreviewLoading={isPreviewLoading}
              previewError={previewError}
            />
          )}
          aiContent={
            <AISidebar
              isOpen
              onClose={() => undefined}
              context={{ ...aiSidebar.context }}
              onInsert={(content) => editorRef.current?.insertAtCursor(content)}
              onReplace={(content) => editorRef.current?.insertAtCursor(content)}
              className="h-96 w-full border-0"
            />
          }
        />
      </div>
      {navigationGuard.dialog}
    </div>
  );
}
