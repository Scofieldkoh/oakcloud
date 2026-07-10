export const HARD_PAGE_BREAK_HTML =
  '<div class="page-break" data-break-type="hard"></div>';

export const LEGACY_SOFT_PAGE_BREAK_REGEX = /<!--\s*PAGE_BREAK\s*-->/gi;
export const HARD_PAGE_BREAK_REGEX =
  /<div\b[^>]*class\s*=\s*["'][^"']*\bpage-break\b[^"']*["'][^>]*>(?:\s*<\/div>)?/gi;

const HARD_BREAK_TOKEN = '[[A4_HARD_PAGE_BREAK]]';

function textContentFromHtml(html: string): string {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<!--[^]*?-->/g, '')
    .replace(/&nbsp;/gi, ' ')
    .replace(/<br\s*\/?>/gi, '')
    .replace(/<[^>]+>/g, '')
    .trim();
}

function isRemovePageSegment(html: string): boolean {
  return /^\[Remove\s*Page\]$/i.test(textContentFromHtml(html));
}

export function normalizeLegacySoftPageBreaks(input: string): string {
  if (!input) return '';
  return input
    .split(LEGACY_SOFT_PAGE_BREAK_REGEX)
    .filter((segment) => !isRemovePageSegment(segment))
    .join('');
}

export function splitHardPageSections(input: string): string[] {
  const normalized = normalizeLegacySoftPageBreaks(input);
  if (!normalized) return [''];
  return normalized
    .replace(HARD_PAGE_BREAK_REGEX, HARD_BREAK_TOKEN)
    .split(HARD_BREAK_TOKEN);
}
