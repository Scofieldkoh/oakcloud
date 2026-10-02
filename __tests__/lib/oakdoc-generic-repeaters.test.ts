// @vitest-environment jsdom

import { describe, expect, it } from 'vitest';
import { strFromU8, unzipSync } from 'fflate';

import { createDocxFixture } from '../helpers/docx-fixture';
import {
  createOakDocGenericRepeater,
  nameOakDocRepeaterItems,
  removeOakDocGenericRepeater,
  resolveOakDocGenericRepeaters,
} from '@/lib/document-editor/oakdoc-generic-repeaters';
import {
  OAKDOC_GENERIC_REPEATER_BY_TAG,
  formatOakDocRole,
  type OakDocRepeaterGenerationData,
} from '@/lib/document-editor/oakdoc-repeater-definitions';
import type { OakDocCompanyDetail } from '@/lib/document-editor/oakdoc-context';

const WORD_NS = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
const WORD14_NS = 'http://schemas.microsoft.com/office/word/2010/wordml';

function docx(body: string): Uint8Array {
  return createDocxFixture({
    'word/document.xml': [
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>',
      '<w:document xmlns:w="' + WORD_NS + '" xmlns:w14="' + WORD14_NS + '">',
      '<w:body>',
      body,
      '<w:sectPr/>',
      '</w:body></w:document>',
    ].join(''),
  });
}

function xml(bytes: Uint8Array): string {
  return strFromU8(unzipSync(bytes)['word/document.xml']);
}

function field(tag: string, id: number): string {
  return '<w:sdt><w:sdtPr><w:tag w:val="' + tag + '"/><w:id w:val="' + id
    + '"/></w:sdtPr><w:sdtContent><w:r><w:t>{{' + tag
    + '}}</w:t></w:r></w:sdtContent></w:sdt>';
}

function definition(tag: string) {
  const found = OAKDOC_GENERIC_REPEATER_BY_TAG.get(tag);
  if (!found) throw new Error('missing test definition ' + tag);
  return found;
}

