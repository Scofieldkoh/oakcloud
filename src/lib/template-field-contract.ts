import type { PlaceholderValueType } from '@/types/placeholders';

/**
 * F0 contract proof for C05. This module is intentionally not wired into the
 * editor or resolver yet: G0 must freeze the interfaces before F1 enables a
 * shared parser/registry implementation.
 */

export type FieldScopeKind = 'template' | 'partial';

export interface FieldOwnerScope {
  kind: FieldScopeKind;
  /** Stable template/partial ID, never a display name. */
  id: string;
  /** Optional display-only source name. */
  label?: string;
}

export interface FieldSourceSpan {
  start: number;
  end: number;
  raw: string;
}

export type FieldRenderMode = 'text' | 'trusted-rich' | 'legacy-unknown';

export interface LosslessStoredFieldDefinition {
  identity: string;
  scope: FieldOwnerScope;
  persistedId?: string;
  key: string;
  label: string;
  /** Preserve the stored type even when this client cannot author it. */
  storedType: string;
  supportedType: PlaceholderValueType | null;
  resolverPath: string;
  source?: string;
  category?: string;
  required: boolean;
  requiredWasExplicit: boolean;
  defaultValue?: unknown;
  linkedTo?: string;
  sourcePartial?: string;
  renderMode: FieldRenderMode;
  /** Complete original object, including forward-compatible metadata. */
  original: Readonly<Record<string, unknown>>;
}

export type TypedFieldValue =
  | { kind: 'missing' }
  | { kind: 'empty' }
  | { kind: 'text'; value: string }
  | { kind: 'multiline'; value: string }
  | { kind: 'date'; value: string }
  | { kind: 'number'; value: string }
  | { kind: 'currency'; value: string }
  | { kind: 'boolean'; value: boolean }
  | { kind: 'legacy'; declaredType: string; value: unknown };

export type FieldInputControl =
  | 'text'
  | 'textarea'
  | 'date'
  | 'decimal'
  | 'currency'
  | 'boolean'
  | 'read-only';

/** Contract consumed later by W-owned batch/template route forms. */
export interface FieldInputDescriptor {
  identity: string;
  scope: FieldOwnerScope;
  key: string;
  label: string;
  description?: string;
  storedType: string;
  control: FieldInputControl;
  required: boolean;
  defaultValue: TypedFieldValue;
  sourceLabel?: string;
  disabledReason?: string;
}

export type FieldGrammarNodeKind =
  | 'reference'
  | 'modifier'
  | 'partial'
  | 'block-open'
  | 'block-close'
  | 'else'
  | 'loop-variable'
  | 'comment';

export interface FieldGrammarNode {
  kind: FieldGrammarNodeKind;
  span: FieldSourceSpan;
  expression: string;
  path?: string;
  modifier?: string;
  block?: 'each' | 'if' | 'unless' | 'with';
  partialName?: string;
  scope: FieldOwnerScope;
  /** Occurrence identity is source-local, not the field's durable identity. */
  occurrenceId: string;
}

export type FieldDiagnosticCode =
  | 'dangling-expression'
  | 'formatted-expression'
  | 'invalid-expression'
  | 'unknown-field'
  | 'duplicate-key-in-scope'
  | 'ambiguous-legacy-binding'
  | 'unclosed-block'
  | 'mismatched-block'
  | 'missing-partial'
  | 'circular-partial';

export interface FieldParserDiagnostic {
  code: FieldDiagnosticCode;
  severity: 'error' | 'warning';
  message: string;
  span: FieldSourceSpan;
  scope: FieldOwnerScope;
  fieldIdentity?: string;
}

export interface ParsedTemplateFieldSyntax {
  source: string;
  nodes: readonly FieldGrammarNode[];
  diagnostics: readonly FieldParserDiagnostic[];
}

/**
 * C05 parser boundary proposed for F1. HTML-aware parsing must preserve the
 * original source and report formatting inserted *inside* an expression.
 */
export interface TemplateFieldParser {
  parse(input: {
    content: string;
    scope: FieldOwnerScope;
    registry?: readonly LosslessStoredFieldDefinition[];
  }): ParsedTemplateFieldSyntax;
}

