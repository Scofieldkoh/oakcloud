import { describe, expect, it } from 'vitest';
import { templatePartyNeeds } from '@/components/documents/generation-batch/template-party-needs';
import { OAKDOC_TEMPLATE_CONTENT } from '@/lib/document-editor/oakdoc-template';

describe('templatePartyNeeds for Word templates', () => {
  it('asks for the parties the template fields and repeaters use', () => {
    expect(templatePartyNeeds(OAKDOC_TEMPLATE_CONTENT, [
      'selectedContact.name',
      'repeat.contacts',
      'contact.email',
      'custom.fee',
    ])).toEqual({
      director: false,
      directors: false,
      shareholder: false,
      shareholders: false,
      contact: true,
      contacts: true,
    });
    expect(templatePartyNeeds(OAKDOC_TEMPLATE_CONTENT, ['selectedDirector.name', 'selectedShareholder.name']))
      .toMatchObject({ director: true, shareholder: true, contact: false, contacts: false });
  });

  it('asks for nothing when a Word template uses only company fields', () => {
    expect(Object.values(templatePartyNeeds(OAKDOC_TEMPLATE_CONTENT, ['company.name'])).some(Boolean)).toBe(false);
  });
});
