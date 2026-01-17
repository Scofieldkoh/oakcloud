'use client';

import { useState, useCallback, useEffect } from 'react';
import { Plus, AlertCircle, Calendar, ListChecks } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { DeadlineRuleInput } from '@/lib/validations/service';
import type { EntityType, GstFilingFrequency } from '@/generated/prisma';
import { DeadlineRuleRow } from './deadline-rule-row';
import { ChronologicalDeadlinePreview } from './chronological-deadline-preview';
import { cn } from '@/lib/utils';

export interface CompanyData {
  fyeMonth?: number | null;
  fyeDay?: number | null;
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
  previewEnabled?: boolean;
  serviceStartDate?: string;
  error?: string;
}

/**
 * Interactive table for building deadline rules
 */
export function DeadlineBuilderTable({
  companyId,
  companyData,
  initialRules,
  onChange,
  previewEnabled = true,
  serviceStartDate,
  error,
}: DeadlineBuilderTableProps) {
  const [rules, setRules] = useState<DeadlineRuleInput[]>(initialRules);

  // Sync internal state when initialRules prop changes
  useEffect(() => {
    setRules(initialRules);
  }, [initialRules]);

  // Update parent when rules change
  const handleRulesChange = useCallback((newRules: DeadlineRuleInput[]) => {
    setRules(newRules);
    onChange(newRules);
  }, [onChange]);

  // Add new rule
  const handleAddRule = useCallback(() => {
    const newRule: DeadlineRuleInput = {
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
      displayOrder: rules.length,
      sourceTemplateCode: null,
    };

    handleRulesChange([...rules, newRule]);
  }, [rules, handleRulesChange]);

  // Update a specific rule
  const handleUpdateRule = useCallback((index: number, updatedRule: DeadlineRuleInput) => {
    const newRules = [...rules];
    newRules[index] = updatedRule;
    handleRulesChange(newRules);
  }, [rules, handleRulesChange]);

  // Delete a rule
  const handleDeleteRule = useCallback((index: number) => {
    const newRules = rules.filter((_, i) => i !== index);
    // Update display orders
    const reorderedRules = newRules.map((rule, i) => ({
      ...rule,
      displayOrder: i,
    }));
    handleRulesChange(reorderedRules);
  }, [rules, handleRulesChange]);

  // Move rule up
  const handleMoveUp = useCallback((index: number) => {
    if (index === 0) return;
    const newRules = [...rules];
    [newRules[index - 1], newRules[index]] = [newRules[index], newRules[index - 1]];
    // Update display orders
    const reorderedRules = newRules.map((rule, i) => ({
      ...rule,
      displayOrder: i,
    }));
    handleRulesChange(reorderedRules);
  }, [rules, handleRulesChange]);

  // Move rule down
  const handleMoveDown = useCallback((index: number) => {
    if (index === rules.length - 1) return;
    const newRules = [...rules];
    [newRules[index], newRules[index + 1]] = [newRules[index + 1], newRules[index]];
    // Update display orders
    const reorderedRules = newRules.map((rule, i) => ({
      ...rule,
      displayOrder: i,
    }));
    handleRulesChange(reorderedRules);
  }, [rules, handleRulesChange]);

  return (
    <div>
      {/* Error message */}
      {error && (
        <div className="flex items-center gap-2 p-3 bg-red-50 dark:bg-red-900/20 rounded-lg border border-red-200 dark:border-red-800 mb-4">
          <AlertCircle className="w-4 h-4 text-red-600 dark:text-red-400 flex-shrink-0" />
          <p className="text-sm text-red-700 dark:text-red-300">{error}</p>
        </div>
      )}

      {/* Empty state */}
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
          <Button
            variant="secondary"
            size="sm"
            leftIcon={<Plus className="w-4 h-4" />}
            onClick={handleAddRule}
          >
            Add First Deadline
          </Button>
        </div>
      )}

      {/* Rules Table with Preview */}
      {rules.length > 0 && (
        <div className="flex flex-col lg:flex-row gap-4">
          {/* Left: Rules Table */}
          <div className="flex-[3] min-w-0">
            <div className="border border-border-primary rounded-lg overflow-hidden">
              {/* Table header - hidden on mobile */}
              <div className="hidden md:grid grid-cols-[1fr_2fr_100px_80px] gap-2 px-3 py-2 bg-background-secondary/50 border-b border-border-primary">
                <div className="text-xs font-semibold text-text-secondary">Task Name</div>
                <div className="text-xs font-semibold text-text-secondary">Due Date Rule</div>
                <div className="text-xs font-semibold text-text-secondary">Frequency</div>
                <div className="text-xs font-semibold text-text-secondary text-right">Actions</div>
              </div>

              {/* Table rows */}
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
                    isFirst={index === 0}
                    isLast={index === rules.length - 1}
                  />
                ))}
              </div>
            </div>

            {/* Summary + Add Button */}
            <div className="flex items-center justify-between mt-3 px-1">
              <div className="flex items-center gap-4 text-xs text-text-muted">
                <span>{rules.length} deadline{rules.length !== 1 ? 's' : ''}</span>
                {companyData.fyeMonth && (
                  <span className="text-text-muted">
                    FYE: {new Date(2000, companyData.fyeMonth - 1, companyData.fyeDay || 1).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                  </span>
                )}
              </div>
              <Button
                variant="ghost"
                size="sm"
                leftIcon={<Plus className="w-3.5 h-3.5" />}
                onClick={handleAddRule}
                className="text-xs"
              >
                Add Deadline
              </Button>
            </div>
          </div>

          {/* Right: Chronological Preview */}
          {previewEnabled && (
            <div className="flex-1 min-w-[280px]">
              <div className="border border-border-primary rounded-lg overflow-hidden sticky top-4">
                {/* Header */}
                <div className="flex items-center gap-2 px-4 py-3 bg-background-secondary/50 border-b border-border-primary">
                  <Calendar className="w-4 h-4 text-oak-primary" />
                  <span className="text-xs font-semibold text-text-secondary">Upcoming Deadlines</span>
                </div>

                {/* Preview content */}
                <div className="p-4 max-h-[400px] overflow-y-auto">
                  <ChronologicalDeadlinePreview
                    rules={rules}
                    companyData={companyData}
                    serviceStartDate={serviceStartDate}
                  />
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
