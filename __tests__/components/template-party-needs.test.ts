import { describe, expect, it } from 'vitest';
import {
  officersOfRoles,
  templateOfficerRoles,
  templatePartyNeeds,
} from '@/components/documents/generation-batch/template-party-needs';
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
      officers: false,
      contacts: true,
    });
    expect(templatePartyNeeds(OAKDOC_TEMPLATE_CONTENT, ['selectedDirector.name', 'selectedShareholder.name']))
      .toMatchObject({ director: true, shareholder: true, contact: false, contacts: false });
  });

  it('asks for officers when the template repeats them', () => {
    expect(templatePartyNeeds(OAKDOC_TEMPLATE_CONTENT, ['repeat.officers', 'officer.name']))
      .toMatchObject({ officers: true, directors: false });
  });

  it('asks for nothing when a Word template uses only company fields', () => {
    expect(Object.values(templatePartyNeeds(OAKDOC_TEMPLATE_CONTENT, ['company.name'])).some(Boolean)).toBe(false);
  });

  it('asks for officers of the roles an officers repeater is limited to', () => {
    const tags = ['repeat.officers.secretary', 'repeat.officers.auditor', 'officer.name'];
    expect(templatePartyNeeds(OAKDOC_TEMPLATE_CONTENT, tags)).toMatchObject({ officers: true });
    expect(templateOfficerRoles(tags)).toEqual(['SECRETARY', 'AUDITOR']);
    expect(templateOfficerRoles([...tags, 'repeat.officers'])).toBeNull();
    const officers = [{ id: 'a', role: 'SECRETARY' }, { id: 'b', role: 'DIRECTOR' }, { id: 'c', role: 'Auditor' }];
    expect(officersOfRoles(officers, templateOfficerRoles(tags)).map((officer) => officer.id)).toEqual(['a', 'c']);
    expect(officersOfRoles(officers, null)).toHaveLength(3);
  });
});
