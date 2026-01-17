/**
 * Deadline Rule Service
 *
 * Handles CRUD operations for deadline rules and conversion between
 * templates and custom rules. Rules define HOW to calculate deadlines,
 * while the deadline-generation service creates deadline INSTANCES from rules.
 */

import { prisma } from '@/lib/prisma';
import { createAuditLog } from '@/lib/audit';
import type {
  DeadlineRule,
  DeadlineRuleType,
  DeadlineCategory,
  DeadlineAnchorType,
  DeadlineFrequency,
  Prisma,
} from '@/generated/prisma';
import { ALL_DEADLINE_TEMPLATES, type DeadlineTemplateData } from '@/lib/constants/deadline-templates';
import type { TenantAwareParams } from './deadline-generation.service';
import type { DeadlineRuleInput } from '@/lib/validations/service';

// ============================================================================
// TYPES
// ============================================================================

export interface PreviewResult {
  taskName: string;
  ruleType: DeadlineRuleType;
  calculatedDates: {
    dueDate: string; // ISO date
    periodLabel: string;
  }[];
  warnings?: string[];
  error?: string;
}

// ============================================================================
// CONVERSION: TEMPLATES TO RULES
// ============================================================================

/**
 * Convert template codes to DeadlineRuleInput array
 */
export function convertTemplatesToRuleInputs(templateCodes: string[]): DeadlineRuleInput[] {
  const rules: DeadlineRuleInput[] = [];
  let displayOrder = 0;

  for (const code of templateCodes) {
    const template = ALL_DEADLINE_TEMPLATES.find((t) => t.code === code);
    if (!template) {
      console.warn(`Template not found: ${code}`);
      continue;
    }

    rules.push({
      taskName: template.name,
      description: template.description,
      category: template.category,
      ruleType: 'RULE_BASED',

      // Rule-based fields
      anchorType: template.anchorType,
      offsetMonths: template.offsetMonths,
      offsetDays: template.offsetDays,
      offsetBusinessDays: template.offsetBusinessDays,
      fixedMonth: template.fixedMonth,
      fixedDay: template.fixedDay,

      // Recurrence
      isRecurring: template.frequency !== 'ONE_TIME',
      frequency: template.frequency,
      generateOccurrences: template.frequency === 'ANNUALLY' ? 3 : template.frequency === 'QUARTERLY' ? 12 : 12,

      // Billing
      isBillable: template.isBillable,
      amount: template.defaultAmount,
      currency: 'SGD',

      displayOrder: displayOrder++,
      sourceTemplateCode: template.code,
    });
  }

  return rules;
}

/**
 * Convert template code to single DeadlineRuleInput
 */
export function convertTemplateToRuleInput(templateCode: string, displayOrder: number = 0): DeadlineRuleInput | null {
  const template = ALL_DEADLINE_TEMPLATES.find((t) => t.code === templateCode);
  if (!template) {
    return null;
  }

  return {
    taskName: template.name,
    description: template.description,
    category: template.category,
    ruleType: 'RULE_BASED',

    anchorType: template.anchorType,
    offsetMonths: template.offsetMonths,
    offsetDays: template.offsetDays,
    offsetBusinessDays: template.offsetBusinessDays,
    fixedMonth: template.fixedMonth,
    fixedDay: template.fixedDay,

    isRecurring: template.frequency !== 'ONE_TIME',
    frequency: template.frequency,
    generateOccurrences: template.frequency === 'ANNUALLY' ? 3 : template.frequency === 'QUARTERLY' ? 12 : 12,

    isBillable: template.isBillable,
    amount: template.defaultAmount,
    currency: 'SGD',

    displayOrder,
    sourceTemplateCode: template.code,
  };
}

// ============================================================================
// CRUD OPERATIONS
// ============================================================================

/**
 * Create deadline rules from template codes
 */
export async function createDeadlineRulesFromTemplates(
  contractServiceId: string,
  templateCodes: string[],
  params: TenantAwareParams
): Promise<DeadlineRule[]> {
  const { tenantId, userId, tx } = params;
  const db = tx || prisma;

  const ruleInputs = convertTemplatesToRuleInputs(templateCodes);
  return createDeadlineRules(contractServiceId, ruleInputs, params);
}

/**
 * Create custom deadline rules from user input
 */
