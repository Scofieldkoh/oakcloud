import { describe, expect, it } from 'vitest';
import {
  assembleServiceAgreementTemplate,
  canonicalServiceAgreementData,
} from '@/services/service-agreement';
import type { ServiceAgreementDraftDto } from '@/services/service-agreement';

const agreement: ServiceAgreementDraftDto = {
  id: 'agreement-1',
  generatedDocumentId: 'document-1',
  primaryCompanyId: 'company-1',
  authorizedContactId: 'contact-1',
  authorizedRepresentativeSnapshot: {
    id: 'contact-1',
    name: 'Alex Tan',
    role: 'Director',
    email: 'alex@example.com',
    phone: '61234567',
  },
  agreementDate: '2026-07-30',
  effectiveDate: '2026-08-01',
  termMonths: 12,
  status: 'DRAFT',
  entities: [
    {
      id: 'entity-1',
      companyId: 'company-1',
      nameSnapshot: 'Alpha Pte. Ltd.',
      uenSnapshot: '11111111A',
      displayOrder: 0,
    },
    {
      id: 'entity-2',
      companyId: 'company-2',
      nameSnapshot: 'Beta <Holdings>',
      uenSnapshot: '22222222B',
      displayOrder: 1,
    },
  ],
  items: [
    {
      id: 'item-2',
      serviceVariantId: 'variant-2',
      variantVersion: 1,
      familyNameSnapshot: 'Corporate Services',
      variantNameSnapshot: 'Corporate Secretarial',
      serviceCadence: 'ANNUALLY',
      customCadenceLabel: null,
      sowPartialId: 'partial-2',
      partialVersion: 1,
      partialContentSnapshot:
        '<h2>Statement of Work – {{service.variantName}}</h2>{{#each service.entities}}<p>{{name}} (UEN: {{uen}})</p>{{/each}}',
      partialPlaceholdersSnapshot: [],
      partialDependencySnapshot: [],
      startDate: '2026-08-01',
      endDate: null,
      fieldValues: {},
      displayOrder: 1,
      entityIds: ['entity-1', 'entity-2'],
      feeLines: [
        {
          id: 'fee-2',
          agreementEntityId: 'entity-2',
          companyId: 'company-2',
          description: 'Annual corporate secretarial',
          amount: '500.00',
          currency: 'SGD',
          billingFrequency: 'ANNUALLY',
          customFrequencyLabel: null,
          billingStartDate: '2026-08-01',
          displayOrder: 0,
        },
      ],
      staleVariantVersion: false,
      stalePartialVersion: false,
    },
    {
      id: 'item-1',
      serviceVariantId: 'variant-1',
      variantVersion: 1,
      familyNameSnapshot: 'Accounting',
      variantNameSnapshot: 'Monthly Accounting',
      serviceCadence: 'MONTHLY',
      customCadenceLabel: null,
      sowPartialId: 'partial-1',
      partialVersion: 1,
      partialContentSnapshot: '<h2>{{service.variantName}}</h2><p>{{service.fields.software}}</p>',
      partialPlaceholdersSnapshot: [
        { key: 'service.fields.software', required: true },
      ],
      partialDependencySnapshot: [],
      startDate: '2026-08-01',
      endDate: null,
      fieldValues: { software: 'Xero' },
      displayOrder: 0,
      entityIds: ['entity-1'],
      feeLines: [
        {
          id: 'fee-1',
          agreementEntityId: 'entity-1',
          companyId: 'company-1',
          description: 'Monthly accounting',
          amount: '200.00',
          currency: 'SGD',
          billingFrequency: 'MONTHLY',
          customFrequencyLabel: null,
          billingStartDate: '2026-08-01',
          displayOrder: 0,
        },
      ],
      staleVariantVersion: false,
      stalePartialVersion: false,
    },
  ],
  createdAt: '2026-07-30T00:00:00.000Z',
  updatedAt: '2026-07-30T00:00:00.000Z',
};

const templateContent = [
  '<p>Cover {{company.name}}</p>',
  '{{@agreement.serviceSections}}',
  '{{@agreement.feeTable}}',
  '{{@agreement.entityAppendix}}',
].join('');

describe('service agreement renderer', () => {
  it('assembles ordered local SOWs, entity fees, and the entity appendix', () => {
    const result = assembleServiceAgreementTemplate({ templateContent, agreement });

    expect(result.content).toContain('Statement of Work – Corporate Secretarial');
    expect(result.content).toContain('Alpha Pte. Ltd. (UEN: 11111111A)');
    expect(result.content).toContain('Beta &lt;Holdings&gt;');
    expect(result.content).toContain('S$500.00 per year');
    expect(result.content.indexOf('Monthly Accounting')).toBeLessThan(
      result.content.indexOf('Corporate Secretarial'),
    );
    expect(result.content).not.toContain('{{@agreement.');
    expect(result.itemDiagnostics).toEqual([]);
  });

  it('rejects a missing or duplicate reserved slot', () => {
    expect(() =>
      assembleServiceAgreementTemplate({
        templateContent: templateContent.replace('{{@agreement.feeTable}}', ''),
        agreement,
      }),
    ).toThrow('exactly one feeTable slot');
    expect(() =>
      assembleServiceAgreementTemplate({
        templateContent: `${templateContent}{{@agreement.feeTable}}`,
        agreement,
      }),
    ).toThrow('exactly one feeTable slot');
  });

  it('reports missing required service values by item', () => {
    const missingAgreement = structuredClone(agreement);
    missingAgreement.items[1].fieldValues = {};

    expect(
      assembleServiceAgreementTemplate({
        templateContent,
        agreement: missingAgreement,
      }).itemDiagnostics,
    ).toEqual([
      {
        itemId: 'item-1',
        missingPlaceholders: ['service.fields.software'],
      },
    ]);
  });

  it('canonicalizes only pinned persisted data in defined display order', () => {
    const permuted = structuredClone(agreement);
    permuted.entities.reverse();
    permuted.items.reverse();
    permuted.items[0].entityIds.reverse();
    permuted.items[0].feeLines.reverse();
    permuted.items.forEach((item) => {
      item.staleVariantVersion = !item.staleVariantVersion;
      item.stalePartialVersion = !item.stalePartialVersion;
    });
    const replacementEntityIds = new Map(
      permuted.entities.map((entity) => [entity.id, `replacement-${entity.companyId}`]),
    );
    permuted.entities.forEach((entity) => {
      entity.id = replacementEntityIds.get(entity.id)!;
    });
    permuted.items.forEach((item) => {
      item.entityIds = item.entityIds.map((id) => replacementEntityIds.get(id)!);
      item.feeLines.forEach((fee, index) => {
        fee.id = `replacement-fee-${index}-${item.id}`;
        fee.agreementEntityId = replacementEntityIds.get(fee.agreementEntityId)!;
      });
    });
    permuted.createdAt = '2030-01-01T00:00:00.000Z';
    permuted.updatedAt = '2030-01-01T00:00:00.000Z';

    expect(canonicalServiceAgreementData(permuted)).toEqual(
      canonicalServiceAgreementData(agreement),
    );
  });
});
