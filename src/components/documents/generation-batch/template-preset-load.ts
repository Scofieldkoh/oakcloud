import type { DocumentTemplateSummary } from '@/types/document-generation';
import type { DocumentTemplatePresetDto, DocumentTemplatePresetUnavailableReason } from '@/types/document-template-preset';

export type PresetSkipReason = DocumentTemplatePresetUnavailableReason | 'not-in-catalogue' | 'limit';
export interface PresetLoadPlan {
  templates: DocumentTemplateSummary[];
  skipped: Array<{ name: string; reason: PresetSkipReason }>;
}

/** Append only: the caller supplies the remaining room, never existing inputs. */
export function planPresetLoad(
  preset: DocumentTemplatePresetDto,
  catalogue: DocumentTemplateSummary[],
  room: number,
): PresetLoadPlan {
  const byId = new Map(catalogue.map((template) => [template.id, template]));
  const result: PresetLoadPlan = { templates: [], skipped: [] };
  for (const item of preset.items) {
    const template = item.template ?? byId.get(item.resolvedTemplateId);
    let reason: PresetSkipReason | undefined;
    if (!item.available) reason = item.unavailableReason ?? 'deleted';
    else if (!template) reason = 'not-in-catalogue';
    else if (!template.isActive) reason = 'inactive';
    else if (template.engine !== 'OAKDOC') reason = 'not-word';
    else if (result.templates.length >= Math.max(0, room)) reason = 'limit';
    if (reason) result.skipped.push({ name: item.templateName, reason });
    else if (template) result.templates.push(template);
  }
  return result;
}

const REASON_LABELS: Record<PresetSkipReason, string> = {
  deleted: 'deleted',
  inactive: 'inactive',
  'not-word': 'not a Word template',
  'not-in-catalogue': 'not in the current catalogue',
  limit: 'over the 20 document limit',
};

export function describePresetLoad(preset: DocumentTemplatePresetDto, plan: PresetLoadPlan): {
  variant: 'success' | 'warning' | 'error'; text: string;
} {
  const count = plan.templates.length;
  if (plan.skipped.length === 0) {
    return { variant: 'success', text: `Added ${count} templates from “${preset.name}”.` };
  }
  const summary = count === 0
    ? `No templates were added from “${preset.name}”.`
    : `Added ${count} of ${preset.items.length} templates from “${preset.name}”.`;
  const skipped = plan.skipped.map((item) => `${item.name} (${REASON_LABELS[item.reason]})`).join('; ');
  return { variant: count === 0 ? 'error' : 'warning', text: `${summary} Skipped: ${skipped}.` };
}
