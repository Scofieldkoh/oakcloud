/**
 * Seed the corporate secretarial starters into a workspace:
 *
 * - 36 resolution partials (annual accounts and AGM, officers and auditors,
 *   shares, company changes including SSIC, bank, dividends, striking off);
 * - 22 "Board Resolution - ..." and "Members Resolution - ..." templates,
 *   each with its resolutions preset;
 * - 19 documents: AGM notice, short notice consent, attendance list,
 *   minutes, proxy and corporate representative forms, director and auditor
 *   letters, nominee director agreement and indemnity, application for
 *   shares, share certificate, instrument of transfer, solvency statement,
 *   dividend voucher, striking off declaration and onboarding letters;
 * - the "Customer Due Diligence (Corporate Client)" form, as a draft.
 *
 *   npx tsx scripts/seed-corp-sec-templates.ts --email <login> [--replace]
 *
 * Creates whatever the workspace has none of by that name. An existing one
 * is left alone unless --replace is given, which saves the starter over it
 * as a new version (in-app edits are overwritten) and resets a template's
 * preset resolutions. A published CDD form is never changed. Separate from
 * seed-resolution-template.ts and seed-consent-form-templates.ts.
 */
import { randomUUID } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import type { Prisma } from '../src/generated/prisma';
import { prisma } from '../src/lib/prisma';
import { ensureA4ServerDomGlobals } from '../src/lib/document-editor/a4-server-dom';
import { createOakDocTemplate, updateOakDocTemplate } from '../src/services/oakdoc-template.service';
import { createOakDocPartial, updateOakDocPartial } from '../src/services/oakdoc-partial.service';
import { setDocumentTemplateResolutionPreset } from '../src/services/document-template.service';
import { createForm, saveFormFields } from '../src/services/form-crud.service';
import { ensureBuiltInFormOptionPresets } from '../src/services/form-option-preset.service';
import { saveFormFieldsSchema } from '../src/lib/validations/form-builder';
import {
  SG_CUSTOMER_DUE_DILIGENCE_TAG,
  SG_CUSTOMER_DUE_DILIGENCE_TITLE,
  buildSgCustomerDueDiligenceFields,
  buildSgCustomerDueDiligenceSettings,
} from '../src/lib/form-templates/sg-customer-due-diligence';
import {
  CORP_SEC_PARTIALS,
  CORP_SEC_RESOLUTION_TEMPLATES,
  type CorpSecPartial,
} from '../src/content/secretarial/corp-sec-resolutions';
import { CORP_SEC_DOCUMENTS } from '../src/content/secretarial/corp-sec-documents';
import type { ResolutionComposition } from '../src/lib/resolution-composition';
import type { PlaceholderDefinition } from '../src/lib/validations/document-template';
import { flag, option } from './lib/oakdoc-cli-args';

type Operator = { tenantId: string; userId: string };

