'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, CheckCircle2, FilePlus2, Save, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/toast';
import type {
  BatchGenerationResult,
} from '@/types/document-generation-batch';
import type {
  Company,
  DocumentContact,
  DocumentTemplateSummary,
} from '@/types/document-generation';
import { useDocumentPartyOptions } from '@/hooks/use-document-party-options';
import { extractA4DocumentLayout } from '@/components/documents/a4-pagination/layout';
import {
  BATCH_STAGES,
  STAGE_LABELS,
  selectCanEnterConfigure,
  selectCanRequestPreflight,
  type BatchStage,
  type EditableDocumentGenerationBatch,
} from './batch-workspace-state';
import { useDocumentGenerationBatch } from './use-document-generation-batch';
import { BatchTemplatePicker } from './batch-template-picker';
import { BatchSharedSetup } from './batch-shared-setup';
import { BatchDocumentQueue } from './batch-document-queue';
import { BatchItemConfigurator } from './batch-item-configurator';
import { BatchReviewWorkspace } from './batch-review-workspace';
import { BatchGenerationResults } from './batch-generation-results';

export interface DocumentGenerationBatchWorkspaceProps {
  initialBatch?: EditableDocumentGenerationBatch | null;
  templates: DocumentTemplateSummary[];
  companies: Company[];
  contacts: DocumentContact[];
  backHref?: string;
}

