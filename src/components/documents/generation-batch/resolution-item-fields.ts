import { appendOakDocPartialCustomFields } from '@/lib/document-editor/oakdoc-custom-fields';
import { resolutionPartialIds, type ResolutionComposition } from '@/lib/resolution-composition';
import { normalizeStoredPlaceholders, storageFormatToCustomPlaceholders } from '@/lib/template-analysis';
import type { CustomPlaceholderDefinition } from '@/types/placeholders';

/**
 * A resolution document's fields: its template's, then the custom fields of
 * the partials chosen for its numbered resolutions. Generation adds the same
 * fields (withResolutionPartialFields), so Configure asks for what prints.
 */
export function resolutionItemFields(
  templateFields: CustomPlaceholderDefinition[],
  resolution: ResolutionComposition | null | undefined,
  partials: ReadonlyArray<{ id: string; placeholders: unknown }>,
): CustomPlaceholderDefinition[] {
  const ids = resolutionPartialIds(resolution);
  if (ids.length === 0) return templateFields;
  const byId = new Map(partials.map((partial) => [partial.id, partial]));
  const chosen = ids.flatMap((id) => byId.get(id) ?? []);
  const partialFields = storageFormatToCustomPlaceholders(
    normalizeStoredPlaceholders(appendOakDocPartialCustomFields([], chosen)),
  );
  const taken = new Set(templateFields.map((field) => field.key));
  const added = partialFields.filter((field) => !taken.has(field.key));
  return added.length === 0 ? templateFields : [...templateFields, ...added];
}