export async function createDeadlineRules(
  contractServiceId: string,
  rules: DeadlineRuleInput[],
  params: TenantAwareParams
): Promise<DeadlineRule[]> {
  const { tenantId, userId, tx } = params;
  const db = tx || prisma;

  // Validate contract service exists and belongs to tenant
  const service = await db.contractService.findFirst({
    where: {
      id: contractServiceId,
      tenantId,
      deletedAt: null,
    },
  });

  if (!service) {
    throw new Error('Contract service not found');
  }

  // Convert inputs to Prisma create objects
  const createData: Prisma.DeadlineRuleCreateManyInput[] = rules.map((rule) => ({
    tenantId,
    contractServiceId,
    taskName: rule.taskName,
    description: rule.description || null,
    category: rule.category,
    ruleType: rule.ruleType,

    // Rule-based fields
    anchorType: rule.anchorType || null,
    offsetMonths: rule.offsetMonths ?? null,
    offsetDays: rule.offsetDays ?? null,
    offsetBusinessDays: rule.offsetBusinessDays ?? null,
    fixedMonth: rule.fixedMonth ?? null,
    fixedDay: rule.fixedDay ?? null,

    // Fixed-date fields
    specificDate: rule.specificDate ? new Date(rule.specificDate) : null,

    // Recurrence
    isRecurring: rule.isRecurring,
    frequency: rule.frequency || null,
    generateUntilDate: rule.generateUntilDate ? new Date(rule.generateUntilDate) : null,
    generateOccurrences: rule.generateOccurrences ?? null,

    // Billing
    isBillable: rule.isBillable,
    amount: rule.amount ?? null,
    currency: rule.currency,

    displayOrder: rule.displayOrder,
    sourceTemplateCode: rule.sourceTemplateCode || null,
  }));

  // Create rules in batch
  await db.deadlineRule.createMany({
    data: createData,
  });

  // Fetch created rules
  const createdRules = await db.deadlineRule.findMany({
    where: {
      contractServiceId,
      tenantId,
    },
    orderBy: {
      displayOrder: 'asc',
    },
  });

  // Audit log
  await createAuditLog({
    tenantId,
    userId,
    action: 'CREATE',
    entityType: 'DeadlineRule',
    entityId: contractServiceId,
    changeSource: 'MANUAL',
    details: {
      contractServiceId,
      rulesCreated: createdRules.length,
    },
  });

  return createdRules;
}

/**
 * Get deadline rules for a contract service
 */
export async function getDeadlineRules(
  contractServiceId: string,
  params: TenantAwareParams
): Promise<DeadlineRule[]> {
  const { tenantId, tx } = params;
  const db = tx || prisma;

  return db.deadlineRule.findMany({
    where: {
      contractServiceId,
      tenantId,
      deletedAt: null,
    },
    orderBy: {
      displayOrder: 'asc',
    },
  });
}

/**
 * Update deadline rules (replace all)
 */
export async function updateDeadlineRules(
  contractServiceId: string,
  rules: DeadlineRuleInput[],
  params: TenantAwareParams
): Promise<DeadlineRule[]> {
  const { tenantId, userId, tx } = params;
  const db = tx || prisma;

  // Soft delete existing rules
  await db.deadlineRule.updateMany({
    where: {
      contractServiceId,
      tenantId,
      deletedAt: null,
    },
    data: {
      deletedAt: new Date(),
    },
  });

  // Create new rules
  const newRules = await createDeadlineRules(contractServiceId, rules, params);

  // Audit log
  await createAuditLog({
    tenantId,
    userId,
    action: 'UPDATE',
    entityType: 'DeadlineRule',
    entityId: contractServiceId,
    changeSource: 'MANUAL',
    details: {
      contractServiceId,
      rulesUpdated: newRules.length,
    },
  });

  return newRules;
}

/**
 * Delete deadline rules for a contract service
 */
export async function deleteDeadlineRules(
  contractServiceId: string,
  params: TenantAwareParams
): Promise<void> {
  const { tenantId, userId, tx } = params;
  const db = tx || prisma;

  // Soft delete
  await db.deadlineRule.updateMany({
    where: {
      contractServiceId,
      tenantId,
      deletedAt: null,
    },
    data: {
      deletedAt: new Date(),
    },
  });

  // Audit log
  await createAuditLog({
    tenantId,
    userId,
    action: 'DELETE',
    entityType: 'DeadlineRule',
    entityId: contractServiceId,
    changeSource: 'MANUAL',
    details: {
      contractServiceId,
    },
  });
}

// ============================================================================
// PREVIEW (without saving)
// ============================================================================

/**
 * Preview calculated dates for deadline rules based on company data
 *
 * Note: This is a placeholder that will be implemented in Phase 2.
 * It requires integration with deadline-generation.service.ts
 */
