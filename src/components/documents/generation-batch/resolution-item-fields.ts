import { appendOakDocPartialCustomFields } from '@/lib/document-editor/oakdoc-custom-fields';
import { resolutionPartialIds, type ResolutionComposition } from '@/lib/resolution-composition';
import { normalizeStoredPlaceholders, storageFormatToCustomPlaceholders } from '@/lib/template-analysis';
import type { CustomPlaceholderDefinition } from '@/types/placeholders';

/**
 * A resolution document's field tags: its template's, then those of the
 * partials chosen for its numbered resolutions, so a repeater inside a
 * chosen partial (officers, directors) gets its Configure picker.
 */
export function resolutionItemFieldTags(
  templateTags: readonly string[] | undefined,
  resolution: ResolutionComposition | null | undefined,
  partials: ReadonlyArray<{ id: string; fieldTags?: readonly string[] }>,
): readonly string[] | undefined {
  const ids = new Set(resolutionPartialIds(resolution));
  if (ids.size === 0) return templateTags;
  const tags = partials.filter((partial) => ids.has(partial.id)).flatMap((partial) => partial.fieldTags ?? []);
  return tags.length === 0 ? templateTags : Array.from(new Set([...(templateTags ?? []), ...tags]));
}

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