export interface FieldLifecycleSnapshot {
  content: string;
  definitions: readonly LosslessStoredFieldDefinition[];
  dependentMetadata: Readonly<Record<string, unknown>>;
}

export type FieldLifecycleIntent =
  | { kind: 'create'; definition: LosslessStoredFieldDefinition }
  | { kind: 'relabel'; identity: string; label: string }
  | { kind: 'migrate-key'; identity: string; nextKey: string }
  | { kind: 'change-definition'; identity: string; patch: Readonly<Record<string, unknown>> }
  | { kind: 'delete'; identity: string; referenceAction: 'remove-references' | 'keep-unresolved' };

export type FieldLifecycleResult =
  | {
      status: 'applied';
      snapshot: FieldLifecycleSnapshot;
      changedOccurrenceIds: readonly string[];
      diagnostics: readonly FieldParserDiagnostic[];
    }
  | {
      status: 'needs-confirmation';
      identity: string;
      usageCount: number;
      occurrenceIds: readonly string[];
    }
  | { status: 'rejected'; code: string; message: string };

export const FIELD_GRAMMAR_V1 = Object.freeze({
  simpleWhitespace: 'normalize' as const,
  pathPattern: String.raw`[A-Za-z_][A-Za-z0-9_.\[\]]*`,
  partialNamePattern: String.raw`[A-Za-z][A-Za-z0-9_-]*`,
  blocks: ['each', 'if', 'unless', 'with'] as const,
  loopVariables: ['@index', '@number', '@first', '@last'] as const,
  /** Existing modifier names stay data-driven; the parser accepts A-Z/_ names. */
  modifierPattern: String.raw`[A-Z_]+`,
});

function encodeIdentityPart(value: string): string {
  return encodeURIComponent(value.trim());
}

/**
 * Stable, structured field identity. It uses owner ID + stored identity/key,
 * never partial/display-name concatenation and never a random load-time UUID.
 */
export function createScopedFieldIdentity(input: {
  scope: FieldOwnerScope;
  key: string;
  persistedId?: string | null;
}): string {
  const scopeId = encodeIdentityPart(input.scope.id);
  const stablePart = input.persistedId?.trim()
    ? `id:${encodeIdentityPart(input.persistedId)}`
    : `key:${encodeIdentityPart(input.key)}`;
  return `field:v1:${input.scope.kind}:${scopeId}:${stablePart}`;
}

/**
 * Preserve value distinctions without appearance-based coercion. In particular
 * an ISO-looking text string stays text and string "false" is not boolean false.
 */
export function classifyFieldValue(input: {
  storedType: string;
  present: boolean;
  value: unknown;
}): TypedFieldValue {
  if (!input.present || input.value === undefined || input.value === null) {
    return { kind: 'missing' };
  }
  if (input.value === '') return { kind: 'empty' };

  switch (input.storedType) {
    case 'text':
      return typeof input.value === 'string'
        ? { kind: 'text', value: input.value }
        : { kind: 'legacy', declaredType: input.storedType, value: input.value };
    case 'textarea':
      return typeof input.value === 'string'
        ? { kind: 'multiline', value: input.value }
        : { kind: 'legacy', declaredType: input.storedType, value: input.value };
    case 'date':
      return typeof input.value === 'string'
        ? { kind: 'date', value: input.value }
        : { kind: 'legacy', declaredType: input.storedType, value: input.value };
    case 'number':
      return typeof input.value === 'string'
        ? { kind: 'number', value: input.value }
        : { kind: 'legacy', declaredType: input.storedType, value: input.value };
    case 'currency':
      return typeof input.value === 'string'
        ? { kind: 'currency', value: input.value }
        : { kind: 'legacy', declaredType: input.storedType, value: input.value };
    case 'boolean':
      return typeof input.value === 'boolean'
        ? { kind: 'boolean', value: input.value }
        : { kind: 'legacy', declaredType: input.storedType, value: input.value };
    default:
      return { kind: 'legacy', declaredType: input.storedType, value: input.value };
  }
}

export type FieldExpressionProbe =
  | {
      status: 'supported';
      kind: 'reference' | 'modifier' | 'partial' | 'block-open' | 'block-close' | 'else' | 'loop-variable' | 'comment';
      normalized: string;
      path?: string;
      modifier?: string;
      partialName?: string;
      block?: 'each' | 'if' | 'unless' | 'with';
    }
  | { status: 'malformed'; code: 'dangling-expression' | 'formatted-expression' | 'invalid-expression' }
  | { status: 'literal' };

