'use client';

import { useId, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Modal, ModalBody, ModalFooter } from '@/components/ui/modal';
import { OakDocContactShortlistPicker } from '@/components/documents/oakdoc/oakdoc-contact-shortlist-picker';
import {
  OAKDOC_REPEATER_DEFINITIONS,
  type OakDocRepeaterDefinition,
} from '@/lib/document-editor/oakdoc-repeaters';
import {
  OAKDOC_CONTACTS_REPEATER_TAG,
  OAKDOC_OFFICERS_REPEATER_TAG,
  OAKDOC_OFFICER_ROLE_FILTERS,
  formatOakDocOfficerRoles,
  oakDocOfficersRepeaterDefinition,
  oakDocRepeaterDefinitionForTag,
  parseOakDocOfficerRepeaterRoles,
} from '@/lib/document-editor/oakdoc-repeater-definitions';
import type { OakDocFieldDefinition } from '@/lib/document-editor/oakdoc-fields';
import type { OakDocCustomFieldContact } from '@/lib/document-editor/oakdoc-custom-fields';
import { cn } from '@/lib/utils';

export interface OakDocRepeaterPanelProps {
  /** Repeater tags in the document, one per repeating section. */
  repeaterTags: readonly string[];
  /** Repeating sections in the document; defaults to the number of distinct tags. */
  count?: number;
  /** Field tags in the document; each shows a dot. */
  fieldTags: readonly string[];
  disabled?: boolean;
  onAdd: (definition: OakDocRepeaterDefinition) => void;
  onRemoveAtCaret: () => void;
  onAssignField: (field: OakDocFieldDefinition) => void;
  /** The contacts repeater's shortlist; with onContactShortlistChange the author can edit it. */
  contactShortlist?: readonly OakDocCustomFieldContact[];
  onContactShortlistChange?: (contacts: OakDocCustomFieldContact[]) => void;
}

/** True when a tag in the document is this definition's repeater (an officers one with any roles). */
function usesDefinition(tags: readonly string[], definition: OakDocRepeaterDefinition): boolean {
  return tags.some((tag) => oakDocRepeaterDefinitionForTag(tag)?.tag === definition.tag);
}

/**
 * Repeating sections (directors, officers, shareholders, contacts...) and the
 * item fields of those in the document. Shared by the template editor and the
 * Word partial editor.
 */
