import type { CustomPlaceholderDefinition, MergedPlaceholder } from '@/types/placeholders';

export interface TemplatePartialLike {
  id?: string;
  name: string;
  displayName?: string | null;
  content?: string | null;
  placeholders?: unknown;
  updatedAt?: string | Date | null;
  version?: number | null;
  deletedAt?: string | Date | null;
}

export interface StoredPlaceholderLike {
  key?: string;
  label?: string;
  type?: string;
  source?: string;
  category?: string;
  path?: string;
  defaultValue?: string;
  required?: boolean;
  linkedTo?: string;
  sourcePartial?: string;
  options?: string[];
  format?: string;
}

export interface PartialDependency {
  name: string;
  found: boolean;
  nestedReferences: string[];
  updatedAt?: string | null;
  version?: number | null;
}

export interface TemplateDiagnostics {
  syntaxErrors: string[];
  partialReferences: string[];
  missingPartials: string[];
  circularPartials: string[];
  unknownPlaceholders: string[];
  duplicateCustomKeys: string[];
  unusedCustomFields: string[];
  dependencies: PartialDependency[];
}

export const PARTIAL_REFERENCE_PATTERN =
  String.raw`\{\{(?:>|&gt;|&#62;|&#x3[eE];)\s*([a-zA-Z][a-zA-Z0-9_-]*)\s*\}\}`;

export const PARTIAL_REFERENCE_REGEX = new RegExp(PARTIAL_REFERENCE_PATTERN, 'g');

const KNOWN_PLACEHOLDER_ROOTS = new Set([
  'company',
  'contact',
  'contacts',
  'directors',
  'selectedContact',
  'selectedDirector',
  'selectedShareholder',
  'secretaries',
  'shareholders',
  'system',
  'custom',
]);

const LOOP_ONLY_PLACEHOLDERS = new Set([
  'this.name',
  'this.identificationNumber',
  'this.nationality',
  'this.address',
  'this.role',
  'this.shareClass',
  'this.numberOfShares',
  'this.percentageHeld',
  'this.appointmentDate',
  'this.cessationDate',
  'this.email',
  'this.phone',
  'this.letterAddress',
  'name',
  'identificationNumber',
  'nationality',
  'address',
  'role',
  'shareClass',
  'numberOfShares',
  'percentageHeld',
  'appointmentDate',
  'cessationDate',
  'email',
  'phone',
]);

export function extractPartialReferences(content: string): string[] {
  const partialNames = new Set<string>();
  const matches = content.matchAll(new RegExp(PARTIAL_REFERENCE_PATTERN, 'g'));

  for (const match of matches) {
    if (match[1]) partialNames.add(match[1]);
  }

  return Array.from(partialNames);
}

export function hasPartialReferences(content: string): boolean {
  return new RegExp(PARTIAL_REFERENCE_PATTERN).test(content);
}

export function normalizePlaceholderKey(key: string | undefined): string {
  return (key || '').replace(/^custom\./, '').trim();
}

export function toCustomPlaceholderKey(key: string | undefined): string {
  const normalized = normalizePlaceholderKey(key);
  return normalized ? `custom.${normalized}` : '';
}

export function isCustomPlaceholder(value: StoredPlaceholderLike): boolean {
  return (
    value.category === 'custom'
    || value.category === 'Custom'
    || value.source === 'custom'
    || Boolean(value.key?.startsWith('custom.'))
  );
}

export function normalizeStoredPlaceholders(value: unknown): StoredPlaceholderLike[] {
  if (!value) return [];
  if (Array.isArray(value)) return value as StoredPlaceholderLike[];
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value);
      return Array.isArray(parsed) ? parsed as StoredPlaceholderLike[] : [];
    } catch {
      return [];
    }
  }
  return [];
}

export function storageFormatToCustomPlaceholders(
  placeholders: StoredPlaceholderLike[]
): CustomPlaceholderDefinition[] {
  return placeholders
    .filter(isCustomPlaceholder)
    .map((placeholder) => {
      const key = normalizePlaceholderKey(placeholder.key);
      return {
        id: key || cryptoSafeId(),
        key,
        label: placeholder.label || key,
        type: normalizePlaceholderType(placeholder.type),
        required: placeholder.required ?? false,
        defaultValue: placeholder.defaultValue,
        linkedTo: placeholder.linkedTo,
        sourcePartial: placeholder.sourcePartial,
      };
    })
    .filter((placeholder) => placeholder.key);
}

export function customPlaceholdersToStorageFormat(
  placeholders: CustomPlaceholderDefinition[]
): StoredPlaceholderLike[] {
  return placeholders.map((placeholder) => ({
    key: toCustomPlaceholderKey(placeholder.key),
    label: placeholder.label,
    type: normalizeStoredPlaceholderType(placeholder.type),
    source: 'custom',
    category: 'custom',
    path: toCustomPlaceholderKey(placeholder.key),
    defaultValue: placeholder.defaultValue,
    required: placeholder.required,
    ...(placeholder.linkedTo ? { linkedTo: placeholder.linkedTo } : {}),
    ...(placeholder.sourcePartial ? { sourcePartial: placeholder.sourcePartial } : {}),
  }));
}

