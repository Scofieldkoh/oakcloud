'use client';

import { Pencil, Trash2, Star, X, Check, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { AUTOMATION_PURPOSES } from '@/lib/constants/automation-purposes';
import { detailTypeConfig, labelSuggestions, type ContactDetail, type EditFormState } from './types';

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
      <div className="flex flex-col gap-2 p-3 bg-surface-secondary rounded-lg border border-oak-light/30">
        <div className="flex flex-wrap items-center gap-2">
          <select
            value={editForm.detailType}
            onChange={(e) => {
              const newType = e.target.value;
              onUpdateForm('detailType', newType);
              // Clear purposes when switching away from EMAIL
              if (newType !== 'EMAIL') {
                onUpdateForm('purposes', []);
              }
            }}
            className="input input-xs w-24"
          >
            {Object.entries(detailTypeConfig).map(([type, cfg]) => (
              <option key={type} value={type}>{cfg.label}</option>
            ))}
          </select>
          <input
            type="text"
            value={editForm.value}
            onChange={(e) => onUpdateForm('value', e.target.value)}
            className="input input-xs flex-1 min-w-[150px]"
            placeholder="Value"
          />
          <input
            type="text"
            value={editForm.label}
            onChange={(e) => onUpdateForm('label', e.target.value)}
            className="input input-xs w-28"
            placeholder="Label"
            list="label-suggestions-edit"
          />
          <button
            onClick={() => onUpdateForm('isPrimary', !editForm.isPrimary)}
            className={`p-1.5 rounded ${editForm.isPrimary ? 'text-status-warning bg-status-warning/10' : 'text-text-muted hover:text-text-secondary'}`}
            title={editForm.isPrimary ? 'Primary' : 'Set as primary'}
          >
            <Star className="w-4 h-4" fill={editForm.isPrimary ? 'currentColor' : 'none'} />
          </button>
        </div>
        {/* Purposes in edit mode - only for EMAIL type */}
        {editForm.detailType === 'EMAIL' && (
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
                    : 'bg-surface-tertiary text-text-secondary hover:bg-surface-secondary'
                }`}
              >
                {purpose.label}
              </button>
            ))}
          </div>
        )}
        <div className="flex justify-end gap-2 pt-1">
          <Button variant="ghost" size="xs" onClick={onCancelEdit} disabled={isSaving}>
            <X className="w-3.5 h-3.5 mr-1" />
            Cancel
          </Button>
          <Button variant="primary" size="xs" onClick={onSaveEdit} disabled={isSaving || !editForm.value.trim()}>
            {isSaving ? <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" /> : <Check className="w-3.5 h-3.5 mr-1" />}
            Save
          </Button>
        </div>
        <datalist id="label-suggestions-edit">
          {labelSuggestions.map((label) => (
            <option key={label} value={label} />
          ))}
        </datalist>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2 py-2 px-3 rounded-lg hover:bg-surface-secondary transition-colors group">
      <Icon className="w-4 h-4 text-text-tertiary flex-shrink-0" />
      <span className="text-sm text-text-primary flex-1 truncate">{detail.value}</span>
      {detail.label && (
        <span className="text-xs text-text-muted bg-surface-tertiary px-1.5 py-0.5 rounded flex-shrink-0">
          {detail.label}
        </span>
      )}
      {/* Only show purposes for EMAIL type */}
      {detail.detailType === 'EMAIL' && detail.purposes && detail.purposes.length > 0 && (
        <div className="hidden sm:flex items-center gap-1 flex-shrink-0">
          {detail.purposes.slice(0, 2).map((purpose) => (
            <span key={purpose} className="text-xs text-oak-light bg-oak-light/10 px-1.5 py-0.5 rounded">
              {purpose}
            </span>
          ))}
          {detail.purposes.length > 2 && (
            <span className="text-xs text-text-muted">+{detail.purposes.length - 2}</span>
          )}
        </div>
      )}
      {detail.isPrimary && (
        <Star className="w-3.5 h-3.5 text-status-warning flex-shrink-0" fill="currentColor" />
      )}
      {canEdit && (
        <div className="opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-1 flex-shrink-0">
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
