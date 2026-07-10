import { describe, expect, it } from 'vitest';
import { prepareCompanyContext, resolvePlaceholders } from '@/lib/placeholder-resolver';

describe('placeholder resolver', () => {
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
