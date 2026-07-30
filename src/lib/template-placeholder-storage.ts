import type {
  CustomPlaceholderDefinition,
  PlaceholderSource,
  PlaceholderValueType,
} from '@/types/placeholders';

export interface StoredEditorPlaceholder extends Record<string, unknown> {
  key: string;
  label: string;
  type: string;
  source?: string;
  category?: string;
  path?: string;
  required?: boolean;
  defaultValue?: string;
  linkedTo?: string;
  sourcePartial?: string;
}

const EDITOR_TYPES = new Set<PlaceholderValueType>([
  'text',
  'textarea',
  'date',
  'number',
  'currency',
  'boolean',
]);

function editorType(type: string): PlaceholderValueType {
  return EDITOR_TYPES.has(type as PlaceholderValueType)
    ? type as PlaceholderValueType
    : 'text';
}

export function storagePlaceholdersToEditor(
  placeholders: readonly StoredEditorPlaceholder[],
): CustomPlaceholderDefinition[] {
  return placeholders.map((placeholder) => {
    const source = placeholder.source as PlaceholderSource | undefined;
    const isCustom = source === 'custom'
      || placeholder.category === 'custom'
      || placeholder.key.startsWith('custom.');
    return {
      id: crypto.randomUUID(),
      key: isCustom
        ? placeholder.key.replace(/^custom\./, '')
        : placeholder.key,
      label: placeholder.label,
      type: editorType(placeholder.type),
      required: placeholder.required ?? true,
      defaultValue: placeholder.defaultValue,
      linkedTo: placeholder.linkedTo,
      sourcePartial: placeholder.sourcePartial,
      storageSource: source,
      storagePath: placeholder.path,
      storageCategory: placeholder.category,
      storageDefinition: { ...placeholder },
    };
  });
}

export function editorPlaceholdersToStorage(
  placeholders: readonly CustomPlaceholderDefinition[],
): StoredEditorPlaceholder[] {
  return placeholders.map((placeholder) => {
    const source = placeholder.storageSource ?? 'custom';
    const isCustom = source === 'custom';
    const key = isCustom
      ? `custom.${placeholder.key.replace(/^custom\./, '')}`
      : placeholder.key;
    const path = placeholder.storagePath ?? (isCustom ? key : undefined);
    const category = placeholder.storageCategory ?? (isCustom ? 'custom' : undefined);
    const stored: StoredEditorPlaceholder = {
      ...(placeholder.storageDefinition ?? {}),
      key,
      label: placeholder.label,
      type: placeholder.type,
      source,
      ...(category === undefined ? {} : { category }),
      ...(path === undefined ? {} : { path }),
      required: placeholder.required,
    };

    if (placeholder.defaultValue === undefined) delete stored.defaultValue;
    else stored.defaultValue = placeholder.defaultValue;
    if (placeholder.linkedTo === undefined) delete stored.linkedTo;
    else stored.linkedTo = placeholder.linkedTo;
    if (placeholder.sourcePartial === undefined) delete stored.sourcePartial;
    else stored.sourcePartial = placeholder.sourcePartial;
    return stored;
  });
}
