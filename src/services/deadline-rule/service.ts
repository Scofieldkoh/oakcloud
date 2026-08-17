import { computeChanges, createAuditLog } from '@/lib/audit';
import { DeadlineApiError, ConflictError, NotFoundError } from '@/lib/errors';
import { prisma } from '@/lib/prisma';
import { runSerializableTransaction } from '@/lib/prisma-transaction';
import type { TenantAwareParams } from '@/lib/types';
import { Prisma } from '@/generated/prisma';
import {
  deadlineRuleDraftSchema,
  searchDeadlineRulesSchema,
  serviceVariantRuleAssociationsSchema,
  type DeadlineRuleDraftInput,
  type SearchDeadlineRulesInput,
  type ServiceVariantRuleAssociationInput,
} from '@/lib/validations/deadline-rule';
import { hashConfiguration } from '@/services/service-schedule/hash';
import type {
  DeadlineMilestoneDto,
  DeadlineRuleDto,
  DeadlineRuleListDto,
  DeadlineRuleParameterDto,
  DeadlineRuleVersionDto,
  ServiceVariantRuleAssociationDto,
} from './types';

const versionInclude = {
  parameterDefinitions: { orderBy: [{ displayOrder: 'asc' as const }, { key: 'asc' as const }] },
  milestoneTemplates: { orderBy: [{ displayOrder: 'asc' as const }, { milestoneKey: 'asc' as const }] },
} satisfies Prisma.DeadlineRuleVersionInclude;

const ruleInclude = {
  versions: { include: versionInclude, orderBy: { version: 'desc' as const } },
  currentVersion: { include: versionInclude },
  variantAssociations: {
    where: { archivedAt: null },
    orderBy: [{ displayOrder: 'asc' as const }, { createdAt: 'asc' as const }],
  },
} satisfies Prisma.DeadlineRuleInclude;

type RuleRecord = Prisma.DeadlineRuleGetPayload<{ include: typeof ruleInclude }>;
type VersionRecord = Prisma.DeadlineRuleVersionGetPayload<{ include: typeof versionInclude }>;

function json(value: unknown): Prisma.InputJsonValue {
  return value as Prisma.InputJsonValue;
}

function toParameterDto(parameter: VersionRecord['parameterDefinitions'][number]): DeadlineRuleParameterDto {
  return {
    id: parameter.id,
    key: parameter.key,
    label: parameter.label,
    description: parameter.helpText ?? null,
    type: parameter.type,
    required: parameter.isRequired,
    defaultValue: parameter.defaultValue,
    validation: parameter.validation,
    helpText: parameter.helpText,
    displayOrder: parameter.displayOrder,
  };
}

function toMilestoneDto(milestone: VersionRecord['milestoneTemplates'][number]): DeadlineMilestoneDto {
  return {
    id: milestone.id,
    key: milestone.milestoneKey,
    name: milestone.name,
    description: milestone.description,
    type: milestone.type,
    generationMode: milestone.generationMode,
    expression: milestone.dateExpression,
    businessDayAdjustment: milestone.businessDayAdjustment,
    displayOrder: milestone.displayOrder,
    isActive: milestone.isActive,
  };
}

function toVersionDto(version: VersionRecord | null | undefined): DeadlineRuleVersionDto | null {
  if (!version) return null;
  return {
    id: version.id,
    ruleId: version.ruleId,
    version: version.version,
    state: version.state,
    schemaVersion: version.schemaVersion,
    recurrence: version.recurrence,
    applicability: version.applicability,
    configHash: version.configHash,
    draftRevision: version.draftRevision,
    publishedAt: version.publishedAt,
    publishedById: version.publishedById,
    createdAt: version.createdAt,
    updatedAt: version.updatedAt,
    parameters: (version.parameterDefinitions ?? []).map(toParameterDto),
    milestones: (version.milestoneTemplates ?? []).map(toMilestoneDto),
  };
}

