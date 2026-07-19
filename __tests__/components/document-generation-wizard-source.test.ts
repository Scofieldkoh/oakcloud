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
});
