export function commitTemplateFormChange<T extends object>(
  setFormData: (update: (current: T) => T) => void,
  setIsDirty: (isDirty: boolean) => void,
  changes: Partial<T>,
) {
  setFormData((current) => ({ ...current, ...changes }));
  setIsDirty(true);
}