function toAssociationDto(
  association: RuleRecord['variantAssociations'][number],
): ServiceVariantRuleAssociationDto {
  return {
    id: association.id,
    serviceVariantId: association.serviceVariantId,
    ruleId: association.ruleId,
    enabledByDefault: association.enabledByDefault,
    parameterDefaults: (association.parameterDefaults ?? {}) as Record<string, unknown>,
    scheduleDefaults: (association.scheduleDefaults ?? []) as unknown[],
    displayOrder: association.displayOrder,
    archivedAt: association.archivedAt,
  };
}

function toRuleDto(rule: RuleRecord): DeadlineRuleDto {
  const versions = (rule.versions ?? [])
    .map((version) => toVersionDto(version))
    .filter((version): version is DeadlineRuleVersionDto => version !== null);
  const draft = versions.find((version) => version.state === 'DRAFT') ?? null;
  const currentVersion = toVersionDto(rule.currentVersion);
  return {
    id: rule.id,
    tenantId: rule.tenantId,
    code: rule.code,
    name: rule.name,
    description: rule.description,
    isActive: rule.isActive,
    archivedAt: rule.archivedAt,
    archivedById: rule.archivedById,
    archiveReason: rule.archiveReason,
    currentVersionId: rule.currentVersionId,
    currentVersion,
    draft,
    versions,
    variantAssociations: (rule.variantAssociations ?? []).map(toAssociationDto),
    createdAt: rule.createdAt,
    updatedAt: rule.updatedAt,
  };
}

function versionCreateData(
  ruleId: string,
  tenantId: string,
  input: DeadlineRuleDraftInput,
  actor: TenantAwareParams,
  configHash: string,
  version = 0,
  draftRevision = 1,
): Prisma.DeadlineRuleVersionCreateInput {
  return {
    tenant: { connect: { id: tenantId } },
    rule: { connect: { id: ruleId } },
    version,
    state: 'DRAFT',
    schemaVersion: 1,
    recurrence: json(input.recurrence),
    applicability: json(input.applicability),
    configHash,
    draftRevision,
    createdBy: { connect: { id: actor.userId } },
    parameterDefinitions: {
      create: input.parameters.map((parameter, index) => ({
        tenant: { connect: { id: tenantId } },
        key: parameter.key,
        label: parameter.label,
        type: parameter.type,
        isRequired: parameter.required,
        validation: parameter.options === undefined ? undefined : json({ options: parameter.options }),
        helpText: parameter.description ?? null,
        displayOrder: index,
      })),
    },
    milestoneTemplates: {
      create: input.milestones.map((milestone, index) => ({
        tenant: { connect: { id: tenantId } },
        milestoneKey: milestone.key,
        name: milestone.name,
        description: milestone.description,
        type: milestone.type,
        generationMode: milestone.generationMode,
        dateExpression: json(milestone.expression),
        businessDayAdjustment: milestone.businessDayAdjustment,
        displayOrder: milestone.displayOrder ?? index,
        isActive: milestone.isActive,
      })),
    },
  };
}

function ruleWhere(id: string, tenantId: string): Prisma.DeadlineRuleWhereInput {
  return { id, tenantId };
}

export async function listDeadlineRules(
  rawInput: SearchDeadlineRulesInput,
  actor: TenantAwareParams,
): Promise<DeadlineRuleListDto> {
  const input = searchDeadlineRulesSchema.parse(rawInput);
  const where: Prisma.DeadlineRuleWhereInput = {
    tenantId: actor.tenantId,
    ...(input.includeArchived ? {} : { archivedAt: null }),
    ...(input.isActive === undefined ? {} : { isActive: input.isActive }),
    ...(input.query
      ? {
          OR: [
            { code: { contains: input.query, mode: 'insensitive' } },
            { name: { contains: input.query, mode: 'insensitive' } },
            { description: { contains: input.query, mode: 'insensitive' } },
          ],
        }
      : {}),
  };
  const [rules, total] = await Promise.all([
    prisma.deadlineRule.findMany({
      where,
      include: ruleInclude,
      orderBy: { [input.sortBy]: input.sortOrder },
      skip: (input.page - 1) * input.limit,
      take: input.limit,
    }),
    prisma.deadlineRule.count({ where }),
  ]);
  return {
    rules: (rules as RuleRecord[]).map(toRuleDto),
    total,
    page: input.page,
    limit: input.limit,
  };
}

