'use client';

import { useEffect, useRef, useState } from 'react';
import type { EsigningFieldType } from '@/generated/prisma';
import type { EsigningEnvelopeDocumentDto, EsigningEnvelopeRecipientDto } from '@/types/esigning';
import type { EsigningFieldDefinitionInput } from '@/lib/validations/esigning';
import { DocumentPageViewer } from '@/components/processing/document-page-viewer';
import { buildFieldHighlights, ESIGNING_FIELD_TYPE_LABELS } from '@/components/esigning/esigning-shared';
import { cn } from '@/lib/utils';

export interface PlacedField extends EsigningFieldDefinitionInput {
  localId: string;
}

const DEFAULT_FIELD_SIZES: Record<EsigningFieldType, { w: number; h: number }> = {
  SIGNATURE:   { w: 0.24, h: 0.08 },
  INITIALS:    { w: 0.12, h: 0.06 },
  DATE_SIGNED: { w: 0.18, h: 0.04 },
  NAME:        { w: 0.20, h: 0.04 },
  TEXT:        { w: 0.20, h: 0.04 },
  COMPANY:     { w: 0.20, h: 0.04 },
  TITLE:       { w: 0.20, h: 0.04 },
  CHECKBOX:    { w: 0.03, h: 0.03 },
};

interface EsigningFieldCanvasProps {
  documents: EsigningEnvelopeDocumentDto[];
  selectedDocumentId: string;
  onDocumentChange: (documentId: string) => void;
  fields: PlacedField[];
  onFieldsChange: (fields: PlacedField[]) => void;
  selectedFieldId: string | null;
  onFieldSelect: (fieldId: string | null) => void;
  placementType: EsigningFieldType | null;
  placementRecipientId: string;
  recipients: EsigningEnvelopeRecipientDto[];
  viewerPage: number;
  onPageChange: (page: number) => void;
  canEdit: boolean;
}

interface PlacedFieldChipProps {
  field: PlacedField;
  containerWidth: number;
  containerHeight: number;
  isSelected: boolean;
  recipients: EsigningEnvelopeRecipientDto[];
  onSelect: () => void;
  onDelete: () => void;
  onUpdate: (updates: Partial<PlacedField>) => void;
}

function PlacedFieldChip({
  field,
  containerWidth,
  containerHeight,
  isSelected,
  recipients,
  onSelect,
  onDelete,
}: PlacedFieldChipProps) {
  const recipient = recipients.find((r) => r.id === field.recipientId);
  return (
    <div
      onClick={(e) => { e.stopPropagation(); onSelect(); }}
      style={{
        position: 'absolute',
        left: field.xPercent * containerWidth,
        top: field.yPercent * containerHeight,
        width: field.widthPercent * containerWidth,
        height: field.heightPercent * containerHeight,
        borderColor: recipient?.colorTag ?? '#1d4ed8',
        zIndex: 20,
        backgroundColor: `${recipient?.colorTag ?? '#1d4ed8'}18`,
      }}
      className={cn(
        'border-2 rounded flex items-center justify-center cursor-pointer select-none',
        isSelected && 'ring-2 ring-oak-primary ring-offset-1'
      )}
    >
      <span
        className="text-xs font-medium truncate px-1"
        style={{ color: recipient?.colorTag ?? '#1d4ed8' }}
      >
        {ESIGNING_FIELD_TYPE_LABELS[field.type]}
      </span>
      {isSelected && (
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); onDelete(); }}
          className="absolute -top-2 -right-2 h-4 w-4 rounded-full bg-rose-500 text-white text-xs flex items-center justify-center leading-none"
        >
          ×
        </button>
      )}
    </div>
  );
}

