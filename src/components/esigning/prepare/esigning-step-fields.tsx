'use client';

import { useEffect, useMemo, useState } from 'react';
import { RotateCcw, RotateCw, ZoomIn, ZoomOut } from 'lucide-react';
import type { EsigningFieldType } from '@/generated/prisma';
import type { EsigningEnvelopeDetailDto } from '@/types/esigning';
import { Button } from '@/components/ui/button';
import { Alert } from '@/components/ui/alert';
import { DOCUMENT_PAGE_VIEWER_ZOOM_LEVELS } from '@/components/processing/document-page-viewer';
import { ESIGNING_FIELD_TYPE_LABELS } from '@/components/esigning/esigning-shared';
import { cn } from '@/lib/utils';
import { EsigningFieldPalette } from './esigning-field-palette';
import {
  EsigningFieldCanvas,
  detectFieldOverlaps,
  type PlacedField,
} from './esigning-field-canvas';

interface EsigningStepFieldsProps {
  envelope: EsigningEnvelopeDetailDto;
  fields: PlacedField[];
  onFieldsChange: (
    fields: PlacedField[],
    options?: { recordHistory?: boolean; historySnapshot?: PlacedField[] }
  ) => void;
  onSaveFields: () => Promise<void>;
  isSaving: boolean;
  canUndo: boolean;
  canRedo: boolean;
  onUndo: () => void;
  onRedo: () => void;
  onNext: () => void;
  onBack: () => void;
  canEdit: boolean;
}