export async function getDeadlineRule(
  id: string,
  actor: TenantAwareParams,
): Promise<DeadlineRuleDto> {
  const rule = await prisma.deadlineRule.findFirst({
    where: ruleWhere(id, actor.tenantId),
    include: ruleInclude,
  });
  if (!rule) throw new NotFoundError('Deadline rule not found');
  return toRuleDto(rule as RuleRecord);
}

export async function createDeadlineRule(
  rawInput: DeadlineRuleDraftInput,
  actor: TenantAwareParams,
): Promise<DeadlineRuleDto> {
  const input = deadlineRuleDraftSchema.parse(rawInput);
  const configHash = hashConfiguration({
    schemaVersion: 1,
    recurrence: input.recurrence,
    applicability: input.applicability,
    parameters: input.parameters,
    milestones: input.milestones,
  });

  return runSerializableTransaction(prisma, async (tx) => {
    const duplicate = await tx.deadlineRule.findFirst({
      where: { tenantId: actor.tenantId, code: input.code },
    });
    if (duplicate) throw new ConflictError('A deadline rule with this code already exists');

    const rule = await tx.deadlineRule.create({
      data: {
        tenantId: actor.tenantId,
        code: input.code,
        name: input.name,
        description: input.description,
        isActive: true,
        createdById: actor.userId,
        updatedById: actor.userId,
      },
    });
    const draft = await tx.deadlineRuleVersion.create({
      data: versionCreateData(rule.id, actor.tenantId, input, actor, configHash),
      include: versionInclude,
    });

    await createAuditLog({
      tenantId: actor.tenantId,
      userId: actor.userId,
      action: 'CREATE',
      entityType: 'DeadlineRule',
      entityId: rule.id,
      entityName: rule.name,
      summary: `Created deadline rule "${rule.name}" draft`,
      metadata: { code: rule.code, draftRevision: draft.draftRevision, configHash },
    }, tx);

    return toRuleDto({
      ...rule,
      versions: [draft],
      currentVersion: null,
      variantAssociations: [],
    } as RuleRecord);
  });
}

async function createDraftFromPublished(
  tx: Prisma.TransactionClient,
  rule: RuleRecord,
  actor: TenantAwareParams,
): Promise<VersionRecord> {
  const source = rule.currentVersion;
  if (!source) {
    throw new ConflictError('Deadline rule has no published version to copy');
  }
  const input: DeadlineRuleDraftInput = {
    code: rule.code,
    name: rule.name,
    description: rule.description,
    recurrence: source.recurrence as DeadlineRuleDraftInput['recurrence'],
    applicability: source.applicability as DeadlineRuleDraftInput['applicability'],
    parameters: source.parameterDefinitions.map((parameter) => ({
      key: parameter.key,
      label: parameter.label,
      description: parameter.helpText,
      type: parameter.type,
      required: parameter.isRequired,
      ...(parameter.validation && typeof parameter.validation === 'object' && 'options' in parameter.validation
        ? { options: (parameter.validation as { options: string[] }).options }
        : {}),
    })),
    milestones: source.milestoneTemplates.map((milestone) => ({
      key: milestone.milestoneKey,
      name: milestone.name,
      description: milestone.description,
      type: milestone.type,
      generationMode: milestone.generationMode,
      expression: milestone.dateExpression as DeadlineRuleDraftInput['milestones'][number]['expression'],
      businessDayAdjustment: milestone.businessDayAdjustment,
      displayOrder: milestone.displayOrder,
      isActive: milestone.isActive,
    })),
  };
  const configHash = hashConfiguration({
    schemaVersion: 1,
    recurrence: input.recurrence,
    applicability: input.applicability,
    parameters: input.parameters,
    milestones: input.milestones,
  });
  const draft = await tx.deadlineRuleVersion.create({
    data: versionCreateData(rule.id, actor.tenantId, input, actor, configHash),
    include: versionInclude,
  });
  return draft;
}

