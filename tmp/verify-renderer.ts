import { prisma } from '../src/lib/prisma';
import { getServiceAgreementDraft } from '../src/services/service-agreement';
import { assembleServiceAgreementTemplate } from '../src/services/service-agreement/renderer';

async function main() {
  const agreement = await prisma.serviceAgreement.findFirst({ orderBy: { updatedAt: 'desc' } });
  if (!agreement) throw new Error('No service agreement found');
  const template = await prisma.documentTemplate.findFirst({
    where: {
      tenantId: agreement.tenantId,
      compositionType: 'SERVICE_AGREEMENT',
      deletedAt: null,
    },
    orderBy: { updatedAt: 'desc' },
  });
  if (!template) throw new Error('No service agreement template found');
  const dto = await getServiceAgreementDraft(
    agreement.generatedDocumentId,
    agreement.tenantId,
  );
  if (!dto) throw new Error('Service agreement draft not found');

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
