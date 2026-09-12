import type { PlaceholderContext } from '@/lib/placeholder-resolver';
import { readA4StoredDocument } from '@/lib/document-editor/a4-editor-format';
import {
  normalizeStoredFieldDefinitionInput,
  resolveTopLevelCustomValues,
} from '@/lib/document-editor/template-field-workflow';
import {
  renderTemplateForGeneration,
  type RenderTemplateForGenerationResult,
} from '@/services/document-generator.service';

export interface TemplatePreviewSnapshotInput {
  tenantId: string;
  generatedBy: string;
  content: string;
  contentJson?: unknown;
  placeholders?: unknown;
  compositionType?: 'STANDARD' | 'SERVICE_AGREEMENT';
  templateScopeId?: string;
  name?: string;
  category?: string;
  companyId?: string | null;
  contactIds?: string[];
  customData?: Record<string, unknown>;
  context?: PlaceholderContext;
}

export interface TemplatePreviewSnapshotResult {
  rendered: RenderTemplateForGenerationResult;
  snapshot: {
    contentJson: unknown;
    placeholders: Readonly<Record<string, unknown>>[];
    compositionType: 'STANDARD' | 'SERVICE_AGREEMENT';
  };
}

/**
 * Thin W2 adapter for an unsaved C1 editor snapshot. The canonical document
 * renderer remains the only HTML/template renderer. W2 contributes complete
 * unsaved metadata and resolves top-level custom values through the F1 field
 * registry before entering that renderer; no temporary template row is
 * created and no revision authority is introduced here.
 */
export async function renderUnsavedTemplateSnapshot(
  input: TemplatePreviewSnapshotInput,
): Promise<TemplatePreviewSnapshotResult> {
  readA4StoredDocument(input.content, input.contentJson);

  const definitions = normalizeStoredFieldDefinitionInput(input.placeholders);
  const scope = {
    kind: 'template' as const,
    id: input.templateScopeId ?? `preview:${input.name ?? 'unsaved-template'}`,
  };
  const effectiveCustomData = resolveTopLevelCustomValues({
    definitions,
    scope,
    itemValues: input.customData ?? {},
  });

  const rendered = await renderTemplateForGeneration({
    tenantId: input.tenantId,
    templateContent: input.content,
    templateName: input.name,
    templateCategory: input.category,
    companyId: input.companyId,
    contactIds: input.contactIds,
    customData: effectiveCustomData,
    contextOverride: input.context,
    generatedBy: input.generatedBy,
    mode: 'test',
  });

  return {
    rendered,
    snapshot: {
      contentJson: input.contentJson ?? null,
      placeholders: definitions,
      compositionType: input.compositionType ?? 'STANDARD',
    },
  };
}
