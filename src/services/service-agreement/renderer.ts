import { resolvePlaceholders } from '@/lib/placeholder-resolver';
import {
  SERVICE_AGREEMENT_SLOTS,
  findServiceAgreementSlotViolations,
} from '@/lib/service-agreement-template';
import type {
  ServiceAgreementDraftDto,
  ServiceAgreementFeeLineDto,
} from './types';

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function currency(amount: string, currencyCode: string): string {
  const formatted = new Intl.NumberFormat('en-SG', {
    style: 'currency',
    currency: currencyCode,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Number(amount));
  return currencyCode === 'SGD'
    ? formatted.replace(/^SGD\s*|\$/u, 'S$')
    : formatted;
}

const FREQUENCY_LABELS: Record<string, string> = {
  MONTHLY: 'per month',
  QUARTERLY: 'per quarter',
  SEMI_ANNUALLY: 'every six months',
  ANNUALLY: 'per year',
  ONE_TIME: 'one time',
};

function frequency(fee: ServiceAgreementFeeLineDto): string {
  return fee.billingFrequency === 'CUSTOM'
    ? fee.customFrequencyLabel ?? ''
    : FREQUENCY_LABELS[fee.billingFrequency] ?? fee.billingFrequency;
}

function valueAtPath(value: unknown, path: string): unknown {
  return path.split('.').reduce<unknown>((current, key) => {
    if (!current || typeof current !== 'object') return undefined;
    return (current as Record<string, unknown>)[key];
  }, value);
}

export function assembleServiceAgreementTemplate(input: {
  templateContent: string;
  agreement: ServiceAgreementDraftDto;
}): {
  content: string;
  itemDiagnostics: Array<{ itemId: string; missingPlaceholders: string[] }>;
} {
  const [violation] = findServiceAgreementSlotViolations(input.templateContent);
  if (violation) throw new Error(violation.message);

  const entities = [...input.agreement.entities].sort(
    (left, right) => left.displayOrder - right.displayOrder,
  );
  const entityById = new Map(entities.map((entity) => [entity.id, entity]));
  const items = [...input.agreement.items].sort(
    (left, right) => left.displayOrder - right.displayOrder,
  );
  const itemDiagnostics: Array<{
    itemId: string;
    missingPlaceholders: string[];
  }> = [];

  const serviceSections = items
    .map((item, index) => {
      const targetedEntities = item.entityIds
        .map((entityId) => entityById.get(entityId))
        .filter((entity): entity is NonNullable<typeof entity> => Boolean(entity))
        .map((entity) => ({
          id: entity.id,
          name: escapeHtml(entity.nameSnapshot),
          uen: escapeHtml(entity.uenSnapshot),
        }));
      const service = {
        itemId: item.id,
        familyName: escapeHtml(item.familyNameSnapshot),
        variantName: escapeHtml(item.variantNameSnapshot),
        cadence: item.serviceCadence,
        startDate: new Date(`${item.startDate}T00:00:00.000Z`),
        endDate: item.endDate
          ? new Date(`${item.endDate}T00:00:00.000Z`)
          : null,
        entities: targetedEntities,
        fields: Object.fromEntries(
          Object.entries(item.fieldValues).map(([key, value]) => [
            key,
            escapeHtml(value),
          ]),
        ),
      };
      const missingPlaceholders = item.partialPlaceholdersSnapshot
        .filter((placeholder) => placeholder.required)
        .map((placeholder) => placeholder.key)
        .filter((key) => {
          const result = valueAtPath({ service }, key);
          return result === undefined || result === null || result === '';
        });
      if (missingPlaceholders.length) {
        itemDiagnostics.push({ itemId: item.id, missingPlaceholders });
      }
      const rendered = resolvePlaceholders(
        item.partialContentSnapshot,
        { service },
        { missingPlaceholder: 'keep', dateFormat: 'dd MMMM yyyy' },
      );
      return [
        index > 0 ? '<div class="page-break"></div>' : '',
        `<section data-service-agreement-item-id="${escapeHtml(item.id)}">`,
        rendered.resolved,
        '</section>',
      ].join('');
    })
    .join('');

  const multipleEntities = entities.length > 1;
  const feeRows = items
    .flatMap((item) =>
      [...item.feeLines]
        .sort((left, right) => left.displayOrder - right.displayOrder)
        .map((fee) => {
          const entity = entityById.get(fee.agreementEntityId);
          return [
            '<tr>',
            `<td>${escapeHtml(item.variantNameSnapshot)}</td>`,
            multipleEntities
              ? `<td>${escapeHtml(entity?.nameSnapshot ?? '')}</td>`
              : '',
            `<td>${escapeHtml(fee.description)}</td>`,
            `<td>${escapeHtml(currency(fee.amount, fee.currency))} ${escapeHtml(
              frequency(fee),
            )}</td>`,
            '</tr>',
          ].join('');
        }),
    )
    .join('');
  const feeTable = [
    '<table data-service-agreement-fees="true"><thead><tr>',
    '<th>Service</th>',
    multipleEntities ? '<th>Entity</th>' : '',
    '<th>Description</th><th>Fee</th>',
    '</tr></thead><tbody>',
    feeRows,
    '</tbody></table>',
  ].join('');

  const entityAppendix = [
    '<ol data-service-agreement-entities="true">',
    ...entities.map(
      (entity) =>
        `<li>${escapeHtml(entity.nameSnapshot)} (UEN: ${escapeHtml(
          entity.uenSnapshot,
        )})</li>`,
    ),
    '</ol>',
  ].join('');

  return {
    content: input.templateContent
      .replace(SERVICE_AGREEMENT_SLOTS.serviceSections, serviceSections)
      .replace(SERVICE_AGREEMENT_SLOTS.feeTable, feeTable)
      .replace(SERVICE_AGREEMENT_SLOTS.entityAppendix, entityAppendix),
    itemDiagnostics,
  };
}
