/**
 * Update only the "Instrument of Transfer" template in a workspace to the
 * current starter layout: a document number at the top, no nationality for
 * the transferors and transferees, the signatures on a new page from
 * "Dated", and no stamp duty footnote.
 *
 *   npx tsx scripts/seed-instrument-of-transfer-template.ts --email <login>
 *
 * Saves the starter over the existing template as a new version (in-app
 * edits to its layout are overwritten), or creates it when the workspace
 * has none. No other template, partial or form is touched; use
 * seed-corp-sec-templates.ts for the full set.
 */
import 'dotenv/config';
import { pathToFileURL } from 'node:url';
import { prisma } from '../src/lib/prisma';
import { ensureA4ServerDomGlobals } from '../src/lib/document-editor/a4-server-dom';
import { updateOakDocTemplate } from '../src/services/oakdoc-template.service';
import { INSTRUMENT_OF_TRANSFER } from '../src/content/secretarial/corp-sec-documents';
import { operator, seedTemplate } from './lib/corp-sec-seed';

async function main() {
  ensureA4ServerDomGlobals();
  const params = await operator();
  const starter = { ...INSTRUMENT_OF_TRANSFER, ...INSTRUMENT_OF_TRANSFER.build() };
  const existing = await prisma.documentTemplate.findFirst({
    where: { tenantId: params.tenantId, name: starter.name, deletedAt: null },
    select: { id: true, version: true },
  });
  if (!existing) {
    await seedTemplate(starter, params, false);
    return;
  }
  await updateOakDocTemplate({
    id: existing.id,
    expectedRevision: existing.version,
    description: starter.description,
    category: starter.category,
    compositionType: starter.compositionType,
    fileName: starter.fileName,
    buffer: Buffer.from(starter.bytes),
    placeholders: starter.placeholders,
  }, params);
  console.info(`Updated "${starter.name}" to the new layout.`);
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
