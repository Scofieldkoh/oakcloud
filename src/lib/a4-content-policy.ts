/**
 * F0 contract proof for C06. These definitions describe the document semantics
 * that browser/server sanitization adapters must converge on after G0. They are
 * deliberately not wired to DOMPurify in F0, so this packet changes no
 * sanitization, escaping, persistence or output behavior.
 */

export const A4_CONTENT_POLICY_VERSION = 1 as const;

/** Semantic document elements that must survive a compatible no-change pass. */
export const A4_CANONICAL_TAGS = Object.freeze([
  'p', 'br', 'div', 'span',
  'strong', 'b', 'em', 'i', 'u', 's', 'strike',
  'ul', 'ol', 'li', 'blockquote',
  'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
  'a', 'hr',
  'table', 'caption', 'thead', 'tbody', 'tfoot', 'tr', 'th', 'td',
  'sup', 'sub',
  // Legacy image content is preserve-only until its trust/URL policy is frozen.
  'img',
] as const);

/**
 * Canonical attributes with durable document meaning. Runtime flow metadata is
 * intentionally kept out of this set.
 */
export const A4_CANONICAL_ATTRIBUTES = Object.freeze([
  'href', 'target', 'rel',
  'style', 'class', 'id',
  'colspan', 'rowspan', 'scope',
  'start', 'align', 'valign', 'width', 'height',
  'src', 'alt',
  'data-break-type',
  'data-a4-break',
  'data-template-each',
] as const);

/** Projection-only attributes that must never become trusted persisted input. */
export const A4_EDITOR_DECORATION_ATTRIBUTES = Object.freeze([
  'data-flow-id',
  'data-flow-continuation',
  'data-flow-continuation-item',
  'data-flow-oversized',
  'data-flow-keep-together',
] as const);

/** Attributes supplied by the SEMANTICS-owned break contract, not redefined here. */
export const A4_STRUCTURAL_ATTRIBUTES = Object.freeze([
  'data-break-type',
  'data-a4-break',
  'data-template-each',
] as const);

export const A4_LEGACY_PRESERVE_ONLY_TAGS = Object.freeze(['img'] as const);

export const A4_ALWAYS_REJECTED_TAGS = Object.freeze([
  'script', 'iframe', 'object', 'embed', 'form', 'input', 'button', 'textarea', 'select',
] as const);

export type TrustedRichOriginName =
  | 'template-partial'
  | 'canonical-builder'
  | 'service-composition';

/**
 * Private brand plus canonical singleton identity makes this an in-process C06
 * capability, not a JSON/client/token-declarable string flag.
 */
const TRUSTED_RICH_ORIGIN_BRAND: unique symbol = Symbol('c06-trusted-rich-origin');

export interface TrustedRichOrigin {
  readonly name: TrustedRichOriginName;
  readonly [TRUSTED_RICH_ORIGIN_BRAND]: true;
}

function createTrustedRichOrigin(name: TrustedRichOriginName): TrustedRichOrigin {
  return Object.freeze({
    name,
    [TRUSTED_RICH_ORIGIN_BRAND]: true as const,
  });
}

/** The only canonical C06 capabilities that may mint a trusted-rich fragment. */
export const C06_TRUSTED_RICH_ORIGINS = Object.freeze({
  templatePartial: createTrustedRichOrigin('template-partial'),
  canonicalBuilder: createTrustedRichOrigin('canonical-builder'),
  serviceComposition: createTrustedRichOrigin('service-composition'),
});

const TRUSTED_RICH_ORIGIN_SET = new Set<TrustedRichOrigin>(
  Object.values(C06_TRUSTED_RICH_ORIGINS),
);

export function isCanonicalTrustedRichOrigin(value: unknown): value is TrustedRichOrigin {
  return TRUSTED_RICH_ORIGIN_SET.has(value as TrustedRichOrigin);
}

export type TextContentFragment = {
  kind: 'text';
  value: string;
  multiline: boolean;
};

export type TrustedRichContentFragment = {
  kind: 'trusted-rich';
  html: string;
  origin: TrustedRichOrigin;
};

export type ResolvedContentFragment =
  | TextContentFragment
  | TrustedRichContentFragment
  | { kind: 'legacy-rich'; html: string; compatibilityBinding: string };

/**
 * Declarative field input is always ordinary text at this trust boundary.
 * `renderMode`, pasted/client metadata and token decoration are retained inputs
 * only for compatibility/diagnostics; none can mint a TrustedRichOrigin.
 */
export interface DeclarativeFieldContentInput {
  value: string;
  multiline?: boolean;
  renderMode?: unknown;
  clientMetadata?: Readonly<Record<string, unknown>>;
  tokenMetadata?: Readonly<Record<string, unknown>>;
}

export function createDeclarativeFieldContentFragment(
  input: DeclarativeFieldContentInput,
): TextContentFragment {
  return {
    kind: 'text',
    value: input.value,
    multiline: input.multiline ?? false,
  };
}

/**
 * Runtime trusted HTML can be minted only with one of the canonical singleton
 * capabilities above. A JSON object that merely names an origin is rejected.
 */
export function createTrustedRichContentFragment(input: {
  html: string;
  origin: TrustedRichOrigin;
}): TrustedRichContentFragment {
  if (!isCanonicalTrustedRichOrigin(input.origin)) {
    throw new TypeError('Trusted rich content requires a canonical C06 origin capability');
  }
  return {
    kind: 'trusted-rich',
    html: input.html,
    origin: input.origin,
  };
}

export interface A4ContentPolicyContract {
  version: typeof A4_CONTENT_POLICY_VERSION;
  canonicalTags: typeof A4_CANONICAL_TAGS;
  canonicalAttributes: typeof A4_CANONICAL_ATTRIBUTES;
  editorDecorationAttributes: typeof A4_EDITOR_DECORATION_ATTRIBUTES;
  structuralAttributes: typeof A4_STRUCTURAL_ATTRIBUTES;
  legacyPreserveOnlyTags: typeof A4_LEGACY_PRESERVE_ONLY_TAGS;
  alwaysRejectedTags: typeof A4_ALWAYS_REJECTED_TAGS;
  plainTextResolution: 'escape-at-interpolation-boundary';
  multilineResolution: 'single-canonical-newline-conversion';
  unknownLegacyRichValue: 'preserve-source-and-block-conversion';
  declarativeRenderModeAuthority: 'none';
  trustedRichAuthority: 'canonical-origin-capability-only';
}

export const A4_CONTENT_POLICY_CONTRACT: A4ContentPolicyContract = Object.freeze({
  version: A4_CONTENT_POLICY_VERSION,
  canonicalTags: A4_CANONICAL_TAGS,
  canonicalAttributes: A4_CANONICAL_ATTRIBUTES,
  editorDecorationAttributes: A4_EDITOR_DECORATION_ATTRIBUTES,
  structuralAttributes: A4_STRUCTURAL_ATTRIBUTES,
  legacyPreserveOnlyTags: A4_LEGACY_PRESERVE_ONLY_TAGS,
  alwaysRejectedTags: A4_ALWAYS_REJECTED_TAGS,
  plainTextResolution: 'escape-at-interpolation-boundary',
  multilineResolution: 'single-canonical-newline-conversion',
  unknownLegacyRichValue: 'preserve-source-and-block-conversion',
  declarativeRenderModeAuthority: 'none',
  trustedRichAuthority: 'canonical-origin-capability-only',
});
