/**
 * Seed only the board resolution convening an Annual General Meeting and its
 * two resolution partials. This does not seed the no-AGM templates or other
 * corporate secretarial documents.
 *
 *   npx tsx scripts/seed-convening-agm-board-resolution.ts --email <login> [--replace]
 *
 * Creates missing records in the login user's workspace. Existing records
 * are preserved unless --replace is supplied, which overwrites the template
 * and these two partials, then resets the template's preset resolutions.
 */
import 'dotenv/config';
import { pathToFileURL } from 'node:url';
import { prisma } from '../src/lib/prisma';
import { ensureA4ServerDomGlobals } from '../src/lib/document-editor/a4-server-dom';
import {
  CONVENING_AGM_BOARD_TEMPLATE,
  CONVENING_AGM_PARTIALS,
} from '../src/content/secretarial/convening-agm-board-resolution';
import type { CorpSecPartial } from '../src/content/secretarial/corp-sec-resolutions';
import { flag } from './lib/oakdoc-cli-args';
import { operator, seedPartial, seedResolutionTemplate } from './lib/corp-sec-seed';

async function main() {
  ensureA4ServerDomGlobals();
  const params = await operator();
  const replace = flag(process.argv, 'replace');

  const partialIds = new Map<CorpSecPartial, string>();
  for (const partial of CONVENING_AGM_PARTIALS) {
    partialIds.set(partial, await seedPartial(partial, params, replace));
  }
  await seedResolutionTemplate(CONVENING_AGM_BOARD_TEMPLATE, partialIds, params, replace);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main()
    .catch((error) => {
      console.error(error instanceof Error ? error.message : 'Seed failed');
      process.exitCode = 1;
    })
    .finally(async () => {
      await prisma.$disconnect();
    });
}
