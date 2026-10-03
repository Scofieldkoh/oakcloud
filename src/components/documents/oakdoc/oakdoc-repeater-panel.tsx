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
  OAKDOC_REPEATER_NAME_MAX,
  formatOakDocOfficerRoles,
  isOakDocContactsRepeaterTag,
  oakDocContactListNameFromSlug,
  oakDocContactListSlug,
  oakDocContactsRepeaterDefinition,
  oakDocOfficersRepeaterDefinition,
  oakDocRepeaterDefinitionForTag,
  parseOakDocContactListSlug,
  parseOakDocOfficerRepeaterRoles,
} from '@/lib/document-editor/oakdoc-repeater-definitions';
import type { OakDocFieldDefinition } from '@/lib/document-editor/oakdoc-fields';
import {
  normalizeOakDocRepeaterName,
  type OakDocCustomFieldContact,
  type OakDocRepeaterSections,
} from '@/lib/document-editor/oakdoc-custom-fields';
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
  /**
   * Names of the document's sections and shortlists of its contacts lists;
   * with onSectionsChange the author can name sections and edit shortlists.
   */
  sections?: OakDocRepeaterSections;
  onSectionsChange?: (sections: OakDocRepeaterSections) => void;
}

const NO_SECTIONS: OakDocRepeaterSections = { names: {}, shortlists: {} };

/** True when a tag in the document is this definition's repeater (an officers one with any roles). */
function usesDefinition(tags: readonly string[], definition: OakDocRepeaterDefinition): boolean {
  return tags.some((tag) => oakDocRepeaterDefinitionForTag(tag)?.tag === definition.tag);
}

