// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import {
  applyOakDocFieldCase,
  oakDocFieldCaseOfTitle,
  oakDocFieldTitle,
} from '@/lib/document-editor/oakdoc-field-case';
import { writeOakDocControlValue } from '@/lib/document-editor/oakdoc-fields';

const WORD_NS = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';

function control(alias: string): Element {
  const xml = new DOMParser().parseFromString(
    `<w:sdt xmlns:w="${WORD_NS}"><w:sdtPr><w:alias w:val="${alias}"/><w:tag w:val="officer.name"/></w:sdtPr>`
      + '<w:sdtContent><w:r><w:t>{{officer.name}}</w:t></w:r></w:sdtContent></w:sdt>',
    'application/xml',
  );
  return xml.documentElement;
}

describe('OakDoc field text case', () => {
  it('keeps the case in the field title and reads it back', () => {
    expect(oakDocFieldTitle('Full Address', 'upper')).toBe('Full Address · UPPERCASE');
    expect(oakDocFieldTitle('Officer Name', 'title')).toBe('Officer Name · Title Case');
    expect(oakDocFieldTitle('Officer Name')).toBe('Officer Name');
    expect(oakDocFieldCaseOfTitle('Full Address · UPPERCASE')).toBe('upper');
    expect(oakDocFieldCaseOfTitle('Officer Name · Title Case')).toBe('title');
    expect(oakDocFieldCaseOfTitle('Officer Name')).toBeNull();
  });

  it('prints values in upper or title case', () => {
    expect(applyOakDocFieldCase('21 Bukit Batok Crescent, #25-72', 'upper')).toBe('21 BUKIT BATOK CRESCENT, #25-72');
    expect(applyOakDocFieldCase('TAN WEI JIE', 'title')).toBe('Tan Wei Jie');
    expect(applyOakDocFieldCase('WONG LEE CHUIN (HUANG LIQIN)', 'title')).toBe('Wong Lee Chuin (Huang Liqin)');
    expect(applyOakDocFieldCase('Tan Wei Jie', null)).toBe('Tan Wei Jie');
  });

  it('writes a field value in the case its title asks for', () => {
    const upper = control('Officer Name · UPPERCASE');
    writeOakDocControlValue(upper, 'Tan Wei Jie');
    expect(upper.textContent).toBe('TAN WEI JIE');
    const stored = control('Officer Name');
    writeOakDocControlValue(stored, 'Tan Wei Jie');
    expect(stored.textContent).toBe('Tan Wei Jie');
  });
});
