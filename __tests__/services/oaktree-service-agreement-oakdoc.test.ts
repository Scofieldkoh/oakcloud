// @vitest-environment jsdom

import { describe, expect, it } from 'vitest';
import { strFromU8, unzipSync } from 'fflate';

import {
  OAKTREE_SERVICE_AGREEMENT_OAKDOC,
  SERVICE_AGREEMENT_OAKDOC_EXPECTED_STAGE4_TAGS,
  SERVICE_AGREEMENT_OAKDOC_FIELD_TAGS,
  SERVICE_AGREEMENT_OAKDOC_STRUCTURAL_TAGS,
  buildOaktreeServiceAgreementOakDoc,
} from '@/content/service-agreement/oaktree-service-agreement-oakdoc';
import { OAKTREE_SERVICE_AGREEMENT_V1 } from '@/content/service-agreement/oaktree-service-agreement-v1';

const WORD_NS = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';

function documentXml(): string {
  const files = unzipSync(buildOaktreeServiceAgreementOakDoc());
  return strFromU8(files['word/document.xml']);
}

function parseDocument(): XMLDocument {
  return new DOMParser().parseFromString(documentXml(), 'application/xml');
}

function tags(xml: XMLDocument): string[] {
  return Array.from(xml.getElementsByTagNameNS(WORD_NS, 'tag'))
    .map((node) => node.getAttributeNS(WORD_NS, 'val') || node.getAttribute('w:val') || '')
    .filter(Boolean);
}

function text(xml: XMLDocument): string {
  return Array.from(xml.getElementsByTagNameNS(WORD_NS, 't'))
    .map((node) => node.textContent || '')
    .join(' ');
}

describe('Oaktree Master Services Agreement OakDoc master', () => {
  it('builds a valid A4 Word package with styles, footer page numbering and native controls', () => {
    const bytes = buildOaktreeServiceAgreementOakDoc();
    const files = unzipSync(bytes);

    expect(files['[Content_Types].xml']).toBeDefined();
    expect(files['word/document.xml']).toBeDefined();
    expect(files['word/styles.xml']).toBeDefined();
    expect(files['word/footer1.xml']).toBeDefined();
    expect(files['word/_rels/document.xml.rels']).toBeDefined();

    const document = strFromU8(files['word/document.xml']);
    const styles = strFromU8(files['word/styles.xml']);
    const footer = strFromU8(files['word/footer1.xml']);

    expect(document).toContain('<w:pgSz w:w="11906" w:h="16838"/>');
    expect(document).toContain('<w:pgMar w:top="1134"');
    expect(styles).toContain('w:ascii="Aptos"');
    expect(styles).toContain('w:styleId="Heading1"');
    expect(styles).toContain('<w:keepNext/>');
    expect(footer).toContain('w:instr="PAGE"');
    expect(document).toContain('<w:tblHeader/>');
  });

  it('contains each Service Agreement structural control exactly once and in the intended regions', () => {
    const source = documentXml();
    const parsed = parseDocument();
    const allTags = tags(parsed);

    for (const tag of Object.values(SERVICE_AGREEMENT_OAKDOC_STRUCTURAL_TAGS)) {
      expect(allTags.filter((candidate) => candidate === tag)).toHaveLength(1);
    }

    const serviceIndex = source.indexOf('w:val="agreement.serviceSections"');
    const feeHeadingIndex = source.indexOf('>Fees</w:t>', serviceIndex);
    const feeIndex = source.indexOf('w:val="agreement.feeTable"');
    const instructionsIndex = source.indexOf('>Instructions</w:t>', feeIndex);
    const appendixHeadingIndex = source.indexOf('Appendix 3 - List of Client entities within this Agreement');
    const entityIndex = source.indexOf('w:val="agreement.entityAppendix"');

    expect(serviceIndex).toBeGreaterThan(source.indexOf('sole responsibility of the Client'));
    expect(serviceIndex).toBeLessThan(feeHeadingIndex);
    expect(feeIndex).toBeGreaterThan(feeHeadingIndex);
    expect(feeIndex).toBeLessThan(instructionsIndex);
    expect(entityIndex).toBeGreaterThan(appendixHeadingIndex);
  });

  it('carries the required company, contact, dates, term, signer, representative and signature controls', () => {
    const parsed = parseDocument();
    const allTags = tags(parsed);

    for (const tag of SERVICE_AGREEMENT_OAKDOC_FIELD_TAGS) {
      expect(allTags).toContain(tag);
    }
    for (const tag of SERVICE_AGREEMENT_OAKDOC_EXPECTED_STAGE4_TAGS) {
      expect(allTags).toContain(tag);
    }

    expect(allTags.filter((tag) => tag === 'repeat.signers')).toHaveLength(2);
    expect(allTags.filter((tag) => tag === 'repeat.authorisedRepresentatives')).toHaveLength(1);
    expect(allTags.filter((tag) => tag === 'oakdoc.signature.v1.provider')).toHaveLength(2);
    expect(allTags.filter((tag) => tag === 'oakdoc.signature.v1.client-acceptance')).toHaveLength(1);
    expect(allTags.filter((tag) => tag === 'oakdoc.signature.v1.sow-client')).toHaveLength(1);
    expect(allTags.filter((tag) => tag === 'oakdoc.signature.v1.authorised-representative-specimen')).toHaveLength(1);
  });

  it('preserves controlled legal wording fingerprints without baking dynamic SOWs or fees into the master', () => {
    const renderedText = text(parseDocument());

    for (const clause of [
      'Services will be performed in such manner, at such place or places',
      'shall not be held responsible for the production of inaccurate financial statements',
      'we will mutually agree with you on a revised fee',
      'Contracts (Rights of Third Parties) Act 2001',
      'Singapore International Arbitration Centre',
    ]) {
      expect(renderedText).toContain(clause);
    }

    expect(renderedText).toContain('[Service sections inserted during generation]');
    expect(renderedText).toContain('[Fee table inserted during generation]');
    expect(renderedText).toContain('[Entity appendix inserted during generation]');
    expect(renderedText).not.toContain('Corporate Secretarial Services');
    expect(renderedText).not.toContain('S$500.00');
    expect(renderedText).not.toContain('S$1,200.00');
  });

  it('is a separate inactive OakDoc seed and leaves the current A4 master active', () => {
    expect(OAKTREE_SERVICE_AGREEMENT_OAKDOC.name).not.toBe(
      OAKTREE_SERVICE_AGREEMENT_V1.template.name,
    );
    expect(OAKTREE_SERVICE_AGREEMENT_OAKDOC.compositionType).toBe('SERVICE_AGREEMENT');
    expect(OAKTREE_SERVICE_AGREEMENT_OAKDOC.isActive).toBe(false);
    expect(OAKTREE_SERVICE_AGREEMENT_V1.template.isActive).toBe(true);
  });
});
