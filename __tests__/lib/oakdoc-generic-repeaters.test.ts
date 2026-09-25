// @vitest-environment jsdom

import { describe, expect, it } from 'vitest';
import { strFromU8, unzipSync } from 'fflate';

import { createDocxFixture } from '../helpers/docx-fixture';
import {
  createOakDocGenericRepeater,
  removeOakDocGenericRepeater,
  resolveOakDocGenericRepeaters,
} from '@/lib/document-editor/oakdoc-generic-repeaters';
import {
  OAKDOC_GENERIC_REPEATER_BY_TAG,
} from '@/lib/document-editor/oakdoc-repeater-definitions';

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
