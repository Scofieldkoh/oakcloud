import type { FieldOwnerScope } from '@/lib/template-field-contract';
import {
  loadStoredFieldRegistry,
  resolveTypedFieldValueByPrecedence,
  serializeStoredFieldDefinition,
  typedFieldValueToLegacyPayloadValue,
} from '@/lib/template-field-registry';

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

/**
 * Preserve request definitions through the F1 registry/serializer rather than
 * reconstructing an allow-listed subset. Invalid legacy objects are retained
 * byte-for-field (within JSON parsing) so a W1 no-op save cannot erase forward
 * metadata; request Zod validation handles new authoring safety separately.
 */
export function preserveStoredFieldDefinitions(
  definitions: readonly Readonly<Record<string, unknown>>[],
  scope: FieldOwnerScope,
): Record<string, unknown>[] {
  return definitions.map((definition) => {
    const registry = loadStoredFieldRegistry({ scope, definitions: [definition] });
    const loaded = registry.definitions[0];
    return loaded ? serializeStoredFieldDefinition(loaded) : { ...definition };
  });
}

export function normalizeStoredFieldDefinitionInput(value: unknown): Readonly<Record<string, unknown>>[] {
  if (!Array.isArray(value)) return [];
  return value.filter(isRecord);
}

/**
 * F1 typed-value adapter for top-level template custom values. It retains the
 * legacy payload surface but derives values by declared type and frozen
 * precedence; appearance is never used to coerce text into date/number/boolean.
 * Scoped partial rebinding remains F2/W3 and is deliberately not invented here.
 */
export function resolveTopLevelCustomValues(input: {
  definitions: readonly Readonly<Record<string, unknown>>[];
  scope: FieldOwnerScope;
  itemValues: Readonly<Record<string, unknown>>;
  documentOverrides?: Readonly<Record<string, unknown>>;
  sharedMasterValues?: Readonly<Record<string, unknown>>;
}): Record<string, unknown> {
  const output: Record<string, unknown> = { ...input.itemValues };
  const registry = loadStoredFieldRegistry({
    scope: input.scope,
    definitions: input.definitions,
  });

  for (const definition of registry.definitions) {
    if (definition.source !== 'custom' && !definition.key.startsWith('custom.')) continue;
    const resolved = resolveTypedFieldValueByPrecedence({
      definition,
      itemValues: input.itemValues,
      documentOverrides: input.documentOverrides ?? {},
      sharedMasterValues: input.sharedMasterValues ?? {},
    });
    if (resolved.source === 'missing') continue;
    const key = definition.key.replace(/^custom\./, '');
    const value = typedFieldValueToLegacyPayloadValue(resolved.value);
    if (value !== undefined) output[key] = value;
  }

  return output;
}
