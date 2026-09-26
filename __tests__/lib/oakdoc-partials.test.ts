// @vitest-environment jsdom
import { strFromU8, unzipSync, zipSync } from 'fflate';
import { encodeOakDocZipText as strToU8 } from '@/lib/document-editor/oakdoc-zip';
import { describe, expect, it } from 'vitest';
import {
  expandOakDocPartials,
  inspectOakDocPartialReferences,
  oakDocPartialTag,
  validateOakDocPartialPackage,
} from '@/lib/document-editor/oakdoc-partials';
import { classifyOakDocTag } from '@/lib/document-editor/oakdoc-field-registry';
import { inspectOakDocPackage } from '@/lib/document-editor/oakdoc-package-policy';

const W = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
const R = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
const WP = 'http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing';
const A = '11111111-1111-4111-8111-111111111111';
const B = '22222222-2222-4222-8222-222222222222';

interface PackageInput {
  body: string;
  styles?: string;
  numbering?: string;
  rels?: string;
  media?: Record<string, Uint8Array>;
}

function pkg(input: PackageInput): Uint8Array {
  const files: Record<string, Uint8Array> = {
    '[Content_Types].xml': strToU8(
      '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">'
      + '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>'
      + '<Default Extension="xml" ContentType="application/xml"/>'
      + (input.media ? '<Default Extension="png" ContentType="image/png"/>' : '')
      + '<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>'
      + '</Types>',
    ),
    '_rels/.rels': strToU8('<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>'),
    'word/document.xml': strToU8(
      `<w:document xmlns:w="${W}" xmlns:r="${R}" xmlns:wp="${WP}"><w:body>${input.body}<w:sectPr><w:pgSz w:w="11906" w:h="16838"/></w:sectPr></w:body></w:document>`,
    ),
    'word/_rels/document.xml.rels': strToU8(
      `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${input.rels ?? ''}</Relationships>`,
    ),
  };
  if (input.styles) files['word/styles.xml'] = strToU8(`<w:styles xmlns:w="${W}">${input.styles}</w:styles>`);
  if (input.numbering) files['word/numbering.xml'] = strToU8(`<w:numbering xmlns:w="${W}">${input.numbering}</w:numbering>`);
  for (const [name, bytes] of Object.entries(input.media ?? {})) files[`word/${name}`] = bytes;
  return zipSync(files);
}

function reference(partialId: string, id = 1): string {
  return `<w:sdt><w:sdtPr><w:tag w:val="${oakDocPartialTag(partialId)}"/><w:id w:val="${id}"/></w:sdtPr><w:sdtContent><w:p><w:r><w:t>[partial]</w:t></w:r></w:p></w:sdtContent></w:sdt>`;
}

function part(bytes: Uint8Array, name: string): string {
  return strFromU8(unzipSync(bytes)[name]);
}

const style = (id: string, color: string) => `<w:style w:type="paragraph" w:styleId="${id}"><w:name w:val="${id}"/><w:rPr><w:color w:val="${color}"/></w:rPr></w:style>`;

