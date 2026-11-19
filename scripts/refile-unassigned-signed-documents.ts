import { pathToFileURL } from 'node:url';
import { prisma } from '../src/lib/prisma';
import { resolveSharePointFilingJob } from '../src/services/esigning-sharepoint-filing/recovery';
import { flag, option } from './lib/oakdoc-cli-args';

/**
 * Move signed documents that went to the SharePoint unassigned folder only
 * because their template had no SharePoint subfolder, although the company
 * had a mapped folder. They are moved into the company's mapped folder:
 *
 *   npx tsx scripts/refile-unassigned-signed-documents.ts --email <login> [--apply]
 *
 * Without --apply it only lists what would move. Documents whose company has
 * no folder mapping (or a mapping on another connector) are left alone.
 * Filings that have not been uploaded yet are re-pointed at the company folder
 * so the next filing run uploads them there.
 */
export async function main(argv: readonly string[]) {
  const email = option(argv, 'email')?.trim();
  const apply = flag(argv, 'apply');
  const user = email
    ? await prisma.user.findFirst({
        where: { email: { equals: email, mode: 'insensitive' }, deletedAt: null, isActive: true },
        select: { id: true, tenantId: true },
      })
    : null;
  if (!user?.tenantId) throw new Error('--email must name an active user in a workspace');
  const tenantId = user.tenantId;

  const jobs = await prisma.esigningSharePointFiling.findMany({
    where: { tenantId, destinationKind: 'ORPHAN', routingReason: 'NO_TEMPLATE_PATH', resolvedAt: null, companyId: { not: null } },
    select: { id: true, companyId: true, connectorId: true, status: true, claimToken: true, companyNameSnapshot: true, documentTitleSnapshot: true },
    orderBy: { createdAt: 'asc' },
  });

  const moved: { company: string | null; document: string; folder: string; action: string }[] = [];
  const skipped: { company: string | null; document: string; reason: string }[] = [];
  const failed: { company: string | null; document: string; error: string }[] = [];

  for (const job of jobs) {
    const label = { company: job.companyNameSnapshot, document: job.documentTitleSnapshot };
    const mapping = await prisma.companySharePointFolder.findFirst({ where: { tenantId, companyId: job.companyId!, connectorId: job.connectorId } });
    if (!mapping) {
      skipped.push({ ...label, reason: 'Company has no SharePoint folder mapping for this connector' });
      continue;
    }

    if (job.status === 'COMPLETED') {
      moved.push({ ...label, folder: mapping.folderName, action: 'move uploaded file' });
      if (!apply) continue;
      try {
        await resolveSharePointFilingJob({
          workspaceId: tenantId,
          jobId: job.id,
          userId: user.id,
          destination: { driveId: mapping.driveId, itemId: mapping.folderItemId, name: mapping.folderName, webUrl: mapping.folderWebUrl },
          note: 'Moved from the unassigned folder to the company folder (template had no SharePoint subfolder)',
        });
      } catch (error) {
        moved.pop();
        failed.push({ ...label, error: error instanceof Error ? error.message : String(error) });
      }
      continue;
    }

    if ((job.status === 'PENDING' || job.status === 'FAILED_RETRYABLE') && !job.claimToken) {
      moved.push({ ...label, folder: mapping.folderName, action: 'upload to company folder on next run' });
      if (!apply) continue;
      const updated = await prisma.esigningSharePointFiling.updateMany({
        where: { id: job.id, tenantId, destinationKind: 'ORPHAN', claimToken: null, status: { in: ['PENDING', 'FAILED_RETRYABLE'] } },
        data: { destinationKind: 'INTENDED', intendedCompanyDriveId: mapping.driveId, intendedCompanyFolderId: mapping.folderItemId, intendedRelativePath: null },
      });
      if (updated.count === 0) {
        moved.pop();
        skipped.push({ ...label, reason: 'Filing started while the script ran; run it again afterwards' });
      }
      continue;
    }

    skipped.push({ ...label, reason: `Filing status ${job.status}; resolve it from SharePoint settings` });
  }

  console.info(JSON.stringify({ applied: apply, checked: jobs.length, moved, skipped, failed }, null, 2));
  if (!apply && moved.length > 0) console.info('Nothing was changed. Re-run with --apply to move these.');
  if (failed.length > 0) process.exitCode = 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main(process.argv.slice(2))
    .catch((error) => {
      console.error(error instanceof Error ? error.message : 'Refile failed');
      process.exitCode = 1;
    })
    .finally(async () => {
      await prisma.$disconnect();
    });
}
