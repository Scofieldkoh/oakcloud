const SHORT_MONTHS = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
] as const;

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function formatDocumentGenerationTitle(
  templateName: string,
  companyName: string,
  date: Date = new Date(),
): string {
  const dateLabel = `${date.getDate()} ${SHORT_MONTHS[date.getMonth()]} ${date.getFullYear()}`;
  return `${templateName.trim()}_${companyName.trim()}_${dateLabel}`;
}

export function isAutoDocumentGenerationTitle(
  title: string,
  templateName: string,
): boolean {
  const normalizedTitle = title.trim();
  const normalizedTemplateName = templateName.trim();
  if (
    normalizedTitle === normalizedTemplateName
    || normalizedTitle === `Untitled - ${normalizedTemplateName}`
  ) {
    return true;
  }

  const pattern = new RegExp(
    `^${escapeRegExp(normalizedTemplateName)}_.+_\\d{1,2} [A-Z][a-z]{2} \\d{4}$`,
  );
  return pattern.test(normalizedTitle);
}