const PATH = String.raw`[A-Za-z_][A-Za-z0-9_.\[\]]*`;
const MODIFIER = String.raw`[A-Z_]+`;

/**
 * F0 executable grammar probe for isolated expressions. F1 must replace the
 * multiple production regex entry points with an HTML-aware implementation of
 * TemplateFieldParser; this helper deliberately does not mutate/resolve HTML.
 */
export function parseFieldExpressionContract(raw: string): FieldExpressionProbe {
  const value = raw.trim();

  const externalModifier = value.match(new RegExp(`^(${MODIFIER})\\(\\s*\\{\\{\\s*(${PATH})\\s*\\}\\}\\s*\\)$`));
  if (externalModifier) {
    return {
      status: 'supported',
      kind: 'modifier',
      normalized: `${externalModifier[1]}({{${externalModifier[2]}}})`,
      modifier: externalModifier[1],
      path: externalModifier[2],
    };
  }

  if (!value.startsWith('{{') && !value.endsWith('}}')) return { status: 'literal' };
  if (!value.startsWith('{{') || !value.endsWith('}}')) {
    return { status: 'malformed', code: 'dangling-expression' };
  }

  const inner = value.slice(2, -2).trim();
  if (/<\/?[A-Za-z][^>]*>/.test(inner)) {
    return { status: 'malformed', code: 'formatted-expression' };
  }
  if (inner === 'else') return { status: 'supported', kind: 'else', normalized: '{{else}}' };
  if (inner.startsWith('!')) return { status: 'supported', kind: 'comment', normalized: `{{${inner}}}` };
  if (/^@(index|number|first|last)$/.test(inner)) {
    return { status: 'supported', kind: 'loop-variable', normalized: `{{${inner}}}` };
  }

  const partial = inner.match(/^>\s*([A-Za-z][A-Za-z0-9_-]*)$/);
  if (partial) {
    return { status: 'supported', kind: 'partial', normalized: `{{> ${partial[1]}}}`, partialName: partial[1] };
  }

  const close = inner.match(/^\/(each|if|unless|with)$/);
  if (close) {
    const block = close[1] as 'each' | 'if' | 'unless' | 'with';
    return { status: 'supported', kind: 'block-close', normalized: `{{/${block}}}`, block };
  }

  const open = inner.match(new RegExp(`^#(each|with)\\s+(${PATH})$`));
  if (open) {
    const block = open[1] as 'each' | 'with';
    return { status: 'supported', kind: 'block-open', normalized: `{{#${block} ${open[2]}}}`, block, path: open[2] };
  }

  const conditional = inner.match(new RegExp(`^#(if|unless)\\s+(${PATH})(?:\\s+(?:==|!=)\\s+.+)?$`));
  if (conditional) {
    const block = conditional[1] as 'if' | 'unless';
    return { status: 'supported', kind: 'block-open', normalized: `{{${inner.replace(/\\s+/g, ' ')}}}`, block, path: conditional[2] };
  }

  const nestedModifier = inner.match(new RegExp(`^(${MODIFIER})\\(\\s*\\{\\{\\s*(${PATH})\\s*\\}\\}\\s*\\)$`));
  if (nestedModifier) {
    return {
      status: 'supported',
      kind: 'modifier',
      normalized: `{{${nestedModifier[1]}({{${nestedModifier[2]}}})}}`,
      modifier: nestedModifier[1],
      path: nestedModifier[2],
    };
  }

  const modifier = inner.match(new RegExp(`^(${MODIFIER})\\(\\s*(${PATH})\\s*\\)$`));
  if (modifier) {
    return {
      status: 'supported',
      kind: 'modifier',
      normalized: `{{${modifier[1]}(${modifier[2]})}}`,
      modifier: modifier[1],
      path: modifier[2],
    };
  }

  if (new RegExp(`^${PATH}$`).test(inner)) {
    return { status: 'supported', kind: 'reference', normalized: `{{${inner}}}`, path: inner };
  }

  return { status: 'malformed', code: 'invalid-expression' };
}
