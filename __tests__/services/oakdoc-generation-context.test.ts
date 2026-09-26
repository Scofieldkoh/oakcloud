// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/prisma', () => ({ prisma: {} }));

const { diagnoseOakDocGeneration } = await import('@/services/oakdoc-generation.service');
const { oakDocBatchContext } = await import('@/services/document-generation-batch/preview.service');

describe('OakDoc generation context (L2)', () => {
  it('blocks fields whose party or agreement context was not supplied', () => {
    const diagnostics = diagnoseOakDocGeneration({
      usedTags: ['company.name', 'selectedDirector.name', 'selectedContact.email', 'agreement.termMonths'],
      provided: new Set(['company', 'system', 'agreement']),
    });

    expect(diagnostics.map((diagnostic) => [diagnostic.code, diagnostic.controlTag])).toEqual([
      ['OAKDOC_CONTEXT_MISSING', 'selectedDirector.name'],
      ['OAKDOC_CONTEXT_MISSING', 'selectedContact.email'],
    ]);
    expect(diagnostics.every((diagnostic) => diagnostic.severity === 'error')).toBe(true);
  });

  it('treats supplied context as resolvable even when its values are empty', () => {
    expect(diagnoseOakDocGeneration({
      usedTags: ['selectedContact.phone', 'director.name', 'repeat.directors'],
      provided: new Set(['company', 'system', 'selectedContact']),
    })).toEqual([]);
  });

  it('reports unsupported controls with their tag', () => {
    expect(diagnoseOakDocGeneration({
      usedTags: ['custom.fee'],
      provided: new Set(['company', 'system']),
    })).toEqual([expect.objectContaining({
      code: 'OAKDOC_UNSUPPORTED_FIELD',
      controlTag: 'custom.fee',
    })]);
  });

  it('passes the batch item contact, agreement and resolution date', () => {
    const configuration = {
      version: 1,
      title: 'Doc',
      contactIds: [],
      selectedDirectorId: null,
      selectedShareholderId: null,
      selectedContactId: 'contact-1',
      itemValues: {},
      masterOverrides: {},
      useLetterhead: false,
      serviceAgreement: { agreementDate: '2026-09-01', effectiveDate: null, termMonths: 12 },
    } as never;

    expect(oakDocBatchContext(configuration, { resolution_date: '2026-09-02' })).toEqual({
      selectedContactId: 'contact-1',
      agreement: { agreementDate: '2026-09-01', effectiveDate: null, termMonths: 12 },
      resolutionDate: '2026-09-02',
    });
    expect(oakDocBatchContext({ ...(configuration as object), selectedContactId: null, serviceAgreement: null } as never, {}))
      .toEqual({ selectedContactId: undefined, agreement: undefined, resolutionDate: undefined });
  });
});
