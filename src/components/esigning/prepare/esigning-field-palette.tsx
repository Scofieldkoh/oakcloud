'use client';

import { PenLine, Type, Calendar, User, Building2, Briefcase, AlignLeft, CheckSquare } from 'lucide-react';
import type { EsigningFieldType } from '@/generated/prisma';
import type { EsigningEnvelopeRecipientDto } from '@/types/esigning';
import { ESIGNING_FIELD_TYPE_LABELS } from '@/components/esigning/esigning-shared';
import { cn } from '@/lib/utils';

interface EsigningFieldPaletteProps {
  recipients: EsigningEnvelopeRecipientDto[];
  selectedRecipientId: string;
  onRecipientChange: (recipientId: string) => void;
  activePlacementType: EsigningFieldType | null;
  onPlacementTypeSelect: (type: EsigningFieldType | null) => void;
  recipientFieldSummary: Map<string, { required: number; optional: number; hasSignature: boolean }>;
}

interface FieldTypeButtonProps {
  type: EsigningFieldType;
  icon: React.ReactNode;
  isActive: boolean;
  onClick: () => void;
}

function FieldTypeButton({ type, icon, isActive, onClick }: FieldTypeButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-sm font-medium transition-colors',
        isActive
          ? 'bg-oak-primary text-white'
          : 'bg-background-primary text-text-primary hover:bg-background-tertiary border border-border-primary'
      )}
    >
      <span className="h-4 w-4 flex-shrink-0">{icon}</span>
      <span>{ESIGNING_FIELD_TYPE_LABELS[type]}</span>
    </button>
  );
}

const SIGNATURE_FIELDS: Array<{ type: EsigningFieldType; icon: React.ReactNode }> = [
  { type: 'SIGNATURE', icon: <PenLine className="h-4 w-4" /> },
  { type: 'INITIALS', icon: <Type className="h-4 w-4" /> },
];

const AUTOFILL_FIELDS: Array<{ type: EsigningFieldType; icon: React.ReactNode }> = [
  { type: 'DATE_SIGNED', icon: <Calendar className="h-4 w-4" /> },
  { type: 'NAME', icon: <User className="h-4 w-4" /> },
  { type: 'COMPANY', icon: <Building2 className="h-4 w-4" /> },
  { type: 'TITLE', icon: <Briefcase className="h-4 w-4" /> },
];

const STANDARD_FIELDS: Array<{ type: EsigningFieldType; icon: React.ReactNode }> = [
  { type: 'TEXT', icon: <AlignLeft className="h-4 w-4" /> },
  { type: 'CHECKBOX', icon: <CheckSquare className="h-4 w-4" /> },
];

export function EsigningFieldPalette({
  recipients,
  selectedRecipientId,
  onRecipientChange,
  activePlacementType,
  onPlacementTypeSelect,
  recipientFieldSummary,
}: EsigningFieldPaletteProps) {
  const signerRecipients = recipients.filter((r) => r.type === 'SIGNER');
  const selectedRecipient = recipients.find((r) => r.id === selectedRecipientId);
  const summary = selectedRecipientId ? recipientFieldSummary.get(selectedRecipientId) : null;

  function handleTypeClick(type: EsigningFieldType) {
    onPlacementTypeSelect(activePlacementType === type ? null : type);
  }

  function renderGroup(
    title: string,
    fields: Array<{ type: EsigningFieldType; icon: React.ReactNode }>
  ) {
    return (
      <div className="space-y-1.5">
        <p className="text-xs font-semibold uppercase tracking-wide text-text-muted">{title}</p>
        {fields.map(({ type, icon }) => (
          <FieldTypeButton
            key={type}
            type={type}
            icon={icon}
            isActive={activePlacementType === type}
            onClick={() => handleTypeClick(type)}
          />
        ))}
      </div>
    );
  }

  return (
    <div className="w-full h-full bg-background-secondary border-r border-border-primary overflow-y-auto p-4 space-y-4">
      {/* Recipient selector */}
      <div className="space-y-2">
        <p className="text-xs font-semibold uppercase tracking-wide text-text-muted">Recipient</p>
        <div className="relative">
          <div
            className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3 w-3 rounded-full flex-shrink-0"
            style={{ backgroundColor: selectedRecipient?.colorTag ?? '#ccc' }}
          />
          <select
            value={selectedRecipientId}
            onChange={(e) => onRecipientChange(e.target.value)}
            className="w-full h-8 rounded-lg border border-border-primary bg-background-primary pl-7 pr-3 text-sm text-text-primary appearance-none"
          >
            {signerRecipients.length === 0 && (
              <option value="">No signers</option>
            )}
            {signerRecipients.map((r) => (
              <option key={r.id} value={r.id}>{r.name}</option>
            ))}
          </select>
        </div>

        {/* Summary line */}
        {summary && (
          <div className={cn('text-xs', !summary.hasSignature ? 'text-amber-600' : 'text-text-secondary')}>
            {summary.required} required · {summary.optional} optional
            {!summary.hasSignature && <span className="ml-1 font-medium">⚠ No signature</span>}
          </div>
        )}
      </div>

      {renderGroup('Signature Fields', SIGNATURE_FIELDS)}
      {renderGroup('Auto-fill Fields', AUTOFILL_FIELDS)}
      {renderGroup('Standard Fields', STANDARD_FIELDS)}

      {/* Active placement hint */}
      {activePlacementType && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-3">
          <p className="text-xs font-medium text-amber-800">
            Click on the document to place a{' '}
            <span className="font-semibold">{ESIGNING_FIELD_TYPE_LABELS[activePlacementType]}</span>{' '}
            field.
          </p>
          <p className="mt-1 text-xs text-amber-700">Press Escape to cancel.</p>
        </div>
      )}
    </div>
  );
}