export function EsigningStepFields({
  envelope,
  fields,
  onFieldsChange,
  onSaveFields,
  isSaving,
  canUndo,
  canRedo,
  onUndo,
  onRedo,
  onNext,
  onBack,
  canEdit,
}: EsigningStepFieldsProps) {
  const [selectedRecipientId, setSelectedRecipientId] = useState<string>(
    () => envelope.recipients.find((recipient) => recipient.type === 'SIGNER')?.id ?? ''
  );
  const [activePlacementType, setActivePlacementType] = useState<EsigningFieldType | null>(null);
  const [selectedFieldId, setSelectedFieldId] = useState<string | null>(null);
  const [viewerPage, setViewerPage] = useState(1);
  const [selectedDocumentId, setSelectedDocumentId] = useState<string>(
    () => envelope.documents[0]?.id ?? ''
  );
  const [overlapWarningDismissed, setOverlapWarningDismissed] = useState(false);
  const [showCoachmarks, setShowCoachmarks] = useState(false);
  const [preparationZoom, setPreparationZoom] = useState<number>(
    DOCUMENT_PAGE_VIEWER_ZOOM_LEVELS[6] ?? 1.5
  );

  const recipientFieldSummary = useMemo(() => {
    const map = new Map<string, { required: number; optional: number; hasSignature: boolean }>();

    for (const recipient of envelope.recipients.filter((entry) => entry.type === 'SIGNER')) {
      const recipientFields = fields.filter((field) => field.recipientId === recipient.id);
      map.set(recipient.id, {
        required: recipientFields.filter((field) => field.required).length,
        optional: recipientFields.filter((field) => !field.required).length,
        hasSignature: recipientFields.some(
          (field) => field.type === 'SIGNATURE' || field.type === 'INITIALS'
        ),
      });
    }

    return map;
  }, [fields, envelope.recipients]);

  const signerRecipients = envelope.recipients.filter((recipient) => recipient.type === 'SIGNER');
  const overlapMap = useMemo(() => detectFieldOverlaps(fields), [fields]);
  const preparationZoomIndex = useMemo(
    () =>
      DOCUMENT_PAGE_VIEWER_ZOOM_LEVELS.reduce((closestIndex, zoomOption, index) => {
        const currentDistance = Math.abs(zoomOption - preparationZoom);
        const closestDistance = Math.abs(
          DOCUMENT_PAGE_VIEWER_ZOOM_LEVELS[closestIndex] - preparationZoom
        );
        return currentDistance < closestDistance ? index : closestIndex;
      }, 0),
    [preparationZoom]
  );
  const overlappingFields = useMemo(
    () => fields.filter((field) => overlapMap.has(field.localId)),
    [fields, overlapMap]
  );
  const selectedField = selectedFieldId
    ? fields.find((field) => field.localId === selectedFieldId) ?? null
    : null;
  const canProceedToStep3 =
    signerRecipients.length > 0 &&
    signerRecipients.every((recipient) => {
      const summary = recipientFieldSummary.get(recipient.id);
      return Boolean(summary && summary.required > 0 && summary.hasSignature);
    });

  useEffect(() => {
    if (overlappingFields.length === 0) {
      setOverlapWarningDismissed(false);
    }
  }, [overlappingFields.length]);

  useEffect(() => {
    const coachmarkKey = `esigning-field-coachmarks:${envelope.id}`;
    if (window.localStorage.getItem(coachmarkKey)) {
      return;
    }

    setShowCoachmarks(true);
  }, [envelope.id]);

  useEffect(() => {
    if (!canEdit) {
      return;
    }

    function shouldIgnoreShortcut(target: EventTarget | null): boolean {
      if (!(target instanceof HTMLElement)) {
        return false;
      }

      if (target.isContentEditable) {
        return true;
      }

      const tagName = target.tagName.toLowerCase();
      return tagName === 'input' || tagName === 'textarea' || tagName === 'select';
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (shouldIgnoreShortcut(event.target)) {
        return;
      }

      const isModifierPressed = event.ctrlKey || event.metaKey;
      if (!isModifierPressed) {
        return;
      }

      const key = event.key.toLowerCase();
      const wantsUndo = key === 'z' && !event.shiftKey;
      const wantsRedo = (key === 'z' && event.shiftKey) || key === 'y';

      if (wantsUndo && canUndo) {
        event.preventDefault();
        onUndo();
      }

      if (wantsRedo && canRedo) {
        event.preventDefault();
        onRedo();
      }
    }

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [canEdit, canRedo, canUndo, onRedo, onUndo]);

  return (
    <div className="flex flex-col" style={{ height: 'calc(100vh - 57px)' }}>
      <div className="flex flex-1 overflow-hidden">
        <div className="w-56 flex-shrink-0">
          <EsigningFieldPalette
            recipients={envelope.recipients}
            selectedRecipientId={selectedRecipientId}
            onRecipientChange={setSelectedRecipientId}
            activePlacementType={activePlacementType}
            onPlacementTypeSelect={setActivePlacementType}
            recipientFieldSummary={recipientFieldSummary}
          />
        </div>

        <div className="flex-1 overflow-hidden">
          <EsigningFieldCanvas
            documents={envelope.documents}
            selectedDocumentId={selectedDocumentId}
            onDocumentChange={(documentId) => {
              setSelectedDocumentId(documentId);
              setViewerPage(1);
            }}
            fields={fields}
            onFieldsChange={onFieldsChange}
            selectedFieldId={selectedFieldId}
            onFieldSelect={setSelectedFieldId}
            placementType={activePlacementType}
            placementRecipientId={selectedRecipientId}
            recipients={envelope.recipients}
            viewerPage={viewerPage}
            onPageChange={setViewerPage}
            zoomLevel={preparationZoom}
            onZoomLevelChange={setPreparationZoom}
            canEdit={canEdit}
          />
        </div>

        <div className="w-56 flex-shrink-0 overflow-y-auto border-l border-border-primary bg-background-secondary p-4">
          {showCoachmarks ? (
            <Alert
              variant="info"
              compact
              className="mb-4"
              title="Placement tips"
              onClose={() => {
                window.localStorage.setItem(`esigning-field-coachmarks:${envelope.id}`, 'dismissed');
                setShowCoachmarks(false);
              }}
            >
              Click a field in the palette, place it on the page, then drag or resize it. Use Ctrl/Cmd+Z to undo layout changes as you work.
            </Alert>
          ) : null}

          <div className="mb-4 flex items-center gap-2">
            <Button
              variant="secondary"
              size="xs"
              leftIcon={<RotateCcw className="h-3.5 w-3.5" />}
              onClick={onUndo}
              disabled={!canUndo}
            >
              Undo
            </Button>
            <Button
              variant="secondary"
              size="xs"
              leftIcon={<RotateCw className="h-3.5 w-3.5" />}
              onClick={onRedo}
              disabled={!canRedo}
            >
              Redo
            </Button>
          </div>

          <div className="mb-4 rounded-xl border border-border-primary bg-background-primary p-3">
            <div className="flex items-center justify-between gap-2">
              <h3 className="text-sm font-semibold text-text-primary">Zoom</h3>
              <span className="text-xs font-medium text-text-secondary">
                {Math.round(preparationZoom * 100)}%
              </span>
            </div>

            <div className="mt-3 flex items-center gap-2">
              <Button
                variant="secondary"
                size="xs"
                leftIcon={<ZoomOut className="h-3.5 w-3.5" />}
                onClick={() =>
                  setPreparationZoom(
                    DOCUMENT_PAGE_VIEWER_ZOOM_LEVELS[Math.max(0, preparationZoomIndex - 1)]
                  )
                }
                disabled={preparationZoomIndex === 0}
              >
                Out
              </Button>
              <Button
                variant="secondary"
                size="xs"
                leftIcon={<ZoomIn className="h-3.5 w-3.5" />}
                onClick={() =>
                  setPreparationZoom(
                    DOCUMENT_PAGE_VIEWER_ZOOM_LEVELS[
                      Math.min(
                        DOCUMENT_PAGE_VIEWER_ZOOM_LEVELS.length - 1,
                        preparationZoomIndex + 1
                      )
                    ]
                  )
                }
                disabled={preparationZoomIndex === DOCUMENT_PAGE_VIEWER_ZOOM_LEVELS.length - 1}
              >
                In
              </Button>
            </div>

            <div className="mt-3 flex flex-wrap gap-2">
              {[1, 1.5, 2].map((zoomPreset) => (
                <Button
                  key={zoomPreset}
                  variant={preparationZoom === zoomPreset ? 'primary' : 'secondary'}
                  size="xs"
                  onClick={() => setPreparationZoom(zoomPreset)}
                >
                  {Math.round(zoomPreset * 100)}%
                </Button>
              ))}
            </div>

            <p className="mt-3 text-xs text-text-secondary">
              Use these controls while placing fields, or use the viewer toolbar and +/- shortcuts.
            </p>
          </div>

          {overlappingFields.length > 0 && !overlapWarningDismissed ? (
            <Alert
              variant="warning"
              compact
              className="mb-4"
              title="Overlapping fields detected"
              onClose={() => setOverlapWarningDismissed(true)}
            >
              {overlappingFields.length} field{overlappingFields.length === 1 ? '' : 's'} overlap on the current layout. Review before sending so signers do not run into competing targets.
            </Alert>
          ) : null}

          {selectedField ? (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold text-text-primary">Field Properties</h3>
                <Button
                  variant="danger"
                  size="xs"
                  onClick={() => {
                    onFieldsChange(fields.filter((field) => field.localId !== selectedField.localId));
                    setSelectedFieldId(null);
                  }}
                >
                  Delete
                </Button>
              </div>

              <div className="text-xs text-text-secondary">
                Type: {ESIGNING_FIELD_TYPE_LABELS[selectedField.type]}
              </div>

              {overlapMap.has(selectedField.localId) ? (
                <Alert variant="warning" compact>
                  This field overlaps another field on the same page.
                </Alert>
              ) : null}

              <label className="flex flex-col gap-1 text-xs text-text-secondary">
                Assigned to
                <select
                  value={selectedField.recipientId}
                  onChange={(event) =>
                    onFieldsChange(
                      fields.map((field) =>
                        field.localId === selectedField.localId
                          ? { ...field, recipientId: event.target.value }
                          : field
                      )
                    )
                  }
                  className="h-7 rounded border border-border-primary bg-background-primary px-2 text-xs text-text-primary"
                >
                  {signerRecipients.map((recipient) => (
                    <option key={recipient.id} value={recipient.id}>
                      {recipient.name}
                    </option>
                  ))}
                </select>
              </label>

              <label className="flex flex-col gap-1 text-xs text-text-secondary">
                Label
                <input
                  value={selectedField.label ?? ''}
                  onChange={(event) =>
                    onFieldsChange(
                      fields.map((field) =>
                        field.localId === selectedField.localId
                          ? { ...field, label: event.target.value || null }
                          : field
                      )
                    )
                  }
                  className="h-7 rounded border border-border-primary bg-background-primary px-2 text-xs text-text-primary"
                />
              </label>

              <label className="flex items-center gap-2 text-xs text-text-secondary">
                <input
                  type="checkbox"
                  checked={selectedField.required}
                  onChange={(event) =>
                    onFieldsChange(
                      fields.map((field) =>
                        field.localId === selectedField.localId
                          ? { ...field, required: event.target.checked }
                          : field
                      )
                    )
                  }
                />
                Required
              </label>
            </div>
          ) : (
            <div className="space-y-3">
              <h3 className="text-sm font-semibold text-text-primary">Field Coverage</h3>
              {signerRecipients.map((recipient) => {
                const summary = recipientFieldSummary.get(recipient.id);
                const hasIssue = !summary?.hasSignature;

                return (
                  <div
                    key={recipient.id}
                    className="rounded-xl border border-border-primary bg-background-primary p-2"
                  >
                    <div className="flex items-center gap-1.5">
                      <span
                        className="h-2 w-2 flex-shrink-0 rounded-full"
                        style={{ backgroundColor: recipient.colorTag }}
                      />
                      <span className="truncate text-xs font-medium text-text-primary">
                        {recipient.name}
                      </span>
                    </div>
                    <div
                      className={cn(
                        'mt-1 text-xs',
                        hasIssue ? 'text-amber-600' : 'text-text-secondary'
                      )}
                    >
                      {summary?.required ?? 0} required · {summary?.optional ?? 0} optional
                      {hasIssue ? <div>No signature field assigned</div> : null}
                    </div>
                  </div>
                );
              })}

              {fields.length === 0 ? (
                <p className="text-xs text-text-secondary">
                  Select a field type in the palette, then click on the document to place it.
                </p>
              ) : null}
            </div>
          )}
        </div>
      </div>

      <div className="flex flex-shrink-0 items-center justify-between gap-4 border-t border-border-primary bg-background-secondary px-6 py-3">
        <Button variant="secondary" onClick={onBack}>
          Back
        </Button>

        <div className="flex gap-3">
          <Button variant="secondary" onClick={onUndo} disabled={!canUndo}>
            Undo
          </Button>
          <Button variant="secondary" onClick={onRedo} disabled={!canRedo}>
            Redo
          </Button>
          <Button variant="secondary" onClick={() => void onSaveFields()} isLoading={isSaving}>
            Save layout
          </Button>
          <Button onClick={onNext} disabled={!canProceedToStep3}>
            Next: Review & Send
          </Button>
        </div>
      </div>
    </div>
  );
}
