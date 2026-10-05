// @vitest-environment jsdom
import { strFromU8, unzipSync } from 'fflate';
import { describe, expect, it } from 'vitest';
import {
  CORP_SEC_DOCUMENTS,
  APPLICATION_FOR_SHARES,
  DIVIDEND_VOUCHER,
  MINUTES_OF_AGM,
  NOTICE_OF_AGM,
  INSTRUMENT_OF_TRANSFER,
} from '@/content/secretarial/corp-sec-documents';
import {
  CORP_SEC_PARTIALS,
  CORP_SEC_RESOLUTION_TEMPLATES,
  APPLICANT_LIST,
  TRANSFEREE_LIST,
  TRANSFEROR_LIST,
  type CorpSecResolutionTemplate,
} from '@/content/secretarial/corp-sec-resolutions';
import { FS_OPTIONS } from '@/content/secretarial/corp-sec-fields';
import {
  buildOakDocResolutionDates,
  buildOakDocResolutionValues,
  type OakDocCompanyDetail,
  type OakDocContact,
} from '@/lib/document-editor/oakdoc-context';
import { inspectOakDocConditions, resolveOakDocConditions } from '@/lib/document-editor/oakdoc-conditions';
import {
  buildOakDocCustomFieldValues,
  oakDocCustomFieldTypes,
  oakDocRepeaterSectionSummary,
  parseOakDocCustomFieldTag,
} from '@/lib/document-editor/oakdoc-custom-fields';
import { deriveOakDocTemplateFieldTags } from '@/lib/document-editor/oakdoc-field-manifest';
import { diagnoseOakDocTags } from '@/lib/document-editor/oakdoc-field-registry';
import { resolveOakDocFields } from '@/lib/document-editor/oakdoc-fields';
import { expandOakDocPartials, validateOakDocPartialPackage } from '@/lib/document-editor/oakdoc-partials';
import { inspectOakDocPackage } from '@/lib/document-editor/oakdoc-package-policy';
import { resolveOakDocRepeaters } from '@/lib/document-editor/oakdoc-repeaters';
import { oakDocContactListSlug, parseOakDocAmount } from '@/lib/document-editor/oakdoc-repeater-definitions';
import { composeOakDocResolutions } from '@/lib/document-editor/oakdoc-resolutions';
import { perPersonSelectionPatch } from '@/lib/document-generation-per-person';
import type { ResolutionComposition } from '@/lib/resolution-composition';
import type { PlaceholderDefinition } from '@/lib/validations/document-template';

