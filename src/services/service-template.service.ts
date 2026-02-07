import { prisma } from '@/lib/prisma';
import { createAuditLog } from '@/lib/audit';
import type { Prisma } from '@/generated/prisma';
import { ALL_SERVICE_BUNDLES } from '@/lib/constants/deadline-templates';
import {
  type CreateServiceTemplateInput,
  type StoredServiceTemplate,
  storedServiceTemplateSchema,
  type UpdateServiceTemplateInput,
} from '@/lib/validations/service-template';

const SETTINGS_KEY = 'customServiceTemplates';
const SYSTEM_TEMPLATE_CODES = new Set(ALL_SERVICE_BUNDLES.map((bundle) => bundle.code));

interface TenantScopedParams {
  tenantId: string;
  userId: string;
}

function toSettingsObject(value: Prisma.JsonValue | null): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return {};
  }
  return value as Record<string, unknown>;
}

function parseStoredTemplates(value: unknown): StoredServiceTemplate[] {
  if (!Array.isArray(value)) return [];

  const templates: StoredServiceTemplate[] = [];
  for (const candidate of value) {
    const parsed = storedServiceTemplateSchema.safeParse(candidate);
    if (parsed.success) {
      templates.push(parsed.data);
    }
  }
  return templates;
}

function normalizeTemplateFields(
  input: CreateServiceTemplateInput | UpdateServiceTemplateInput,
  fallback?: StoredServiceTemplate
): Omit<StoredServiceTemplate, 'code' | 'isSystemOverride' | 'createdAt' | 'updatedAt'> {
  const serviceType = input.serviceType ?? fallback?.serviceType ?? 'RECURRING';
  const status = input.status ?? fallback?.status ?? 'ACTIVE';

  const requestedFrequency = input.frequency ?? fallback?.frequency ?? 'ANNUALLY';
  const frequency = serviceType === 'ONE_TIME'
    ? 'ONE_TIME'
    : requestedFrequency === 'ONE_TIME'
      ? 'ANNUALLY'
      : requestedFrequency;

  const rate = input.rate ?? fallback?.rate ?? null;
  const currency = input.currency ?? fallback?.currency ?? 'SGD';
  const startDate = input.startDate ?? fallback?.startDate ?? null;
  const endDate = input.endDate ?? fallback?.endDate ?? null;
  const rawScope = input.scope ?? fallback?.scope ?? null;
  const scope = typeof rawScope === 'string' && rawScope === '' ? null : rawScope;

  const deadlineRules = (input.deadlineRules ?? fallback?.deadlineRules ?? []).map((rule, index) => ({
    ...rule,
    displayOrder: index,
  }));

  const rawDescription = input.description ?? fallback?.description ?? null;
  const description = typeof rawDescription === 'string'
    ? rawDescription.trim() || null
    : rawDescription;

  return {
    name: (input.name ?? fallback?.name ?? '').trim(),
    category: input.category ?? fallback?.category ?? 'OTHER',
    description,
    serviceType,
    status,
    rate,
    currency,
    frequency,
    startDate,
    endDate,
    scope,
    deadlineRules,
    isActive: true,
  };
}

function makeTemplateCode(name: string, existingCodes: Set<string>): string {
  const normalized = name
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 80);

  const base = normalized || 'CUSTOM_TEMPLATE';
  let candidate = `CUSTOM_${base}`;
  let suffix = 2;

  while (existingCodes.has(candidate)) {
    candidate = `CUSTOM_${base}_${suffix}`;
    suffix += 1;
  }
  return candidate;
}

async function getTenantSettings(tenantId: string): Promise<{ name: string; settings: Record<string, unknown> }> {
  const tenant = await prisma.tenant.findUnique({
    where: { id: tenantId },
    select: {
      name: true,
      deletedAt: true,
      settings: true,
    },
  });

  if (!tenant || tenant.deletedAt) {
    throw new Error('Tenant not found');
  }

  return {
    name: tenant.name,
    settings: toSettingsObject(tenant.settings as Prisma.JsonValue | null),
  };
}

async function saveTemplatesToTenant(
  tenantId: string,
  settings: Record<string, unknown>,
  templates: StoredServiceTemplate[]
): Promise<void> {
  await prisma.tenant.update({
    where: { id: tenantId },
    data: {
      settings: {
        ...settings,
        [SETTINGS_KEY]: templates,
      } as Prisma.InputJsonValue,
    },
  });
}

export async function listServiceTemplates(tenantId: string): Promise<StoredServiceTemplate[]> {
  const { settings } = await getTenantSettings(tenantId);
  const templates = parseStoredTemplates(settings[SETTINGS_KEY]);
  return templates.filter((template) => template.isActive !== false);
}

