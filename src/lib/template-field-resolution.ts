import {
  createDeclarativeFieldContentFragment,
  isCanonicalTrustedRichOrigin,
  type ResolvedContentFragment,
  type TrustedRichOrigin,
} from '@/lib/a4-content-policy';
import {
  classifyFieldValue,
  type FieldOwnerScope,
  type FieldParserDiagnostic,
  type LosslessStoredFieldDefinition,
  type TypedFieldValue,
} from '@/lib/template-field-contract';
import {
  parseTemplateFields,
  type TemplateFieldPartialSource,
} from '@/lib/template-field-parser';

/**
 * F2 field semantics are deliberately independent from the legacy renderer.
 * WORKFLOW can consume this API behind the D2 activation gate without granting
 * client/stored metadata HTML authority or flattening owner scopes.
 */

export interface ScopedTemplateFieldSource {
  scope: FieldOwnerScope;
  content: string;
  definitions: readonly LosslessStoredFieldDefinition[];
}

export interface ScopedTemplateFieldPartial extends TemplateFieldPartialSource {
  definitions: readonly LosslessStoredFieldDefinition[];
}

/**
 * A target field may intentionally share the value of a source field. The
 * binding is explicit and identity based; display names and legacy aliases do
 * not create sharing implicitly.
 */
export interface ScopedFieldValueBinding {
  targetIdentity: string;
  sourceIdentity: string;
}

export type ScopedFieldResolutionDiagnosticCode =
  | 'ambiguous-scoped-field'
  | 'missing-scoped-value'
  | 'required-scoped-value-missing'
  | 'unsupported-legacy-field-value'
  | 'unknown-field-modifier'
  | 'missing-rich-sanitizer'
  | 'untrusted-rich-origin'
  | 'unapproved-legacy-rich-binding'
  | 'field-binding-cycle'
  | 'field-binding-missing-target'
  | 'field-binding-type-mismatch'
  | 'ambiguous-legacy-value'
  | 'unmapped-legacy-value';

export interface ScopedFieldResolutionDiagnostic {
  code: ScopedFieldResolutionDiagnosticCode;
  severity: 'error' | 'warning';
  message: string;
  scope?: FieldOwnerScope;
  fieldIdentity?: string;
  occurrenceId?: string;
  legacyKey?: string;
}

export interface RenderResolvedFieldFragmentOptions {
  sanitizeTrustedRich?: (html: string, origin: TrustedRichOrigin) => string;
  approvedLegacyRichBindings?: ReadonlySet<string>;
  sanitizeApprovedLegacyRich?: (html: string, compatibilityBinding: string) => string;
}

export type RenderedFieldFragmentResult =
  | { status: 'rendered'; html: string; kind: ResolvedContentFragment['kind'] }
  | { status: 'blocked'; diagnostic: ScopedFieldResolutionDiagnostic };

