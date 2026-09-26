import 'dotenv/config';
import { pathToFileURL } from 'node:url';
import { prisma } from '@/lib/prisma';
import {
  applyA4DraftConversionManifest,
  buildOakDocRolloutInventory,
} from '@/services/oakdoc-rollout.service';
import { flag, option, uuidOption } from './lib/oakdoc-cli-args';

/**
 * OakDoc rollout for one workspace.
 *
 *   Dry run (default, no writes):
 *     tsx scripts/oakdoc-rollout.ts --workspace <id>
 *   Convert the A4 drafts listed in an approved dry-run manifest:
 *     tsx scripts/oakdoc-rollout.ts --workspace <id> --apply-draft-conversions \
 *       --operator <user id> --manifest <hash from the dry run>
 *
 * Output is JSON with IDs, revisions, hashes and dispositions only.
 */
export async function runOakDocRollout(argv: readonly string[]) {
  const tenantId = uuidOption(argv, 'workspace');
  if (!flag(argv, 'apply-draft-conversions')) {
    return { mode: 'dry-run', inventory: await buildOakDocRolloutInventory(tenantId) };
  }
  const manifestHash = option(argv, 'manifest');
  if (!manifestHash || !/^[a-f0-9]{64}$/.test(manifestHash)) {
    throw new Error('--manifest must be the 64-character hash printed by the dry run');
  }
  const run = await applyA4DraftConversionManifest({
    tenantId,
    userId: uuidOption(argv, 'operator'),
    manifestHash,
  });
  return { mode: 'apply-draft-conversions', ...run };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  runOakDocRollout(process.argv.slice(2))
    .then((result) => {
      process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
      if ('results' in result && result.results.some((item) => item.outcome === 'failed')) {
        process.exitCode = 1;
      }
    })
    .catch((error) => {
      console.error(error instanceof Error ? error.message : 'OakDoc rollout failed');
      process.exitCode = 1;
    })
    .finally(async () => {
      await prisma.$disconnect();
    });
}