export async function createServiceTemplate(
  input: CreateServiceTemplateInput,
  params: TenantScopedParams
): Promise<StoredServiceTemplate> {
  const { tenantId, userId } = params;
  const { name: tenantName, settings } = await getTenantSettings(tenantId);
  const templates = parseStoredTemplates(settings[SETTINGS_KEY]);

  const existingCodes = new Set(templates.map((template) => template.code));
  const normalized = normalizeTemplateFields(input);
  const code = makeTemplateCode(normalized.name, existingCodes);
  const now = new Date().toISOString();

  const template: StoredServiceTemplate = {
    ...normalized,
    code,
    isSystemOverride: false,
    createdAt: now,
    updatedAt: now,
  };

  const nextTemplates = [...templates, template].sort((a, b) => a.name.localeCompare(b.name));
  await saveTemplatesToTenant(tenantId, settings, nextTemplates);

  await createAuditLog({
    tenantId,
    userId,
    action: 'CREATE',
    entityType: 'ServiceTemplate',
    entityId: template.code,
    entityName: template.name,
    summary: `Created custom service template "${template.name}"`,
    changeSource: 'MANUAL',
    metadata: {
      tenantName,
      templateCode: template.code,
      deadlineRuleCount: template.deadlineRules.length,
    },
  });

  return template;
}

export async function updateServiceTemplate(
  code: string,
  input: UpdateServiceTemplateInput,
  params: TenantScopedParams
): Promise<StoredServiceTemplate> {
  const { tenantId, userId } = params;
  const { name: tenantName, settings } = await getTenantSettings(tenantId);
  const templates = parseStoredTemplates(settings[SETTINGS_KEY]);

  const index = templates.findIndex((template) => template.code === code);
  if (index === -1) {
    throw new Error('Template not found');
  }

  const currentTemplate = templates[index];
  const normalized = normalizeTemplateFields(input, currentTemplate);
  const updatedTemplate: StoredServiceTemplate = {
    ...currentTemplate,
    ...normalized,
    updatedAt: new Date().toISOString(),
  };

  const nextTemplates = [...templates];
  nextTemplates[index] = updatedTemplate;
  nextTemplates.sort((a, b) => a.name.localeCompare(b.name));

  await saveTemplatesToTenant(tenantId, settings, nextTemplates);

  await createAuditLog({
    tenantId,
    userId,
    action: 'UPDATE',
    entityType: 'ServiceTemplate',
    entityId: updatedTemplate.code,
    entityName: updatedTemplate.name,
    summary: `Updated custom service template "${updatedTemplate.name}"`,
    changeSource: 'MANUAL',
    metadata: {
      tenantName,
      templateCode: updatedTemplate.code,
      deadlineRuleCount: updatedTemplate.deadlineRules.length,
    },
  });

  return updatedTemplate;
}

export async function overwriteSystemServiceTemplate(
  code: string,
  input: UpdateServiceTemplateInput,
  params: TenantScopedParams
): Promise<StoredServiceTemplate> {
  if (!SYSTEM_TEMPLATE_CODES.has(code)) {
    throw new Error('System template not found');
  }

  const { tenantId, userId } = params;
  const { name: tenantName, settings } = await getTenantSettings(tenantId);
  const templates = parseStoredTemplates(settings[SETTINGS_KEY]);

  const index = templates.findIndex((template) => template.code === code);
  const currentOverride = index >= 0 ? templates[index] : undefined;

  if (currentOverride && !currentOverride.isSystemOverride) {
    throw new Error('Template code conflict');
  }

  const normalized = normalizeTemplateFields(input, currentOverride);
  const now = new Date().toISOString();
  const nextOverride: StoredServiceTemplate = {
    ...normalized,
    code,
    isSystemOverride: true,
    createdAt: currentOverride?.createdAt ?? now,
    updatedAt: now,
  };

  const nextTemplates = [...templates];
  if (index >= 0) {
    nextTemplates[index] = nextOverride;
  } else {
    nextTemplates.push(nextOverride);
  }
  nextTemplates.sort((a, b) => a.name.localeCompare(b.name));

  await saveTemplatesToTenant(tenantId, settings, nextTemplates);

  await createAuditLog({
    tenantId,
    userId,
    action: currentOverride ? 'UPDATE' : 'CREATE',
    entityType: 'ServiceTemplate',
    entityId: nextOverride.code,
    entityName: nextOverride.name,
    summary: currentOverride
      ? `Updated system template override "${nextOverride.name}"`
      : `Created system template override "${nextOverride.name}"`,
    changeSource: 'MANUAL',
    metadata: {
      tenantName,
      templateCode: nextOverride.code,
      isSystemOverride: true,
      deadlineRuleCount: nextOverride.deadlineRules.length,
    },
  });

  return nextOverride;
}

export async function deleteServiceTemplate(
  code: string,
  params: TenantScopedParams
): Promise<void> {
  const { tenantId, userId } = params;
  const { name: tenantName, settings } = await getTenantSettings(tenantId);
  const templates = parseStoredTemplates(settings[SETTINGS_KEY]);

  const index = templates.findIndex((template) => template.code === code);
  if (index === -1) {
    throw new Error('Template not found');
  }

  const [deletedTemplate] = templates.splice(index, 1);
  await saveTemplatesToTenant(tenantId, settings, templates);

  await createAuditLog({
    tenantId,
    userId,
    action: 'DELETE',
    entityType: 'ServiceTemplate',
    entityId: deletedTemplate.code,
    entityName: deletedTemplate.name,
    summary: deletedTemplate.isSystemOverride
      ? `Reset system template override "${deletedTemplate.name}" to default`
      : `Deleted custom service template "${deletedTemplate.name}"`,
    changeSource: 'MANUAL',
    metadata: {
      tenantName,
      templateCode: deletedTemplate.code,
      isSystemOverride: deletedTemplate.isSystemOverride,
    },
  });
}