export async function updateDeadlineRuleDraft(
  id: string,
  rawInput: DeadlineRuleDraftInput,
  actor: TenantAwareParams,
): Promise<DeadlineRuleDto> {
  const input = deadlineRuleDraftSchema.parse(rawInput);
  const configHash = hashConfiguration({
    schemaVersion: 1,
    recurrence: input.recurrence,
    applicability: input.applicability,
    parameters: input.parameters,
    milestones: input.milestones,
  });

  return runSerializableTransaction(prisma, async (tx) => {
    const rule = await tx.deadlineRule.findFirst({
      where: ruleWhere(id, actor.tenantId),
      include: ruleInclude,
    });
    if (!rule) throw new NotFoundError('Deadline rule not found');
    let typedRule = rule as RuleRecord;
    let draft = (typedRule.versions ?? []).find((version) => version.state === 'DRAFT');
    if (!draft) {
      draft = (await tx.deadlineRuleVersion.findFirst({
        where: { tenantId: actor.tenantId, ruleId: id, state: 'DRAFT' },
        include: versionInclude,
      })) ?? undefined;
    }
    if (!draft) draft = await createDraftFromPublished(tx, typedRule, actor);

    const expectedRevision = input.expectedDraftRevision ?? draft.draftRevision;
    const nextRevision = expectedRevision + 1;
    const changed = await tx.deadlineRuleVersion.updateMany({
      where: {
        id: draft.id,
        tenantId: actor.tenantId,
        state: 'DRAFT',
        draftRevision: expectedRevision,
      },
      data: {
        recurrence: json(input.recurrence),
        applicability: json(input.applicability),
        configHash,
        draftRevision: nextRevision,
      },
    });
    if (!changed || changed.count !== 1) {
      throw new DeadlineApiError(
        'VERSION_CONFLICT',
        'The deadline rule draft was changed by another administrator',
        409,
        { expectedDraftRevision: expectedRevision },
      );
    }

    const updated = await tx.deadlineRuleVersion.update({
      where: { id: draft.id },
      data: {
        parameterDefinitions: {
          deleteMany: { ruleVersionId: draft.id },
          create: input.parameters.map((parameter, index) => ({
            tenant: { connect: { id: actor.tenantId } },
            key: parameter.key,
            label: parameter.label,
            type: parameter.type,
            isRequired: parameter.required,
            validation: parameter.options === undefined ? undefined : json({ options: parameter.options }),
            helpText: parameter.description ?? null,
            displayOrder: index,
          })),
        },
        milestoneTemplates: {
          deleteMany: { ruleVersionId: draft.id },
          create: input.milestones.map((milestone, index) => ({
            tenant: { connect: { id: actor.tenantId } },
            milestoneKey: milestone.key,
            name: milestone.name,
            description: milestone.description,
            type: milestone.type,
            generationMode: milestone.generationMode,
            dateExpression: json(milestone.expression),
            businessDayAdjustment: milestone.businessDayAdjustment,
            displayOrder: milestone.displayOrder ?? index,
            isActive: milestone.isActive,
          })),
        },
      },
      include: versionInclude,
    });
    await tx.deadlineRule.update({
      where: { id: typedRule.id },
      data: { name: input.name, description: input.description, updatedById: actor.userId },
    });
    await createAuditLog({
      tenantId: actor.tenantId,
      userId: actor.userId,
      action: 'UPDATE',
      entityType: 'DeadlineRuleVersion',
      entityId: draft.id,
      entityName: input.name,
      summary: `Updated deadline rule draft "${input.name}"`,
      changes: computeChanges(
        draft as unknown as Record<string, unknown>,
        { ...input, configHash, draftRevision: nextRevision },
        ['configHash', 'draftRevision', 'recurrence', 'applicability'],
      ) ?? undefined,
      metadata: { ruleId: id, draftRevision: nextRevision, configHash },
    }, tx);

    typedRule = {
      ...typedRule,
      name: input.name,
      description: input.description,
      updatedById: actor.userId,
      versions: [updated, ...typedRule.versions.filter((version) => version.id !== draft!.id)],
    } as RuleRecord;
    return toRuleDto(typedRule);
  });
}