const HTML_TEXT_ESCAPE = /[&<>"']/g;
const HTML_TEXT_ESCAPE_MAP: Readonly<Record<string, string>> = Object.freeze({
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
});

/** Escape ordinary field text exactly at the interpolation boundary. */
export function escapeFieldText(value: string): string {
  return value.replace(HTML_TEXT_ESCAPE, (character) => HTML_TEXT_ESCAPE_MAP[character] ?? character);
}

function normalizeNewlines(value: string): string {
  return value.replace(/\r\n?/g, '\n');
}

/**
 * C06 renderer boundary. Text is always escaped. Trusted rich content must
 * carry the in-process canonical capability and must pass a sanitizer supplied
 * by WORKFLOW. Legacy rich content requires an explicit compatibility binding.
 */
export function renderResolvedFieldFragment(
  fragment: ResolvedContentFragment,
  options: RenderResolvedFieldFragmentOptions = {},
): RenderedFieldFragmentResult {
  if (fragment.kind === 'text') {
    const escaped = escapeFieldText(normalizeNewlines(fragment.value));
    return {
      status: 'rendered',
      kind: 'text',
      html: fragment.multiline ? escaped.replace(/\n/g, '<br>') : escaped,
    };
  }

  if (fragment.kind === 'trusted-rich') {
    if (!isCanonicalTrustedRichOrigin(fragment.origin)) {
      return {
        status: 'blocked',
        diagnostic: {
          code: 'untrusted-rich-origin',
          severity: 'error',
          message: 'Trusted rich content was not minted by a canonical C06 origin capability.',
        },
      };
    }
    if (!options.sanitizeTrustedRich) {
      return {
        status: 'blocked',
        diagnostic: {
          code: 'missing-rich-sanitizer',
          severity: 'error',
          message: 'Trusted rich content requires the WORKFLOW sanitizer adapter before interpolation.',
        },
      };
    }
    return {
      status: 'rendered',
      kind: 'trusted-rich',
      html: options.sanitizeTrustedRich(fragment.html, fragment.origin),
    };
  }

  if (!options.approvedLegacyRichBindings?.has(fragment.compatibilityBinding)) {
    return {
      status: 'blocked',
      diagnostic: {
        code: 'unapproved-legacy-rich-binding',
        severity: 'error',
        message: `Legacy rich compatibility binding is not approved: ${fragment.compatibilityBinding}`,
      },
    };
  }
  if (!options.sanitizeApprovedLegacyRich) {
    return {
      status: 'blocked',
      diagnostic: {
        code: 'missing-rich-sanitizer',
        severity: 'error',
        message: 'Approved legacy rich content requires an explicit sanitizer adapter.',
      },
    };
  }
  return {
    status: 'rendered',
    kind: 'legacy-rich',
    html: options.sanitizeApprovedLegacyRich(fragment.html, fragment.compatibilityBinding),
  };
}

const DESIGNATION_ACRONYMS = new Set([
  'CEO', 'CFO', 'COO', 'CTO', 'CIO', 'CISO', 'CRO', 'CMO', 'CLO', 'CHRO',
  'CDO', 'CPO', 'CSO', 'CAO', 'CCO', 'MD', 'VP', 'PA', 'HR',
]);
const DESIGNATION_SMALL_WORDS = new Set(['of', 'the', 'and', 'in', 'at', 'for', 'on']);

function toProperCase(value: string): string {
  return value.toLowerCase().replace(/\b\w/g, (character) => character.toUpperCase());
}

function toDesignationCase(value: string): string {
  return value
    .trim()
    .split(/\s+/)
    .map((word, index) => {
      const upper = word.toUpperCase();
      if (DESIGNATION_ACRONYMS.has(upper)) return upper;
      const lower = word.toLowerCase();
      if (index > 0 && DESIGNATION_SMALL_WORDS.has(lower)) return lower;
      return lower.charAt(0).toUpperCase() + lower.slice(1);
    })
    .join(' ');
}

const TEXT_MODIFIERS: Readonly<Record<string, (value: string) => string>> = Object.freeze({
  UCASE: (value) => value.toUpperCase(),
  UPPERCASE: (value) => value.toUpperCase(),
  LCASE: (value) => value.toLowerCase(),
  LOWERCASE: (value) => value.toLowerCase(),
  CAPITALIZE: (value) => value.charAt(0).toUpperCase() + value.slice(1).toLowerCase(),
  PCASE: toProperCase,
  PROPERCASE: toProperCase,
  TITLECASE: toProperCase,
  TRIM: (value) => value.trim(),
  DESIGNATION: toDesignationCase,
});

export function applyScopedFieldTextModifier(
  modifier: string,
  value: string,
): { status: 'applied'; value: string } | { status: 'unsupported' } {
  const implementation = TEXT_MODIFIERS[modifier];
  return implementation
    ? { status: 'applied', value: implementation(value) }
    : { status: 'unsupported' };
}

function typedFieldValueToText(value: TypedFieldValue): string | null {
  switch (value.kind) {
    case 'missing':
      return null;
    case 'empty':
      return '';
    case 'text':
    case 'multiline':
    case 'date':
    case 'number':
    case 'currency':
      return value.value;
    case 'boolean':
      return value.value ? 'true' : 'false';
    case 'legacy':
      return null;
  }
}

function fieldFragmentFromTypedValue(value: TypedFieldValue, text: string): ResolvedContentFragment {
  return createDeclarativeFieldContentFragment({
    value: text,
    multiline: value.kind === 'multiline',
  });
}

function sameScope(left: FieldOwnerScope, right: FieldOwnerScope): boolean {
  return left.kind === right.kind && left.id === right.id;
}

function fieldPaths(definition: LosslessStoredFieldDefinition): readonly string[] {
  return [...new Set([
    definition.resolverPath,
    definition.key,
    definition.path,
  ].filter((value): value is string => typeof value === 'string' && value.length > 0))];
}

function definitionForPath(
  definitions: readonly LosslessStoredFieldDefinition[],
  scope: FieldOwnerScope,
  path: string,
): { definition?: LosslessStoredFieldDefinition; ambiguous: boolean } {
  const matches = definitions.filter(
    (definition) => sameScope(definition.scope, scope) && fieldPaths(definition).includes(path),
  );
  return { definition: matches[0], ambiguous: matches.length > 1 };
}

interface BindingGraph {
  byTarget: ReadonlyMap<string, string>;
  definitionsByIdentity: ReadonlyMap<string, LosslessStoredFieldDefinition>;
  diagnostics: readonly ScopedFieldResolutionDiagnostic[];
}

function buildBindingGraph(
  definitions: readonly LosslessStoredFieldDefinition[],
  bindings: readonly ScopedFieldValueBinding[],
): BindingGraph {
  const definitionsByIdentity = new Map(definitions.map((definition) => [definition.identity, definition]));
  const byTarget = new Map<string, string>();
  const diagnostics: ScopedFieldResolutionDiagnostic[] = [];

  for (const binding of bindings) {
    const target = definitionsByIdentity.get(binding.targetIdentity);
    const source = definitionsByIdentity.get(binding.sourceIdentity);
    if (!target || !source) {
      diagnostics.push({
        code: 'field-binding-missing-target',
        severity: 'error',
        fieldIdentity: !target ? binding.targetIdentity : binding.sourceIdentity,
        message: `Field value binding references an unknown scoped identity: ${!target ? binding.targetIdentity : binding.sourceIdentity}`,
      });
      continue;
    }
    if (target.storedType !== source.storedType) {
      diagnostics.push({
        code: 'field-binding-type-mismatch',
        severity: 'error',
        fieldIdentity: target.identity,
        scope: target.scope,
        message: `Shared fields must use the same stored type (${target.storedType} != ${source.storedType}).`,
      });
      continue;
    }
    byTarget.set(target.identity, source.identity);
  }

  for (const definition of definitions) {
    const seen = new Set<string>();
    let current = definition.identity;
    while (byTarget.has(current)) {
      if (seen.has(current)) {
        diagnostics.push({
          code: 'field-binding-cycle',
          severity: 'error',
          fieldIdentity: definition.identity,
          scope: definition.scope,
          message: `Field value binding cycle detected from ${definition.identity}.`,
        });
        break;
      }
      seen.add(current);
      current = byTarget.get(current)!;
    }
  }

  return { byTarget, definitionsByIdentity, diagnostics };
}

function effectiveValueIdentity(identity: string, graph: BindingGraph): string | null {
  const seen = new Set<string>();
  let current = identity;
  while (graph.byTarget.has(current)) {
    if (seen.has(current)) return null;
    seen.add(current);
    current = graph.byTarget.get(current)!;
  }
  return current;
}

function resolveScopedFieldValueWithGraph(input: {
  definition: LosslessStoredFieldDefinition;
  valuesByIdentity: Readonly<Record<string, unknown>>;
  graph: BindingGraph;
}): ResolvedScopedFieldValue {
  const effectiveIdentity = effectiveValueIdentity(input.definition.identity, input.graph)
    ?? input.definition.identity;
  const effectiveDefinition = input.graph.definitionsByIdentity.get(effectiveIdentity) ?? input.definition;
  const present = Object.prototype.hasOwnProperty.call(input.valuesByIdentity, effectiveIdentity);
  const diagnostics: ScopedFieldResolutionDiagnostic[] = [];

  if (present) {
    return {
      definition: input.definition,
      effectiveIdentity,
      source: 'value',
      value: classifyFieldValue({
        storedType: input.definition.storedType,
        present: true,
        value: input.valuesByIdentity[effectiveIdentity],
      }),
      diagnostics,
    };
  }

  const hasDefault = Object.prototype.hasOwnProperty.call(effectiveDefinition.original, 'defaultValue');
  if (hasDefault) {
    return {
      definition: input.definition,
      effectiveIdentity,
      source: 'default',
      value: classifyFieldValue({
        storedType: input.definition.storedType,
        present: true,
        value: effectiveDefinition.defaultValue,
      }),
      diagnostics,
    };
  }

  diagnostics.push({
    code: input.definition.required ? 'required-scoped-value-missing' : 'missing-scoped-value',
    severity: input.definition.required ? 'error' : 'warning',
    fieldIdentity: input.definition.identity,
    scope: input.definition.scope,
    message: input.definition.required
      ? `Required field has no value: ${input.definition.resolverPath}`
      : `Field has no value: ${input.definition.resolverPath}`,
  });
  return {
    definition: input.definition,
    effectiveIdentity,
    source: 'missing',
    value: { kind: 'missing' },
    diagnostics,
  };
}

export interface ResolveScopedFieldValueInput {
  definition: LosslessStoredFieldDefinition;
  allDefinitions: readonly LosslessStoredFieldDefinition[];
  valuesByIdentity: Readonly<Record<string, unknown>>;
  bindings?: readonly ScopedFieldValueBinding[];
}

export interface ResolvedScopedFieldValue {
  definition: LosslessStoredFieldDefinition;
  effectiveIdentity: string;
  source: 'value' | 'default' | 'missing';
  value: TypedFieldValue;
  diagnostics: readonly ScopedFieldResolutionDiagnostic[];
}

/** Resolve one field by structured identity without any flattened-name fallback. */
export function resolveScopedFieldValue(input: ResolveScopedFieldValueInput): ResolvedScopedFieldValue {
  const graph = buildBindingGraph(input.allDefinitions, input.bindings ?? []);
  const resolved = resolveScopedFieldValueWithGraph({
    definition: input.definition,
    valuesByIdentity: input.valuesByIdentity,
    graph,
  });
  return {
    ...resolved,
    diagnostics: [...graph.diagnostics, ...resolved.diagnostics],
  };
}

export interface LegacyFlattenedFieldValueAdapterResult {
  ok: boolean;
  valuesByIdentity: Readonly<Record<string, unknown>>;
  diagnostics: readonly ScopedFieldResolutionDiagnostic[];
}

/**
 * Compatibility-only adapter for legacy flattened payloads. A key may bind
 * implicitly only when it resolves to exactly one scoped definition. Any
 * collision is an explicit error; callers may provide an exact identity map to
 * disambiguate without reviving name-concatenation identity.
 */
export function adaptLegacyFlattenedFieldValues(input: {
  definitions: readonly LosslessStoredFieldDefinition[];
  values: Readonly<Record<string, unknown>>;
  explicitBindings?: Readonly<Record<string, string>>;
}): LegacyFlattenedFieldValueAdapterResult {
  const definitionsByIdentity = new Map(input.definitions.map((definition) => [definition.identity, definition]));
  const resolved: Record<string, unknown> = {};
  const diagnostics: ScopedFieldResolutionDiagnostic[] = [];

  for (const [legacyKey, value] of Object.entries(input.values)) {
    const explicitIdentity = input.explicitBindings?.[legacyKey];
    if (explicitIdentity) {
      if (!definitionsByIdentity.has(explicitIdentity)) {
        diagnostics.push({
          code: 'unmapped-legacy-value',
          severity: 'error',
          legacyKey,
          fieldIdentity: explicitIdentity,
          message: `Explicit legacy binding points to an unknown field identity: ${explicitIdentity}`,
        });
      } else {
        resolved[explicitIdentity] = value;
      }
      continue;
    }

    if (definitionsByIdentity.has(legacyKey)) {
      resolved[legacyKey] = value;
      continue;
    }

    const matches = input.definitions.filter((definition) => {
      const unprefixedKey = definition.key.replace(/^custom\./, '');
      const unprefixedPath = definition.resolverPath.replace(/^custom\./, '');
      return definition.key === legacyKey
        || definition.resolverPath === legacyKey
        || unprefixedKey === legacyKey
        || unprefixedPath === legacyKey;
    });

    if (matches.length === 1) {
      resolved[matches[0].identity] = value;
    } else if (matches.length > 1) {
      diagnostics.push({
        code: 'ambiguous-legacy-value',
        severity: 'error',
        legacyKey,
        message: `Legacy field value "${legacyKey}" matches ${matches.length} scoped fields; provide an explicit identity binding.`,
      });
    } else {
      diagnostics.push({
        code: 'unmapped-legacy-value',
        severity: 'warning',
        legacyKey,
        message: `Legacy field value "${legacyKey}" does not match a known scoped field.`,
      });
    }
  }

  return {
    ok: diagnostics.every((diagnostic) => diagnostic.severity !== 'error'),
    valuesByIdentity: resolved,
    diagnostics,
  };
}

export interface ResolveScopedTemplateFieldsInput extends RenderResolvedFieldFragmentOptions {
  template: ScopedTemplateFieldSource;
  partials?: readonly ScopedTemplateFieldPartial[];
  valuesByIdentity: Readonly<Record<string, unknown>>;
  bindings?: readonly ScopedFieldValueBinding[];
  missingValue?: 'keep' | 'blank';
}

export interface ResolveScopedTemplateFieldsResult {
  resolved: string;
  diagnostics: readonly ScopedFieldResolutionDiagnostic[];
  parserDiagnostics: readonly FieldParserDiagnostic[];
  usedFieldIdentities: readonly string[];
}

interface SourceResolutionContext {
  allDefinitions: readonly LosslessStoredFieldDefinition[];
  partialByName: ReadonlyMap<string, ScopedTemplateFieldPartial>;
  input: ResolveScopedTemplateFieldsInput;
  bindingGraph: BindingGraph;
}

function replaceSpans(
  source: string,
  replacements: readonly { start: number; end: number; value: string }[],
): string {
  let output = source;
  for (const replacement of [...replacements].sort((left, right) => right.start - left.start)) {
    output = `${output.slice(0, replacement.start)}${replacement.value}${output.slice(replacement.end)}`;
  }
  return output;
}

function resolveSource(
  source: ScopedTemplateFieldSource,
  context: SourceResolutionContext,
  partialStack: readonly string[],
  includeBindingDiagnostics: boolean,
): ResolveScopedTemplateFieldsResult {
  const partialMetadata = [...context.partialByName.values()].map(({ id, name, content }) => ({ id, name, content }));
  const parsed = parseTemplateFields({
    content: source.content,
    scope: source.scope,
    registry: source.definitions,
    knownPaths: source.definitions.flatMap((definition) => fieldPaths(definition)),
    partials: partialMetadata,
  });
  const diagnostics: ScopedFieldResolutionDiagnostic[] = includeBindingDiagnostics
    ? [...context.bindingGraph.diagnostics]
    : [];
  const parserDiagnostics: FieldParserDiagnostic[] = [...parsed.diagnostics];
  const usedFieldIdentities = new Set<string>();
  const replacements: Array<{ start: number; end: number; value: string }> = [];

  for (const node of parsed.nodes) {
    if (node.kind === 'partial' && node.partialName) {
      const partial = context.partialByName.get(node.partialName);
      if (!partial || partialStack.includes(partial.id)) continue;
      const child = resolveSource(
        {
          scope: { kind: 'partial', id: partial.id, label: partial.name },
          content: partial.content,
          definitions: partial.definitions,
        },
        context,
        [...partialStack, partial.id],
        false,
      );
      diagnostics.push(...child.diagnostics);
      parserDiagnostics.push(...child.parserDiagnostics);
      child.usedFieldIdentities.forEach((identity) => usedFieldIdentities.add(identity));

      if (!context.input.sanitizeTrustedRich) {
        diagnostics.push({
          code: 'missing-rich-sanitizer',
          severity: 'error',
          occurrenceId: node.occurrenceId,
          scope: node.scope,
          message: 'Template partial interpolation requires the WORKFLOW trusted-rich sanitizer adapter.',
        });
        continue;
      }
      replacements.push({
        start: node.span.start,
        end: node.span.end,
        value: context.input.sanitizeTrustedRich(child.resolved, { ...({} as TrustedRichOrigin) }),
      });
      continue;
    }

    if ((node.kind !== 'reference' && node.kind !== 'modifier') || !node.path) continue;
    const match = definitionForPath(source.definitions, source.scope, node.path);
    if (match.ambiguous) {
      diagnostics.push({
        code: 'ambiguous-scoped-field',
        severity: 'error',
        occurrenceId: node.occurrenceId,
        scope: node.scope,
        message: `Reference ${node.path} matches multiple definitions in the same scope.`,
      });
      continue;
    }
    if (!match.definition) continue;
    const definition = match.definition;
    usedFieldIdentities.add(definition.identity);

    const valueResult = resolveScopedFieldValueWithGraph({
      definition,
      valuesByIdentity: context.input.valuesByIdentity,
      graph: context.bindingGraph,
    });
    diagnostics.push(...valueResult.diagnostics);

    if (valueResult.value.kind === 'legacy') {
      diagnostics.push({
        code: 'unsupported-legacy-field-value',
        severity: 'error',
        occurrenceId: node.occurrenceId,
        fieldIdentity: definition.identity,
        scope: definition.scope,
        message: `Legacy field type "${definition.storedType}" is preserve-only and cannot be interpolated by F2.`,
      });
      continue;
    }

    const rawText = typedFieldValueToText(valueResult.value);
    if (rawText === null) {
      if (context.input.missingValue === 'blank') {
        replacements.push({ start: node.span.start, end: node.span.end, value: '' });
      }
      continue;
    }

    let text = rawText;
    if (node.kind === 'modifier' && node.modifier) {
      const modified = applyScopedFieldTextModifier(node.modifier, text);
      if (modified.status === 'unsupported') {
        diagnostics.push({
          code: 'unknown-field-modifier',
          severity: 'error',
          occurrenceId: node.occurrenceId,
          fieldIdentity: definition.identity,
          scope: definition.scope,
          message: `Unsupported field modifier: ${node.modifier}`,
        });
        continue;
      }
      text = modified.value;
    }

    const fragment = fieldFragmentFromTypedValue(valueResult.value, text);
    const rendered = renderResolvedFieldFragment(fragment, context.input);
    if (rendered.status === 'blocked') {
      diagnostics.push({
        ...rendered.diagnostic,
        occurrenceId: node.occurrenceId,
        fieldIdentity: definition.identity,
        scope: definition.scope,
      });
      continue;
    }
    replacements.push({ start: node.span.start, end: node.span.end, value: rendered.html });
  }

  return {
    resolved: replaceSpans(source.content, replacements),
    diagnostics,
    parserDiagnostics,
    usedFieldIdentities: [...usedFieldIdentities],
  };
}

/**
 * Resolve scoped custom-field references without flattening scope. The returned
 * HTML MUST NOT be sent through the legacy template parser again: WORKFLOW must
 * integrate this interpolation boundary into its one-pass render pipeline so
 * braces contained in ordinary field text can never become template syntax.
 *
 * Partial expansion itself is intentionally left to WORKFLOW because only the
 * renderer owns the canonical sanitizer and trusted-rich origin capability.
 */
export function resolveScopedTemplateFields(
  input: ResolveScopedTemplateFieldsInput,
): ResolveScopedTemplateFieldsResult {
  const allDefinitions = [
    ...input.template.definitions,
    ...(input.partials ?? []).flatMap((partial) => partial.definitions),
  ];
  const bindingGraph = buildBindingGraph(allDefinitions, input.bindings ?? []);
  const partialByName = new Map((input.partials ?? []).map((partial) => [partial.name, partial]));
  return resolveSource(
    input.template,
    { allDefinitions, partialByName, input, bindingGraph },
    [],
    true,
  );
}