export function DocumentGenerationBatchWorkspace({
  initialBatch = null,
  templates,
  companies,
  contacts,
  backHref = '/generated-documents',
}: DocumentGenerationBatchWorkspaceProps) {
  const { success, error: toastError } = useToast();
  const {
    state,
    dispatch,
    saveDraft,
    continueTo,
    previewItem,
    reviewItem,
    preflight,
    generate,
    retry,
    requestNavigation,
    dialog,
  } = useDocumentGenerationBatch({ initialBatch });
  const [results, setResults] = useState<BatchGenerationResult | null>(null);
  const partyOptions = useDocumentPartyOptions(state.batch.primaryCompanyId);
  const activeItem = state.batch.items.find(
    (item) => item.key === state.activeItemId,
  ) ?? state.batch.items[0] ?? null;

  const activeTemplateFields = useMemo(
    () => templates.find((template) => template.id === activeItem?.templateId)?.placeholders ?? [],
    [templates, activeItem],
  );

  const activeLayout = useMemo(
    () => extractA4DocumentLayout(
      templates.find((template) => template.id === activeItem?.templateId)?.contentJson,
    ),
    [templates, activeItem?.templateId],
  );

  const autoPreviewedKeys = useRef<Set<string>>(new Set());
  const autoPreviewBusy = useRef(false);
  useEffect(() => {
    if (state.stage !== 'review-generate') {
      autoPreviewedKeys.current.clear();
      return;
    }
    if (autoPreviewBusy.current) return;
    const pending = state.batch.items.filter(
      (item) =>
        item.status !== 'GENERATED'
        && !item.previewContent
        && !autoPreviewedKeys.current.has(item.key),
    );
    if (pending.length === 0) return;
    autoPreviewBusy.current = true;
    void (async () => {
      for (const item of pending) {
        autoPreviewedKeys.current.add(item.key);
        try {
          await previewItem(item.key);
        } catch (caught) {
          toastError(caught instanceof Error ? caught.message : 'Preview failed');
        }
      }
      autoPreviewBusy.current = false;
    })();
  }, [state.stage, state.batch.items, previewItem, toastError]);

  const masterFieldValues = state.batch.masterFieldValues;
  const overriddenCountByField = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const item of state.batch.items) {
      for (const fieldId of Object.keys(item.configuration.masterOverrides)) {
        counts[fieldId] = (counts[fieldId] ?? 0) + 1;
      }
    }
    return counts;
  }, [state.batch.items]);

  const effectiveValues = useMemo(() => {
    if (!activeItem) return {};
    const values: Record<string, string> = {};
    for (const field of state.batch.masterFields.fields) {
      const override = activeItem.configuration.masterOverrides[field.id];
      values[field.key] = override !== undefined
        ? override
        : masterFieldValues[field.id] ?? '';
    }
    return values;
  }, [activeItem, state.batch.masterFields.fields, masterFieldValues]);

  const partyContacts: DocumentContact[] = useMemo(
    () => partyOptions.contacts.map((party) => ({
      id: party.id,
      fullName: party.name,
      email: party.email,
      phone: party.phone,
      designation: party.detail,
    })),
    [partyOptions.contacts],
  );
  const allContacts = useMemo(() => {
    const byId = new Map(contacts.map((contact) => [contact.id, contact]));
    for (const contact of partyContacts) byId.set(contact.id, contact);
    return [...byId.values()];
  }, [contacts, partyContacts]);

  const stageIndex = BATCH_STAGES.indexOf(state.stage);
  const canEnterConfigure = selectCanEnterConfigure(state);
  const canGenerate = selectCanRequestPreflight(state);
  const showResults = Boolean(results) && (
    state.batch.status === 'PARTIAL'
    || state.batch.status === 'COMPLETED'
    || state.batch.items.some((item) =>
      item.status === 'GENERATED' || item.status === 'FAILED')
  );

  const readyCount = state.batch.items.filter(
    (item) => item.status === 'READY' || item.status === 'GENERATED',
  ).length;
  const configuredCount = state.batch.items.filter(
    (item) => item.status !== 'NOT_STARTED',
  ).length;
  const stageMeta: Record<BatchStage, { complete: boolean; hint: string }> = {
    documents: {
      complete: state.batch.items.length > 0,
      hint: state.batch.items.length > 0
        ? `${state.batch.items.length} selected`
        : 'Select documents',
    },
    'shared-setup': {
      complete: Boolean(state.batch.primaryCompanyId),
      hint: state.batch.company ? state.batch.company.name : 'Select a company',
    },
    configure: {
      complete: state.batch.items.length > 0 && configuredCount === state.batch.items.length,
      hint: state.batch.items.length > 0
        ? `${configuredCount} of ${state.batch.items.length} configured`
        : 'Configure documents',
    },
    'review-generate': {
      complete: canGenerate,
      hint: canGenerate
        ? 'Ready to generate'
        : `${readyCount} of ${state.batch.items.length} reviewed`,
    },
  };

  const navigate = (stage: BatchStage) => {
    setResults(null);
    dispatch({ type: 'stage/navigate', stage });
  };

  const handleGenerate = async () => {
    try {
      await preflight();
      const result = await generate();
      setResults(result);
      success(result.batchStatus === 'COMPLETED'
        ? 'All documents generated'
        : 'Generation finished with some failures');
    } catch (caught) {
      toastError(caught instanceof Error ? caught.message : 'Generation failed');
    }
  };

  const handleRetry = async (itemId: string) => {
    try {
      await retry(itemId);
      success('Document generated after retry');
    } catch (caught) {
      toastError(caught instanceof Error ? caught.message : 'Retry failed');
    }
  };

  const contextActionLabel = state.stage === 'review-generate'
    ? 'Generate All'
    : 'Continue';

  return (
    <div data-testid="document-generation-batch-workspace" className="mx-auto w-full max-w-[1800px] p-3 sm:p-5">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-border-secondary pb-3">
        <div className="flex min-w-0 items-center gap-3">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-oak-primary/10 text-oak-primary">
            <FilePlus2 className="h-4 w-4" aria-hidden="true" />
          </span>
          <div className="min-w-0">
            <h1 className="truncate text-lg font-semibold text-text-primary">
              {state.batch.items.length === 0
                ? 'Create documents'
                : `${state.batch.items.length} document${state.batch.items.length === 1 ? '' : 's'}`}
              {state.batch.company ? ` · ${state.batch.company.name}` : ''}
            </h1>
            <p className="text-xs text-text-muted" aria-live="polite">
              {state.dirty
                ? 'Unsaved changes'
                : state.pending
                  ? `Saving (${state.pending})…`
                  : 'All changes saved'}
              {state.batch.items.length > 0 ? ` · ${readyCount}/${state.batch.items.length} ready` : ''}
              {state.conflict ? ` · Conflict: revision ${state.conflict.currentRevision}` : ''}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="secondary"
            size="sm"
            onClick={() => void saveDraft().catch((caught: unknown) =>
              toastError(caught instanceof Error ? caught.message : 'Save failed'))}
            disabled={state.pending !== null}
            leftIcon={<Save className="h-4 w-4" aria-hidden="true" />}
          >
            Save Draft
          </Button>
          <Link
            href={backHref}
            onClick={(event) => {
              event.preventDefault();
              requestNavigation(backHref);
            }}
            className="inline-flex min-h-9 items-center gap-1 rounded-lg px-2 text-sm text-text-secondary transition-colors hover:text-text-primary"
            aria-label="Exit document generation"
          >
            <X className="h-4 w-4" aria-hidden="true" />
            Exit
          </Link>
        </div>
      </header>

      <nav aria-label="Generation stages" className="mt-4">
        <ol aria-label="Generation stages" className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {BATCH_STAGES.map((stage, index) => {
            const active = stage === state.stage;
            const meta = stageMeta[stage];
            const reachable = !state.capabilities.canEditComposition
              && index < stageIndex
              ? false
              : true;
            return (
              <li key={stage}>
                <button
                  type="button"
                  onClick={() => navigate(stage)}
                  disabled={!reachable}
                  aria-current={active ? 'step' : undefined}
                  className={
                    'flex min-h-14 w-full items-center gap-2 rounded-lg border px-3 text-left transition-colors '
                    + (active
                      ? 'border-oak-primary bg-oak-primary/5 text-oak-primary'
                      : 'border-border-primary bg-background-primary text-text-secondary hover:bg-background-tertiary')
                  }
                >
                  {meta.complete ? (
                    <CheckCircle2 className="h-4 w-4 shrink-0 text-status-success" aria-hidden="true" />
                  ) : (
                    <span
                      aria-hidden="true"
                      className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-border-secondary text-xs"
                    >
                      {index + 1}
                    </span>
                  )}
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium">{STAGE_LABELS[stage]}</span>
                    <span className="block truncate text-xs text-text-muted">{meta.hint}</span>
                  </span>
                </button>
              </li>
            );
          })}
        </ol>
      </nav>

      <main className="mt-4">
        {state.stage === 'documents' && (
          <BatchTemplatePicker
            templates={templates}
            selected={state.batch.items}
            onAdd={(template) => dispatch({ type: 'template/add', template })}
            onRemove={(itemId) => dispatch({ type: 'template/remove', itemId })}
            onReorder={(itemId, direction) => dispatch({
              type: 'template/reorder',
              itemId,
              direction,
            })}
            disabled={!state.capabilities.canEditComposition}
          />
        )}

        {state.stage === 'shared-setup' && (
          <BatchSharedSetup
            companies={companies}
            primaryCompanyId={state.batch.primaryCompanyId}
            masterFields={state.batch.masterFields}
            masterFieldValues={masterFieldValues}
            onCompanyChange={(companyId) => dispatch({
              type: 'shared/company',
              companyId,
            })}
            onMasterValueChange={(fieldId, value) => dispatch({
              type: 'shared/masterValue',
              fieldId,
              value,
            })}
            disabled={!state.capabilities.canEditSharedSetup}
            overriddenCountByField={overriddenCountByField}
            onSelectOverridden={(fieldId) => {
              const first = state.batch.items.find((item) =>
                Object.prototype.hasOwnProperty.call(
                  item.configuration.masterOverrides,
                  fieldId,
                ));
              if (first) {
                navigate('configure');
                dispatch({ type: 'item/activate', itemId: first.key });
              }
            }}
          />
        )}

        {state.stage === 'configure' && (
          <div className="grid gap-4 lg:grid-cols-[280px_minmax(0,1fr)]">
            <BatchDocumentQueue
              items={state.batch.items}
              activeItemId={activeItem?.key ?? null}
              onSelect={(itemId) => dispatch({ type: 'item/activate', itemId })}
            />
            <div>
              <h2 className="text-sm font-medium text-text-primary">
                Configure {activeItem?.templateName ?? 'document'}
              </h2>
              <div className="mt-3">
                {activeItem && (
                  <BatchItemConfigurator
                    item={activeItem}
                    primaryCompany={companies.find(
                      (company) => company.id === state.batch.primaryCompanyId,
                    ) ?? null}
                    companies={companies}
                    contacts={allContacts}
                    companyContacts={partyContacts}
                    directors={partyOptions.directors}
                    shareholders={partyOptions.shareholders}
                    partyLoading={partyOptions.isLoading}
                    partyError={partyOptions.error}
                    onPartyRetry={partyOptions.reload}
                    masterFields={state.batch.masterFields}
                    effectiveMasterValues={effectiveValues}
                    templateFields={activeTemplateFields}
                    onPatch={(patch) => dispatch({
                      type: 'item/patch',
                      itemId: activeItem.key,
                      patch,
                    })}
                    disabled={!state.capabilities.canEditItems}
                  />
                )}
              </div>
            </div>
          </div>
        )}

        {state.stage === 'review-generate' && (
          showResults ? (
            <BatchGenerationResults
              items={state.batch.items}
              onRetry={handleRetry}
            />
          ) : (
            <BatchReviewWorkspace
              items={state.batch.items}
              activeItemId={activeItem?.key ?? null}
              onSelect={(itemId) => dispatch({ type: 'item/activate', itemId })}
              onPreview={async (itemId, replaceEditedContent) => {
                try {
                  await previewItem(itemId, replaceEditedContent);
                } catch (caught) {
                  toastError(caught instanceof Error ? caught.message : 'Preview failed');
                }
              }}
              onReview={async (itemId) => {
                try {
                  await reviewItem(itemId);
                } catch (caught) {
                  toastError(caught instanceof Error ? caught.message : 'Review failed');
                }
              }}
              onEditContent={(itemId, content, json) => dispatch({
                type: 'item/edit-content',
                itemId,
                editedContent: content,
                editedContentJson: json,
              })}
              onGenerateAll={handleGenerate}
              canGenerate={canGenerate}
              pending={state.pending !== null}
              layout={activeLayout}
            />
          )
        )}
      </main>

      <footer className="sticky bottom-0 z-10 mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-border-secondary bg-background-primary/95 py-3 backdrop-blur">
        <Button
          variant="secondary"
          size="sm"
          onClick={() => navigate(BATCH_STAGES[Math.max(0, stageIndex - 1)])}
          disabled={stageIndex === 0 || state.pending !== null}
          leftIcon={<ArrowLeft className="h-4 w-4" aria-hidden="true" />}
        >
          Back
        </Button>
        <div className="flex items-center gap-2">
          <Button
            variant="secondary"
            size="sm"
            onClick={() => void saveDraft().catch((caught: unknown) =>
              toastError(caught instanceof Error ? caught.message : 'Save failed'))}
            disabled={state.pending !== null}
          >
            Save Draft
          </Button>
          {state.stage === 'review-generate' ? (
            <Button
              variant="primary"
              size="sm"
              onClick={handleGenerate}
              disabled={!canGenerate || state.pending !== null}
            >
              Generate All
            </Button>
          ) : (
            <Button
              variant="primary"
              size="sm"
              onClick={() => void continueTo(
                BATCH_STAGES[Math.min(BATCH_STAGES.length - 1, stageIndex + 1)],
              ).catch((caught: unknown) =>
                toastError(caught instanceof Error ? caught.message : 'Save failed'))}
              disabled={
                (state.stage === 'shared-setup' && !canEnterConfigure)
                || state.pending !== null
              }
            >
              {contextActionLabel}
            </Button>
          )}
        </div>
      </footer>
      {dialog}
    </div>
  );
}