describe('native partial expansion', () => {
  it('merges styles, numbering, links, images and IDs without transplanting the section', () => {
    const master = pkg({
      body: `<w:p><w:pPr><w:pStyle w:val="Title"/></w:pPr><w:r><w:t>Letter</w:t></w:r></w:p>${reference(A, 7)}<w:p><w:r><w:t>End</w:t></w:r></w:p>`,
      styles: style('Title', '000000'),
      numbering: '<w:abstractNum w:abstractNumId="0"/><w:num w:numId="1"><w:abstractNumId w:val="0"/></w:num>',
    });
    const fragment = pkg({
      body: [
        '<w:p><w:pPr><w:pStyle w:val="Clause"/><w:numPr><w:ilvl w:val="0"/><w:numId w:val="1"/></w:numPr></w:pPr><w:r><w:t>Scope of work</w:t></w:r></w:p>',
        '<w:p><w:pPr><w:pStyle w:val="Title"/><w:sectPr/></w:pPr><w:bookmarkStart w:id="0" w:name="clause"/><w:hyperlink r:id="rIdLink"><w:r><w:t>Terms</w:t></w:r></w:hyperlink><w:bookmarkEnd w:id="0"/><w:r><w:commentReference w:id="3"/></w:r></w:p>',
        '<w:sdt><w:sdtPr><w:tag w:val="company.name"/><w:id w:val="7"/></w:sdtPr><w:sdtContent><w:p><w:r><w:t>[Company]</w:t></w:r></w:p></w:sdtContent></w:sdt>',
        '<w:p><w:r><w:drawing><wp:inline><wp:docPr w:id="1" id="1" name="logo"/><a:blip xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" r:embed="rIdImg"/></wp:inline></w:drawing></w:r></w:p>',
      ].join(''),
      styles: style('Clause', '1F5C49') + style('Title', 'FF0000'),
      numbering: '<w:abstractNum w:abstractNumId="0"><w:lvl w:ilvl="0"><w:numFmt w:val="decimal"/></w:lvl></w:abstractNum><w:num w:numId="1"><w:abstractNumId w:val="0"/></w:num>',
      rels: '<Relationship Id="rIdLink" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/hyperlink" Target="https://example.com/terms" TargetMode="External"/>'
        + '<Relationship Id="rIdImg" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/image1.png"/>',
      media: { 'media/image1.png': strToU8('PNGDATA') },
    });

    const result = expandOakDocPartials({ docxBytes: master, fragments: new Map([[A, fragment]]) });
    const document = part(result.bytes, 'word/document.xml');

    expect(result.expanded).toEqual([A]);
    expect(document).not.toContain('oakdoc.partial:');
    expect(document.indexOf('Letter')).toBeLessThan(document.indexOf('Scope of work'));
    expect(document.indexOf('Scope of work')).toBeLessThan(document.indexOf('End'));
    expect(document.match(/<w:sectPr/g)).toHaveLength(1);
    expect(document).not.toContain('commentReference');

    // The copied list gets a fresh numId that points at a fresh definition.
    const numbering = part(result.bytes, 'word/numbering.xml');
    expect(document).toContain('<w:numId w:val="2"/>');
    expect(numbering).toMatch(/<w:num w:numId="2"><w:abstractNumId w:val="1"\/>/);
    expect(numbering.indexOf('w:abstractNumId="1"')).toBeLessThan(numbering.indexOf('<w:num w:numId="1"'));

    // Missing style copied; clashing style keeps the master's definition.
    const styles = part(result.bytes, 'word/styles.xml');
    expect(styles).toContain('w:styleId="Clause"');
    expect(styles.match(/w:styleId="Title"/g)).toHaveLength(1);
    expect(styles).not.toContain('FF0000');
    expect(result.diagnostics.map((entry) => entry.code)).toContain('OAKDOC_PARTIAL_STYLE_CONFLICT');

    const rels = part(result.bytes, 'word/_rels/document.xml.rels');
    expect(rels).toContain('https://example.com/terms');
    expect(rels).not.toContain('rIdLink');
    const media = Object.keys(unzipSync(result.bytes)).filter((name) => name.startsWith('word/media/'));
    expect(media).toHaveLength(1);
    expect(rels).toContain(media[0].replace('word/', ''));

    // Control and bookmark IDs no longer collide with the master's.
    const controlIds = Array.from(document.matchAll(/<w:id w:val="(\d+)"\/>/g)).map((match) => match[1]);
    expect(controlIds).not.toContain('7');
    expect(document).toContain('<w:bookmarkStart w:id="2');
    expect(() => inspectOakDocPackage(result.bytes, 'draft')).not.toThrow();
  });

  it('expands nested partials and stops cycles, depth and missing partials with errors', () => {
    const inner = pkg({ body: '<w:p><w:r><w:t>Inner clause</w:t></w:r></w:p>' });
    const outer = pkg({ body: `<w:p><w:r><w:t>Outer clause</w:t></w:r></w:p>${reference(B)}` });
    const master = pkg({ body: reference(A) });

    const nested = expandOakDocPartials({ docxBytes: master, fragments: new Map([[A, outer], [B, inner]]) });
    expect(part(nested.bytes, 'word/document.xml')).toContain('Inner clause');
    expect(nested.expanded.sort()).toEqual([A, B].sort());
    expect(nested.diagnostics).toEqual([]);

    const cyclic = pkg({ body: reference(A) });
    const cycle = expandOakDocPartials({ docxBytes: master, fragments: new Map([[A, outer], [B, cyclic]]) });
    expect(cycle.diagnostics.map((entry) => entry.code)).toContain('OAKDOC_PARTIAL_CYCLE');

    const shallow = expandOakDocPartials({ docxBytes: master, fragments: new Map([[A, outer], [B, inner]]), maxDepth: 1 });
    expect(shallow.diagnostics.map((entry) => entry.code)).toContain('OAKDOC_PARTIAL_DEPTH');

    const missing = expandOakDocPartials({ docxBytes: master, fragments: new Map() });
    expect(missing.diagnostics).toEqual([expect.objectContaining({ code: 'OAKDOC_PARTIAL_MISSING', severity: 'error' })]);
    expect(part(missing.bytes, 'word/document.xml')).toContain(oakDocPartialTag(A));
  });

  it('rejects a reference placed inside a paragraph', () => {
    const inline = `<w:p><w:r><w:t>Before </w:t></w:r><w:sdt><w:sdtPr><w:tag w:val="${oakDocPartialTag(A)}"/></w:sdtPr><w:sdtContent><w:r><w:t>x</w:t></w:r></w:sdtContent></w:sdt></w:p>`;
    const result = expandOakDocPartials({
      docxBytes: pkg({ body: inline }),
      fragments: new Map([[A, pkg({ body: '<w:p><w:r><w:t>Clause</w:t></w:r></w:p>' })]]),
    });
    expect(result.diagnostics.map((entry) => entry.code)).toEqual(['OAKDOC_PARTIAL_INLINE_REFERENCE']);
  });

  it('validates partial packages at upload and classifies references', () => {
    const header = pkg({
      body: '<w:p><w:r><w:object r:id="rIdOle"/></w:r></w:p>',
      rels: '<Relationship Id="rIdOle" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/oleObject" Target="embeddings/x.bin"/>',
    });
    expect(validateOakDocPartialPackage(header).map((entry) => entry.code)).toContain('OAKDOC_PARTIAL_UNSUPPORTED_PART');
    expect(validateOakDocPartialPackage(pkg({ body: '<w:p><w:r><w:t>Fine</w:t></w:r></w:p>' }))).toEqual([]);
    expect(inspectOakDocPartialReferences(pkg({ body: reference(A) + reference(A, 2) + reference(B, 3) }))).toEqual([A, B]);
    expect(classifyOakDocTag(oakDocPartialTag(A))).toBe('partial');
  });
});
