import type { Form } from '@/generated/prisma';
import { ValidationError } from '@/lib/errors';
import { getFormTemplateSummary } from '@/lib/form-templates';
import {
  SG_COMPANY_INCORPORATION_TEMPLATE_KEY,
  SG_COMPANY_INCORPORATION_TEMPLATE_VERSION,
  SG_COMPANY_INCORPORATION_TITLE,
  buildSgCompanyIncorporationDescription,
  buildSgCompanyIncorporationFields,
  buildSgCompanyIncorporationSettings,
} from '@/lib/form-templates/sg-company-incorporation';
import { prisma } from '@/lib/prisma';
import type { TenantAwareParams } from '@/lib/types';
import { saveFormFieldsSchema } from '@/lib/validations/form-builder';
import { createForm, saveFormFields } from './form-crud.service';
import { ensureBuiltInFormOptionPresets } from './form-option-preset.service';

export interface CreateFormFromTemplateInput {
  templateKey: string;
  title?: string;
  tags?: string[];
}

/**
 * Create a DRAFT form from a guided template through the canonical form CRUD.
 * Nothing is published; staff review and publish it in the builder as usual.
 */
export async function createFormFromTemplate(
  input: CreateFormFromTemplateInput,
  params: TenantAwareParams
): Promise<Form> {
  const template = getFormTemplateSummary(input.templateKey);
  if (!template || template.key !== SG_COMPANY_INCORPORATION_TEMPLATE_KEY) {
    throw new ValidationError('Unknown form template');
  }

  await ensureBuiltInFormOptionPresets(params.tenantId, params.userId);
  const [ssicPreset, workspace] = await Promise.all([
    prisma.formOptionPreset.findUnique({
      where: { tenantId_builtInKey: { tenantId: params.tenantId, builtInKey: 'ssic' } },
      select: { id: true },
    }),
    prisma.workspace.findUnique({ where: { id: params.tenantId }, select: { name: true } }),
  ]);
  if (!ssicPreset) {
    throw new ValidationError('The SSIC 2025 option list is unavailable in this workspace');
  }

  const firmName = workspace?.name?.trim() || '';
  const fields = saveFormFieldsSchema.parse({
    fields: buildSgCompanyIncorporationFields({ firmName, ssicPresetId: ssicPreset.id }),
  }).fields;

  const form = await createForm({
    title: input.title?.trim() || SG_COMPANY_INCORPORATION_TITLE,
    description: buildSgCompanyIncorporationDescription(firmName),
    tags: input.tags ?? ['incorporation'],
    status: 'DRAFT',
  }, params);

  await saveFormFields(form.id, fields, params, `Created from template ${template.title}`);

  // The binding is server-owned: updateForm preserves an existing binding but will
  // not accept one from a settings payload, so write it directly here.
  const settings = {
    ...buildSgCompanyIncorporationSettings({ firmName }),
    template: {
      key: template.key,
      version: SG_COMPANY_INCORPORATION_TEMPLATE_VERSION,
      installedAt: new Date().toISOString(),
      definitionHash: null,
      lockedAt: null,
    },
  };
  return prisma.form.update({ where: { id: form.id }, data: { settings } });
}
