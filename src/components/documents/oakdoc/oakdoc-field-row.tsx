'use client';

import { useId, useState, type ReactNode } from 'react';
import { Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { FormInput } from '@/components/ui/form-input';
import { SearchableSelect } from '@/components/ui/searchable-select';
import { OAKDOC_REPEATER_NAME_MAX } from '@/lib/document-editor/oakdoc-repeater-definitions';
import { OAKDOC_FIELD_CASE_OPTIONS, isOakDocFieldCase } from '@/lib/document-editor/oakdoc-field-case';
import type { OakDocFieldDefinition } from '@/lib/document-editor/oakdoc-fields';
import { OAKDOC_FIELD_DRAG_TYPE } from '@/lib/document-editor/oakdoc-field-blocks';
import { cn } from '@/lib/utils';

export interface OakDocFieldRowProps {
  /** The field Add inserts; its label names the row. */
  field: OakDocFieldDefinition;
  /** Shown after the label, e.g. a required mark. */
  badge?: ReactNode;
  /** Short line under the label once the row is open, e.g. "Dropdown · required". */
  detail?: ReactNode;
  /** The field is already in the document. */
  present?: boolean;
  selected: boolean;
  onSelect: () => void;
  onAdd: (field: OakDocFieldDefinition) => void;
  disabled?: boolean;
  /** Settings shown under an open row, e.g. the picker's name on Configure. */
  children?: ReactNode;
  /** Buttons beside Add, e.g. Edit and Remove. */
  actions?: ReactNode;
  /** Text of the Add button. */
  addLabel?: string;
}

/** Offers the text case the field prints in; Add (and a drag) carry the choice. */
function OakDocFieldCaseSelect({
  value,
  onChange,
  disabled,
}: {
  value: string;
  onChange: (value: string) => void;
  disabled: boolean;
}) {
  return (
    <SearchableSelect
      label="Text case"
      options={OAKDOC_FIELD_CASE_OPTIONS.map((option) => ({ value: option.value || 'stored', label: option.label }))}
      value={value || 'stored'}
      onChange={(next) => onChange(next === 'stored' ? '' : next)}
      disabled={disabled}
      clearable={false}
      showKeyboardHints={false}
      size="sm"
    />
  );
}

/** Keeps the editor's caret where it is when a panel button is pressed. */
export function keepEditorCaret(event: { preventDefault: () => void }) {
  event.preventDefault();
}

/**
 * One field in the OakDoc field panel. Clicking it opens it, showing its
 * placeholder, the text case it prints in, any settings and an Add button that inserts it at the
 * caret (or around the selected text). A double click adds it at once,
 * and it can be dragged onto the page.
 */
export function OakDocFieldRow({
  field,
  badge,
  detail,
  present = false,
  selected,
  onSelect,
  onAdd,
  disabled = false,
  children,
  actions,
  addLabel = 'Add',
}: OakDocFieldRowProps) {
  const [textCase, setTextCase] = useState('');
  // The field as Add inserts it, in the chosen case.
  const withCase = isOakDocFieldCase(textCase) ? { ...field, textCase } : field;
  return (
    <div
      className={cn(
        'rounded-md border transition-colors',
        selected ? 'border-oak-primary/40 bg-oak-primary/5' : 'border-transparent hover:bg-oak-primary/5',
      )}
    >
      <button
        type="button"
        aria-expanded={selected}
        disabled={disabled}
        draggable={!disabled}
        onPointerDown={keepEditorCaret}
        onDragStart={(event) => {
          event.dataTransfer.effectAllowed = 'copy';
          event.dataTransfer.setData(OAKDOC_FIELD_DRAG_TYPE, JSON.stringify(withCase));
        }}
        onClick={onSelect}
        onDoubleClick={() => onAdd(withCase)}
        title={selected ? undefined : 'Click for options, double-click to add, or drag onto the page'}
        className="flex w-full items-center justify-between gap-2 px-2.5 py-1.5 text-left disabled:cursor-not-allowed disabled:opacity-40"
      >
        <span className="min-w-0 truncate text-xs font-medium text-text-primary">
          {field.label}
          {badge}
        </span>
        {present ? (
          <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-oak-primary" title="Used in this document" />
        ) : null}
      </button>
      {selected ? (
        <div className="space-y-2 px-2.5 pb-2.5">
          <div className="space-y-0.5">
            <code className="block break-all text-[11px] text-text-muted">{`{{${field.tag}}}`}</code>
            {detail ? <div className="text-[11px] text-text-secondary">{detail}</div> : null}
          </div>
          <OakDocFieldCaseSelect value={textCase} onChange={setTextCase} disabled={disabled} />
          {children}
          <div className="flex items-center gap-1">
            <Button
              variant="primary"
              size="xs"
              disabled={disabled}
              onPointerDown={keepEditorCaret}
              onClick={() => onAdd(withCase)}
              leftIcon={<Plus className="h-3.5 w-3.5" aria-hidden="true" />}
              aria-label={`${addLabel} ${field.label}`}
            >
              {addLabel}
            </Button>
            {actions}
          </div>
        </div>
      ) : null}
    </div>
  );
}

export interface OakDocConfigureNameProps {
  value: string;
  onChange: (value: string) => void;
  /** What Configure shows when no name is given, e.g. "Director". */
  placeholder: string;
  hint?: string;
  error?: string;
  disabled?: boolean;
  label?: string;
}

/**
 * The name Configure shows for a picker or repeating section, e.g.
 * "Signer of the resolution(s)" instead of "Director".
 */
export function OakDocConfigureName({
  value,
  onChange,
  placeholder,
  hint,
  error,
  disabled = false,
  label = 'Name on Configure',
}: OakDocConfigureNameProps) {
  const id = useId();
  return (
    <FormInput
      id={id}
      label={label}
      inputSize="xs"
      value={value}
      maxLength={OAKDOC_REPEATER_NAME_MAX}
      placeholder={placeholder}
      hint={hint}
      error={error}
      disabled={disabled}
      onChange={(event) => onChange(event.target.value)}
      containerClassName="gap-1"
      className="focus:ring-offset-0"
    />
  );
}