function plainText(bytes: Uint8Array): string {
  return strFromU8(unzipSync(bytes)['word/document.xml'])
    .replace(/<w:tab\/>/g, '\t')
    .replace(/<w:br\/>/g, '\n')
    .replace(/<\/w:p>/g, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&')
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .join('\n');
}

const BORDEUS: OakDocCompanyDetail = {
  id: 'company-1',
  name: 'Bordeus Pte. Ltd.',
  uen: '202645711K',
  incorporationDate: '2026-10-03T00:00:00.000Z',
  primarySsicCode: '46900',
  primarySsicDescription: 'Wholesale trade of a variety of goods without a dominant product',
  financialYearEndDay: 31,
  financialYearEndMonth: 12,
  registeredAddress: '21 Bukit Batok Crescent, #25-72, WCEGA Tower, Singapore 658065',
  auditor: { name: 'Sample & Co. PAC', address: '1 Sample Road' },
  officers: [
    { id: 'd1', name: 'Yuly Mirawati', role: 'DIRECTOR', identificationNumber: 'S8078571B', isCurrent: true },
    { id: 'd2', name: 'Liang Joo Heong', role: 'NOMINEE_DIRECTOR', identificationNumber: 'S2039870A', isCurrent: true },
    { id: 's1', name: 'Tan Wei Jie', role: 'SECRETARY', identificationNumber: 'S9101817I', isCurrent: true },
  ],
  shareholders: [
    { id: 'h1', name: 'Engterprise Holdings Pte. Ltd.', numberOfShares: 3500, shareClass: 'Ordinary', address: '21 Bukit Batok Crescent', isCurrent: true },
    { id: 'h2', name: 'Liang Joo Heong', numberOfShares: 6500, shareClass: 'Ordinary', isCurrent: true },
  ],
};

const ENGTERPRISE: OakDocContact = {
  id: 'c1',
  name: 'Engterprise Holdings Pte. Ltd.',
  identificationNumber: '202624322D',
  address: { full: '21 Bukit Batok Crescent, #25-72 Wcega Tower, Singapore 658065' },
};
const TAN: OakDocContact = { id: 'c2', name: 'Tan Wei Jie', identificationNumber: 'S9101817I', nationality: 'Singaporean', address: '1 Orchard Road' };

const slug = (name: string) => oakDocContactListSlug(name);

/** Custom keys a document prints, from its own field tags. */
function customKeys(bytes: Uint8Array): string[] {
  return deriveOakDocTemplateFieldTags(bytes).flatMap((tag) => {
    const parsed = parseOakDocCustomFieldTag(tag);
    return parsed ? [parsed.key] : [];
  });
}

function definedKeys(placeholders: readonly PlaceholderDefinition[]): string[] {
  return placeholders.flatMap((definition) => (definition.source === 'custom' ? [definition.key.replace(/^custom\./, '')] : []));
}

interface Generation {
  custom?: Record<string, unknown>;
  placeholders?: readonly PlaceholderDefinition[];
  repeaters?: Omit<Parameters<typeof resolveOakDocRepeaters>[0], 'docxBytes' | 'company'>;
  selectedDirectorId?: string;
}

/** Generation as the generation service runs it: conditions, repeaters, then fields. */
function generate(bytes: Uint8Array, input: Generation = {}): string {
  const fieldTags = deriveOakDocTemplateFieldTags(bytes);
  const context = { company: BORDEUS, fieldTags, resolution: { date: '2026-10-03' }, selectedDirectorId: input.selectedDirectorId };
  const custom = buildOakDocCustomFieldValues({
    tags: fieldTags,
    data: input.custom ?? {},
    types: oakDocCustomFieldTypes(input.placeholders ?? []),
  });
  const values = { ...buildOakDocResolutionValues(context), ...custom.values };
  const conditioned = resolveOakDocConditions({ docxBytes: bytes, values, allowedFields: new Set(fieldTags) });
  expect(conditioned.unresolvedFields).toEqual([]);
  const repeated = resolveOakDocRepeaters({
    docxBytes: conditioned.bytes,
    company: BORDEUS,
    dividendPerShare: parseOakDocAmount(input.custom?.dividend_per_share),
    ...input.repeaters,
  });
  const resolved = resolveOakDocFields(repeated.bytes, values, { dates: { ...buildOakDocResolutionDates(context), ...custom.dates } });
  expect(resolved.unresolvedTags).toEqual([]);
  return plainText(resolved.bytes);
}

function composeTemplate(template: CorpSecResolutionTemplate): { bytes: Uint8Array; placeholders: PlaceholderDefinition[] } {
  const ids = template.partials.map((_, index) => `6666666${index}-6666-4666-8666-666666666666`);
  const preset: ResolutionComposition = {
    subject: '',
    sections: template.partials.map((partial, index) => ({
      id: `preset-${index + 1}`,
      kind: 'PARTIAL' as const,
      heading: partial.header,
      partialId: ids[index],
    })),
  };
  const composed = composeOakDocResolutions(template.build(), preset);
  expect(composed.diagnostics).toEqual([]);
  const fragments = new Map(template.partials.map((partial, index) => [ids[index], partial.build().bytes]));
  const expanded = expandOakDocPartials({ docxBytes: composed.bytes, fragments });
  expect(expanded.diagnostics.filter((entry) => entry.severity === 'error')).toEqual([]);
  return {
    bytes: expanded.bytes,
    placeholders: [...template.placeholders, ...template.partials.flatMap((partial) => partial.build().placeholders)],
  };
}

describe('corporate secretarial starters', () => {
  it('names every partial and template once', () => {
    const partialNames = CORP_SEC_PARTIALS.map((partial) => partial.name);
    expect(new Set(partialNames).size).toBe(partialNames.length);
    for (const name of partialNames) expect(name).toMatch(/^resolution-[a-z0-9-]+$/);
    const templateNames = [...CORP_SEC_RESOLUTION_TEMPLATES, ...CORP_SEC_DOCUMENTS].map((template) => template.name);
    expect(new Set(templateNames).size).toBe(templateNames.length);
    for (const template of CORP_SEC_RESOLUTION_TEMPLATES) {
      for (const partial of template.partials) expect(CORP_SEC_PARTIALS).toContain(partial);
    }
  });

  it.each(CORP_SEC_PARTIALS.map((partial) => [partial.displayName, partial] as const))('partial %s is valid and defines its custom fields', (_, partial) => {
    const { bytes, placeholders } = partial.build();
    expect(validateOakDocPartialPackage(bytes).filter((entry) => entry.severity === 'error')).toEqual([]);
    expect(diagnoseOakDocTags(deriveOakDocTemplateFieldTags(bytes), 'render')).toEqual([]);
    expect(definedKeys(placeholders).sort()).toEqual([...new Set(customKeys(bytes))].sort());
    expect(strFromU8(unzipSync(bytes)['word/document.xml'])).not.toContain('Times New Roman');
  });

  it.each(CORP_SEC_DOCUMENTS.map((document) => [document.name, document] as const))('%s is a valid template that defines its custom fields', (_, document) => {
    const { bytes, placeholders } = document.build();
    expect(() => inspectOakDocPackage(bytes, 'master')).not.toThrow();
    expect(diagnoseOakDocTags(deriveOakDocTemplateFieldTags(bytes), 'render')).toEqual([]);
    expect(definedKeys(placeholders).sort()).toEqual([...new Set(customKeys(bytes))].sort());
  });

  it.each(CORP_SEC_RESOLUTION_TEMPLATES.map((template) => [template.name, template] as const))('%s composes its preset resolutions', (_, template) => {
    expect(() => inspectOakDocPackage(template.build(), 'master')).not.toThrow();
    const { bytes } = composeTemplate(template);
    expect(diagnoseOakDocTags(deriveOakDocTemplateFieldTags(bytes), 'render')).toEqual([]);
  });
});

describe('corporate secretarial generation', () => {
  it('prints the Application for Shares like the Bordeus reference', () => {
    const { bytes, placeholders } = APPLICATION_FOR_SHARES.build();
    expect(oakDocRepeaterSectionSummary(placeholders).perPersonTag).toBe(`repeat.contacts.${slug(APPLICANT_LIST)}`);
    const selection = perPersonSelectionPatch(`repeat.contacts.${slug(APPLICANT_LIST)}`, 'c1', {});
    expect(selection.selectedContactListIds).toEqual({ [slug(APPLICANT_LIST)]: ['c1'] });
    const custom = { application_shares: '3500', issue_price: '1', application_amount: '3500', application_date: '2026-10-03', authorised_signatory: 'Yuly Mirawati' };
    const text = generate(bytes, { custom, placeholders, repeaters: { contactLists: { [slug(APPLICANT_LIST)]: [ENGTERPRISE] } } });
    expect(text).toContain('APPLICATION FOR SHARES');
    expect(text).toContain('To:\tThe Board of Directors\nBORDEUS PTE. LTD.');
    expect(text).toContain('hereby apply for 3,500 Ordinary Shares at S$1.00 per share for cash, to be issued by BORDEUS PTE. LTD. (the ‘Company’)');
    expect(text).toContain('A sum of S$3,500.00 being full payment');
    expect(text).toContain('Dated this 3rd day of October, 2026');
    expect(text).toContain('Name: Engterprise Holdings Pte. Ltd.');
    expect(text).toContain('Authorised Signature: Yuly Mirawati');
    expect(text).toContain('Identification No.\n:\n202624322D');

    const individual = generate(bytes, { custom: { ...custom, authorised_signatory: '' }, placeholders, repeaters: { contactLists: { [slug(APPLICANT_LIST)]: [TAN] } } });
    expect(individual).not.toContain('Authorised Signature');
    expect(individual).toContain('Name: Tan Wei Jie');
  });

  it('leaves directors’ fees out of the AGM notice and minutes when none are entered', () => {
    for (const document of [NOTICE_OF_AGM, MINUTES_OF_AGM]) {
      const { bytes, placeholders } = document.build();
      expect(new Set(inspectOakDocConditions(bytes).fieldTags)).toEqual(new Set(['custom.directors_fees']));
      const custom = { fs_documents: FS_OPTIONS[1], fs_period_end: '2026-12-31', agm_date: '2027-06-30', agm_time: '10.00 a.m.', agm_venue: 'the registered office', agm_auditor_item: 'To note the audit exemption.', notice_date: '2027-06-01' };
      const repeaters = { selectedDirectorIds: ['d1'], selectedOfficerIds: ['s1'] };
      const withFees = generate(bytes, { custom: { ...custom, directors_fees: '1000' }, placeholders, repeaters, selectedDirectorId: 'd1' });
      expect(withFees).toContain('Directors’ fees of S$1,000.00 for the financial year ended 31 December 2026');
      expect(withFees).toContain('YULY MIRAWATI');
      expect(withFees).not.toContain('LIANG JOO HEONG\n');
      const without = generate(bytes, { custom: { ...custom, directors_fees: '' }, placeholders, repeaters, selectedDirectorId: 'd1' });
      expect(without).not.toContain('Directors’ fees');
    }
  });

  it('works out each shareholder’s dividend on the voucher', () => {
    const { bytes, placeholders } = DIVIDEND_VOUCHER.build();
    const custom = { dividend_per_share: '0.10', dividend_period_end: '2026-12-31', dividend_payment_date: '2026-12-15' };
    const text = generate(bytes, { custom, placeholders, repeaters: { selectedShareholderIds: ['h2'] } });
    expect(text).toContain('Dividend per share\nS$0.10');
    expect(text).toContain('Amount payable\nS$650.00');
    expect(text).not.toContain('ENGTERPRISE');
  });

  it('prints the transferor and transferee on the instrument of transfer', () => {
    const { bytes, placeholders } = INSTRUMENT_OF_TRANSFER.build();
    const text = generate(bytes, {
      custom: { transfer_shares: '1000', transfer_consideration: '1000', transfer_date: '2026-10-03' },
      placeholders,
      repeaters: { contactLists: { [slug(TRANSFEROR_LIST)]: [ENGTERPRISE], [slug(TRANSFEREE_LIST)]: [TAN] } },
    });
    expect(text).toMatch(/TRANSFEROR\nName\n:\nENGTERPRISE HOLDINGS PTE\. LTD\./);
    expect(text).toMatch(/TRANSFEREE\nName\n:\nTAN WEI JIE/);
    expect(text).toContain('in consideration of the sum of S$1,000.00 paid by the Transferee');
    expect(text).toContain('hereby transfers to the Transferee 1,000 ordinary shares');
  });

  it('composes the members’ resolutions in lieu of an AGM with company data', () => {
    const template = CORP_SEC_RESOLUTION_TEMPLATES.find((entry) => entry.name === 'Members Resolution - In Lieu of AGM')!;
    const { bytes, placeholders } = composeTemplate(template);
    const text = generate(bytes, {
      custom: { fs_documents: FS_OPTIONS[1], fs_period_end: '2026-12-31', audit_exemption_basis: 'a small company', directors_fees: '0' },
      placeholders,
      repeaters: { selectedDirectorIds: ['d1'] },
    });
    expect(text).toContain('MEMBERS’ RESOLUTIONS IN WRITING');
    expect(text).toContain('1.\tFINANCIAL STATEMENTS');
    expect(text).toContain('RESOLVED THAT the unaudited financial statements of the Company together with the Directors’ Statement for the financial year ended 31 December 2026 be received and adopted.');
    expect(text).toContain('YULY MIRAWATI (S8078571B), who retires');
    expect(text).not.toContain('LIANG JOO HEONG (S2039870A), who retires');
    expect(text).toContain('5.\tAUTHORITY TO ALLOT AND ISSUE SHARES');
  });

  it('lists the auditors on record and changes SSIC from the company’s current activity', () => {
    const auditors = CORP_SEC_RESOLUTION_TEMPLATES.find((entry) => entry.name === 'Board Resolution - Resignation of Auditors')!;
    const resignation = composeTemplate(auditors);
    expect(generate(resignation.bytes, { custom: { auditor_cessation_date: '2026-10-31' }, placeholders: resignation.placeholders }))
      .toContain('the resignation of Sample & Co. PAC as auditors of the Company with effect from 31 October 2026 be accepted.');

    const ssic = composeTemplate(CORP_SEC_RESOLUTION_TEMPLATES.find((entry) => entry.name === 'Board Resolution - Change of Business Activities (SSIC)')!);
    const text = generate(ssic.bytes, {
      custom: { new_primary_activity: '62011 | Software development', new_secondary_activity: '70201 | Management consultancy services' },
      placeholders: ssic.placeholders,
    });
    expect(text).toContain('the primary activity of the Company be changed to 62011 | Software development, in place of 46900 | Wholesale trade of a variety of goods without a dominant product.');
    expect(text).toContain('3.\tNOTIFICATION AND LODGEMENT');
  });

  it('accepts the resignation of the director ticked, from any kind of director', () => {
    const { bytes, placeholders } = composeTemplate(CORP_SEC_RESOLUTION_TEMPLATES.find((entry) => entry.name === 'Board Resolution - Resignation of Director')!);
    const text = generate(bytes, { custom: { cessation_date: '2026-10-31' }, placeholders, repeaters: { selectedOfficerIds: ['d2'] } });
    expect(text).toContain('the resignation of LIANG JOO HEONG (S2039870A) as a Director of the Company with effect from 31 October 2026 be accepted');
  });
});

describe('customer due diligence form', () => {
  it('builds questions the form builder accepts, with unique keys', async () => {
    const { buildSgCustomerDueDiligenceFields } = await import('@/lib/form-templates/sg-customer-due-diligence');
    const { saveFormFieldsSchema } = await import('@/lib/validations/form-builder');
    const fields = buildSgCustomerDueDiligenceFields({ firmName: 'Oaktree', nationalityPresetId: '11111111-1111-4111-8111-111111111111', countryPresetId: '22222222-2222-4222-8222-222222222222' });
    expect(() => saveFormFieldsSchema.parse({ fields })).not.toThrow();
    const keys = fields.map((field) => field.key);
    expect(new Set(keys).size).toBe(keys.length);
    const keySet = new Set(keys);
    for (const field of fields) {
      const condition = field.condition as { fieldKey?: string } | null | undefined;
      if (condition?.fieldKey) expect(keySet.has(condition.fieldKey)).toBe(true);
    }
  });
});