export function OakDocRepeaterPanel({
  repeaterTags,
  count = repeaterTags.length,
  fieldTags,
  disabled = false,
  onAdd,
  onRemoveAtCaret,
  onAssignField,
  contactShortlist = [],
  onContactShortlistChange,
}: OakDocRepeaterPanelProps) {
  // Roles the next Officers section is limited to; none means any role.
  const [officerRoles, setOfficerRoles] = useState<string[]>([]);
  const [shortlistOpen, setShortlistOpen] = useState(false);
  const rolesLabelId = useId();
  const officerRepeaterRoles = repeaterTags.flatMap((tag) => {
    const roles = parseOakDocOfficerRepeaterRoles(tag);
    return roles === null ? [] : [formatOakDocOfficerRoles(roles) || 'any role'];
  });
  const toggleOfficerRole = (role: string) => setOfficerRoles((current) => (
    current.includes(role) ? current.filter((entry) => entry !== role) : [...current, role]
  ));

  return (
    <section className="space-y-3">
      <div>
        <div className="flex items-end justify-between gap-2">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-text-muted">
            Repeating sections
          </h2>
          <span className="text-[11px] text-text-muted">
            {count} in document
          </span>
        </div>
        <p className="mt-1 text-xs text-text-secondary">
          Put the caret in a paragraph or table row, then make that structure repeat for every person chosen.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-2">
        {OAKDOC_REPEATER_DEFINITIONS.map((base) => {
          const definition = base.tag === OAKDOC_OFFICERS_REPEATER_TAG
            ? oakDocOfficersRepeaterDefinition(officerRoles)
            : base;
          const present = usesDefinition(repeaterTags, base);
          return (
            <button
              key={base.tag}
              type="button"
              disabled={disabled}
              onPointerDown={(event) => event.preventDefault()}
              onClick={() => onAdd(definition)}
              className="rounded-lg border border-border-primary bg-background-primary px-2.5 py-2 text-left transition-colors hover:border-oak-primary/40 hover:bg-oak-primary/5 disabled:cursor-not-allowed disabled:opacity-40"
            >
              <span className="flex items-center justify-between gap-2">
                <span className="text-xs font-medium text-text-primary">{definition.label}</span>
                {present ? (
                  <span className="h-1.5 w-1.5 rounded-full bg-oak-primary" title="Used in this document" />
                ) : null}
              </span>
              <span className="mt-0.5 block break-all text-[10px] text-text-muted">{definition.tag}</span>
            </button>
          );
        })}
      </div>

      <div role="group" aria-labelledby={rolesLabelId} className="space-y-1.5">
        <div id={rolesLabelId} className="text-[11px] font-semibold uppercase tracking-wide text-text-muted">
          Officer roles
        </div>
        <p className="text-[10px] leading-relaxed text-text-muted">
          Limit a new Officers section to these roles, e.g. Secretary only. With none
          ticked it lists officers of any role. Configure offers only officers of these roles.
        </p>
        <div className="flex flex-wrap gap-1">
          {OAKDOC_OFFICER_ROLE_FILTERS.map((entry) => {
            const pressed = officerRoles.includes(entry.role);
            return (
              <button
                key={entry.role}
                type="button"
                aria-pressed={pressed}
                disabled={disabled}
                onPointerDown={(event) => event.preventDefault()}
                onClick={() => toggleOfficerRole(entry.role)}
                className={cn(
                  'rounded border px-1.5 py-0.5 text-[10px] transition-colors disabled:cursor-not-allowed disabled:opacity-40',
                  pressed
                    ? 'border-oak-primary bg-oak-primary/10 text-oak-primary'
                    : 'border-border-primary text-text-secondary hover:border-oak-primary/30 hover:bg-oak-primary/5',
                )}
              >
                {entry.label}
              </button>
            );
          })}
        </div>
      </div>

      {count > 0 ? (
        <button
          type="button"
          disabled={disabled}
          onClick={onRemoveAtCaret}
          className="w-full rounded-md border border-border-primary px-2.5 py-2 text-xs text-text-secondary transition-colors hover:border-status-error/40 hover:bg-status-error/5 hover:text-status-error disabled:cursor-not-allowed disabled:opacity-40"
        >
          Remove repeater at caret
        </button>
      ) : null}

      {OAKDOC_REPEATER_DEFINITIONS
        .filter((definition) => usesDefinition(repeaterTags, definition))
        .map((definition) => (
          <div key={definition.tag} className="rounded-lg border border-border-primary p-2.5">
            <div className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-text-muted">
              {definition.itemLabel} fields
            </div>
            {definition.tag === OAKDOC_OFFICERS_REPEATER_TAG ? (
              <p className="mb-2 text-[10px] leading-relaxed text-text-secondary">
                In this document: {officerRepeaterRoles.map((roles) => `Officers (${roles})`).join(', ')}
              </p>
            ) : null}
            {definition.tag === OAKDOC_CONTACTS_REPEATER_TAG && onContactShortlistChange ? (
              <div className="mb-2 flex items-center justify-between gap-2 rounded-md bg-background-secondary px-2 py-1.5">
                <span className="text-[10px] leading-relaxed text-text-secondary">
                  {contactShortlist.length === 0
                    ? 'Configure offers any contact.'
                    : `Configure offers ${contactShortlist.length} shortlisted contact${contactShortlist.length === 1 ? '' : 's'}.`}
                </span>
                <Button
                  variant="secondary"
                  size="xs"
                  disabled={disabled}
                  onClick={() => setShortlistOpen(true)}
                >
                  Shortlist
                </Button>
              </div>
            ) : null}
            <p className="mb-2 text-[10px] leading-relaxed text-text-muted">
              Select sample text inside the repeated row or paragraph, then assign the matching field.
            </p>
            <div className="space-y-1">
              {definition.fields.map((field) => {
                const present = fieldTags.includes(field.tag);
                return (
                  <button
                    key={field.tag}
                    type="button"
                    disabled={disabled}
                    onPointerDown={(event) => event.preventDefault()}
                    onClick={() => onAssignField(field)}
                    className="flex w-full items-center justify-between gap-2 rounded-md px-2 py-1.5 text-left transition-colors hover:bg-oak-primary/5 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    <span className="min-w-0">
                      <span className="block truncate text-xs font-medium text-text-primary">
                        {field.label}
                      </span>
                      <span className="block truncate text-[10px] text-text-muted">
                        {field.tag}
                      </span>
                    </span>
                    {present ? (
                      <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-oak-primary" title="Used in this document" />
                    ) : null}
                  </button>
                );
              })}
            </div>
          </div>
        ))}

      {onContactShortlistChange ? (
        <Modal
          isOpen={shortlistOpen}
          onClose={() => setShortlistOpen(false)}
          title="Contacts shortlist"
          size="sm"
        >
          <ModalBody className="space-y-3">
            <OakDocContactShortlistPicker
              contacts={contactShortlist}
              onChange={onContactShortlistChange}
              label="Contacts Configure offers"
            />
            <p className="text-xs text-text-secondary">
              Configure lists only these contacts for the Contacts section, to tick the ones
              the document names. Leave it empty to search every contact.
            </p>
          </ModalBody>
          <ModalFooter>
            <Button type="button" variant="primary" onClick={() => setShortlistOpen(false)}>Done</Button>
          </ModalFooter>
        </Modal>
      ) : null}
    </section>
  );
}
