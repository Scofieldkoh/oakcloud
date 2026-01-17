/**
 * Deadline Template Converter
 *
 * Pure utility functions for converting deadline templates to rule inputs.
 * This file has NO server-side dependencies (Prisma, next/headers, etc.)
 * and can be safely imported in client components.
 */

import { ALL_DEADLINE_TEMPLATES } from '@/lib/constants/deadline-templates';
import type { DeadlineRuleInput } from '@/lib/validations/service';

/**
 * Convert template codes to DeadlineRuleInput array
 * Pure function with no side effects - safe for client-side use
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
      description: template.description || null,
      category: template.category,
      ruleType: 'RULE_BASED',

      // Rule-based fields
      anchorType: template.anchorType,
      offsetMonths: template.offsetMonths ?? 0,
      offsetDays: template.offsetDays ?? 0,
      offsetBusinessDays: template.offsetBusinessDays ?? false,
      fixedMonth: template.fixedMonth ?? null,
      fixedDay: template.fixedDay ?? null,

      // Fixed-date fields (not used for templates)
      specificDate: null,

      // Recurrence - templates have frequency but are always recurring if not ONE_TIME
      isRecurring: template.frequency !== 'ONE_TIME',
      frequency: template.frequency,
      generateUntilDate: null,
      generateOccurrences: 3, // Default to 3 occurrences

      // Billing
      isBillable: template.isBillable,
      amount: template.defaultAmount ?? null,
      currency: 'SGD',

      displayOrder: displayOrder++,
      sourceTemplateCode: code,
    });
  }

  return rules;
}