export function EsigningFieldCanvas({
  documents,
  selectedDocumentId,
  onDocumentChange,
  fields,
  onFieldsChange,
  selectedFieldId,
  onFieldSelect,
  placementType,
  placementRecipientId,
  recipients,
  viewerPage,
  onPageChange,
  canEdit,
}: EsigningFieldCanvasProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [containerSize, setContainerSize] = useState({ width: 0, height: 0 });

  // Track container dimensions
  useEffect(() => {
    if (!containerRef.current) return;
    const obs = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (entry) {
        setContainerSize({
          width: entry.contentRect.width,
          height: entry.contentRect.height,
        });
      }
    });
    obs.observe(containerRef.current);
    return () => obs.disconnect();
  }, []);

  // Escape key to deselect
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') onFieldSelect(null);
    }
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [onFieldSelect]);

  const selectedDocument = documents.find((d) => d.id === selectedDocumentId) ?? documents[0] ?? null;

  const highlights = buildFieldHighlights(
    fields.map((f) => ({
      ...f,
      id: f.localId,
      label: f.label ?? null,
      placeholder: f.placeholder ?? null,
    })),
    recipients,
    selectedDocumentId,
    selectedFieldId
  );

  const fieldsOnPage = fields.filter(
    (f) => f.documentId === selectedDocumentId && f.pageNumber === viewerPage
  );

  function handleCanvasClick(event: React.MouseEvent<HTMLDivElement>) {
    if (!canEdit || !placementType || !placementRecipientId || !selectedDocumentId) {
      onFieldSelect(null);
      return;
    }
    const rect = event.currentTarget.getBoundingClientRect();
    const xPercent = (event.clientX - rect.left) / rect.width;
    const yPercent = (event.clientY - rect.top) / rect.height;
    const size = DEFAULT_FIELD_SIZES[placementType];

    const newField: PlacedField = {
      localId: crypto.randomUUID(),
      documentId: selectedDocumentId,
      recipientId: placementRecipientId,
      type: placementType,
      pageNumber: viewerPage,
      xPercent: Math.max(0, Math.min(1 - size.w, xPercent - size.w / 2)),
      yPercent: Math.max(0, Math.min(1 - size.h, yPercent - size.h / 2)),
      widthPercent: size.w,
      heightPercent: size.h,
      required: placementType !== 'CHECKBOX',
      label: null,
      placeholder: null,
      sortOrder: fields.length,
    };
    onFieldsChange([...fields, newField]);
  }

  return (
    <div className="flex h-full flex-col">
      {/* Document tabs */}
      {documents.length > 1 && (
        <div className="flex items-center gap-2 border-b border-border-primary bg-background-secondary px-4 py-2 overflow-x-auto flex-shrink-0">
          {documents.map((doc) => (
            <button
              key={doc.id}
              type="button"
              onClick={() => onDocumentChange(doc.id)}
              className={cn(
                'flex-shrink-0 rounded-full px-3 py-1 text-xs font-medium transition-colors',
                doc.id === selectedDocumentId
                  ? 'bg-oak-primary text-white'
                  : 'bg-background-primary text-text-secondary hover:bg-background-tertiary border border-border-primary'
              )}
            >
              {doc.fileName}
            </button>
          ))}
        </div>
      )}

      {/* Canvas area */}
      <div className="relative flex-1 overflow-hidden" ref={containerRef}>
        {selectedDocument ? (
          <>
            <DocumentPageViewer
              key={`${selectedDocument.id}:${viewerPage}`}
              pdfUrl={selectedDocument.pdfUrl}
              initialPage={viewerPage}
              highlights={highlights}
              onPageChange={onPageChange}
              className="h-full w-full"
            />
            {/* Transparent overlay for click-to-place */}
            {canEdit && placementType && (
              <div
                onClick={handleCanvasClick}
                className={cn(
                  'absolute inset-0 z-10',
                  placementType ? 'cursor-crosshair' : 'cursor-default'
                )}
              />
            )}
            {/* Placed field chips */}
            {containerSize.width > 0 && containerSize.height > 0 && (
              <div className="pointer-events-none absolute inset-0 z-10">
                {fieldsOnPage.map((field) => (
                  <PlacedFieldChip
                    key={field.localId}
                    field={field}
                    containerWidth={containerSize.width}
                    containerHeight={containerSize.height}
                    isSelected={selectedFieldId === field.localId}
                    recipients={recipients}
                    onSelect={() => onFieldSelect(field.localId)}
                    onDelete={() => {
                      onFieldsChange(fields.filter((f) => f.localId !== field.localId));
                      onFieldSelect(null);
                    }}
                    onUpdate={(updates) =>
                      onFieldsChange(
                        fields.map((f) =>
                          f.localId === field.localId ? { ...f, ...updates } : f
                        )
                      )
                    }
                  />
                ))}
              </div>
            )}
          </>
        ) : (
          <div className="flex h-full items-center justify-center text-sm text-text-muted">
            No documents uploaded yet.
          </div>
        )}
      </div>
    </div>
  );
}
