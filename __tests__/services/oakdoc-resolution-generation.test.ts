// @vitest-environment node
import { createHash } from 'node:crypto';
import { strFromU8, unzipSync, zipSync } from 'fflate';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { buildBoardResolutionOakDocMaster, buildMembersResolutionOakDocMaster } from '@/content/resolution/board-resolution-oakdoc';
import { deriveOakDocTemplateFieldTags } from '@/lib/document-editor/oakdoc-field-manifest';
import { OAKDOC_MIME_TYPE } from '@/lib/document-editor/oakdoc-template';
import { ensureA4ServerDomGlobals } from '@/lib/document-editor/a4-server-dom';
import { encodeOakDocZipText } from '@/lib/document-editor/oakdoc-zip';

const prismaMock = vi.hoisted(() => ({
  documentTemplate: { findFirst: vi.fn() },
  templatePartial: { findMany: vi.fn(async () => [] as unknown[]) },
  user: { findFirst: vi.fn() },
}));
vi.mock('@/lib/prisma', () => ({ prisma: prismaMock }));

const storageMock = vi.hoisted(() => ({ upload: vi.fn(), download: vi.fn(), delete: vi.fn() }));
vi.mock('@/lib/storage', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/storage')>()),
  storage: storageMock,
}));

const companyMock = vi.hoisted(() => ({ getCompanyById: vi.fn() }));
vi.mock('@/services/company.service', () => companyMock);

const templateMock = vi.hoisted(() => ({ downloadOakDocTemplate: vi.fn() }));
vi.mock('@/services/oakdoc-template.service', () => templateMock);

const { generateOakDocBytes, previewOakDocMaster } = await import('@/services/oakdoc-generation.service');

ensureA4ServerDomGlobals();
const tenantId = 'tenant-1';
const partialId = '33333333-3333-4333-8333-333333333333';
const master = buildBoardResolutionOakDocMaster();
const sha = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex');
const asset = {
  schemaVersion: 1,
  storageKey: `${tenantId}/templates/oakdoc/assets/board.docx`,
  fileName: 'Board.docx',
  fileSize: master.byteLength,
  sha256: sha(master),
  mimeType: OAKDOC_MIME_TYPE,
  fieldTags: deriveOakDocTemplateFieldTags(master),
};
const stored = {
  id: '11111111-1111-4111-8111-111111111111',
  name: 'Board Resolution (Numbered)',
  version: 1,
  contentJson: { oakDoc: asset },
  compositionType: 'RESOLUTION',
};

const W = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
const partialBytes = zipSync({
  '[Content_Types].xml': encodeOakDocZipText('<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>'),
  '_rels/.rels': encodeOakDocZipText('<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>'),
  'word/document.xml': encodeOakDocZipText(`<w:document xmlns:w="${W}"><w:body><w:p><w:r><w:t>RESOLVED that all necessary documents be lodged with ACRA.</w:t></w:r></w:p><w:sectPr/></w:body></w:document>`),
  'word/_rels/document.xml.rels': encodeOakDocZipText('<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"></Relationships>'),
});
const partialKey = `${tenantId}/template-partials/${partialId}/oakdoc/${sha(partialBytes)}.docx`;

function documentText(bytes: Uint8Array): string {
  const xml = strFromU8(unzipSync(bytes)['word/document.xml']);
  return Array.from(xml.matchAll(/<w:t(?:\s[^>]*)?>([^<]*)<\/w:t>|<w:tab\/>/g), (match) => match[1] ?? '\t').join('');
}

const context = { companyId: 'company-1', generatedBy: 'Test User', resolutionDate: '2026-07-09' };

