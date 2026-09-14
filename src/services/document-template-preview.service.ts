import type { PlaceholderContext } from '@/lib/placeholder-resolver';
import type { FieldInputDescriptor } from '@/lib/template-field-contract';
import { readA4StoredDocument } from '@/lib/document-editor/a4-editor-format';
import {
  createStoredWorkflowFieldInputDescriptors,
  normalizeStoredFieldDefinitionInput,
  normalizeWorkflowInputValues,
  resolveTopLevelCustomValues,
} from '@/lib/document-editor/template-field-workflow';
import {
  renderTemplateForWorkflow,
} from '@/services/document-workflow-renderer.service';
import type { RenderTemplateForGenerationResult } from '@/services/document-generator.service';

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
    inputDescriptors: FieldInputDescriptor[];
  };
}

/**
 * W3 adapter for an unsaved C1 editor snapshot. The scoped workflow renderer
 * consumes the complete unsaved field schema and original template source; no
 * temporary template row is created and no legacy flattened partial identity
 * is introduced. Route callback values are normalized from F's typed input
 * descriptors before canonical precedence resolution, so real false, exact
 * zero/date/currency strings and multiline text survive the request boundary.
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
  const inputDescriptors = createStoredWorkflowFieldInputDescriptors(definitions, scope);
  const normalizedRouteValues = normalizeWorkflowInputValues(
    inputDescriptors,
    input.customData ?? {},
  );
  const effectiveCustomData = resolveTopLevelCustomValues({
    definitions,
    scope,
    itemValues: normalizedRouteValues,
  });

  const rendered = await renderTemplateForWorkflow({
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
    templatePlaceholders: definitions,
    templateScopeId: scope.id,
    compositionType: input.compositionType ?? 'STANDARD',
  });

  return {
    rendered,
    snapshot: {
      contentJson: input.contentJson ?? null,
      placeholders: definitions,
      compositionType: input.compositionType ?? 'STANDARD',
      inputDescriptors,
    },
  };
}
