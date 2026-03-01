import { describe, it, expect } from 'vitest';
import { createContactSchema, updateContactSchema } from '@/lib/validations/contact';

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
});
