import { NotFoundError } from '@/lib/errors';
import { prisma } from '@/lib/prisma';
import type { TenantAwareParams } from '@/lib/types';
import type { PlaceholderDefinition } from '@/types/placeholders';
import { composeServicePartialGraph } from '@/services/service-agreement/snapshot';
import type {
  ManualClientServiceCatalogField,
  ManualClientServiceCatalogOptionsResponse,
  ManualClientServiceCatalogVariantOption,
} from './types';

const FIELD_PREFIX = 'service.fields.';
const FIELD_TYPES = new Set(['text', 'date', 'number', 'currency', 'boolean', 'textarea']);

function toOperationalField(definition: PlaceholderDefinition): ManualClientServiceCatalogField | null {
  if (!definition.key.startsWith(FIELD_PREFIX)) return null;
  const stored = definition as PlaceholderDefinition & { label?: unknown; type?: unknown; defaultValue?: unknown };
  const key = definition.key.slice(FIELD_PREFIX.length);
  if (!key) return null;
  return {
    key,
    label: typeof stored.label === 'string' && stored.label.trim() ? stored.label.trim() : key.replaceAll('_', ' ').replace(/^./, (value) => value.toUpperCase()),
    type: typeof stored.type === 'string' && FIELD_TYPES.has(stored.type) ? stored.type as ManualClientServiceCatalogField['type'] : 'text',
    defaultValue: typeof stored.defaultValue === 'string' ? stored.defaultValue : null,
  };
}

export async function getManualClientServiceCatalogOptions(
  companyId: string,
  params: TenantAwareParams,
): Promise<ManualClientServiceCatalogOptionsResponse> {
  const company = await prisma.company.findFirst({
    where: { id: companyId, tenantId: params.tenantId, deletedAt: null },
    select: { id: true },
  });
  if (!company) throw new NotFoundError('Company not found');

  const [variants, partials] = await Promise.all([
    prisma.serviceVariant.findMany({
      where: {
        tenantId: params.tenantId,
        deletedAt: null,
        isActive: true,
        family: { tenantId: params.tenantId, deletedAt: null, isActive: true },
        sowPartial: { tenantId: params.tenantId, deletedAt: null },
      },
      include: {
        family: { select: { id: true, name: true, displayOrder: true } },
        sowPartial: {
          select: {
            id: true,
            name: true,
            version: true,
            content: true,
            placeholders: true,
            updatedAt: true,
          },
        },
        defaultFeeTemplates: {
          where: { tenantId: params.tenantId },
          orderBy: [{ displayOrder: 'asc' }, { createdAt: 'asc' }],
        },
      },
      orderBy: [
        { family: { displayOrder: 'asc' } },
        { family: { name: 'asc' } },
        { displayOrder: 'asc' },
        { name: 'asc' },
      ],
    }),
    prisma.templatePartial.findMany({
      where: { tenantId: params.tenantId, deletedAt: null },
      select: {
        id: true,
        name: true,
        version: true,
        content: true,
        placeholders: true,
        updatedAt: true,
      },
    }),
  ]);

  const options: ManualClientServiceCatalogVariantOption[] = variants.map((variant) => {
    const composed = composeServicePartialGraph(variant.sowPartial, partials);
    return {
      id: variant.id,
      name: variant.name,
      family: { id: variant.family.id, name: variant.family.name },
      serviceCadence: variant.serviceCadence,
      customCadenceLabel: variant.customCadenceLabel,
      fields: composed.placeholders.map(toOperationalField).filter((field): field is ManualClientServiceCatalogField => field !== null),
      feeTemplates: variant.defaultFeeTemplates.map((fee) => ({
        description: fee.description,
        defaultAmount: fee.defaultAmount ? fee.defaultAmount.toFixed(2) : null,
        currency: fee.currency,
        billingFrequency: fee.billingFrequency,
        customFrequencyLabel: fee.customFrequencyLabel,
        displayOrder: fee.displayOrder,
      })),
    };
  });

  return { variants: options };
}