describe('OakDoc generic repeaters', () => {
  it('keeps legacy director tags compatible with the generic registry', () => {
    const source = docx(
      '<w:p w14:paraId="A1B2C3D4">' + field('director.name', 10) + '</w:p>',
    );
    const created = createOakDocGenericRepeater({
      docxBytes: source,
      fromParaId: 'A1B2C3D4',
      definition: definition('repeat.directors'),
    });
    const resolved = resolveOakDocGenericRepeaters({
      docxBytes: created.bytes,
      data: {
        company: {
          id: 'c1',
          name: 'Example',
          uen: '202600001A',
          officers: [
            { id: 'd1', name: 'John Tan', role: 'DIRECTOR', isCurrent: true },
          ],
        },
      },
    });

    expect(resolved.repeatersResolved).toBe(1);
    expect(resolved.itemsCreated).toBe(1);
    expect(xml(resolved.bytes)).toContain('John Tan');
    expect(xml(resolved.bytes)).not.toContain('repeat.directors');
  });

  it.each([
    {
      tag: 'repeat.signers',
      itemTag: 'signer.name',
      expected: 'Signer One',
      data: {
        signers: [{ id: 's1', name: 'Signer One', role: 'Director' }],
      },
    },
    {
      tag: 'repeat.contacts',
      itemTag: 'contact.identificationNumber',
      expected: 'S1234567A',
      data: {
        contacts: [{ id: 'k1', name: 'Contact One', identificationNumber: 'S1234567A' }],
      },
    },
    {
      tag: 'repeat.authorisedRepresentatives',
      itemTag: 'authorisedRepresentative.name',
      expected: 'Representative One',
      data: {
        authorisedRepresentatives: [
          { id: 'r1', name: 'Representative One', role: 'Director' },
        ],
      },
    },
  ])('resolves $tag from its generation adapter', ({ tag, itemTag, expected, data }) => {
    const source = docx(
      '<w:p w14:paraId="B1C2D3E4">' + field(itemTag, 20) + '</w:p>',
    );
    const created = createOakDocGenericRepeater({
      docxBytes: source,
      fromParaId: 'B1C2D3E4',
      definition: definition(tag),
    });
    const resolved = resolveOakDocGenericRepeaters({
      docxBytes: created.bytes,
      data: {
        company: { id: 'c1', name: 'Example', uen: '202600001A' },
        ...data,
      },
    });

    expect(resolved.itemsCreated).toBe(1);
    expect(xml(resolved.bytes)).toContain(expected);
    expect(xml(resolved.bytes)).not.toContain(tag);
  });

  it('repeats only the officers ticked on Configure, any role, in that order', () => {
    const source = docx('<w:p w14:paraId="E1000001">' + field('officer.name', 50) + field('officer.role', 51) + '</w:p>');
    const created = createOakDocGenericRepeater({
      docxBytes: source,
      fromParaId: 'E1000001',
      definition: definition('repeat.officers'),
    });
    const company = {
      id: 'c1',
      name: 'Example',
      uen: '202600001A',
      officers: [
        { id: 'o1', name: 'Dana Director', role: 'DIRECTOR', isCurrent: true },
        { id: 'o2', name: 'Sam Secretary', role: 'SECRETARY', isCurrent: true },
        { id: 'o3', name: 'Sue Secretary', role: 'SECRETARY', isCurrent: true },
        { id: 'o4', name: 'Old Secretary', role: 'SECRETARY', isCurrent: false },
      ],
    };
    const resolved = resolveOakDocGenericRepeaters({
      docxBytes: created.bytes,
      data: { company, selectedOfficerIds: ['o3', 'o2', 'o4'] },
    });
    expect(resolved.itemsCreated).toBe(2);
    const text = xml(resolved.bytes);
    expect(text.indexOf('Sue Secretary')).toBeLessThan(text.indexOf('Sam Secretary'));
    expect(text).toContain('Secretary');
    expect(text).not.toContain('Dana Director');
    expect(text).not.toContain('Old Secretary');

    const none = resolveOakDocGenericRepeaters({ docxBytes: created.bytes, data: { company } });
    expect(none.itemsCreated).toBe(0);
  });

  it('keeps each director signing block together and puts roles in proper case', () => {
    const source = docx(
      '<w:p w14:paraId="D1000001"/>'
      + '<w:p w14:paraId="D1000002"><w:r><w:t>________________</w:t></w:r></w:p>'
      + '<w:p w14:paraId="D1000003">' + field('director.name', 40) + '</w:p>'
      + '<w:p w14:paraId="D1000004"><w:pPr><w:pStyle w:val="Normal"/><w:jc w:val="left"/></w:pPr>' + field('director.role', 41) + '</w:p>',
    );
    const created = createOakDocGenericRepeater({
      docxBytes: source,
      fromParaId: 'D1000001',
      toParaId: 'D1000004',
      definition: definition('repeat.directors'),
    });
    const resolved = resolveOakDocGenericRepeaters({
      docxBytes: created.bytes,
      data: {
        company: {
          id: 'c1',
          name: 'Example',
          uen: '202600001A',
          officers: [
            { id: 'd1', name: 'Goh Hua Tiong', role: 'DIRECTOR', isCurrent: true },
            { id: 'd2', name: 'Lee Kwee Eng', role: 'MANAGING DIRECTOR AND CEO', isCurrent: true },
          ],
        },
      },
    });
    const document = new DOMParser().parseFromString(xml(resolved.bytes), 'application/xml');
    const paragraphs = Array.from(document.getElementsByTagNameNS(WORD_NS, 'p'));
    const flags = paragraphs.map((paragraph) => [
      paragraph.getElementsByTagNameNS(WORD_NS, 'keepNext').length,
      paragraph.getElementsByTagNameNS(WORD_NS, 'keepLines').length,
    ]);

    // Each block of four paragraphs holds together; the last line of a block does not pull in the next.
    expect(flags).toEqual([[1, 1], [1, 1], [1, 1], [0, 1], [1, 1], [1, 1], [1, 1], [0, 1]]);
    expect(xml(resolved.bytes)).toContain('<w:pPr><w:pStyle w:val="Normal"/><w:keepLines/><w:jc w:val="left"/></w:pPr>');
    expect(xml(resolved.bytes)).toContain('>Director<');
    expect(xml(resolved.bytes)).toContain('>Managing Director and CEO<');
  });

  it('formats registry roles and leaves typed roles alone', () => {
    expect(formatOakDocRole('DIRECTOR')).toBe('Director');
    expect(formatOakDocRole('CEO')).toBe('CEO');
    expect(formatOakDocRole('DIRECTOR / CFO')).toBe('Director / CFO');
    expect(formatOakDocRole('ALTERNATE DIRECTOR')).toBe('Alternate Director');
    expect(formatOakDocRole('Chief Executive Officer')).toBe('Chief Executive Officer');
    expect(formatOakDocRole(null)).toBe('');
  });

  it('repeats only the directors and shareholders chosen for the document', () => {
    const company = {
      officers: [
        { id: 'o1', name: 'Ann Lim', role: 'DIRECTOR', isCurrent: true },
        { id: 'o2', name: 'Ben Ong', role: 'NOMINEE_DIRECTOR', isCurrent: true },
        { id: 'o3', name: 'Cal Ng', role: 'SECRETARY', isCurrent: true },
      ],
      shareholders: [
        { id: 's1', name: 'Dee Tan', isCurrent: true },
        { id: 's2', name: 'Eve Koh', isCurrent: true },
      ],
    } as unknown as OakDocCompanyDetail;
    const names = (tag: string, data: Omit<OakDocRepeaterGenerationData, 'company'>) =>
      definition(tag).generationDataAdapter({ company, ...data })
        .map((row) => row[tag === 'repeat.directors' ? 'director.name' : 'shareholder.name']);

    expect(names('repeat.directors', {})).toEqual(['Ann Lim', 'Ben Ong']);
    expect(names('repeat.directors', { selectedDirectorIds: ['o2'] })).toEqual(['Ben Ong']);
    expect(names('repeat.shareholders', {})).toEqual(['Dee Tan', 'Eve Koh']);
    expect(names('repeat.shareholders', { selectedShareholderIds: ['s1'] })).toEqual(['Dee Tan']);
    expect(names('repeat.shareholders', { selectedShareholderIds: [] })).toEqual([]);
  });

  it('repeats agreement entities in a table row', () => {
    const source = docx(
      '<w:tbl><w:tr><w:tc><w:p w14:paraId="C1D2E3F4">'
      + field('agreementEntity.name', 30)
      + '</w:p></w:tc><w:tc><w:p w14:paraId="C1D2E3F5">'
      + field('agreementEntity.uen', 31)
      + '</w:p></w:tc></w:tr></w:tbl>',
    );
    const created = createOakDocGenericRepeater({
      docxBytes: source,
      fromParaId: 'C1D2E3F4',
      toParaId: 'C1D2E3F5',
      definition: definition('repeat.agreementEntities'),
    });
    const resolved = resolveOakDocGenericRepeaters({
      docxBytes: created.bytes,
      data: {
        company: { id: 'c1', name: 'Example', uen: '202600001A' },
        agreementEntities: [
          { id: 'e1', name: 'Alpha Pte. Ltd.', uen: '202600001A' },
          { id: 'e2', name: 'Beta Pte. Ltd.', uen: '202600002B' },
        ],
      },
    });
    const output = xml(resolved.bytes);

    expect(created.targetKind).toBe('table row');
    expect(output.match(/<w:tr(?:\s|>)/g)).toHaveLength(2);
    expect(output).toContain('Alpha Pte. Ltd.');
    expect(output).toContain('Beta Pte. Ltd.');
    // Table rows can still break across pages.
    expect(output).not.toContain('w:keepNext');
  });

  it('wraps and safely unwraps a multi-paragraph repeating block', () => {
    const source = docx(
      '<w:p w14:paraId="D1E2F3A4">' + field('signer.name', 40) + '</w:p>'
      + '<w:p w14:paraId="D1E2F3A5"><w:r><w:t>Second line</w:t></w:r></w:p>',
    );
    const created = createOakDocGenericRepeater({
      docxBytes: source,
      fromParaId: 'D1E2F3A4',
      toParaId: 'D1E2F3A5',
      definition: definition('repeat.signers'),
    });
    expect(created.targetKind).toBe('block range');

    const removed = removeOakDocGenericRepeater({
      docxBytes: created.bytes,
      paraId: 'D1E2F3A4',
    });
    const output = xml(removed.bytes);
    expect(output).toContain('D1E2F3A4');
    expect(output).toContain('D1E2F3A5');
    expect(output).toContain('Second line');
    expect(output).not.toContain('repeat.signers');
  });

  it('names repeater items so the editor shows which repeater the caret is in', () => {
    const created = createOakDocGenericRepeater({
      docxBytes: docx('<w:p w14:paraId="C1D2E3F4">' + field('director.name', 30) + '</w:p>'),
      fromParaId: 'C1D2E3F4',
      definition: definition('repeat.directors'),
    });
    expect(xml(created.bytes).match(/w:alias w:val="Directors repeater"/g)).toHaveLength(2);

    const unnamed = docx(
      '<w:sdt><w:sdtPr><w:alias w:val="Directors"/><w:tag w:val="repeat.directors"/><w:id w:val="1"/>'
      + '<w15:repeatingSection xmlns:w15="http://schemas.microsoft.com/office/word/2012/wordml"/>'
      + '</w:sdtPr><w:sdtContent><w:sdt><w:sdtPr><w:id w:val="2"/>'
      + '<w15:repeatingSectionItem xmlns:w15="http://schemas.microsoft.com/office/word/2012/wordml"/>'
      + '</w:sdtPr><w:sdtContent><w:p w14:paraId="C1D2E3F5">' + field('director.name', 3)
      + '</w:p></w:sdtContent></w:sdt></w:sdtContent></w:sdt>',
    );
    const named = nameOakDocRepeaterItems(unnamed);
    expect(xml(named)).toContain('<w:sdtPr><w:alias w:val="Directors"/><w:id w:val="2"/>');
    expect(nameOakDocRepeaterItems(named)).toBe(named);
  });

  it('rejects malformed repeating structures instead of deleting content', () => {
    const malformed = docx(
      '<w:sdt><w:sdtPr><w:tag w:val="repeat.signers"/>'
      + '<w15:repeatingSection xmlns:w15="http://schemas.microsoft.com/office/word/2012/wordml"/>'
      + '</w:sdtPr><w:sdtContent><w:p w14:paraId="E1F2A3B4">'
      + '<w:r><w:t>Keep me</w:t></w:r></w:p></w:sdtContent></w:sdt>',
    );

    expect(() => removeOakDocGenericRepeater({
      docxBytes: malformed,
      paraId: 'E1F2A3B4',
    })).toThrow('structure is incomplete');
    expect(xml(malformed)).toContain('Keep me');
  });
});
