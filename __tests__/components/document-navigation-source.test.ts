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

  it('lists Document Templates under Administration after Services instead of on Document Generation', () => {
    const sidebar = readSource('src/components/ui/sidebar.tsx');
    const generatedDocuments = readSource('src/app/(dashboard)/generated-documents/page.tsx');
    const templates = readSource('src/app/(dashboard)/template-partials/page.tsx');

    expect(sidebar).toContain(
      "{ name: 'Services', href: '/admin/services', icon: BriefcaseBusiness, adminOnly: true },\n  { name: 'Document Templates', href: '/template-partials', icon: LayoutTemplate, adminOnly: true },",
    );
    expect(generatedDocuments).not.toContain('DocumentGenerationTabs');
    expect(generatedDocuments).not.toContain('/template-partials');
    expect(templates).not.toContain('DocumentGenerationTabs');
  });

  it('uses Document Vault as the processing page heading', () => {
    const processing = readSource('src/app/(dashboard)/processing/page.tsx');

    expect(processing).toContain('>Document Vault</h1>');
    expect(processing).not.toContain('>Document Processing</h1>');
  });

  it('routes company document navigation through the filtered Document Vault', () => {
    const companyProfile = readSource(
      'src/components/companies/company-detail/company-profile-sections.tsx',
    );

    expect(companyProfile).toContain('href={`/processing?companyId=${companyId}`}');
    expect(companyProfile).not.toContain('href={`/companies/${companyId}/documents`}');
  });
});
