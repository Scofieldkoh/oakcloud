export function commitTemplateFormChange<T extends object>(
  setFormData: (update: (current: T) => T) => void,
  setIsDirty: (isDirty: boolean) => void,
  changes: Partial<T>,
) {
  setFormData((current) => ({ ...current, ...changes }));
  setIsDirty(true);
}

/**
 * Remove references to custom fields that are no longer defined by the
 * template. Keeping the content and field catalogue in sync prevents the
 * validation layer from treating a deleted field as an unknown placeholder
 * and the legacy loader from inferring it again after reload.
 */
export function removeCustomPlaceholderReferences(
  content: string,
  keys: readonly string[],
): string {
  return keys.reduce((nextContent, key) => {
    const escapedKey = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return nextContent.replace(
      new RegExp(`\\{\\{\\s*custom\\.${escapedKey}\\s*\\}\\}`, 'g'),
      '',
    );
  }, content);
}
