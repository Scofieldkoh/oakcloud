import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('document generation wizard source', () => {
  it('does not retain the removed browser-draft reset path', () => {
    const source = readFileSync(resolve(
      process.cwd(),
      'src/components/documents/document-generation-wizard.tsx',
    ), 'utf8');

    expect(source).not.toContain('clearWizardDraft');
    expect(source).not.toContain('const _handleReset');
  });

  it('uses the three-stage responsive workspace structure', () => {
    const wizardSource = readFileSync(resolve(
      process.cwd(),
      'src/components/documents/document-generation-wizard.tsx',
    ), 'utf8');
    const pageSource = readFileSync(resolve(
      process.cwd(),
      'src/app/(dashboard)/generated-documents/generate/page.tsx',
    ), 'utf8');

    expect(wizardSource).toContain('DocumentPartyChoiceList');
    expect(wizardSource).toContain('DocumentContactChoiceList');
    expect(wizardSource).toContain('sticky bottom-0');
    expect(wizardSource).toContain('2xl:grid-cols');
    expect(wizardSource).toContain('2xl:sticky');
    expect(wizardSource).not.toContain("{ id: 'people', label: 'People' }");
    expect(pageSource).toContain('Back to Documents');
    expect(pageSource).toContain('Create document');
    expect(pageSource).toContain('max-w-[1800px]');
  });
});
