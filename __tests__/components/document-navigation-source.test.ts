import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

function readSource(path: string) {
  return readFileSync(resolve(process.cwd(), path), 'utf8');
}

describe('document navigation source', () => {
  it('rebrands processing and removes Templates from Administration', () => {
    const sidebar = readSource('src/components/ui/sidebar.tsx');

    expect(sidebar).toContain("{ name: 'Document Vault', href: '/processing', icon: ScanText }");
    expect(sidebar).not.toContain("{ name: 'Templates', href: '/admin/template-partials'");
  });

  it('shows the shared tabs on Generated Documents', () => {
    const generatedDocuments = readSource('src/app/(dashboard)/generated-documents/page.tsx');

    expect(generatedDocuments).toContain("import { DocumentGenerationTabs } from '@/components/documents/document-generation-tabs'");
    expect(generatedDocuments).toContain('<DocumentGenerationTabs />');
  });

  it('uses Document Vault as the processing page heading', () => {
    const processing = readSource('src/app/(dashboard)/processing/page.tsx');

    expect(processing).toContain('>Document Vault</h1>');
    expect(processing).not.toContain('>Document Processing</h1>');
  });

  it('routes company document navigation through the filtered Document Vault', () => {
    const companyProfile = readSource(
      'src/components/companies/company-detail/company-profile-tab.tsx',
    );
    const helpbot = readSource('src/services/ai-helpbot.service.ts');

    expect(companyProfile).toContain('href={`/processing?companyId=${companyId}`}');
    expect(helpbot).toContain('target: { path: `/processing?companyId=${companyId}` }');
    expect(companyProfile).not.toContain('href={`/companies/${companyId}/documents`}');
    expect(helpbot).not.toContain('target: { path: `/companies/${companyId}/documents` }');
  });
});
