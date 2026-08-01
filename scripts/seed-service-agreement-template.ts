import { prisma } from '../src/lib/prisma';
import { OAKTREE_SERVICE_AGREEMENT_V1 } from '../src/content/service-agreement/oaktree-service-agreement-v1';
import { Prisma } from '../src/generated/prisma';
import { pathToFileURL } from 'node:url';
import {
  normalizeMaterialContent,
  stableSerialize,
} from '../src/services/template-partial.service';

function argument(name: string): string {
  const index = process.argv.indexOf(`--${name}`);
  const value = index >= 0 ? process.argv[index + 1] : undefined;
  if (!value || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)) {
    throw new Error(`--${name} must be a valid UUID`);
  }
  return value;
}

function materialFees(
  fees: ReadonlyArray<{
    description: string;
    defaultAmount: unknown;
    currency: string;
    billingFrequency: string;
    customFrequencyLabel?: string | null;
    displayOrder: number;
  }>,
) {
  return fees
    .map((fee) => ({
      description: fee.description,
      defaultAmount: fee.defaultAmount == null
        ? null
        : new Prisma.Decimal(String(fee.defaultAmount)).toFixed(2),
      currency: fee.currency,
      billingFrequency: fee.billingFrequency,
      customFrequencyLabel: fee.customFrequencyLabel ?? null,
      displayOrder: fee.displayOrder,
    }))
    .sort((left, right) => left.displayOrder - right.displayOrder);
}

export async function seedServiceAgreementBundle(
  input: { tenantId: string; userId: string; deactivate?: boolean },
  db = prisma,
) {
  const { tenantId, userId, deactivate = false } = input;
  const user = await db.user.findFirst({
    where: { id: userId, tenantId, deletedAt: null, isActive: true },
    select: { id: true },
  });
  if (!user) throw new Error('The user is not an active member of the tenant');

  return db.$transaction(async (tx) => {
    const families = new Map<string, string>();
    for (const family of OAKTREE_SERVICE_AGREEMENT_V1.families) {
      const saved = await tx.serviceFamily.upsert({
        where: { tenantId_code: { tenantId, code: family.code } },
        create: { tenantId, ...family },
        update: {
          name: family.name,
          description: family.description,
          displayOrder: family.displayOrder,
          ...(deactivate ? { isActive: false } : {}),
          deletedAt: null,
        },
      });
      families.set(family.code, saved.id);
    }

    const partials = new Map<string, string>();
    for (const partial of OAKTREE_SERVICE_AGREEMENT_V1.partials) {
      const existing = await tx.templatePartial.findUnique({
        where: { tenantId_name: { tenantId, name: partial.name } },
        select: { content: true, placeholders: true },
      });
      const materialChanged = Boolean(
        existing
        && (
          normalizeMaterialContent(existing.content)
            !== normalizeMaterialContent(partial.content)
          || stableSerialize(existing.placeholders)
            !== stableSerialize(partial.placeholders)
        ),
      );
      const saved = await tx.templatePartial.upsert({
        where: { tenantId_name: { tenantId, name: partial.name } },
        create: {
          tenantId,
          createdById: userId,
          ...partial,
          placeholders: partial.placeholders as unknown as Prisma.InputJsonValue,
        },
        update: {
          displayName: partial.displayName,
          content: partial.content,
          placeholders: partial.placeholders as unknown as Prisma.InputJsonValue,
          ...(materialChanged ? { version: { increment: 1 } } : {}),
          deletedAt: null,
        },
      });
      partials.set(partial.name, saved.id);
    }

    const variantIds: string[] = [];
    for (const variant of OAKTREE_SERVICE_AGREEMENT_V1.variants) {
      const {
        familyCode,
        partialName,
        feeTemplates,
        ...variantData
      } = variant;
      const existing = await tx.serviceVariant.findUnique({
        where: { tenantId_code: { tenantId, code: variant.code } },
        include: {
          defaultFeeTemplates: {
            where: { tenantId },
            orderBy: { displayOrder: 'asc' },
          },
        },
      });
      const familyId = families.get(familyCode)!;
      const sowPartialId = partials.get(partialName)!;
      const materialChanged = Boolean(
        existing
        && (
          existing.familyId !== familyId
          || existing.sowPartialId !== sowPartialId
          || existing.name !== variant.name
          || existing.serviceCadence !== variant.serviceCadence
          || (existing.customCadenceLabel ?? null) !== (
            'customCadenceLabel' in variant
              ? variant.customCadenceLabel ?? null
              : null
          )
          || stableSerialize(materialFees(existing.defaultFeeTemplates))
            !== stableSerialize(materialFees(feeTemplates))
        ),
      );
      const saved = await tx.serviceVariant.upsert({
        where: { tenantId_code: { tenantId, code: variant.code } },
        create: {
          tenantId,
          familyId,
          sowPartialId,
          ...variantData,
        },
        update: {
          familyId,
          sowPartialId,
          name: variant.name,
          serviceCadence: variant.serviceCadence,
          displayOrder: variant.displayOrder,
          ...(materialChanged ? { version: { increment: 1 } } : {}),
          ...(deactivate ? { isActive: false } : {}),
          deletedAt: null,
        },
      });
      if (!existing || materialChanged) {
        await tx.serviceVariantFeeTemplate.deleteMany({
          where: { tenantId, variantId: saved.id },
        });
        await tx.serviceVariantFeeTemplate.createMany({
          data: feeTemplates.map((fee) => ({
            tenantId,
            variantId: saved.id,
            ...fee,
            defaultAmount: new Prisma.Decimal(fee.defaultAmount),
          })),
        });
      }
      variantIds.push(saved.id);
    }

    const currentTemplate = await tx.documentTemplate.findFirst({
      where: {
        tenantId,
        name: OAKTREE_SERVICE_AGREEMENT_V1.template.name,
        deletedAt: null,
      },
      select: {
        id: true,
        content: true,
        placeholders: true,
      },
    });
    const {
      isActive: _initialTemplateActive,
      ...controlledTemplate
    } = OAKTREE_SERVICE_AGREEMENT_V1.template;
    const templateData = {
      ...controlledTemplate,
      placeholders:
        OAKTREE_SERVICE_AGREEMENT_V1.template.placeholders as unknown as Prisma.InputJsonValue,
    };
    const template = currentTemplate
      ? await tx.documentTemplate.update({
          where: { id: currentTemplate.id },
          data: {
            ...templateData,
            ...(normalizeMaterialContent(currentTemplate.content)
                !== normalizeMaterialContent(templateData.content)
              || stableSerialize(currentTemplate.placeholders)
                !== stableSerialize(templateData.placeholders)
              ? { version: { increment: 1 } }
              : {}),
            ...(deactivate ? { isActive: false } : {}),
          },
        })
      : await tx.documentTemplate.create({
          data: {
            tenantId,
            createdById: userId,
            ...templateData,
            isActive: false,
          },
        });

    return {
      familyIds: [...families.values()],
      partialIds: [...partials.values()],
      variantIds,
      templateId: template.id,
    };
  });

}

async function main() {
  const result = await seedServiceAgreementBundle({
    tenantId: argument('tenantId'),
    userId: argument('userId'),
    deactivate: process.argv.includes('--deactivate'),
  });
  console.log(JSON.stringify(result));
}

if (
  process.argv[1]
  && import.meta.url === pathToFileURL(process.argv[1]).href
) {
  main()
    .catch((error) => {
      console.error(error instanceof Error ? error.message : 'Seed failed');
      process.exitCode = 1;
    })
    .finally(async () => {
      await prisma.$disconnect();
    });
}
