'use client';

import { DocumentPartyChoiceList } from '@/components/documents/document-party-choice-list';
import type { DocumentParty } from '@/lib/document-party';
import type { BatchItemConfiguration } from '@/types/document-generation-batch';
import type { EditableBatchItem } from './batch-workspace-state';
import { PARTY_CONFIGURATION_KEYS, type TemplatePartyNeeds } from './template-party-needs';

type PartyKey = (typeof PARTY_CONFIGURATION_KEYS)[number][1];

export interface BatchSharedPartiesProps {
  items: EditableBatchItem[];
  /** Party choices each item's template asks for, by item key. */
  needsByItemKey: Record<string, TemplatePartyNeeds>;
  directors: DocumentParty[];
  shareholders: DocumentParty[];
  officers?: DocumentParty[];
  contacts: DocumentParty[];
  isLoading?: boolean;
  error?: string | null;
  onRetry?: () => void;
  /** Writes one party choice onto every listed document. */
  onApply: (itemKeys: string[], patch: Partial<BatchItemConfiguration>) => void;
  disabled?: boolean;
}

const LABELS: Record<PartyKey, string> = {
  selectedDirectorId: 'Director',
  selectedDirectorIds: 'Directors',
  selectedShareholderId: 'Shareholder',
  selectedShareholderIds: 'Shareholders',
  selectedOfficerIds: 'Officers',
  selectedContactId: 'Contact',
};

/**
 * Checked parties for a repeater: every party until the user narrows the
 * list, except officers, which start unticked.
 */
function checkedIds(options: DocumentParty[], ids: string[] | undefined, allByDefault = true): string[] {
  if (ids === undefined) return allByDefault ? options.map((party) => party.id) : [];
  const available = new Set(options.map((party) => party.id));
  return ids.filter((id) => available.has(id));
}

function sameIds(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false;
  const set = new Set(a);
  return b.every((id) => set.has(id));
}

/**
 * Party choices used by more than one document, set once for all of them.
 * Each document can still be changed on Configure.
 */
export function BatchSharedParties({
  items,
  needsByItemKey,
  directors,
  shareholders,
  officers = [],
  contacts,
  isLoading = false,
  error = null,
  onRetry,
  onApply,
  disabled = false,
}: BatchSharedPartiesProps) {
  const apply = (itemKeys: string[], patch: Partial<BatchItemConfiguration>) => {
    if (!disabled) onApply(itemKeys, patch);
  };
  const optionsFor = (key: PartyKey): DocumentParty[] => {
    if (key === 'selectedDirectorId' || key === 'selectedDirectorIds') return directors;
    if (key === 'selectedShareholderId' || key === 'selectedShareholderIds') return shareholders;
    if (key === 'selectedOfficerIds') return officers;
    return contacts;
  };

  const shared = PARTY_CONFIGURATION_KEYS
    .map(([need, key]) => ({
      key,
      targets: items.filter((item) => item.status !== 'GENERATED' && needsByItemKey[item.key]?.[need]),
    }))
    .filter(({ targets }) => targets.length >= 2);

  if (shared.length === 0) return null;

  return (
    <section aria-labelledby="shared-parties-heading">
      <h2 id="shared-parties-heading" className="text-sm font-medium text-text-primary">
        Shared parties
      </h2>
      <p className="mt-1 text-xs text-text-muted">
        Choices used by more than one document. Changing one here updates every document
        that uses it; you can still change a single document on Configure.
      </p>
      <div className="mt-3 grid gap-4 lg:grid-cols-2 xl:grid-cols-3">
        {shared.map(({ key, targets }) => {
          const options = optionsFor(key);
          const targetKeys = targets.map((item) => item.key);
          const note = `Used by ${targets.length} documents`;
          if (key === 'selectedDirectorIds' || key === 'selectedShareholderIds' || key === 'selectedOfficerIds') {
            const selections = targets.map((item) =>
              checkedIds(options, item.configuration[key], key !== 'selectedOfficerIds'));
            const differs = selections.some((ids) => !sameIds(ids, selections[0]));
            return (
              <div key={key}>
                <DocumentPartyChoiceList
                  id={`shared-${key}`}
                  label={LABELS[key]}
                  options={options}
                  values={selections[0]}
                  onChange={(values) => apply(targetKeys, { [key]: values })}
                  multiple
                  isLoading={isLoading}
                  error={error}
                  onRetry={onRetry}
                />
                <p className="mt-1 text-xs text-text-muted">
                  {differs ? `${note}; they differ, so the first document is shown.` : note}
                </p>
              </div>
            );
          }
          const values = targets.map((item) => item.configuration[key] ?? '');
          const differs = values.some((value) => value !== values[0]);
          return (
            <div key={key}>
              <DocumentPartyChoiceList
                id={`shared-${key}`}
                label={LABELS[key]}
                options={options}
                value={values[0]}
                onChange={(value) => apply(targetKeys, { [key]: value || null })}
                isLoading={isLoading}
                error={error}
                onRetry={onRetry}
              />
              <p className="mt-1 text-xs text-text-muted">
                {differs ? `${note}; they differ, so the first document is shown.` : note}
              </p>
            </div>
          );
        })}
      </div>
    </section>
  );
}