async function operator(): Promise<Operator> {
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

/** The partial's id, creating it when missing (and overwriting it with --replace). */
async function seedPartial(partial: CorpSecPartial, params: Operator, replace: boolean): Promise<string> {
  const existing = await prisma.templatePartial.findFirst({
    where: { tenantId: params.tenantId, name: partial.name },
    select: { id: true, version: true, deletedAt: true },
  });
  if (existing?.deletedAt) {
    throw new Error(`The partial "${partial.name}" is in the Recycle Bin. Restore or purge it, then run this again.`);
  }
  if (existing && !replace) {
    console.info(`Partial "${partial.displayName}" already exists; left unchanged.`);
    return existing.id;
  }
  const { bytes, placeholders } = partial.build();
  const fileName = `${partial.name}.docx`;
  if (existing) {
    await updateOakDocPartial({
      id: existing.id,
      expectedRevision: existing.version,
      fileName,
      buffer: Buffer.from(bytes),
      displayName: partial.displayName,
      description: null,
      placeholders,
    }, params);
    console.info(`Replaced partial "${partial.displayName}".`);
    return existing.id;
  }
  const created = await createOakDocPartial({
    id: randomUUID(),
    name: partial.name,
    displayName: partial.displayName,
    header: partial.header,
    category: 'RESOLUTION',
    fileName,
    buffer: Buffer.from(bytes),
    placeholders,
  }, params);
  console.info(`Created partial "${partial.displayName}".`);
  return created.id;
}

interface TemplateStarter {
  name: string;
  description: string;
  fileName: string;
  category: 'RESOLUTION' | 'LETTER' | 'MINUTES' | 'NOTICE' | 'CERTIFICATE' | 'CONTRACT' | 'OTHER';
  compositionType: 'RESOLUTION' | 'STANDARD';
  bytes: Uint8Array;
  placeholders: PlaceholderDefinition[];
}

/** The template's id when it was created or replaced; null when left unchanged. */
async function seedTemplate(starter: TemplateStarter, params: Operator, replace: boolean): Promise<string | null> {
  const existing = await prisma.documentTemplate.findFirst({
    where: { tenantId: params.tenantId, name: starter.name, deletedAt: null },
    select: { id: true, version: true },
  });
  if (existing && !replace) {
    console.info(`"${starter.name}" already exists; left unchanged. Pass --replace to overwrite it with the starter layout.`);
    return null;
  }
  const buffer = Buffer.from(starter.bytes);
  if (existing) {
    const updated = await updateOakDocTemplate({
      id: existing.id,
      expectedRevision: existing.version,
      category: starter.category,
      compositionType: starter.compositionType,
      fileName: starter.fileName,
      buffer,
      placeholders: starter.placeholders,
    }, params);
    console.info(`Replaced "${updated.name}" with the starter layout.`);
    return updated.id;
  }
  const created = await createOakDocTemplate({
    name: starter.name,
    description: starter.description,
    category: starter.category,
    compositionType: starter.compositionType,
    isActive: true,
    fileName: starter.fileName,
    buffer,
    placeholders: starter.placeholders,
  }, params);
  console.info(`Created "${created.name}".`);
  return created.id;
}

async function seedCustomerDueDiligenceForm(params: Operator, replace: boolean): Promise<void> {
  const existing = await prisma.form.findFirst({
    where: { tenantId: params.tenantId, title: SG_CUSTOMER_DUE_DILIGENCE_TITLE, deletedAt: null },
    select: { id: true, status: true },
    orderBy: { updatedAt: 'desc' },
  });
  if (existing && (existing.status !== 'DRAFT' || !replace)) {
    console.info(`Form "${SG_CUSTOMER_DUE_DILIGENCE_TITLE}" already exists; left unchanged.${existing.status === 'DRAFT' ? ' Pass --replace to update its questions.' : ''}`);
    return;
  }
  await ensureBuiltInFormOptionPresets(params.tenantId, params.userId);
  const presetId = async (builtInKey: string) => (await prisma.formOptionPreset.findUnique({
    where: { tenantId_builtInKey: { tenantId: params.tenantId, builtInKey } },
    select: { id: true },
  }))?.id;
  const [nationalityPresetId, countryPresetId, workspace] = await Promise.all([
    presetId('nationalities'),
    presetId('countries'),
    prisma.workspace.findUnique({ where: { id: params.tenantId }, select: { name: true } }),
  ]);
  if (!nationalityPresetId || !countryPresetId) {
    throw new Error('The nationality or country option list is unavailable in this workspace');
  }
  const firmName = workspace?.name ?? '';
  const fields = saveFormFieldsSchema.parse({
    fields: buildSgCustomerDueDiligenceFields({ firmName, nationalityPresetId, countryPresetId }),
  }).fields;
  const form = existing ?? await createForm({
    title: SG_CUSTOMER_DUE_DILIGENCE_TITLE,
    tags: [SG_CUSTOMER_DUE_DILIGENCE_TAG],
    status: 'DRAFT',
  }, params);
  await saveFormFields(form.id, fields, params, existing ? 'Updated from the CDD starter' : 'Seeded from the CDD starter');
  if (!existing) {
    await prisma.form.update({
      where: { id: form.id },
      data: { settings: buildSgCustomerDueDiligenceSettings(firmName) as Prisma.InputJsonValue },
    });
  }
  console.info(`${existing ? 'Updated' : 'Created'} draft form "${SG_CUSTOMER_DUE_DILIGENCE_TITLE}". Open Forms to review and publish it.`);
}

async function main() {
  ensureA4ServerDomGlobals();
  const params = await operator();
  const replace = flag(process.argv, 'replace');

  const partialIds = new Map<CorpSecPartial, string>();
  for (const partial of CORP_SEC_PARTIALS) partialIds.set(partial, await seedPartial(partial, params, replace));

  for (const template of CORP_SEC_RESOLUTION_TEMPLATES) {
    const templateId = await seedTemplate({ ...template, bytes: template.build() }, params, replace);
    if (!templateId) continue;
    const preset: ResolutionComposition = {
      subject: '',
      sections: template.partials.map((partial, index) => ({
        id: `preset-${index + 1}`,
        kind: 'PARTIAL' as const,
        heading: partial.header,
        partialId: partialIds.get(partial)!,
      })),
    };
    await setDocumentTemplateResolutionPreset(templateId, preset, params);
  }

  for (const document of CORP_SEC_DOCUMENTS) {
    await seedTemplate({ ...document, ...document.build() }, params, replace);
  }

  await seedCustomerDueDiligenceForm(params, replace);
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
