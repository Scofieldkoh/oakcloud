import type { Form, Prisma } from '@/generated/prisma';
import { ValidationError } from '@/lib/errors';
import { parseFormTemplateBinding } from '@/lib/form-templates';
import {
  SG_COMPANY_INCORPORATION_TEMPLATE_KEY,
  SG_COMPANY_INCORPORATION_TEMPLATE_VERSION,
  SG_COMPANY_INCORPORATION_TITLE,
  buildSgCompanyIncorporationFields,
  buildSgCompanyIncorporationSettings,
} from '@/lib/form-templates/sg-company-incorporation';
import {
  SG_ANNUAL_RETURN_DECLARATION_TEMPLATE_KEY,
  SG_ANNUAL_RETURN_DECLARATION_TEMPLATE_VERSION,
  SG_ANNUAL_RETURN_DECLARATION_TITLE,
  buildSgAnnualReturnDeclarationFields,
  buildSgAnnualReturnDeclarationSettings,
} from '@/lib/form-templates/sg-annual-return-declaration';
import { prisma } from '@/lib/prisma';
import type { TenantAwareParams } from '@/lib/types';
import { saveFormFieldsSchema, type FormFieldInput } from '@/lib/validations/form-builder';
import { createForm, saveFormFields } from './form-crud.service';
import { ensureBuiltInFormOptionPresets } from './form-option-preset.service';

export interface SeedFormResult {
  form: Form;
  action: 'created' | 'updated';
}

const settingsObject = (value: unknown): Record<string, unknown> =>
  value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};

/** Shared guided-template seed path: never mutate published or locked forms. */
async function seedGuidedForm(input: {
  params: TenantAwareParams;
  key: string;
  version: number;
  title: string;
  tag: string;
  description: string | null;
  fields: FormFieldInput[];
  defaultSettings: Record<string, unknown>;
  liveSettingsSlug?: string;
}): Promise<SeedFormResult> {
  const { params } = input;
  const fields = saveFormFieldsSchema.parse({ fields: input.fields }).fields;
  const [candidates, liveForm] = await Promise.all([
    prisma.form.findMany({
      where: { tenantId: params.tenantId, deletedAt: null, status: 'DRAFT' },
      select: { id: true, settings: true },
      orderBy: { updatedAt: 'desc' },
    }),
    input.liveSettingsSlug ? prisma.form.findFirst({
      where: { tenantId: params.tenantId, deletedAt: null,
        slug: input.liveSettingsSlug, status: 'PUBLISHED' },
      select: { settings: true },
    }) : Promise.resolve(null),
  ]);
  const existing = candidates.find((candidate) => {
    const binding = parseFormTemplateBinding(candidate.settings);
    return binding?.key === input.key && !binding.lockedAt;
  });
  const form = existing ? { id: existing.id } : await createForm({
    title: input.title, tags: [input.tag], status: 'DRAFT',
  }, params);

  await saveFormFields(form.id, fields, params,
    `${existing ? 'Updated to' : 'Seeded from'} template version ${input.version}`);

  const defaults = { ...input.defaultSettings };
  // User-specific configuration is never checked into the repository.
  // Retain branding, locale, response display and notifications from the current
  // draft; on creation, inherit them from the existing published live form.
  const source = settingsObject(existing?.settings ?? liveForm?.settings);
  const portable = Object.fromEntries([
    'notifications', 'responseTable', 'i18n', 'hideLogo', 'hideFooter',
    'backgroundImageUrl', 'backgroundImageOpacity', 'panelOpacity', 'headingColor',
    'branding', 'pdf',
  ].filter((key) => key in source).map((key) => [key, source[key]]));
  const settings = {
    ...source,
    ...defaults,
    ...portable,
    template: {
      key: input.key,
      version: input.version,
      installedAt: new Date().toISOString(),
      definitionHash: null,
      lockedAt: null,
    },
  } as Prisma.InputJsonValue;

  const saved = await prisma.form.update({
    where: { id: form.id },
    data: { settings, description: input.description },
  });
  return { form: saved, action: existing ? 'updated' : 'created' };
}

/** Seed an editable draft beside any published company incorporation form. */
export async function seedCompanyIncorporationForm(params: TenantAwareParams): Promise<SeedFormResult> {
  await ensureBuiltInFormOptionPresets(params.tenantId, params.userId);
  const presetId = (builtInKey: string) => prisma.formOptionPreset.findUnique({
    where: { tenantId_builtInKey: { tenantId: params.tenantId, builtInKey } },
    select: { id: true },
  });
  const [ssicPreset, nationalityPreset, countryPreset, workspace] = await Promise.all([
    presetId('ssic'), presetId('nationalities'), presetId('countries'),
    prisma.workspace.findUnique({ where: { id: params.tenantId }, select: { name: true } }),
  ]);
  if (!ssicPreset || !nationalityPreset || !countryPreset) {
    throw new ValidationError('The SSIC, nationality or country option list is unavailable in this workspace');
  }
  const firmName = workspace?.name?.trim() || '';
  return seedGuidedForm({
    params, key: SG_COMPANY_INCORPORATION_TEMPLATE_KEY,
    version: SG_COMPANY_INCORPORATION_TEMPLATE_VERSION,
    title: SG_COMPANY_INCORPORATION_TITLE, tag: 'incorporation', description: null,
    fields: buildSgCompanyIncorporationFields({
      firmName,
      ssicPresetId: ssicPreset.id,
      nationalityPresetId: nationalityPreset.id,
      countryPresetId: countryPreset.id,
    }),
    defaultSettings: buildSgCompanyIncorporationSettings({ firmName }),
  });
}

/** Seed revised Annual Return Declaration as a draft; leave the live form untouched. */
export async function seedAnnualReturnDeclarationForm(params: TenantAwareParams): Promise<SeedFormResult> {
  await ensureBuiltInFormOptionPresets(params.tenantId, params.userId);
  const ssicPreset = await prisma.formOptionPreset.findUnique({
    where: { tenantId_builtInKey: { tenantId: params.tenantId, builtInKey: 'ssic' } },
    select: { id: true },
  });
  if (!ssicPreset) throw new ValidationError('The SSIC 2025 option list is unavailable in this workspace');
  return seedGuidedForm({
    params,
    key: SG_ANNUAL_RETURN_DECLARATION_TEMPLATE_KEY,
    version: SG_ANNUAL_RETURN_DECLARATION_TEMPLATE_VERSION,
    title: SG_ANNUAL_RETURN_DECLARATION_TITLE,
    tag: 'annual-return',
    description: 'Declaration form for ACRA annual return filing',
    fields: buildSgAnnualReturnDeclarationFields({ ssicPresetId: ssicPreset.id }),
    defaultSettings: buildSgAnnualReturnDeclarationSettings(),
    liveSettingsSlug: 'annual-return-declaration',
  });
}
