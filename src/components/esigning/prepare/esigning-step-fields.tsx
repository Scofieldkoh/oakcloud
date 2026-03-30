'use client';

import { useMemo, useState } from 'react';
import type { EsigningFieldType } from '@/generated/prisma';
import type { EsigningEnvelopeDetailDto } from '@/types/esigning';
import { Button } from '@/components/ui/button';
import { ESIGNING_FIELD_TYPE_LABELS } from '@/components/esigning/esigning-shared';
import { cn } from '@/lib/utils';
import { EsigningFieldPalette } from './esigning-field-palette';
import { EsigningFieldCanvas, type PlacedField } from './esigning-field-canvas';

interface EsigningStepFieldsProps {
  envelope: EsigningEnvelopeDetailDto;
  fields: PlacedField[];
  onFieldsChange: (fields: PlacedField[]) => void;
  onSaveFields: () => Promise<void>;
  isSaving: boolean;
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
  onNext,
  onBack,
  canEdit,
}: EsigningStepFieldsProps) {
  const [selectedRecipientId, setSelectedRecipientId] = useState<string>(
    () => envelope.recipients.find((r) => r.type === 'SIGNER')?.id ?? ''
  );
  const [activePlacementType, setActivePlacementType] = useState<EsigningFieldType | null>(null);
  const [selectedFieldId, setSelectedFieldId] = useState<string | null>(null);
  const [viewerPage, setViewerPage] = useState(1);
  const [selectedDocumentId, setSelectedDocumentId] = useState<string>(
    () => envelope.documents[0]?.id ?? ''
  );

  const recipientFieldSummary = useMemo(() => {
    const map = new Map<string, { required: number; optional: number; hasSignature: boolean }>();
    for (const r of envelope.recipients.filter((r) => r.type === 'SIGNER')) {
      const rFields = fields.filter((f) => f.recipientId === r.id);
      map.set(r.id, {
        required: rFields.filter((f) => f.required).length,
        optional: rFields.filter((f) => !f.required).length,
        hasSignature: rFields.some((f) => f.type === 'SIGNATURE' || f.type === 'INITIALS'),
      });
    }
    return map;
  }, [fields, envelope.recipients]);

  const signerRecipients = envelope.recipients.filter((r) => r.type === 'SIGNER');
  const canProceedToStep3 =
    signerRecipients.length > 0 &&
    signerRecipients.every((r) => {
      const summary = recipientFieldSummary.get(r.id);
      return summary && summary.required > 0 && summary.hasSignature;
    });

  return (
    <div className="flex flex-col" style={{ height: 'calc(100vh - 57px)' }}>
      <div className="flex flex-1 overflow-hidden">
        {/* Left palette */}
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

        {/* Center canvas */}
        <div className="flex-1 overflow-hidden">
          <EsigningFieldCanvas
            documents={envelope.documents}
            selectedDocumentId={selectedDocumentId}
            onDocumentChange={(id) => {
              setSelectedDocumentId(id);
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
            canEdit={canEdit}
          />
        </div>

        {/* Right properties/hints */}
        <div className="w-56 flex-shrink-0 border-l border-border-primary overflow-y-auto p-4 bg-background-secondary">
          {selectedFieldId ? (
            (() => {
              const field = fields.find((f) => f.localId === selectedFieldId);
              if (!field) return null;
              const signerRecips = envelope.recipients.filter((r) => r.type === 'SIGNER');
              return (
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <h3 className="text-sm font-semibold text-text-primary">Field Properties</h3>
                    <Button
                      variant="danger"
                      size="xs"
                      onClick={() => {
                        onFieldsChange(fields.filter((f) => f.localId !== selectedFieldId));
                        setSelectedFieldId(null);
                      }}
                    >
                      Delete
                    </Button>
                  </div>
                  <div className="text-xs text-text-secondary">
                    Type: {ESIGNING_FIELD_TYPE_LABELS[field.type]}
                  </div>
                  <label className="flex flex-col gap-1 text-xs text-text-secondary">
                    Assigned to
                    <select
                      value={field.recipientId}
                      onChange={(e) =>
                        onFieldsChange(
                          fields.map((f) =>
                            f.localId === selectedFieldId
                              ? { ...f, recipientId: e.target.value }
                              : f
                          )
                        )
                      }
                      className="h-7 rounded border border-border-primary bg-background-primary px-2 text-xs text-text-primary"
                    >
                      {signerRecips.map((r) => (
                        <option key={r.id} value={r.id}>{r.name}</option>
                      ))}
                    </select>
                  </label>
                  <label className="flex flex-col gap-1 text-xs text-text-secondary">
                    Label
                    <input
                      value={field.label ?? ''}
                      onChange={(e) =>
                        onFieldsChange(
                          fields.map((f) =>
                            f.localId === selectedFieldId
                              ? { ...f, label: e.target.value || null }
                              : f
                          )
                        )
                      }
                      className="h-7 rounded border border-border-primary bg-background-primary px-2 text-xs text-text-primary"
                    />
                  </label>
                  <label className="flex items-center gap-2 text-xs text-text-secondary">
                    <input
                      type="checkbox"
                      checked={field.required}
                      onChange={(e) =>
                        onFieldsChange(
                          fields.map((f) =>
                            f.localId === selectedFieldId
                              ? { ...f, required: e.target.checked }
                              : f
                          )
                        )
                      }
                    />
                    Required
                  </label>
                </div>
              );
            })()
          ) : (
            <div className="space-y-3">
              <h3 className="text-sm font-semibold text-text-primary">Field Coverage</h3>
              {signerRecipients.map((r) => {
                const summary = recipientFieldSummary.get(r.id);
                const hasIssue = !summary?.hasSignature;
                return (
                  <div
                    key={r.id}
                    className="rounded-xl border border-border-primary bg-background-primary p-2"
                  >
                    <div className="flex items-center gap-1.5">
                      <span
                        className="h-2 w-2 rounded-full flex-shrink-0"
                        style={{ backgroundColor: r.colorTag }}
                      />
                      <span className="text-xs font-medium text-text-primary truncate">{r.name}</span>
                    </div>
                    <div className={cn('mt-1 text-xs', hasIssue ? 'text-amber-600' : 'text-text-secondary')}>
                      {summary?.required ?? 0} required · {summary?.optional ?? 0} optional
                      {hasIssue && <div>⚠ No signature field</div>}
                    </div>
                  </div>
                );
              })}
              {fields.length === 0 && (
                <p className="text-xs text-text-secondary">
                  Select a field type in the palette, then click on the document to place it.
                </p>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Bottom bar */}
      <div className="border-t border-border-primary bg-background-secondary px-6 py-3 flex items-center justify-between gap-4 flex-shrink-0">
        <Button variant="secondary" onClick={onBack}>
          ← Back
        </Button>
        <div className="flex gap-3">
          <Button
            variant="secondary"
            onClick={() => void onSaveFields()}
            isLoading={isSaving}
          >
            Save layout
          </Button>
          <Button onClick={onNext} disabled={!canProceedToStep3}>
            Next: Review & Send →
          </Button>
        </div>
      </div>
    </div>
  );
}