describe('Resolution template generation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    prismaMock.documentTemplate.findFirst.mockResolvedValue(stored);
    prismaMock.templatePartial.findMany.mockResolvedValue([{
      id: partialId,
      version: 3,
      contentJson: {
        oakDoc: { ...asset, storageKey: partialKey, sha256: sha(partialBytes), fileSize: partialBytes.byteLength, fieldTags: [] },
      },
    }]);
    storageMock.download.mockResolvedValue(Buffer.from(partialBytes));
    companyMock.getCompanyById.mockResolvedValue({
      id: 'company-1',
      name: '96 Fruit Avenue Pte. Ltd.',
      uen: '202425961Z',
      addresses: [],
      officers: [],
      shareholders: [],
    });
    templateMock.downloadOakDocTemplate.mockResolvedValue({ buffer: Buffer.from(master), metadata: asset });
  });

  it('numbers custom and partial resolutions in the order chosen', async () => {
    const result = await generateOakDocBytes({
      templateId: stored.id,
      ...context,
      resolution: {
        subject: 'CHANGE IN COMPANY SECRETARY',
        sections: [
          { id: 'a', kind: 'CUSTOM', heading: 'APPOINTMENT OF SECRETARY', body: 'RESOLVED that Tan Wei Jie be appointed as Secretary.' },
          { id: 'b', kind: 'PARTIAL', heading: 'NOTIFICATION AND LODGEMENT', partialId },
        ],
      },
    }, { tenantId });

    expect(result.diagnostics.filter((diagnostic) => diagnostic.severity === 'error')).toEqual([]);
    const text = documentText(result.bytes);
    expect(text).toContain('96 Fruit Avenue Pte. Ltd.');
    expect(text).toContain('CHANGE IN COMPANY SECRETARY1.\tAPPOINTMENT OF SECRETARYRESOLVED that Tan Wei Jie be appointed as Secretary.2.\tNOTIFICATION AND LODGEMENTRESOLVED that all necessary documents be lodged with ACRA.');
    expect(text).toContain('Dated this 9 day of July, 2026');
    expect(text).not.toContain('Numbered resolutions');
    expect(result.resolutionPartialPins).toEqual([expect.objectContaining({ partialId, version: 3 })]);
  });

  it('fills the custom fields of a chosen partial with their types', async () => {
    const field = (tag: string) => `<w:sdt><w:sdtPr><w:alias w:val="${tag}"/><w:tag w:val="${tag}"/></w:sdtPr><w:sdtContent><w:r><w:t>{{${tag}}}</w:t></w:r></w:sdtContent></w:sdt>`;
    const feeBytes = zipSync({
      ...unzipSync(partialBytes),
      'word/document.xml': encodeOakDocZipText(`<w:document xmlns:w="${W}"><w:body><w:p><w:r><w:t xml:space="preserve">RESOLVED that a fee of S$</w:t></w:r>${field('custom.fee')}<w:r><w:t xml:space="preserve"> be paid on </w:t></w:r>${field('custom.pay_date')}<w:r><w:t>.</w:t></w:r></w:p><w:sectPr/></w:body></w:document>`),
    });
    const feeKey = `${tenantId}/template-partials/${partialId}/oakdoc/${sha(feeBytes)}.docx`;
    prismaMock.templatePartial.findMany.mockResolvedValue([{
      id: partialId,
      version: 4,
      contentJson: {
        oakDoc: { ...asset, storageKey: feeKey, sha256: sha(feeBytes), fileSize: feeBytes.byteLength, fieldTags: ['custom.fee', 'custom.pay_date'] },
      },
      placeholders: [
        { key: 'custom.fee', path: 'custom.fee', label: 'Fee', type: 'currency', source: 'custom', category: 'custom', required: true },
        { key: 'custom.pay_date', path: 'custom.pay_date', label: 'Pay date', type: 'date', source: 'custom', category: 'custom', required: true },
      ],
    }]);
    storageMock.download.mockResolvedValue(Buffer.from(feeBytes));

    const result = await generateOakDocBytes({
      templateId: stored.id,
      ...context,
      customData: { fee: '2500', pay_date: '2026-11-03' },
      resolution: {
        subject: '',
        sections: [{ id: 'a', kind: 'PARTIAL', heading: 'DIRECTORS FEE', partialId }],
      },
    }, { tenantId });

    expect(result.diagnostics.filter((diagnostic) => diagnostic.code === 'OAKDOC_CUSTOM_FIELD_UNDEFINED')).toEqual([]);
    expect(documentText(result.bytes)).toContain('RESOLVED that a fee of S$2,500.00 be paid on 3 Nov 2026.');
  });

  it('fills {field} tokens in custom resolution text', async () => {
    const result = await generateOakDocBytes({
      templateId: stored.id,
      ...context,
      resolution: {
        subject: '',
        sections: [{
          id: 'a',
          kind: 'CUSTOM',
          heading: 'REGISTERED OFFICE',
          body: 'RESOLVED that {company.name} (UEN {company.uen}) keep its {unknown.tag} office.',
        }],
      },
    }, { tenantId });
    expect(result.diagnostics.filter((diagnostic) => diagnostic.severity === 'error')).toEqual([]);
    expect(documentText(result.bytes)).toContain('RESOLVED that 96 Fruit Avenue Pte. Ltd. (UEN 202425961Z) keep its {unknown.tag} office.');
  });

  it('generates the members resolution signed by every shareholder', async () => {
    const members = buildMembersResolutionOakDocMaster();
    const membersAsset = { ...asset, sha256: sha(members), fileSize: members.byteLength, fieldTags: deriveOakDocTemplateFieldTags(members) };
    prismaMock.documentTemplate.findFirst.mockResolvedValue({ ...stored, contentJson: { oakDoc: membersAsset } });
    templateMock.downloadOakDocTemplate.mockResolvedValue({ buffer: Buffer.from(members), metadata: membersAsset });
    companyMock.getCompanyById.mockResolvedValue({
      id: 'company-1',
      name: '96 Fruit Avenue Pte. Ltd.',
      uen: '202425961Z',
      addresses: [],
      officers: [],
      shareholders: [
        { id: 'sh-1', name: 'Mary Lee', shareholderType: 'INDIVIDUAL', isCurrent: true },
        { id: 'sh-2', name: 'Oak Holdings Pte. Ltd.', shareholderType: 'CORPORATE', isCurrent: true },
      ],
    });
    const result = await generateOakDocBytes({
      templateId: stored.id,
      ...context,
      resolution: { subject: '', sections: [{ id: 'a', kind: 'CUSTOM', heading: 'APPROVAL OF ACCOUNTS', body: 'RESOLVED that the accounts be approved.' }] },
    }, { tenantId });
    expect(result.diagnostics.filter((diagnostic) => diagnostic.severity === 'error')).toEqual([]);
    const text = documentText(result.bytes);
    expect(text).toContain('MEMBERS’ RESOLUTIONS IN WRITING PURSUANT TO SECTION 184A OF THE COMPANIES ACT 1967');
    expect(text).toContain('1.\tAPPROVAL OF ACCOUNTS');
    expect(text).toMatch(/Mary Lee[^]*Member[^]*Oak Holdings Pte\. Ltd\.[^]*Member/);
  });

  it('reports a resolution template generated without its resolutions', async () => {
    const result = await generateOakDocBytes({ templateId: stored.id, ...context }, { tenantId });
    expect(result.diagnostics).toContainEqual(expect.objectContaining({
      severity: 'error',
      message: 'This resolution template needs the resolutions chosen on Configure.',
    }));
  });

  it('blocks a custom resolution without text', async () => {
    const result = await generateOakDocBytes({
      templateId: stored.id,
      ...context,
      resolution: { subject: '', sections: [{ id: 'a', kind: 'CUSTOM', heading: 'APPOINTMENT', body: '  ' }] },
    }, { tenantId });
    expect(result.diagnostics).toContainEqual(expect.objectContaining({
      severity: 'error',
      message: 'Resolution 1 needs its text.',
    }));
  });

  it('previews sample resolutions in the editor', async () => {
    const preview = await previewOakDocMaster({
      ...context,
      bytes: new Uint8Array(master),
      fileName: 'Board.docx',
      compositionType: 'RESOLUTION',
    }, { tenantId });
    expect(preview.diagnostics.filter((diagnostic) => diagnostic.severity === 'error')).toEqual([]);
    expect(documentText(preview.bytes)).toContain('1.\tFIRST RESOLUTION');
  });
});
