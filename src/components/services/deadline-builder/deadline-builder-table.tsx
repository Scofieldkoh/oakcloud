'use client';

import { useState, useCallback, useEffect } from 'react';
import { Plus, AlertCircle, ListChecks, Wand2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { DeadlineRuleInput } from '@/lib/validations/service';
import type { EntityType, GstFilingFrequency } from '@/generated/prisma';
import { DeadlineRuleRow } from './deadline-rule-row';

export interface CompanyData {
  fyeMonth?: number | null;
  fyeDay?: number | null;
  fyeYear?: number | null;
  incorporationDate?: string | null;
  isGstRegistered: boolean;
  gstFilingFrequency?: GstFilingFrequency | null;
  entityType: EntityType;
}

export interface DeadlineBuilderTableProps {
  companyId: string;
  companyData: CompanyData;
  initialRules: DeadlineRuleInput[];
  onChange: (rules: DeadlineRuleInput[]) => void;
  serviceStartDate?: string;
  error?: string;
  selectedRuleIndex?: number | null;
  onSelectRule?: (index: number | null) => void;
}

interface RulePreset {
  id: string;
  label: string;
  description: string;
  buildRule: (displayOrder: number) => DeadlineRuleInput;
}

const createBlankRule = (displayOrder: number): DeadlineRuleInput => ({
  taskName: '',
  description: null,
  category: 'CORPORATE_SECRETARY',
  ruleType: 'RULE_BASED',
  anchorType: 'FYE',
  offsetMonths: 0,
  offsetDays: 0,
  offsetBusinessDays: false,
  fixedMonth: null,
  fixedDay: null,
  specificDate: null,
  isRecurring: true,
  frequency: 'ANNUALLY',
  generateUntilDate: null,
  generateOccurrences: 3,
  isBillable: false,
  amount: null,
  currency: 'SGD',
  displayOrder,
  sourceTemplateCode: null,
});

const QUICK_RULE_PRESETS: RulePreset[] = [
  {
    id: 'fye-6m',
    label: 'FYE + 6 months',
    description: 'Common annual compliance deadline',
    buildRule: (displayOrder) => ({
      ...createBlankRule(displayOrder),
      taskName: 'Annual compliance filing',
      category: 'CORPORATE_SECRETARY',
      anchorType: 'FYE',
      offsetMonths: 6,
      offsetDays: 0,
      frequency: 'ANNUALLY',
      generateOccurrences: 3,
    }),
  },
  {
    id: 'renewal-30d',
    label: '30 days before renewal',
    description: 'Service renewal reminder',
    buildRule: (displayOrder) => ({
      ...createBlankRule(displayOrder),
      taskName: 'Service renewal reminder',
      category: 'COMPLIANCE',
      anchorType: 'SERVICE_START',
      offsetMonths: 0,
      offsetDays: -30,
      frequency: 'ANNUALLY',
      generateOccurrences: 3,
    }),
  },
  {
    id: 'month-end-15d',
    label: 'Month-end + 15 days',
    description: 'Recurring monthly follow-up',
    buildRule: (displayOrder) => ({
      ...createBlankRule(displayOrder),
      taskName: 'Monthly close follow-up',
      category: 'ACCOUNTING',
      anchorType: 'MONTH_END',
      offsetMonths: 0,
      offsetDays: 15,
      frequency: 'MONTHLY',
      generateOccurrences: 12,
    }),
  },
  {
    id: 'quarter-end-1m',
    label: 'Quarter-end + 1 month',
    description: 'Recurring quarterly filing',
    buildRule: (displayOrder) => ({
      ...createBlankRule(displayOrder),
      taskName: 'Quarterly filing',
      category: 'TAX',
      anchorType: 'QUARTER_END',
      offsetMonths: 1,
      offsetDays: 0,
      frequency: 'QUARTERLY',
      generateOccurrences: 8,
    }),
  },
];

function withReorderedDisplayOrder(rules: DeadlineRuleInput[]): DeadlineRuleInput[] {
  return rules.map((rule, index) => ({
    ...rule,
    displayOrder: index,
  }));
}

/**
 * Interactive table for building deadline rules
 */
export function DeadlineBuilderTable({
  companyId,
  companyData,
  initialRules,
  onChange,
  serviceStartDate,
  error,
  selectedRuleIndex,
  onSelectRule,
}: DeadlineBuilderTableProps) {
  const [rules, setRules] = useState<DeadlineRuleInput[]>(initialRules);
  const [internalSelectedRuleIndex, setInternalSelectedRuleIndex] = useState<number | null>(null);
  const resolvedSelectedRuleIndex = selectedRuleIndex ?? internalSelectedRuleIndex;
  const handleSelectRule = useCallback(
    (index: number | null) => {
      if (onSelectRule) {
        onSelectRule(index);
      } else {
        setInternalSelectedRuleIndex(index);
      }
    },
    [onSelectRule]
  );

  useEffect(() => {
    setRules(initialRules);
  }, [initialRules]);

  useEffect(() => {
    if (resolvedSelectedRuleIndex != null && resolvedSelectedRuleIndex >= rules.length) {
      handleSelectRule(null);
    }
  }, [rules.length, resolvedSelectedRuleIndex, handleSelectRule]);

  const handleRulesChange = useCallback(
    (newRules: DeadlineRuleInput[]) => {
      setRules(newRules);
      onChange(newRules);
    },
    [onChange]
  );

  const handleAddRule = useCallback(() => {
    const newRule = createBlankRule(rules.length);
    handleRulesChange([...rules, newRule]);
  }, [rules, handleRulesChange]);

  const handleAddPresetRule = useCallback(
    (presetId: string) => {
      const preset = QUICK_RULE_PRESETS.find((item) => item.id === presetId);
      if (!preset) return;
      const newRule = preset.buildRule(rules.length);
      handleRulesChange([...rules, newRule]);
    },
    [rules, handleRulesChange]
  );

  const handleUpdateRule = useCallback(
    (index: number, updatedRule: DeadlineRuleInput) => {
      const newRules = [...rules];
      newRules[index] = updatedRule;
      handleRulesChange(newRules);
    },
    [rules, handleRulesChange]
  );

  const handleDeleteRule = useCallback(
    (index: number) => {
      const newRules = rules.filter((_, i) => i !== index);
      handleRulesChange(withReorderedDisplayOrder(newRules));
    },
    [rules, handleRulesChange]
  );

  const handleDuplicateRule = useCallback(
    (index: number) => {
      const existingRule = rules[index];
      if (!existingRule) return;

      const clonedRule: DeadlineRuleInput = {
        ...existingRule,
        taskName: existingRule.taskName ? `${existingRule.taskName} (Copy)` : 'New deadline',
      };

      const newRules = [
        ...rules.slice(0, index + 1),
        clonedRule,
        ...rules.slice(index + 1),
      ];

      handleRulesChange(withReorderedDisplayOrder(newRules));
    },
    [rules, handleRulesChange]
  );

  const handleMoveUp = useCallback(
    (index: number) => {
      if (index === 0) return;
      const newRules = [...rules];
      [newRules[index - 1], newRules[index]] = [newRules[index], newRules[index - 1]];
      handleRulesChange(withReorderedDisplayOrder(newRules));
    },
    [rules, handleRulesChange]
  );

  const handleMoveDown = useCallback(
    (index: number) => {
      if (index === rules.length - 1) return;
      const newRules = [...rules];
      [newRules[index], newRules[index + 1]] = [newRules[index + 1], newRules[index]];
      handleRulesChange(withReorderedDisplayOrder(newRules));
    },
    [rules, handleRulesChange]
  );

  return (
    <div>
      {error && (
        <div className="flex items-center gap-2 p-3 bg-red-50 dark:bg-red-900/20 rounded-lg border border-red-200 dark:border-red-800 mb-4">
          <AlertCircle className="w-4 h-4 text-red-600 dark:text-red-400 flex-shrink-0" />
          <p className="text-sm text-red-700 dark:text-red-300">{error}</p>
        </div>
      )}

      {rules.length === 0 && (
        <div className="p-8 border-2 border-dashed border-border-secondary rounded-lg text-center">
          <div className="flex justify-center mb-3">
            <div className="p-3 rounded-full bg-background-secondary">
              <ListChecks className="w-6 h-6 text-text-muted" />
            </div>
          </div>
          <p className="text-sm text-text-secondary mb-4">
            No deadline rules configured yet.
          </p>
            <div className="flex flex-wrap justify-center gap-2 mb-3">
              <Button
                variant="secondary"
                size="sm"
                leftIcon={<Plus className="w-4 h-4" />}
                onClick={handleAddRule}
              >
                Add First Deadline
              </Button>
              {QUICK_RULE_PRESETS.map((preset) => (
                <Button
                  key={preset.id}
                  type="button"
                  variant="secondary"
                  size="xs"
                  leftIcon={<Wand2 className="w-3 h-3" />}
                  onClick={() => handleAddPresetRule(preset.id)}
                  className="rounded-full"
                >
                  {preset.label}
                </Button>
              ))}
            </div>
          <p className="text-[11px] text-text-muted">
            Start with a quick preset, then fine-tune the rule details.
          </p>
        </div>
      )}

      {rules.length > 0 && (
        <div className="space-y-4">
          <div className="min-w-0">
            <div className="border border-border-primary rounded-lg overflow-hidden">
              <div className="hidden md:grid grid-cols-[1.75fr_2fr_170px_120px_240px] gap-2 px-3 py-2 bg-background-secondary/50 border-b border-border-primary">
                <div className="text-xs font-semibold text-text-secondary">Task Name</div>
                <div className="text-xs font-semibold text-text-secondary">Due Date Rule</div>
                <div className="text-xs font-semibold text-text-secondary">Frequency</div>
                <div className="text-xs font-semibold text-text-secondary">Billable</div>
                <div className="text-xs font-semibold text-text-secondary text-right">Actions</div>
              </div>

              <div className="divide-y divide-border-primary">
                {rules.map((rule, index) => (
                  <DeadlineRuleRow
                    key={index}
                    index={index}
                    rule={rule}
                    companyId={companyId}
                    companyData={companyData}
                    previewEnabled={false}
                    serviceStartDate={serviceStartDate}
                    onUpdate={(updatedRule) => handleUpdateRule(index, updatedRule)}
                    onDelete={() => handleDeleteRule(index)}
                    onMoveUp={() => handleMoveUp(index)}
                    onMoveDown={() => handleMoveDown(index)}
                    onDuplicate={() => handleDuplicateRule(index)}
                    isFirst={index === 0}
                    isLast={index === rules.length - 1}
                    isSelected={resolvedSelectedRuleIndex === index}
                    onSelect={() => handleSelectRule(index)}
                  />
                ))}
              </div>
            </div>

            <div className="mt-3 px-1 flex flex-wrap items-center gap-2">
              <span className="text-[11px] text-text-muted">Quick add:</span>
              <Button
                variant="secondary"
                size="xs"
                onClick={handleAddRule}
                className="h-7 rounded-md text-[11px]"
              >
                + Add Deadline
              </Button>
              {QUICK_RULE_PRESETS.map((preset) => (
                <Button
                  key={preset.id}
                  type="button"
                  variant="ghost"
                  size="xs"
                  onClick={() => handleAddPresetRule(preset.id)}
                  leftIcon={<Wand2 className="w-3 h-3" />}
                  className="h-7 rounded-md text-[11px] border border-border-primary text-text-muted hover:text-text-primary"
                >
                  {preset.label}
                </Button>
              ))}
            </div>
          </div>

        </div>
      )}
    </div>
  );
}
