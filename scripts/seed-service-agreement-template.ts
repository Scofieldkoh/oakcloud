import { createHash, randomUUID } from 'node:crypto';
import { prisma } from '../src/lib/prisma';
import { OAKTREE_SERVICE_AGREEMENT_V1 } from '../src/content/service-agreement/oaktree-service-agreement-v1';
import {
  OAKTREE_SERVICE_AGREEMENT_OAKDOC,
  buildOaktreeServiceAgreementOakDoc,
} from '../src/content/service-agreement/oaktree-service-agreement-oakdoc';
import {
  OAKTREE_SERVICE_AGREEMENT_REFERENCE_OAKDOC,
  buildOaktreeServiceAgreementReferenceOakDoc,
} from '../src/content/service-agreement/oaktree-service-agreement-reference-oakdoc';
import { REFERENCE_SOW_PARTIALS } from '../src/content/service-agreement/oaktree-service-agreement-reference-sows';
import { Prisma } from '../src/generated/prisma';
import { pathToFileURL } from 'node:url';
import {
  normalizeMaterialContent,
  stableSerialize,
} from '../src/services/template-partial.service';
import { readOakDocTemplateMetadata } from '../src/lib/document-editor/oakdoc-template';
import {
  createOakDocTemplate,
  deriveOakDocTemplateFieldTags,
  updateOakDocTemplate,
} from '../src/services/oakdoc-template.service';
import {
  createOakDocPartial,
  downloadOakDocPartial,
  updateOakDocPartial,
} from '../src/services/oakdoc-partial.service';

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

    // A variant already switched to its Word scope keeps it; re-running the
    // bundle seed must not quietly move it back to the HTML partial.
    const wordPartials = new Map((await tx.templatePartial.findMany({
      where: {
        tenantId,
        name: { in: REFERENCE_SOW_PARTIALS.map((partial) => partial.name) },
        deletedAt: null,
      },
      select: { id: true, name: true },
    })).map((partial) => [partial.name, partial.id]));
    const wordPartialFor = (htmlPartialName: string) => {
      const word = REFERENCE_SOW_PARTIALS.find((partial) => partial.replacesPartialName === htmlPartialName);
      return word ? wordPartials.get(word.name) : undefined;
    };

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
      const wordPartialId = wordPartialFor(partialName);
      const sowPartialId = wordPartialId && existing?.sowPartialId === wordPartialId
        ? wordPartialId
        : partials.get(partialName)!;
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

    await tx.documentTemplate.updateMany({
      where: {
        tenantId,
        category: 'CONTRACT',
        name: { in: ['Oaktree Local Master Services Agreement v1', 'Service agreement'] },
        isActive: false,
        deletedAt: null,
      },
      data: {
        isActive: false,
        deletedAt: new Date(),
      },
    });

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
      isActive: sourceTemplateActive,
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
            isActive: deactivate ? false : sourceTemplateActive,
          },
        })
      : await tx.documentTemplate.create({
          data: {
            tenantId,
            createdById: userId,
            ...templateData,
            isActive: deactivate ? false : sourceTemplateActive,
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


interface SeededOakDocMaster {
  name: string;
  description: string;
  category: typeof OAKTREE_SERVICE_AGREEMENT_OAKDOC.category;
  compositionType: typeof OAKTREE_SERVICE_AGREEMENT_OAKDOC.compositionType;
  isActive: boolean;
  fileName: string;
}

async function seedOakDocMaster(
  definition: SeededOakDocMaster,
  build: () => Uint8Array,
  input: { tenantId: string; userId: string },
) {
  const buffer = Buffer.from(build());
  const digest = createHash('sha256').update(buffer).digest('hex');
  // Compare against the manifest the server derives from these bytes.
  const fieldTags = deriveOakDocTemplateFieldTags(new Uint8Array(buffer));

  const existing = await prisma.documentTemplate.findFirst({
    where: {
      tenantId: input.tenantId,
      name: definition.name,
      deletedAt: null,
    },
  });

  if (!existing) {
    return createOakDocTemplate({
      name: definition.name,
      description: definition.description,
      category: definition.category,
      compositionType: definition.compositionType,
      isActive: definition.isActive,
      fileName: definition.fileName,
      buffer,
    }, input);
  }

  const metadata = readOakDocTemplateMetadata(existing.contentJson);
  if (!metadata) {
    throw new Error(
      `A non-OakDoc template already uses the reserved name "${definition.name}".`,
    );
  }

  const sameAsset = metadata.sha256 === digest
    && metadata.fileName === definition.fileName
    && metadata.fieldTags.join('\u0000') === [...fieldTags].sort().join('\u0000');
  const sameRecord = existing.description === definition.description
    && existing.category === definition.category
    && existing.compositionType === definition.compositionType;

  if (sameAsset && sameRecord) return existing;

  return updateOakDocTemplate({
    id: existing.id,
    expectedRevision: existing.version,
    name: definition.name,
    description: definition.description,
    category: definition.category,
    compositionType: definition.compositionType,
    // Whoever switched a master on or off in the app decides that, not a re-seed.
    isActive: existing.isActive,
    fileName: definition.fileName,
    buffer,
  }, input);
}

export async function seedOaktreeServiceAgreementOakDocTemplate(input: {
  tenantId: string;
  userId: string;
}) {
  return seedOakDocMaster(OAKTREE_SERVICE_AGREEMENT_OAKDOC, buildOaktreeServiceAgreementOakDoc, input);
}

/**
 * The reference-layout master is a separate template that starts inactive,
 * so the current Service Agreement master is untouched until someone
 * chooses to switch.
 */
export async function seedOaktreeServiceAgreementReferenceOakDocTemplate(input: {
  tenantId: string;
  userId: string;
}) {
  return seedOakDocMaster(
    OAKTREE_SERVICE_AGREEMENT_REFERENCE_OAKDOC,
    buildOaktreeServiceAgreementReferenceOakDoc,
    input,
  );
}

/**
 * Create or refresh the Word scope-of-work partials. A partial whose bytes
 * already match is left alone, so re-running does not bump versions.
 */
export async function seedReferenceSowPartials(input: { tenantId: string; userId: string }) {
  const ids: Record<string, string> = {};
  for (const definition of REFERENCE_SOW_PARTIALS) {
    const buffer = Buffer.from(definition.build());
    const existing = await prisma.templatePartial.findFirst({
      where: { tenantId: input.tenantId, name: definition.name, deletedAt: null },
      select: { id: true, version: true },
    });
    if (!existing) {
      const created = await createOakDocPartial({
        id: randomUUID(),
        name: definition.name,
        displayName: definition.displayName,
        description: definition.description,
        fileName: definition.fileName,
        buffer,
      }, input);
      ids[definition.name] = created.id;
      continue;
    }
    const current = await downloadOakDocPartial(existing.id, input.tenantId);
    if (!current.buffer.equals(buffer)) {
      await updateOakDocPartial({
        id: existing.id,
        expectedRevision: existing.version,
        fileName: definition.fileName,
        buffer,
        displayName: definition.displayName,
        description: definition.description,
      }, input);
    }
    ids[definition.name] = existing.id;
  }
  return ids;
}

/**
 * Point the two reference services at their Word scopes. New agreements
 * pick this up; agreements already drafted keep the scope they captured.
 */
export async function switchVariantsToReferenceSowPartials(input: { tenantId: string }) {
  const switched: string[] = [];
  for (const definition of REFERENCE_SOW_PARTIALS) {
    const [word, html] = await Promise.all([
      prisma.templatePartial.findFirst({
        where: { tenantId: input.tenantId, name: definition.name, deletedAt: null },
        select: { id: true },
      }),
      prisma.templatePartial.findFirst({
        where: { tenantId: input.tenantId, name: definition.replacesPartialName, deletedAt: null },
        select: { id: true },
      }),
    ]);
    if (!word) throw new Error(`Run with --reference-layout first: "${definition.name}" does not exist yet.`);
    if (!html) continue;
    const variants = await prisma.serviceVariant.findMany({
      where: { tenantId: input.tenantId, sowPartialId: html.id, deletedAt: null },
      select: { id: true, code: true },
    });
    for (const variant of variants) {
      await prisma.serviceVariant.update({
        where: { id: variant.id },
        data: { sowPartialId: word.id, version: { increment: 1 } },
      });
      switched.push(variant.code);
    }
  }
  return switched;
}

async function main() {
  const result = await seedServiceAgreementBundle({
    tenantId: argument('tenantId'),
    userId: argument('userId'),
    deactivate: process.argv.includes('--deactivate'),
  });
  const actor = { tenantId: argument('tenantId'), userId: argument('userId') };
  const oakDocTemplate = await seedOaktreeServiceAgreementOakDocTemplate(actor);
  const referenceLayout = process.argv.includes('--reference-layout')
    ? {
        referenceTemplateId: (await seedOaktreeServiceAgreementReferenceOakDocTemplate(actor)).id,
        referenceSowPartialIds: await seedReferenceSowPartials(actor),
      }
    : {};
  const switchedVariants = process.argv.includes('--use-word-scopes')
    ? { switchedVariants: await switchVariantsToReferenceSowPartials(actor) }
    : {};
  console.log(JSON.stringify({
    ...result,
    oakDocTemplateId: oakDocTemplate.id,
    ...referenceLayout,
    ...switchedVariants,
  }));
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
