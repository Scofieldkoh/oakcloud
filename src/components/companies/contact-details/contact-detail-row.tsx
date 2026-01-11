'use client';

import { Pencil, Trash2, X, Check, Loader2, Star } from 'lucide-react';
import { AUTOMATION_PURPOSES } from '@/lib/constants/automation-purposes';
import { detailTypeConfig, type ContactDetail, type EditFormState } from './types';
import { CopyButton } from './copy-button';

interface ContactDetailRowProps {
  detail: ContactDetail;
  canEdit: boolean;
  isEditing: boolean;
  editForm: EditFormState;
  onStartEdit: () => void;
  onCancelEdit: () => void;
  onSaveEdit: () => void;
  onDelete: () => void;
  onUpdateForm: (field: string, value: string | string[] | boolean) => void;
  isSaving: boolean;
  isDeleting: boolean;
}

export function ContactDetailRow({
  detail,
  canEdit,
  isEditing,
  editForm,
  onStartEdit,
  onCancelEdit,
  onSaveEdit,
  onDelete,
  onUpdateForm,
  isSaving,
  isDeleting,
}: ContactDetailRowProps) {
  const config = detailTypeConfig[detail.detailType];
  const Icon = config.icon;

  if (isEditing && canEdit) {
    return (
      <div className="flex flex-col gap-2 py-3 px-4 bg-surface-secondary">
        {/* Main row with inputs */}
        <div className="flex items-center gap-4">
          {/* Label column - w-[360px] */}
          <div className="flex-shrink-0 w-[360px]">
            <input
              type="text"
              value={editForm.label}
              onChange={(e) => onUpdateForm('label', e.target.value)}
              className="input input-xs w-full"
              placeholder="Label (optional)"
            />
          </div>

          {/* Type column - w-[300px] */}
          <div className="flex-shrink-0 w-[300px]">
            <select
              value={editForm.detailType}
              onChange={(e) => {
                const newType = e.target.value;
                onUpdateForm('detailType', newType);
                if (newType !== 'EMAIL') {
                  onUpdateForm('purposes', []);
                }
              }}
              className="input input-xs w-full"
            >
              {Object.entries(detailTypeConfig).map(([type, cfg]) => (
                <option key={type} value={type}>{cfg.label}</option>
              ))}
            </select>
          </div>

          {/* POC column - w-[80px] */}
          <div className="flex-shrink-0 w-[80px] flex items-center justify-center">
            <button
              type="button"
              onClick={() => onUpdateForm('isPoc', !editForm.isPoc)}
              className={`p-1.5 rounded transition-colors ${
                editForm.isPoc
                  ? 'text-amber-500 hover:text-amber-600'
                  : 'text-text-muted hover:text-amber-500'
              }`}
              title={editForm.isPoc ? 'Remove POC' : 'Set as POC'}
            >
              <Star className={`w-4 h-4 ${editForm.isPoc ? 'fill-current' : ''}`} />
            </button>
          </div>

          {/* Value column - flex-1 */}
          <div className="flex-1 min-w-0">
            <input
              type="text"
              value={editForm.value}
              onChange={(e) => onUpdateForm('value', e.target.value)}
              className="input input-xs w-full"
              placeholder="Value"
            />
          </div>

          {/* Actions column - w-[56px] */}
          <div className="flex-shrink-0 w-[56px] flex items-center gap-1">
            <button
              onClick={onCancelEdit}
              disabled={isSaving}
              className="text-text-muted hover:text-status-error p-1 rounded hover:bg-surface-tertiary"
              title="Cancel"
            >
              <X className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={onSaveEdit}
              disabled={isSaving || !editForm.value.trim()}
              className="text-text-muted hover:text-oak-light p-1 rounded hover:bg-surface-tertiary disabled:opacity-50"
              title="Save"
            >
              {isSaving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
            </button>
          </div>
        </div>

        {/* Purposes row - only for EMAIL type */}
        {editForm.detailType === 'EMAIL' && (
          <div className="flex items-center gap-4">
            {/* Empty spacers for Label, Type, and POC columns */}
            <div className="flex-shrink-0 w-[360px]" />
            <div className="flex-shrink-0 w-[300px]" />
            <div className="flex-shrink-0 w-[80px]" />
            {/* Automation aligned with Value column */}
            <div className="flex-1 flex items-center gap-2 min-w-0">
              <span className="text-xs text-text-muted flex-shrink-0">Automation:</span>
              <div className="flex flex-wrap gap-1.5">
                {AUTOMATION_PURPOSES.map((purpose) => (
                  <button
                    key={purpose.value}
                    type="button"
                    onClick={() => {
                      const newPurposes = editForm.purposes.includes(purpose.value)
                        ? editForm.purposes.filter(p => p !== purpose.value)
                        : [...editForm.purposes, purpose.value];
                      onUpdateForm('purposes', newPurposes);
                    }}
                    className={`text-xs px-2 py-1 rounded transition-colors ${
                      editForm.purposes.includes(purpose.value)
                        ? 'bg-oak-light text-white'
                        : 'bg-surface-tertiary text-text-secondary hover:bg-border-secondary'
                    }`}
                  >
                    {purpose.label}
                  </button>
                ))}
              </div>
            </div>
            {/* Empty spacer for Actions column */}
            <div className="flex-shrink-0 w-[56px]" />
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="flex items-center gap-4 py-2.5 px-4 hover:bg-surface-secondary transition-colors group">
      {/* Label column - aligned with Name (360px) */}
      <div className="flex-shrink-0 w-[360px]">
        <span className="text-sm text-text-primary truncate">
          {detail.label || <span className="text-text-muted italic">No label</span>}
        </span>
      </div>

      {/* Type column - w-[300px] */}
      <div className="flex-shrink-0 w-[300px] flex items-center gap-1.5">
        <Icon className="w-4 h-4 text-text-tertiary flex-shrink-0" />
        <span className="text-sm text-text-secondary">{config.label}</span>
      </div>

      {/* POC column - w-[80px] */}
      <div className="flex-shrink-0 w-[80px] flex items-center justify-center">
        {detail.isPoc && (
          <span className="text-amber-500" title="Point of Contact">
            <Star className="w-4 h-4 fill-current" />
          </span>
        )}
      </div>

      {/* Value column - aligned with Phone+Email */}
      <div className="flex-1 flex items-center gap-1.5 min-w-0">
        <span className="text-sm text-text-primary truncate">{detail.value}</span>
        <CopyButton value={detail.value} />
        {/* Only show purposes for EMAIL type - pill badge design */}
        {detail.detailType === 'EMAIL' && detail.purposes && detail.purposes.length > 0 && (
          <div className="hidden sm:flex items-center gap-1 flex-shrink-0">
            {detail.purposes.slice(0, 2).map((purpose) => (
              <span key={purpose} className="text-[10px] font-medium text-amber-700 bg-amber-100 px-2 py-0.5 rounded-full">
                {purpose}
              </span>
            ))}
            {detail.purposes.length > 2 && (
              <span className="text-[10px] text-text-muted">+{detail.purposes.length - 2}</span>
            )}
          </div>
        )}
      </div>

      {/* Actions column */}
      {canEdit && (
        <div className="flex-shrink-0 flex items-center gap-1">
          <button
            onClick={onStartEdit}
            className="text-text-muted hover:text-oak-light p-1 rounded hover:bg-surface-tertiary"
            title="Edit"
          >
            <Pencil className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={onDelete}
            className="text-text-muted hover:text-status-error p-1 rounded hover:bg-surface-tertiary"
            title="Delete"
            disabled={isDeleting}
          >
            {isDeleting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
          </button>
        </div>
      )}
    </div>
  );
}