export async function replaceVariantRuleAssociations(
  variantId: string,
  rawInput: ServiceVariantRuleAssociationInput[],
  actor: TenantAwareParams,
): Promise<import('@/services/service-catalog/types').ServiceVariantDto> {
  const input = serviceVariantRuleAssociationsSchema.parse(rawInput);
  return runSerializableTransaction(prisma, async (tx) => {
    const variant = await tx.serviceVariant.findFirst({
      where: { id: variantId, tenantId: actor.tenantId, deletedAt: null },
      include: { sowPartial: true, defaultFeeTemplates: true },
    });
    if (!variant) throw new NotFoundError('Service variant not found');

    const ruleIds = input.map((association) => association.ruleId);
    const rules = ruleIds.length === 0
      ? []
      : await tx.deadlineRule.findMany({
          where: { tenantId: actor.tenantId, id: { in: ruleIds }, archivedAt: null },
          select: { id: true },
        });
    if (rules.length !== ruleIds.length) {
      throw new NotFoundError('One or more deadline rules were not found in this workspace');
    }

    await tx.serviceVariantDeadlineRule.deleteMany({
      where: { tenantId: actor.tenantId, serviceVariantId: variantId },
    });
    if (input.length > 0) {
      await tx.serviceVariantDeadlineRule.createMany({
        data: input.map((association) => ({
          tenantId: actor.tenantId,
          serviceVariantId: variantId,
          ruleId: association.ruleId,
          enabledByDefault: association.enabledByDefault,
          parameterDefaults: json(association.parameterDefaults),
          scheduleDefaults: json(association.scheduleDefaults),
          displayOrder: association.displayOrder,
        })),
      });
    }

    const associations = await tx.serviceVariantDeadlineRule.findMany({
      where: { tenantId: actor.tenantId, serviceVariantId: variantId, archivedAt: null },
      orderBy: [{ displayOrder: 'asc' }, { createdAt: 'asc' }],
    });
    await createAuditLog({
      tenantId: actor.tenantId,
      userId: actor.userId,
      action: 'UPDATE',
      entityType: 'ServiceVariantDeadlineRule',
      entityId: variantId,
      entityName: variant.name,
      summary: `Updated deadline rule associations for service variant "${variant.name}"`,
      metadata: { ruleIds },
    }, tx);

    return {
      id: variant.id,
      familyId: variant.familyId,
      code: variant.code,
      name: variant.name,
      description: variant.description,
      serviceCadence: variant.serviceCadence,
      customCadenceLabel: variant.customCadenceLabel,
      displayOrder: variant.displayOrder,
      version: variant.version,
      isActive: variant.isActive,
      sowPartial: {
        id: variant.sowPartial.id,
        name: variant.sowPartial.name,
        displayName: variant.sowPartial.displayName,
        version: variant.sowPartial.version,
        placeholders: variant.sowPartial.placeholders,
      },
      feeTemplates: variant.defaultFeeTemplates.map((fee) => ({
        id: fee.id,
        description: fee.description,
        defaultAmount: fee.defaultAmount?.toString() ?? null,
        currency: fee.currency,
        billingFrequency: fee.billingFrequency,
        customFrequencyLabel: fee.customFrequencyLabel,
        displayOrder: fee.displayOrder,
      })),
      deadlineRules: associations.map((association) => ({
        id: association.id,
        ruleId: association.ruleId,
        serviceVariantId: association.serviceVariantId,
        enabledByDefault: association.enabledByDefault,
        parameterDefaults: (association.parameterDefaults ?? {}) as Record<string, unknown>,
        scheduleDefaults: (association.scheduleDefaults ?? []) as unknown[],
        displayOrder: association.displayOrder,
        archivedAt: association.archivedAt,
      })),
    };
  });
}
