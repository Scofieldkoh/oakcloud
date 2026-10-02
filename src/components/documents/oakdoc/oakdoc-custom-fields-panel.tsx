'use client';

import { useState, type FormEvent } from 'react';
import { Pencil, Plus, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { FormInput } from '@/components/ui/form-input';
import { Modal, ModalBody, ModalFooter } from '@/components/ui/modal';
import { SearchableSelect } from '@/components/ui/searchable-select';
import {
  OAKDOC_CUSTOM_FIELD_TYPES,
  oakDocCustomFieldKeyFromLabel,
  oakDocCustomFieldTag,
  readPlaceholderOptions,
  type OakDocCustomField,
  type OakDocCustomFieldType,
} from '@/lib/document-editor/oakdoc-custom-fields';
import type { OakDocFieldDefinition } from '@/lib/document-editor/oakdoc-fields';

export interface OakDocCustomFieldsPanelProps {
  fields: OakDocCustomField[];
  onChange: (fields: OakDocCustomField[]) => void;
  /** Insert a field's control at the caret or around the selection. */
  onInsert: (field: OakDocFieldDefinition) => void;
  /** Tags already in the document. */
  presentTags: readonly string[];
  /** Fields copied from inserted partials; shown so they can be inserted too. */
  partialFields?: OakDocCustomField[];
  disabled?: boolean;
  /** Where the fields are defined, for the help text. */
  ownerLabel?: 'template' | 'partial';
}

const TYPE_LABELS = Object.fromEntries(
  OAKDOC_CUSTOM_FIELD_TYPES.map((type) => [type.value, type.label]),
) as Record<OakDocCustomFieldType, string>;

interface Draft {
  label: string;
  type: OakDocCustomFieldType;
  required: boolean;
  options: string;
}

const EMPTY_DRAFT: Draft = { label: '', type: 'text', required: true, options: '' };

function definitionOf(field: OakDocCustomField): OakDocFieldDefinition {
  return { tag: oakDocCustomFieldTag(field.key), label: field.label, category: 'Custom fields' };
}

/**
 * Custom fields of a Word template or partial: define them (label, type,
 * required, dropdown choices) and insert them into the document. Configure
 * asks for their values when a document is generated.
 */
export function OakDocCustomFieldsPanel({
  fields,
  onChange,
  onInsert,
  presentTags,
  partialFields = [],
  disabled = false,
  ownerLabel = 'template',
}: OakDocCustomFieldsPanelProps) {
  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<Draft>(EMPTY_DRAFT);
  const [error, setError] = useState<string | null>(null);

  const openNew = () => {
    setEditingKey(null);
    setDraft(EMPTY_DRAFT);
    setError(null);
    setOpen(true);
  };

  const openEdit = (field: OakDocCustomField) => {
    setEditingKey(field.key);
    setDraft({
      label: field.label,
      type: field.type,
      required: field.required,
      options: (field.options ?? []).join('\n'),
    });
    setError(null);
    setOpen(true);
  };

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const label = draft.label.trim();
    if (!label) {
      setError('Enter a label.');
      return;
    }
    const options = readPlaceholderOptions(draft.options.split('\n'));
    if (draft.type === 'dropdown' && options.length < 2) {
      setError('List at least two choices, one per line.');
      return;
    }
    const taken = new Set([...fields, ...partialFields].map((field) => field.key));
    if (editingKey) taken.delete(editingKey);
    const next: OakDocCustomField = {
      key: editingKey ?? oakDocCustomFieldKeyFromLabel(label, taken),
      label,
      type: draft.type,
      required: draft.required,
      ...(draft.type === 'dropdown' ? { options } : {}),
    };
    onChange(editingKey
      ? fields.map((field) => (field.key === editingKey ? next : field))
      : [...fields, next]);
    setOpen(false);
  };

  const remove = (key: string) => {
    onChange(fields.filter((field) => field.key !== key));
  };

  const renderRow = (field: OakDocCustomField, editable: boolean) => {
    const definition = definitionOf(field);
    const present = presentTags.includes(definition.tag);
    return (
      <div key={field.key} className="flex items-center gap-1 rounded-md hover:bg-oak-primary/5">
        <button
          type="button"
          disabled={disabled}
          onPointerDown={(event) => event.preventDefault()}
          onClick={() => onInsert(definition)}
          title={`Insert ${field.label}`}
          className="flex min-w-0 flex-1 items-center justify-between gap-2 px-2.5 py-2 text-left disabled:cursor-not-allowed disabled:opacity-40"
        >
          <span className="min-w-0">
            <span className="block truncate text-xs font-medium text-text-primary">
              {field.label}
              {field.required ? <span className="ml-0.5 text-status-error" aria-label="required">*</span> : null}
            </span>
            <span className="block truncate text-[10px] text-text-muted">
              {definition.tag} · {TYPE_LABELS[field.type]}
            </span>
          </span>
          {present ? (
            <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-oak-primary" title="Used in this document" />
          ) : null}
        </button>
        {editable ? (
          <>
            <Button
              variant="ghost"
              size="xs"
              iconOnly
              aria-label={`Edit ${field.label}`}
              disabled={disabled}
              onClick={() => openEdit(field)}
            >
              <Pencil className="h-3.5 w-3.5" aria-hidden="true" />
            </Button>
            <Button
              variant="ghost"
              size="xs"
              iconOnly
              aria-label={`Remove ${field.label}`}
              disabled={disabled}
              onClick={() => remove(field.key)}
            >
              <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
            </Button>
          </>
        ) : null}
      </div>
    );
  };

  return (
    <section className="space-y-2">
      <div className="flex items-end justify-between gap-2">
        <div>
          <h2 className="text-xs font-semibold uppercase tracking-wide text-text-muted">
            Custom fields
          </h2>
          <p className="mt-1 text-xs text-text-secondary">
            Values you type in when generating a document, such as a fee or a meeting date.
            Click a field to insert it; save the {ownerLabel} to keep the fields.
          </p>
        </div>
        <Button
          variant="secondary"
          size="xs"
          leftIcon={<Plus className="h-3.5 w-3.5" aria-hidden="true" />}
          disabled={disabled}
          onClick={openNew}
        >
          Add
        </Button>
      </div>

      {fields.length === 0 && partialFields.length === 0 ? (
        <p className="text-xs text-text-muted">No custom fields yet.</p>
      ) : (
        <div className="space-y-1">
          {fields.map((field) => renderRow(field, true))}
          {partialFields.length > 0 ? (
            <>
              <h3 className="pt-1 text-[11px] font-semibold uppercase tracking-wide text-text-muted">
                From inserted partials
              </h3>
              {partialFields.map((field) => renderRow(field, false))}
            </>
          ) : null}
        </div>
      )}

      <Modal
        isOpen={open}
        onClose={() => setOpen(false)}
        title={editingKey ? 'Edit custom field' : 'Add custom field'}
        size="sm"
      >
        <form onSubmit={submit}>
          <ModalBody className="space-y-4">
            <FormInput
              label="Label"
              value={draft.label}
              onChange={(event) => setDraft({ ...draft, label: event.target.value })}
              hint={editingKey
                ? `Field ${oakDocCustomFieldTag(editingKey)}; renaming the label keeps it.`
                : 'Shown on Configure when the document is generated.'}
              autoFocus
              required
            />
            <SearchableSelect
              label="Type"
              options={OAKDOC_CUSTOM_FIELD_TYPES.map((type) => ({ value: type.value, label: type.label }))}
              value={draft.type}
              onChange={(value) => {
                const type = OAKDOC_CUSTOM_FIELD_TYPES.find((option) => option.value === value);
                if (type) setDraft({ ...draft, type: type.value });
              }}
              clearable={false}
              size="md"
            />
            {draft.type === 'dropdown' ? (
              <label className="block">
                <span className="text-sm font-medium text-text-primary">Choices</span>
                <textarea
                  value={draft.options}
                  onChange={(event) => setDraft({ ...draft, options: event.target.value })}
                  rows={4}
                  placeholder={'One choice per line'}
                  className="mt-1 w-full rounded-lg border border-border-primary bg-background-primary px-3 py-2 text-sm text-text-primary focus:border-oak-primary focus:outline-none focus:ring-2 focus:ring-oak-primary/30"
                />
              </label>
            ) : null}
            <Checkbox
              label="Required"
              description="Generation waits until a value is entered."
              checked={draft.required}
              onChange={(event) => setDraft({ ...draft, required: event.target.checked })}
              size="sm"
            />
            {error ? <p role="alert" className="text-sm text-status-error">{error}</p> : null}
          </ModalBody>
          <ModalFooter>
            <Button type="button" variant="secondary" onClick={() => setOpen(false)}>Cancel</Button>
            <Button type="submit" variant="primary">
              {editingKey ? 'Save field' : 'Add field'}
            </Button>
          </ModalFooter>
        </form>
      </Modal>
    </section>
  );
}
