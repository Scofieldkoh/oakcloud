import { Prisma, type FormField } from '@/generated/prisma';
import { isEmptyValue, parseObject } from '@/lib/form-utils';
import { prisma } from '@/lib/prisma';

export const DEFAULT_TENANT_TIME_ZONE = 'Asia/Singapore';

export function toJsonInput(value: unknown): Prisma.InputJsonValue | typeof Prisma.JsonNull {
  if (value === undefined || value === null) {
    return Prisma.JsonNull;
  }
  return value as Prisma.InputJsonValue;
}

export function normalizeTenantTimeZone(value: unknown): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    return DEFAULT_TENANT_TIME_ZONE;
  }

  const candidate = value.trim();
  try {
    Intl.DateTimeFormat('en-US', { timeZone: candidate }).format(new Date());
    return candidate;
  } catch {
    return DEFAULT_TENANT_TIME_ZONE;
  }
}

export async function getTenantTimeZone(tenantId: string): Promise<string> {
  const tenant = await prisma.tenant.findUnique({
    where: { id: tenantId },
    select: { settings: true },
  });

  const settings = parseObject(tenant?.settings);
  return normalizeTenantTimeZone(settings?.timezone);
}

export function isRepeatStartMarker(field: { type: string; inputType: string | null }): boolean {
  return field.type === 'PAGE_BREAK' && field.inputType === 'repeat_start';
}

export function isRepeatEndMarker(field: { type: string; inputType: string | null }): boolean {
  return field.type === 'PAGE_BREAK' && field.inputType === 'repeat_end';
}

export function escapeHtml(value: string): string {
  return value.replace(/[<>&]/g, (match) => (
    match === '<' ? '&lt;' : match === '>' ? '&gt;' : '&amp;'
  ));
}

export function applyDefaultTodayAnswers(
  fields: FormField[],
  inputAnswers: Record<string, unknown>
): Record<string, unknown> {
  const answers = { ...inputAnswers };
  const now = new Date();
  const todayIso = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;

  for (const field of fields) {
    if (field.type !== 'SHORT_TEXT' || field.inputType !== 'date') continue;
    const validation = parseObject(field.validation);
    if (validation?.defaultToday !== true) continue;

    const currentValue = answers[field.key];
    if (Array.isArray(currentValue)) {
      answers[field.key] = currentValue.map((rowValue) => (isEmptyValue(rowValue) ? todayIso : rowValue));
      continue;
    }

    if (isEmptyValue(currentValue)) {
      answers[field.key] = todayIso;
    }
  }

  return answers;
}
