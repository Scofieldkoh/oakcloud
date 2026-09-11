import {
  normalizeTemplateFieldSyntax,
  parseTemplateFields,
  type ParseTemplateFieldsInput,
} from '@/lib/template-field-parser';
import {
  resolvePlaceholders,
  type PlaceholderContext,
  type ResolveOptions,
  type ResolveResult,
} from '@/lib/placeholder-resolver';
import type { ParsedTemplateFieldSyntax } from '@/lib/template-field-contract';

export interface ResolveTemplateFieldsResult extends ResolveResult {
  syntax: ParsedTemplateFieldSyntax;
}

/**
 * F1 canonical render/generation entry point. It performs no value escaping or
 * type coercion: parser-approved syntax is normalized, then the established
 * resolver is reused unchanged. Malformed expressions stay recoverable source.
 */
export function resolveTemplateFields(
  content: string,
  context: PlaceholderContext,
  options: ResolveOptions = {},
  parserOptions: Omit<ParseTemplateFieldsInput, 'content' | 'scope'> = {},
): ResolveTemplateFieldsResult {
  const syntax = parseTemplateFields({
    content,
    scope: { kind: 'template', id: 'runtime-resolution' },
    ...parserOptions,
  });
  const normalized = normalizeTemplateFieldSyntax(content, syntax);
  return {
    ...resolvePlaceholders(normalized, context, options),
    syntax,
  };
}
