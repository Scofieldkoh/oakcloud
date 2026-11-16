import { describe, expect, it } from 'vitest';
import type { FormField } from '@/generated/prisma';
import { buildSgAnnualReturnDeclarationFields } from '@/lib/form-templates/sg-annual-return-declaration';
import { getDateValidationRange } from '@/app/(public)/forms/f/[slug]/_lib/validation';
import { validatePublicAnswerConstraints } from '@/services/form-submission/validation';
import { fieldValidationSchema } from '@/lib/validations/form-builder';

const fields = buildSgAnnualReturnDeclarationFields();
const noticeField = fields.find((field) => field.key === 'agm_notice_date')!;
const agmField = fields.find((field) => field.key === 'agm_date')!;
const dateFields = [noticeField, agmField] as FormField[];

const notice = '2099-06-01';
const agmInSevenDays = '2099-06-08';
const agmInFourteenDays = '2099-06-15';
const answers = (consent: unknown, agm: string, noticeDate = notice) => ({
  short_notice_consent: consent,
  agm_notice_date: noticeDate,
  agm_date: agm,
});

describe('Annual Return AGM short-notice date restrictions', () => {
  it('persists conditional date offsets in the form validation schema', () => {
    expect(fieldValidationSchema.safeParse(noticeField.validation).success).toBe(true);
    expect(fieldValidationSchema.safeParse(agmField.validation).success).toBe(true);
    expect(noticeField.validation).toMatchObject({
      maxDateFieldKey: 'agm_date',
      maxDateOffsetDays: -14,
      maxDateOffsetDaysWhen: {
        fieldKey: 'short_notice_consent',
        equals: 'Yes',
        offsetDays: 0,
      },
    });
    expect(agmField.validation).toMatchObject({
      minDateFieldKey: 'agm_notice_date',
      minDateOffsetDays: 14,
      minDateOffsetDaysWhen: {
        fieldKey: 'short_notice_consent',
        equals: 'Yes',
        offsetDays: 0,
      },
    });
    expect(fieldValidationSchema.safeParse({
      maxDateOffsetDaysWhen: { fieldKey: 'consent', equals: 'Yes', offsetDays: 0 },
    }).success).toBe(false);
    expect(fieldValidationSchema.safeParse({
      maxDateFieldKey: 'agm_date',
      maxDateOffsetDaysWhen: { fieldKey: 'consent', equals: 'Yes', offsetDays: 99999 },
    }).success).toBe(false);
  });

  it('updates both date pickers when consent is given or revoked', () => {
    const noConsent = answers('No', agmInSevenDays);
    expect(getDateValidationRange(noticeField as Parameters<typeof getDateValidationRange>[0], noConsent).maxDate).toBe('2099-05-25');
    expect(getDateValidationRange(agmField as Parameters<typeof getDateValidationRange>[0], noConsent).minDate).toBe(agmInFourteenDays);

    const withConsent = answers('Yes', agmInSevenDays);
    expect(getDateValidationRange(noticeField as Parameters<typeof getDateValidationRange>[0], withConsent).maxDate).toBe(agmInSevenDays);
    expect(getDateValidationRange(agmField as Parameters<typeof getDateValidationRange>[0], withConsent).minDate).toBe(notice);

    const missingConsent = answers(undefined, agmInSevenDays);
    expect(getDateValidationRange(agmField as Parameters<typeof getDateValidationRange>[0], missingConsent).minDate).toBe(agmInFourteenDays);
  });

  it('allows less than 14 days, including same-day notice, only with affirmative consent', () => {
    expect(() => validatePublicAnswerConstraints(dateFields, answers('Yes', agmInSevenDays))).not.toThrow();
    expect(() => validatePublicAnswerConstraints(dateFields, answers('Yes', notice))).not.toThrow();
    expect(() => validatePublicAnswerConstraints(dateFields, answers('No', agmInFourteenDays))).not.toThrow();

    expect(() => validatePublicAnswerConstraints(dateFields, answers('No', agmInSevenDays))).toThrow();
    expect(() => validatePublicAnswerConstraints(dateFields, answers(undefined, agmInSevenDays))).toThrow();
  });

  it('never permits a meeting before its notice, even with short-notice consent', () => {
    const invalid = answers('Yes', '2099-05-31');
    expect(getDateValidationRange(agmField as Parameters<typeof getDateValidationRange>[0], invalid).minDate).toBe(notice);
    expect(() => validatePublicAnswerConstraints(dateFields, invalid)).toThrow();
  });
});
