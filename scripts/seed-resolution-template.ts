/**
 * Seed the starter "Board Resolution (Numbered)" template into a workspace.
 *
 *   npx tsx scripts/seed-resolution-template.ts --email <login> [--replace]
 *
 * Creates the template when the workspace has none by that name. An existing
 * one is left alone unless --replace is given, which saves the starter layout
 * over it as a new version (in-app edits to that template are overwritten).
 */
import { pathToFileURL } from 'node:url';
import { prisma } from '../src/lib/prisma';
import { ensureA4ServerDomGlobals } from '../src/lib/document-editor/a4-server-dom';
import { createOakDocTemplate, updateOakDocTemplate } from '../src/services/oakdoc-template.service';
import {
  BOARD_RESOLUTION_PLACEHOLDERS,
  BOARD_RESOLUTION_TEMPLATE,
  buildBoardResolutionOakDocMaster,
} from '../src/content/resolution/board-resolution-oakdoc';
import { flag, option } from './lib/oakdoc-cli-args';

async function operator(): Promise<{ tenantId: string; userId: string }> {
  const email = option(process.argv, 'email')?.trim().toLowerCase() ?? '';
  const user = email
    ? await prisma.user.findFirst({
        where: { email: { equals: email, mode: 'insensitive' }, deletedAt: null, isActive: true },
        select: { id: true, tenantId: true },
      })
    : null;
  if (!user?.tenantId) throw new Error('--email must name an active user in a workspace');
  return { tenantId: user.tenantId, userId: user.id };
}

async function main() {
  ensureA4ServerDomGlobals();
  const params = await operator();
  const buffer = Buffer.from(buildBoardResolutionOakDocMaster());
  const existing = await prisma.documentTemplate.findFirst({
    where: { tenantId: params.tenantId, name: BOARD_RESOLUTION_TEMPLATE.name, deletedAt: null },
    select: { id: true, version: true },
  });

  if (existing && !flag(process.argv, 'replace')) {
    console.info(`"${BOARD_RESOLUTION_TEMPLATE.name}" already exists (${existing.id}); left unchanged. Pass --replace to overwrite it with the starter layout.`);
    return;
  }
  if (existing) {
    const updated = await updateOakDocTemplate({
      id: existing.id,
      expectedRevision: existing.version,
      category: BOARD_RESOLUTION_TEMPLATE.category,
      compositionType: BOARD_RESOLUTION_TEMPLATE.compositionType,
      fileName: BOARD_RESOLUTION_TEMPLATE.fileName,
      buffer,
    }, params);
    console.info(`Replaced "${updated.name}" (${updated.id}) with the starter layout.`);
    return;
  }
  const created = await createOakDocTemplate({
    name: BOARD_RESOLUTION_TEMPLATE.name,
    description: BOARD_RESOLUTION_TEMPLATE.description,
    category: BOARD_RESOLUTION_TEMPLATE.category,
    compositionType: BOARD_RESOLUTION_TEMPLATE.compositionType,
    isActive: true,
    fileName: BOARD_RESOLUTION_TEMPLATE.fileName,
    buffer,
    placeholders: BOARD_RESOLUTION_PLACEHOLDERS,
  }, params);
  console.info(`Created "${created.name}" (${created.id}). Open Document Templates to review it.`);
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
