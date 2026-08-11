import { prisma } from '../src/lib/prisma';
import { assembleServiceAgreementTemplate } from '../src/services/service-agreement/renderer';
import type { ServiceAgreementDraftDto } from '../src/services/service-agreement';

async function main() {
  const template = await prisma.documentTemplate.findFirst({
    where: { compositionType: 'SERVICE_AGREEMENT', deletedAt: null },
    orderBy: { updatedAt: 'desc' },
  });
  if (!template) throw new Error('No service agreement template found');
  const agreement = await prisma.serviceAgreement.findFirst({ orderBy: { updatedAt: 'desc' } });
  if (!agreement) throw new Error('No service agreement found');
  const entities = await prisma.serviceAgreementEntity.findMany({
    where: { agreementId: agreement.id },
    orderBy: { displayOrder: 'asc' },
  });
  const items = await prisma.serviceAgreementItem.findMany({
    where: { agreementId: agreement.id },
    orderBy: { displayOrder: 'asc' },
    include: { entityLinks: true, feeLines: true },
  });

  const dto: ServiceAgreementDraftDto = {
    id: agreement.id,
    generatedDocumentId: agreement.generatedDocumentId,
    primaryCompanyId: agreement.primaryCompanyId,
    authorizedContactId: agreement.authorizedContactId ?? '',
    authorizedRepresentativeSnapshot: agreement.authorizedRepresentativeSnapshot as ServiceAgreementDraftDto['authorizedRepresentativeSnapshot'],
    agreementDate: agreement.agreementDate ?? '',
    effectiveDate: agreement.effectiveDate ?? agreement.agreementDate ?? '',
    termMonths: agreement.termMonths ?? 12,
    status: agreement.status,
    entities: entities.map((entity) => ({
      id: entity.id,
      companyId: entity.companyId,
      nameSnapshot: entity.nameSnapshot,
      uenSnapshot: entity.uenSnapshot,
      displayOrder: entity.displayOrder,
    })),
    items: items.map((item) => ({
      id: item.id,
      serviceVariantId: item.serviceVariantId,
      variantVersion: item.variantVersion,
      familyNameSnapshot: item.familyNameSnapshot,
      variantNameSnapshot: item.variantNameSnapshot,
      serviceCadence: item.serviceCadence,
      customCadenceLabel: item.customCadenceLabel,
      sowPartialId: item.sowPartialId,
      partialVersion: item.partialVersion,
      partialContentSnapshot: item.partialContentSnapshot ?? '',
      partialPlaceholdersSnapshot: (item.partialPlaceholdersSnapshot ?? []) as ServiceAgreementDraftDto['items'][number]['partialPlaceholdersSnapshot'],
      partialDependencySnapshot: (item.partialDependencySnapshot ?? []) as ServiceAgreementDraftDto['items'][number]['partialDependencySnapshot'],
      startDate: item.startDate?.toISOString().slice(0, 10) ?? '',
      endDate: item.endDate ? item.endDate.toISOString().slice(0, 10) : null,
      fieldValues: (item.fieldValues ?? {}) as Record<string, string>,
      displayOrder: item.displayOrder,
      entityIds: item.entityLinks.map((link) => link.entityId),
      feeLines: item.feeLines.map((fee) => ({
        id: fee.id,
        agreementEntityId: fee.agreementEntityId,
        companyId: fee.companyId,
        description: fee.description,
        amount: fee.amount.toFixed(2),
        currency: fee.currency,
        billingFrequency: fee.billingFrequency,
        customFrequencyLabel: fee.customFrequencyLabel,
        billingStartDate: fee.billingStartDate?.toISOString().slice(0, 10) ?? null,
        displayOrder: fee.displayOrder,
      })),
      staleVariantVersion: item.staleVariantVersion,
      stalePartialVersion: item.stalePartialVersion,
    })),
    createdAt: agreement.createdAt.toISOString(),
    updatedAt: agreement.updatedAt.toISOString(),
  };

  const result = assembleServiceAgreementTemplate({
    templateContent: template.content,
    agreement: dto,
  });
  const section =
    result.content.match(/<section[^>]*data-service-agreement-item-id="[^"]+"[\s\S]*?<\/section>/)?.[0] ?? '';

  console.log('font-family:', /font-family/i.test(section));
  console.log('line-height:', /line-height/i.test(section));
  console.log('margin-left:', /margin-left/i.test(section));
  console.log('font-size 11pt:', /font-size:\s*11pt/i.test(section));
  console.log('font-size 14.6667px:', /font-size:\s*14\.6667px/i.test(section));
  console.log('font-size 10pt:', /font-size:\s*10pt/i.test(section));
  const sizes = [...new Set((section.match(/font-size:\s*([^;]+)/gi) ?? []))];
  console.log('remaining font sizes:', JSON.stringify(sizes.slice(0, 8)));
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
