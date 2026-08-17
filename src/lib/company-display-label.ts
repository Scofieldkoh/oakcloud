const LEGAL_SUFFIXES = new Set([
  'pte',
  'ltd',
  'limited',
  'private',
  'llp',
  'lp',
  'inc',
  'llc',
  'corp',
  'corporation',
]);

export function normalizeCompanyAlias(value: string | null | undefined): string | null {
  const normalized = value?.trim();
  return normalized || null;
}

export function deriveCompanyInitials(legalName: string): string {
  const tokens = legalName
    .split(/[^\p{L}\p{N}]+/u)
    .map((token) => token.trim())
    .filter(Boolean);

  while (
    tokens.length > 0
    && LEGAL_SUFFIXES.has(tokens[tokens.length - 1]!.toLocaleLowerCase('en-SG'))
  ) {
    tokens.pop();
  }

  const initials = tokens
    .map((token) => Array.from(token)[0]?.toLocaleUpperCase('en-SG') ?? '')
    .join('');

  return initials || Array.from(legalName.trim())[0]?.toLocaleUpperCase('en-SG') || '?';
}

export function getCompanyDisplayLabel(company: { name: string; displayAlias?: string | null }): string {
  return normalizeCompanyAlias(company.displayAlias) ?? deriveCompanyInitials(company.name);
}
