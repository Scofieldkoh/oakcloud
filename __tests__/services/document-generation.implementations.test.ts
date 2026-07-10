import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/services/document-generator.service', () => ({
  createDocumentFromTemplate: vi.fn(),
  finalizeDocument: vi.fn(),
  unfinalizeDocument: vi.fn(),
  cloneDocument: vi.fn(),
  getGeneratedDocumentById: vi.fn(),
}));

vi.mock('@/services/document-export.service', () => ({
  exportToPDF: vi.fn(),
  exportToHTML: vi.fn(),
}));

vi.mock('@/services/document-template.service', () => ({
  getDocumentTemplateById: vi.fn(),
}));

vi.mock('@/services/document-validation.service', () => ({
  extractSections: vi.fn(() => []),
}));

vi.mock('@/lib/placeholder-resolver', () => ({
  resolvePlaceholders: vi.fn(() => ({ resolved: '', missing: [], missingPartials: [] })),
  prepareCompanyContext: vi.fn(),
}));

vi.mock('@/services/template-partial.service', () => ({
  getPartialsUsedInTemplate: vi.fn(() => []),
}));

vi.mock('@/services/company.service', () => ({
  getCompanyById: vi.fn(),
}));

vi.mock('@/lib/prisma', () => ({
  prisma: {
    company: {
      findUnique: vi.fn(),
    },
  },
}));

import { createDocumentFromTemplate } from '@/services/document-generator.service';
import { exportToPDF } from '@/services/document-export.service';
import { getDocumentTemplateById } from '@/services/document-template.service';
import { prisma } from '@/lib/prisma';
import { getDocumentWorkflowStep, resetInstances } from '@/services/document-generation';

describe('document generation workflow implementation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetInstances();
    vi.mocked(createDocumentFromTemplate).mockResolvedValue({
      id: 'doc-1',
      title: 'Generated document',
      content: '<div></div>',
      status: 'DRAFT',
    } as never);
    vi.mocked(getDocumentTemplateById).mockResolvedValue({
      id: 'template-1',
      name: 'Resolution template',
    } as never);
    vi.mocked(prisma.company.findUnique).mockResolvedValue({
      name: 'Sample Company Pte Ltd',
      uen: '202600001A',
    } as never);
    vi.mocked(exportToPDF).mockResolvedValue({
      buffer: Buffer.from('%PDF'),
      filename: 'generated.pdf',
      pageCount: 1,
      mimeType: 'application/pdf',
    });
  });

  it('returns a stable PDF export URL when a workflow step exports PDF', async () => {
    const result = await getDocumentWorkflowStep().execute(
      {
        tenantId: 'workspace-1',
        triggeredById: 'user-1',
        companyId: 'company-1',
        variables: {},
      },
      {
        templateId: 'template-1',
        title: 'Generated document',
        exportPDF: true,
        includeLetterhead: true,
      }
    );

    expect(result.success).toBe(true);
    expect(result.pdfBuffer?.toString()).toBe('%PDF');
    expect(result.pdfUrl).toBe('/api/generated-documents/doc-1/export/pdf');
  });
});