export async function previewDeadlineDates(
  companyId: string,
  rules: DeadlineRuleInput[],
  tenantId: string
): Promise<PreviewResult[]> {
  // Fetch company data
  const company = await prisma.company.findFirst({
    where: {
      id: companyId,
      tenantId,
      deletedAt: null,
    },
  });

  if (!company) {
    throw new Error('Company not found');
  }

  const previews: PreviewResult[] = [];

  for (const rule of rules) {
    const preview: PreviewResult = {
      taskName: rule.taskName,
      ruleType: rule.ruleType,
      calculatedDates: [],
      warnings: [],
    };

    try {
      if (rule.ruleType === 'FIXED_DATE') {
        // Fixed date preview
        if (!rule.specificDate) {
          preview.error = 'Missing specific date';
        } else {
          const date = new Date(rule.specificDate);
          preview.calculatedDates.push({
            dueDate: date.toISOString(),
            periodLabel: date.getFullYear().toString(),
          });

          // Check if date is in the past
          if (date < new Date()) {
            preview.warnings?.push('Date is in the past');
          }
        }
      } else if (rule.ruleType === 'RULE_BASED') {
        // Rule-based preview
        // Check for missing company data
        if (rule.anchorType === 'FYE' && (!company.financialYearEndMonth || !company.financialYearEndDay)) {
          preview.warnings?.push('Company FYE not set');
        } else if (rule.anchorType === 'INCORPORATION' && !company.incorporationDate) {
          preview.warnings?.push('Company incorporation date not set');
        } else if (rule.anchorType === 'IPC_EXPIRY' && !company.ipcExpiryDate) {
          preview.warnings?.push('Company IPC expiry date not set');
        } else {
          // TODO: Implement actual date calculation using deadline-generation.service
          // For now, show placeholder
          const currentYear = new Date().getFullYear();
          preview.calculatedDates.push({
            dueDate: new Date(currentYear, 0, 1).toISOString(),
            periodLabel: `Preview unavailable - implement in Phase 2`,
          });
        }
      }
    } catch (error) {
      preview.error = error instanceof Error ? error.message : 'Unknown error';
    }

    previews.push(preview);
  }

  return previews;
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Validate deadline rule input
 */
export function validateDeadlineRuleInput(rule: DeadlineRuleInput): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  // Task name
  if (!rule.taskName || rule.taskName.trim().length === 0) {
    errors.push('Task name is required');
  }
  if (rule.taskName && rule.taskName.length > 200) {
    errors.push('Task name must be 200 characters or less');
  }

  // Rule type validation
  if (rule.ruleType === 'RULE_BASED') {
    if (!rule.anchorType) {
      errors.push('Anchor type is required for rule-based deadlines');
    }
    if (rule.offsetMonths !== undefined && (rule.offsetMonths < -120 || rule.offsetMonths > 120)) {
      errors.push('Offset months must be between -120 and 120');
    }
    if (rule.offsetDays !== undefined && (rule.offsetDays < -365 || rule.offsetDays > 365)) {
      errors.push('Offset days must be between -365 and 365');
    }
    if (rule.anchorType === 'FIXED_CALENDAR') {
      if (!rule.fixedMonth || rule.fixedMonth < 1 || rule.fixedMonth > 12) {
        errors.push('Fixed month must be between 1 and 12');
      }
      if (!rule.fixedDay || rule.fixedDay < 1 || rule.fixedDay > 31) {
        errors.push('Fixed day must be between 1 and 31');
      }
    }
  } else if (rule.ruleType === 'FIXED_DATE') {
    if (!rule.specificDate) {
      errors.push('Specific date is required for fixed-date deadlines');
    }
  }

  // Recurrence validation
  if (rule.isRecurring) {
    if (!rule.frequency) {
      errors.push('Frequency is required for recurring deadlines');
    }
    if (!rule.generateUntilDate && !rule.generateOccurrences) {
      errors.push('Either generate until date or occurrences count is required for recurring deadlines');
    }
  }

  // Billing validation
  if (rule.isBillable && rule.amount !== undefined && rule.amount < 0) {
    errors.push('Amount cannot be negative');
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Validate array of deadline rule inputs
 */
export function validateDeadlineRuleInputs(rules: DeadlineRuleInput[]): {
  valid: boolean;
  errors: { index: number; errors: string[] }[];
} {
  const allErrors: { index: number; errors: string[] }[] = [];

  rules.forEach((rule, index) => {
    const validation = validateDeadlineRuleInput(rule);
    if (!validation.valid) {
      allErrors.push({
        index,
        errors: validation.errors,
      });
    }
  });

  // Check for duplicate task names
  const taskNames = rules.map((r) => r.taskName.trim().toLowerCase());
  const duplicates = taskNames.filter((name, index) => taskNames.indexOf(name) !== index);
  if (duplicates.length > 0) {
    allErrors.push({
      index: -1,
      errors: [`Duplicate task names found: ${duplicates.join(', ')}`],
    });
  }

  return {
    valid: allErrors.length === 0,
    errors: allErrors,
  };
}
