import { describe, it, expect } from 'vitest';
import { createContactSchema, createContactWithDetailsSchema, updateContactSchema } from '@/lib/validations/contact';

describe('contact validation', () => {
  it('allows blank identificationType when creating a contact', () => {
    const parsed = createContactSchema.parse({
      contactType: 'INDIVIDUAL',
      firstName: 'John',
      identificationType: '',
    });

    expect(parsed.identificationType).toBeNull();
  });

  it('allows blank identificationType when updating a contact', () => {
    const parsed = updateContactSchema.parse({
      id: '11111111-1111-1111-1111-111111111111',
      identificationType: '',
    });

    expect(parsed.identificationType).toBeNull();
  });

  it('takes a gender of MALE, FEMALE or OTHER, treats a blank one as none, and rejects anything else', () => {
    for (const gender of ['MALE', 'FEMALE', 'OTHER']) {
      expect(createContactSchema.parse({ contactType: 'INDIVIDUAL', firstName: 'John', gender }).gender).toBe(gender);
    }
    expect(createContactSchema.parse({ contactType: 'INDIVIDUAL', firstName: 'John', gender: '' }).gender).toBeNull();
    expect(createContactSchema.parse({ contactType: 'INDIVIDUAL', firstName: 'John' }).gender).toBeUndefined();
    expect(updateContactSchema.parse({ id: '11111111-1111-1111-1111-111111111111', gender: '' }).gender).toBeNull();
    for (const bad of ['male', 'M', 'unknown', 1]) {
      expect(createContactSchema.safeParse({ contactType: 'INDIVIDUAL', firstName: 'John', gender: bad }).success, String(bad)).toBe(false);
    }
  });

  describe('date of birth', () => {
    const person = { contactType: 'INDIVIDUAL' as const, firstName: 'John' };
    const dob = (value: unknown) => createContactSchema.safeParse({ ...person, dateOfBirth: value });

    it('takes YYYY-MM-DD as typed', () => {
      expect(createContactSchema.parse({ ...person, dateOfBirth: '1980-01-01' }).dateOfBirth).toBe('1980-01-01');
      expect(createContactSchema.parse({ ...person, dateOfBirth: '2024-02-29' }).dateOfBirth).toBe('2024-02-29');
    });

    it('still takes a legacy ISO date-time, as the same UTC calendar date', () => {
      expect(createContactSchema.parse({ ...person, dateOfBirth: '1980-01-01T00:00:00.000Z' }).dateOfBirth).toBe('1980-01-01');
      expect(updateContactSchema.parse({ id: '11111111-1111-1111-1111-111111111111', dateOfBirth: '1980-12-31T23:59:59.000Z' }).dateOfBirth).toBe('1980-12-31');
    });

    it('treats blank as none and leaves a missing field missing', () => {
      expect(createContactSchema.parse({ ...person, dateOfBirth: '' }).dateOfBirth).toBeNull();
      expect(createContactSchema.parse({ ...person, dateOfBirth: null }).dateOfBirth).toBeNull();
      expect(createContactSchema.parse(person).dateOfBirth).toBeUndefined();
      expect(updateContactSchema.parse({ id: '11111111-1111-1111-1111-111111111111', dateOfBirth: '' }).dateOfBirth).toBeNull();
      expect(updateContactSchema.parse({ id: '11111111-1111-1111-1111-111111111111' }).dateOfBirth).toBeUndefined();
    });

    it.each(['2023-02-29', '1980-13-01', '1980-02-30T00:00:00Z', 'not a date', '01/01/1980', '2999-01-01', '1850-01-01', 19800101])(
      'rejects %j with a clear message',
      (value) => {
        const result = dob(value);
        expect(result.success).toBe(false);
        if (!result.success) expect(result.error.issues[0].path).toEqual(['dateOfBirth']);
      },
    );

    it('rejects tomorrow, accepts today', () => {
      const today = new Date().toISOString().slice(0, 10);
      const tomorrow = new Date(Date.now() + 36 * 3600 * 1000).toISOString().slice(0, 10);
      expect(dob(today).success).toBe(true);
      expect(dob(tomorrow).success).toBe(false);
    });

    it('rejects a date of birth for a corporate contact, on create with or without details', () => {
      const corporate = { contactType: 'CORPORATE' as const, corporateName: 'Acme Pte Ltd', dateOfBirth: '1980-01-01' };
      expect(createContactSchema.safeParse(corporate).success).toBe(false);
      expect(createContactWithDetailsSchema.safeParse(corporate).success).toBe(false);
      expect(createContactSchema.safeParse({ ...corporate, dateOfBirth: null }).success).toBe(true);
      expect(createContactSchema.safeParse({ ...corporate, dateOfBirth: '' }).success).toBe(true);
    });
  });

  it('accepts an explicit reuse decision with a selected contact', () => {
    const parsed = createContactWithDetailsSchema.parse({
      contactType: 'INDIVIDUAL',
      firstName: '王小明',
      resolution: { action: 'REUSE', contactId: '11111111-1111-4111-8111-111111111111' },
    });

    expect(parsed.resolution).toEqual({
      action: 'REUSE',
      contactId: '11111111-1111-4111-8111-111111111111',
    });
  });

  it('requires a selected contact for reuse', () => {
    const result = createContactWithDetailsSchema.safeParse({
      contactType: 'INDIVIDUAL',
      firstName: '王小明',
      resolution: { action: 'REUSE' },
    });

    expect(result.success).toBe(false);
  });

  it('requires a meaningful reason for separate creation', () => {
    const result = createContactWithDetailsSchema.safeParse({
      contactType: 'INDIVIDUAL',
      firstName: '王小明',
      resolution: { action: 'CREATE_SEPARATE', reason: 'short' },
    });

    expect(result.success).toBe(false);
  });
});