export function mergeTemplateAndPartialPlaceholders(params: {
  templatePlaceholders: CustomPlaceholderDefinition[];
  templateContent: string;
  partials: TemplatePartialLike[];
  partialPlaceholderLinkings?: Record<string, string>;
}): MergedPlaceholder[] {
  const {
    templatePlaceholders,
    templateContent,
    partials,
    partialPlaceholderLinkings = {},
  } = params;
  const result: MergedPlaceholder[] = [];
  const seenKeys = new Set<string>();

  for (const placeholder of templatePlaceholders) {
    result.push({ ...placeholder, source: 'template' });
    seenKeys.add(placeholder.key);
  }

  for (const partialName of extractPartialReferences(templateContent)) {
    const partial = partials.find((candidate) => candidate.name === partialName);
    if (!partial) continue;

    for (const placeholder of storageFormatToCustomPlaceholders(
      normalizeStoredPlaceholders(partial.placeholders)
    )) {
      const baseKey = placeholder.key;
      const key = seenKeys.has(baseKey) ? `${partialName}_${baseKey}` : baseKey;
      result.push({
        ...placeholder,
        key,
        source: 'partial',
        sourceName: partialName,
        sourceDisplayName: partial.displayName || partialName,
        sourcePartial: partialName,
        linkedTo: partialPlaceholderLinkings[key] || placeholder.linkedTo,
      });
      seenKeys.add(key);
    }
  }

  return result;
}

