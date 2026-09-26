import 'dotenv/config';
import { prisma } from '@/lib/prisma';
import { migrateCanonicalOakDocTemplates } from '@/services/oakdoc-consolidated-migration.service';

async function main() {
  const workspaces = await prisma.workspace.findMany({
    where: { deletedAt: null },
    select: { id: true, name: true },
    orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
  });

  const failures: Array<{ workspaceId: string; workspaceName: string; error: string }> = [];

  for (const workspace of workspaces) {
    try {
      const creator = await prisma.user.findFirst({
        where: {
          tenantId: workspace.id,
          isActive: true,
          deletedAt: null,
        },
        select: { id: true },
        orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      });

      if (!creator) {
        throw new Error('No active tenant user is available to own the migration');
      }

      const result = await migrateCanonicalOakDocTemplates({
        tenantId: workspace.id,
        userId: creator.id,
      });

      console.log(JSON.stringify({
        workspaceId: workspace.id,
        workspaceName: workspace.name,
        status: 'ok',
        standard: result.standard,
        serviceAgreement: result.serviceAgreement,
      }));
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      failures.push({
        workspaceId: workspace.id,
        workspaceName: workspace.name,
        error: message,
      });
      console.error(JSON.stringify({
        workspaceId: workspace.id,
        workspaceName: workspace.name,
        status: 'failed',
        error: message,
      }));
    }
  }

  if (failures.length > 0) {
    throw new Error(
      `OakDoc migration failed for ${failures.length} workspace(s): `
      + failures.map((failure) => `${failure.workspaceName}: ${failure.error}`).join('; '),
    );
  }
}

main()
  .catch((error) => {
    console.error('OakDoc template migration failed:', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
