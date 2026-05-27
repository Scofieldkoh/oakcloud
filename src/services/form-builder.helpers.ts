import { Prisma, type FormField } from '@/generated/prisma';
import { isEmptyValue, parseChoiceOptions, parseObject } from '@/lib/form-utils';
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
    const currentValue = answers[field.key];
    if (field.type === 'MULTIPLE_CHOICE') {
      const defaultValue = parseChoiceOptions(field.options)
        .filter((option) => option.defaultSelected)
        .map((option) => (option.allowTextInput ? { value: option.value, detailText: '' } : option.value));
      if (defaultValue.length > 0 && isEmptyValue(currentValue)) {
        answers[field.key] = defaultValue;
      }
      continue;
    }

    if (field.type === 'SHORT_TEXT' && field.inputType === 'time_timezone') {
      const validation = parseObject(field.validation);
      const timezone = normalizeTenantTimeZone(validation?.timezoneDefault);
      if (Array.isArray(currentValue)) {
        answers[field.key] = currentValue.map((rowValue) => {
          const rowRecord = parseObject(rowValue);
          const time = typeof rowRecord?.time === 'string' ? rowRecord.time : '';
          const rowTimezone = typeof rowRecord?.timezone === 'string' ? rowRecord.timezone : timezone;
          return { time, timezone: normalizeTenantTimeZone(rowTimezone) };
        });
      } else if (isEmptyValue(currentValue)) {
        answers[field.key] = { time: '', timezone };
      }
      continue;
    }

    if (field.type !== 'SHORT_TEXT' || field.inputType !== 'date') continue;
    const validation = parseObject(field.validation);
    if (validation?.defaultToday !== true) continue;

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
