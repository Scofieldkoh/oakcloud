import { describe, expect, it } from 'vitest';
import { prepareCompanyContext, resolvePlaceholders } from '@/lib/placeholder-resolver';
import { buildEachBlock, type TemplateCollection, type TemplateLoopLayout } from '@/components/documents/template-editor/template-builders';

describe('placeholder resolver', () => {
  it.each([
    ['directors', 'paragraphs'], ['directors', 'bullets'], ['directors', 'table'],
    ['shareholders', 'paragraphs'], ['shareholders', 'bullets'], ['shareholders', 'table'],
  ] as Array<[TemplateCollection, TemplateLoopLayout]>)('resolves generated %s %s loops without raw syntax or escaped structural HTML', (collection, layout) => {
    const fields = collection === 'directors'
      ? ['name', 'identificationNumber', 'nationality', 'role', 'address']
      : ['name', 'identificationNumber', 'nationality', 'shareClass', 'numberOfShares', 'percentageHeld'];
    const template = buildEachBlock({ collection, fields, layout });
    const result = resolvePlaceholders(template, {
      directors: [{ name: 'Alice Director', identificationNumber: 'D1', nationality: 'SG', role: 'Director', address: 'One Road' } as never],
      shareholders: [{ name: 'Bob Shareholder', identificationNumber: 'S1', nationality: 'SG', shareClass: 'Ordinary', numberOfShares: 10, percentageHeld: 100 } as never],
    });

    expect(result.resolved).toContain(collection === 'directors' ? 'Alice Director' : 'Bob Shareholder');
    expect(result.resolved).not.toContain('{{');
    expect(result.resolved).not.toContain('&lt;table');
    expect(result.resolved).not.toContain('&lt;ul');
    expect(result.missing).toEqual([]);
  });
  it('supports one-based @number inside each blocks', () => {
    const result = resolvePlaceholders(
      '{{#each directors}}<p>{{@number}}. {{name}}</p>{{/each}}',
      {
        directors: [
          { name: 'Alice Tan', role: 'DIRECTOR', isCurrent: true },
          { name: 'Ben Lim', role: 'DIRECTOR', isCurrent: true },
        ],
      }
    );

    expect(result.resolved).toContain('<p>1. Alice Tan</p>');
    expect(result.resolved).toContain('<p>2. Ben Lim</p>');
    expect(result.missing).toEqual([]);
  });

  it('supports PCASE modifiers used by the template editor', () => {
    const result = resolvePlaceholders(
      '<p>{{PCASE(company.name)}}</p><p>PCASE({{company.status}})</p>',
      {
        company: {
          id: 'company-1',
          name: 'SAMPLE COMPANY PTE LTD',
          uen: '202600001A',
          status: 'LIVE COMPANY',
        },
      }
    );

    expect(result.resolved).toContain('<p>Sample Company Pte Ltd</p>');
    expect(result.resolved).toContain('<p>Live Company</p>');
    expect(result.missing).toEqual([]);
  });

  it('supports equality and inequality conditionals', () => {
    const result = resolvePlaceholders(
      [
        '{{#if company.entityType == "Private Limited"}}<p>Private</p>{{/if}}',
        '{{#if company.status != "Struck Off"}}<p>Live</p>{{/if}}',
      ].join(''),
      {
        company: {
          id: 'company-1',
          name: 'Sample Company Pte Ltd',
          uen: '202600001A',
          entityType: 'Private Limited',
          status: 'Live',
        },
      }
    );

    expect(result.resolved).toBe('<p>Private</p><p>Live</p>');
    expect(result.resolved).not.toContain('{{#if');
  });

  it('prepares address parts and capital aliases advertised by the editor', () => {
    const context = prepareCompanyContext({
      id: 'company-1',
      name: 'Sample Company Pte Ltd',
      uen: '202600001A',
      paidUpCapitalAmount: 100000,
      addresses: [
        {
          addressType: 'REGISTERED_OFFICE',
          fullAddress: '123 Sample Street, #04-05, Sample Building, Singapore 123456',
          isCurrent: true,
          block: '123',
          streetName: 'Sample Street',
          level: '04',
          unit: '05',
          buildingName: 'Sample Building',
          postalCode: '123456',
        } as never,
      ],
    });

    const result = resolvePlaceholders(
      [
        '{{company.address.block}}',
        '{{company.address.street}}',
        '{{company.address.level}}',
        '{{company.address.unit}}',
        '{{company.address.building}}',
        '{{company.address.postalCode}}',
        '{{company.capital}}',
      ].join('|'),
      context
    );

    expect(result.resolved).toBe('123|Sample Street|04|05|Sample Building|123456|100,000');
    expect(result.missing).toEqual([]);
  });
});