export function extractTemplatePlaceholderKeys(content: string): string[] {
  const placeholders = new Set<string>();
  let match: RegExpExecArray | null;

  const internalModifierRegex = /\{\{[A-Z_]+\(([a-zA-Z_][a-zA-Z0-9_.\[\]]*)\)\}\}/g;
  while ((match = internalModifierRegex.exec(content)) !== null) {
    if (!LOOP_ONLY_PLACEHOLDERS.has(match[1])) placeholders.add(match[1]);
  }

  const externalModifierRegex =
    /[A-Z_]+\(\s*(?:<[^>]*>\s*)*\{\{([a-zA-Z_][a-zA-Z0-9_.\[\]]*)\}\}(?:\s*<[^>]*>)*\s*\)/g;
  while ((match = externalModifierRegex.exec(content)) !== null) {
    if (!LOOP_ONLY_PLACEHOLDERS.has(match[1])) placeholders.add(match[1]);
  }

  const simpleRegex = /\{\{([a-zA-Z_][a-zA-Z0-9_.\[\]]*)\}\}/g;
  while ((match = simpleRegex.exec(content)) !== null) {
    const placeholder = match[1];
    if (
      !placeholder.startsWith('#')
      && !placeholder.startsWith('/')
      && !placeholder.startsWith('@')
      && !LOOP_ONLY_PLACEHOLDERS.has(placeholder)
      && !['if', 'each', 'unless', 'with', 'else'].includes(placeholder)
    ) {
      placeholders.add(placeholder);
    }
  }

  const blockRegex = /\{\{#(each|with)\s+([a-zA-Z_][a-zA-Z0-9_.]*)\}\}/g;
  while ((match = blockRegex.exec(content)) !== null) {
    placeholders.add(match[2]);
  }

  const conditionRegex = /\{\{#(?:if|unless)\s+([a-zA-Z_][a-zA-Z0-9_.\[\]]*)/g;
  while ((match = conditionRegex.exec(content)) !== null) {
    placeholders.add(match[1]);
  }

  return Array.from(placeholders);
}

export function validateTemplateSyntax(content: string): string[] {
  const errors: string[] = [];
  const openCount = (content.match(/\{\{/g) || []).length;
  const closeCount = (content.match(/\}\}/g) || []).length;
  if (openCount !== closeCount) {
    errors.push('Mismatched placeholder brackets: ensure every {{ has a matching }}');
  }

  for (const blockName of ['each', 'if', 'unless', 'with']) {
    const opens = (content.match(new RegExp(String.raw`\{\{#${blockName}\b`, 'g')) || []).length;
    const closes = (content.match(new RegExp(String.raw`\{\{\/${blockName}\}\}`, 'g')) || []).length;
    if (opens !== closes) {
      errors.push(`Unclosed #${blockName} blocks: ${opens} opens, ${closes} closes`);
    }
  }

  return errors;
}

export function analyzeTemplateContent(params: {
  content: string;
  placeholders?: unknown;
  partials?: TemplatePartialLike[];
}): TemplateDiagnostics {
  const { content, placeholders, partials = [] } = params;
  const partialByName = new Map(partials.map((partial) => [partial.name, partial]));
  const partialReferences = extractPartialReferences(content);
  const dependencyNames = collectDependencyNames(content, partialByName);
  const missingPartials = dependencyNames.filter((partialName) => !partialByName.has(partialName));
  const circularPartials = detectCircularPartials(content, partialByName);
  const placeholderDefinitions = normalizeStoredPlaceholders(placeholders);
  const duplicateCustomKeys = findDuplicateCustomKeys(placeholderDefinitions);
  const extractedPlaceholders = extractTemplatePlaceholderKeys(content);
  const definedCustomKeys = new Set(
    placeholderDefinitions.filter(isCustomPlaceholder).map((p) => normalizePlaceholderKey(p.key))
  );
  const unknownPlaceholders = extractedPlaceholders.filter((key) => {
    const root = key.split(/[.[\]]/)[0];
    if (KNOWN_PLACEHOLDER_ROOTS.has(root)) return false;
    if (definedCustomKeys.has(normalizePlaceholderKey(key))) return false;
    return true;
  });
  const referencedCustomKeys = new Set(
    extractedPlaceholders
      .filter((key) => key.startsWith('custom.'))
      .map(normalizePlaceholderKey)
  );
  const unusedCustomFields = Array.from(definedCustomKeys)
    .filter((key) => key && !referencedCustomKeys.has(key));

  return {
    syntaxErrors: validateTemplateSyntax(content),
    partialReferences,
    missingPartials: Array.from(new Set(missingPartials)),
    circularPartials,
    unknownPlaceholders: Array.from(new Set(unknownPlaceholders)),
    duplicateCustomKeys,
    unusedCustomFields,
    dependencies: Array.from(new Set(dependencyNames)).map((name) => {
      const partial = partialByName.get(name);
      return {
        name,
        found: Boolean(partial),
        nestedReferences: partial?.content ? extractPartialReferences(partial.content) : [],
        updatedAt: partial?.updatedAt ? new Date(partial.updatedAt).toISOString() : null,
        version: partial?.version ?? null,
      };
    }),
  };
}

export interface RequiredPartySelections {
  director: boolean;
  shareholder: boolean;
  contact: boolean;
}

export function getRequiredPartySelections(
  content: string,
  partials: TemplatePartialLike[] = [],
): RequiredPartySelections {
  const byName = new Map(partials.map((partial) => [partial.name, partial]));
  const names = collectDependencyNames(content, byName);
  const combined = [
    content,
    ...names.map((name) => byName.get(name)?.content ?? ''),
  ].join('\n');
  const keys = extractTemplatePlaceholderKeys(combined);

  return {
    director: keys.some(
      (key) => key === 'selectedDirector' || key.startsWith('selectedDirector.'),
    ),
    shareholder: keys.some(
      (key) => key === 'selectedShareholder' || key.startsWith('selectedShareholder.'),
    ),
    contact: keys.some(
      (key) => key === 'selectedContact'
        || key.startsWith('selectedContact.'),
    ),
  };
}

export function getRequiredLegacyContactSelection(
  content: string,
  partials: TemplatePartialLike[] = [],
): boolean {
  const byName = new Map(partials.map((partial) => [partial.name, partial]));
  const names = collectDependencyNames(content, byName);
  const combined = [content, ...names.map((name) => byName.get(name)?.content ?? '')].join('\n');
  const keys = extractTemplatePlaceholderKeys(combined);

  return keys.some((key) => key === 'contact' || key.startsWith('contact.') || key === 'contacts');
}

function collectDependencyNames(
  content: string,
  partialByName: Map<string, TemplatePartialLike>,
  seen = new Set<string>()
): string[] {
  const names: string[] = [];
  for (const name of extractPartialReferences(content)) {
    names.push(name);
    if (seen.has(name)) continue;
    seen.add(name);
    const nestedContent = partialByName.get(name)?.content;
    if (nestedContent) {
      names.push(...collectDependencyNames(nestedContent, partialByName, seen));
    }
  }
  return names;
}

function detectCircularPartials(
  content: string,
  partialByName: Map<string, TemplatePartialLike>
): string[] {
  const circular = new Set<string>();

  const visit = (name: string, stack: string[]) => {
    if (stack.includes(name)) {
      circular.add([...stack.slice(stack.indexOf(name)), name].join(' -> '));
      return;
    }
    const partialContent = partialByName.get(name)?.content;
    if (!partialContent) return;
    for (const nestedName of extractPartialReferences(partialContent)) {
      visit(nestedName, [...stack, name]);
    }
  };

  for (const name of extractPartialReferences(content)) {
    visit(name, []);
  }

  return Array.from(circular);
}

function findDuplicateCustomKeys(placeholders: StoredPlaceholderLike[]): string[] {
  const counts = new Map<string, number>();
  for (const placeholder of placeholders.filter(isCustomPlaceholder)) {
    const key = normalizePlaceholderKey(placeholder.key);
    if (!key) continue;
    counts.set(key, (counts.get(key) || 0) + 1);
  }
  return Array.from(counts.entries())
    .filter(([, count]) => count > 1)
    .map(([key]) => key);
}

function normalizePlaceholderType(type: string | undefined): CustomPlaceholderDefinition['type'] {
  if (type === 'date' || type === 'number' || type === 'currency' || type === 'boolean' || type === 'textarea') {
    return type;
  }
  return 'text';
}

function normalizeStoredPlaceholderType(type: string | undefined): string {
  return type || 'text';
}

function cryptoSafeId(): string {
  return Math.random().toString(36).slice(2);
}