/** What a section is, from its tag: "Officers (Secretary)", "Contacts list". */
function sectionKindLabel(tag: string, definition: OakDocRepeaterDefinition): string {
  if (parseOakDocContactListSlug(tag)) return `${definition.label} list`;
  const roles = parseOakDocOfficerRepeaterRoles(tag);
  if (roles !== null) return `${definition.label} (${formatOakDocOfficerRoles(roles) || 'any role'})`;
  return definition.label;
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
  sections = NO_SECTIONS,
  onSectionsChange,
}: OakDocRepeaterPanelProps) {
  // Roles the next Officers section is limited to; none means any role.
  const [officerRoles, setOfficerRoles] = useState<string[]>([]);
  // Name of the next section inserted; a named Contacts section is its own list.
  const [newName, setNewName] = useState('');
  const [shortlistTag, setShortlistTag] = useState<string | null>(null);
  const rolesLabelId = useId();
  const nameInputId = useId();
  const toggleOfficerRole = (role: string) => setOfficerRoles((current) => (
    current.includes(role) ? current.filter((entry) => entry !== role) : [...current, role]
  ));
  const canName = Boolean(onSectionsChange);
  const pendingName = canName ? normalizeOakDocRepeaterName(newName) : '';
  const contactListUnnamed = pendingName !== '' && oakDocContactListSlug(pendingName) === '';
  const usedTags = Array.from(new Set(repeaterTags));

  const nameOf = (tag: string): string => {
    const slug = parseOakDocContactListSlug(tag);
    return sections.names[tag] ?? (slug ? oakDocContactListNameFromSlug(slug) : '');
  };
  const setName = (tag: string, name: string) => onSectionsChange?.({
    ...sections,
    names: { ...sections.names, [tag]: name },
  });
  const setShortlist = (tag: string, contacts: OakDocCustomFieldContact[]) => onSectionsChange?.({
    ...sections,
    shortlists: { ...sections.shortlists, [tag]: contacts },
  });
  const insert = (definition: OakDocRepeaterDefinition) => {
    if (pendingName) {
      // A named list keeps its first name when the same name is inserted again.
      const keep = parseOakDocContactListSlug(definition.tag) && sections.names[definition.tag];
      if (!keep) setName(definition.tag, pendingName);
      setNewName('');
    }
    onAdd(definition);
  };
  const shortlist = shortlistTag ? sections.shortlists[shortlistTag] ?? [] : [];
  const shortlistName = shortlistTag ? nameOf(shortlistTag) : '';

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

      {canName ? (
        <div className="space-y-1">
          <label htmlFor={nameInputId} className="block text-[11px] font-semibold uppercase tracking-wide text-text-muted">
            Section name
          </label>
          <input
            id={nameInputId}
            type="text"
            value={newName}
            maxLength={OAKDOC_REPEATER_NAME_MAX}
            disabled={disabled}
            placeholder="e.g. Signers for the resolution(s)"
            onChange={(event) => setNewName(event.target.value)}
            aria-invalid={contactListUnnamed || undefined}
            className="w-full rounded-md border border-border-primary bg-background-primary px-2 py-1.5 text-xs text-text-primary placeholder:text-text-muted focus:border-oak-primary focus:outline-none focus:ring-2 focus:ring-oak-primary/30 disabled:opacity-40"
          />
          <p className={cn('text-[10px] leading-relaxed', contactListUnnamed ? 'text-status-error' : 'text-text-muted')}>
            {contactListUnnamed
              ? 'A Contacts list name needs letters or numbers.'
              : 'Optional. Configure titles the new section\'s picker with it. A named Contacts section is its own list, with its own shortlist and ticks.'}
          </p>
        </div>
      ) : null}

      <div className="grid grid-cols-2 gap-2">
        {OAKDOC_REPEATER_DEFINITIONS.map((base) => {
          const definition = base.tag === OAKDOC_OFFICERS_REPEATER_TAG
            ? oakDocOfficersRepeaterDefinition(officerRoles)
            : base.tag === OAKDOC_CONTACTS_REPEATER_TAG
              ? oakDocContactsRepeaterDefinition(pendingName)
              : base;
          const present = usesDefinition(repeaterTags, base);
          const blocked = base.tag === OAKDOC_CONTACTS_REPEATER_TAG && contactListUnnamed;
          return (
            <button
              key={base.tag}
              type="button"
              disabled={disabled || blocked}
              onPointerDown={(event) => event.preventDefault()}
              onClick={() => insert(definition)}
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
        .map((definition) => {
          const tags = usedTags.filter((tag) => oakDocRepeaterDefinitionForTag(tag)?.tag === definition.tag);
          return (
            <div key={definition.tag} className="rounded-lg border border-border-primary p-2.5">
              <div className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-text-muted">
                {definition.itemLabel} fields
              </div>
              <ul className="mb-2 space-y-1.5" aria-label={`${definition.label} sections`}>
                {tags.map((tag) => {
                  const kindLabel = sectionKindLabel(tag, definition);
                  const name = nameOf(tag);
                  const contactsTag = isOakDocContactsRepeaterTag(tag);
                  const listShortlist = sections.shortlists[tag] ?? [];
                  return (
                    <li key={tag} className="space-y-1 rounded-md bg-background-secondary px-2 py-1.5">
                      <div className="text-[10px] font-medium text-text-secondary">
                        {name ? `${name} · ${kindLabel}` : kindLabel}
                      </div>
                      <div className="break-all text-[10px] text-text-muted">{tag}</div>
                      {canName && tag !== OAKDOC_CONTACTS_REPEATER_TAG ? (
                        <input
                          type="text"
                          value={sections.names[tag] ?? ''}
                          maxLength={OAKDOC_REPEATER_NAME_MAX}
                          disabled={disabled}
                          aria-label={`Name of ${kindLabel} section`}
                          placeholder={parseOakDocContactListSlug(tag) ? name : 'Name shown on Configure'}
                          onChange={(event) => setName(tag, event.target.value)}
                          className="w-full rounded border border-border-primary bg-background-primary px-1.5 py-1 text-[11px] text-text-primary placeholder:text-text-muted focus:border-oak-primary focus:outline-none disabled:opacity-40"
                        />
                      ) : null}
                      {canName && contactsTag ? (
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-[10px] leading-relaxed text-text-secondary">
                            {listShortlist.length === 0
                              ? 'Configure offers any contact.'
                              : `Configure offers ${listShortlist.length} shortlisted contact${listShortlist.length === 1 ? '' : 's'}.`}
                          </span>
                          <Button
                            variant="secondary"
                            size="xs"
                            disabled={disabled}
                            aria-label={tag === OAKDOC_CONTACTS_REPEATER_TAG ? undefined : `Shortlist for ${name}`}
                            onClick={() => setShortlistTag(tag)}
                          >
                            Shortlist
                          </Button>
                        </div>
                      ) : null}
                    </li>
                  );
                })}
              </ul>
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
          );
        })}

      {onSectionsChange ? (
        <Modal
          isOpen={shortlistTag !== null}
          onClose={() => setShortlistTag(null)}
          title={shortlistName ? `${shortlistName} shortlist` : 'Contacts shortlist'}
          size="sm"
        >
          <ModalBody className="space-y-3">
            <OakDocContactShortlistPicker
              contacts={shortlist}
              onChange={(contacts) => {
                if (shortlistTag) setShortlist(shortlistTag, contacts);
              }}
              label="Contacts Configure offers"
            />
            <p className="text-xs text-text-secondary">
              Configure lists only these contacts for this Contacts section, to tick the ones
              the document names. Leave it empty to search every contact.
            </p>
          </ModalBody>
          <ModalFooter>
            <Button type="button" variant="primary" onClick={() => setShortlistTag(null)}>Done</Button>
          </ModalFooter>
        </Modal>
      ) : null}
    </section>
  );
}
