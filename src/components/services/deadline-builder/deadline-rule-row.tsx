'use client';

import { useState, useCallback, useEffect } from 'react';
import { ChevronUp, ChevronDown, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { DeadlineRuleInput } from '@/lib/validations/service';
import type { CompanyData } from './deadline-builder-table';
import { RecurrenceConfig } from './recurrence-config';
import { DeadlinePreviewColumn } from './deadline-preview-column';
import { cn } from '@/lib/utils';

export interface DeadlineRuleRowProps {
  index?: number;
  rule: DeadlineRuleInput;
  companyId: string;
  companyData: CompanyData;
  previewEnabled?: boolean;
  serviceStartDate?: string;
  onUpdate: (rule: DeadlineRuleInput) => void;
  onDelete: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
  isFirst: boolean;
  isLast: boolean;
}

const anchorTypeLabels: Record<string, string> = {
  FYE: 'Financial Year End',
  SERVICE_START: 'Service Start Date',
  FIXED_CALENDAR: 'Fixed Calendar Date',
  QUARTER_END: 'Quarter End',
  MONTH_END: 'Month End',
  INCORPORATION: 'Incorporation Date',
  IPC_EXPIRY: 'IPC Expiry Date',
};

const anchorTypeShort: Record<string, string> = {
  FYE: 'FYE',
  SERVICE_START: 'Service Start',
  FIXED_CALENDAR: 'Calendar',
  QUARTER_END: 'Quarter End',
  MONTH_END: 'Month End',
  INCORPORATION: 'Incorporation',
  IPC_EXPIRY: 'IPC Expiry',
};

export function DeadlineRuleRow({
  rule,
  companyId,
  companyData,
  previewEnabled = true,
  serviceStartDate,
  onUpdate,
  onDelete,
  onMoveUp,
  onMoveDown,
  isFirst,
  isLast,
}: DeadlineRuleRowProps) {
  const [localRule, setLocalRule] = useState(rule);

  // Update local state when prop changes
  useEffect(() => {
    setLocalRule(rule);
  }, [rule]);

  // Handle field updates
  const handleFieldChange = useCallback((field: keyof DeadlineRuleInput, value: unknown) => {
    const updatedRule = { ...localRule, [field]: value };

    // Auto-adjust based on rule type changes
    if (field === 'ruleType') {
      if (value === 'FIXED_DATE') {
        // Switch to fixed date mode
        updatedRule.anchorType = null;
        updatedRule.offsetMonths = null;
        updatedRule.offsetDays = null;
        if (!updatedRule.specificDate) {
          updatedRule.specificDate = new Date().toISOString().split('T')[0];
        }
      } else if (value === 'RULE_BASED') {
        // Switch to rule-based mode
        updatedRule.specificDate = null;
        if (!updatedRule.anchorType) {
          updatedRule.anchorType = 'FYE';
        }
        if (updatedRule.offsetMonths === null) {
          updatedRule.offsetMonths = 0;
        }
        if (updatedRule.offsetDays === null) {
          updatedRule.offsetDays = 0;
        }
      }
    }

    setLocalRule(updatedRule);
    onUpdate(updatedRule);
  }, [localRule, onUpdate]);

  const isRuleBased = localRule.ruleType === 'RULE_BASED';

  // Common input styles
  const inputBaseClasses = cn(
    'bg-background-primary border border-border-primary',
    'hover:border-border-secondary focus:border-oak-primary focus:ring-1 focus:ring-oak-primary/30',
    'outline-none transition-colors text-text-primary'
  );

  // Render the offset number input
  const renderOffsetInput = (height: string = 'h-6') => (
    <input
      type="number"
      value={Math.abs(localRule.offsetMonths !== 0 ? localRule.offsetMonths ?? 0 : localRule.offsetDays ?? 0)}
      onChange={(e) => {
        const val = parseInt(e.target.value) || 0;
        const sign = (localRule.offsetMonths ?? 0) < 0 || (localRule.offsetDays ?? 0) < 0 ? -1 : 1;
        if (localRule.offsetMonths !== 0) {
          handleFieldChange('offsetMonths', val * sign);
        } else {
          handleFieldChange('offsetDays', val * sign);
        }
      }}
      className={cn(
        `w-12 ${height} px-1.5 text-xs text-center rounded`,
        inputBaseClasses
      )}
    />
  );

  // Render the unit select (month/days)
  const renderUnitSelect = (height: string = 'h-6') => (
    <select
      className={cn(
        `${height} px-1 text-xs rounded appearance-none cursor-pointer`,
        inputBaseClasses
      )}
      value={localRule.offsetMonths !== 0 ? 'month' : 'days'}
      onChange={(e) => {
        const currentValue = Math.abs(localRule.offsetMonths !== 0 ? localRule.offsetMonths ?? 0 : localRule.offsetDays ?? 0);
        const sign = (localRule.offsetMonths ?? 0) < 0 || (localRule.offsetDays ?? 0) < 0 ? -1 : 1;
        if (e.target.value === 'month') {
          handleFieldChange('offsetMonths', currentValue * sign);
          handleFieldChange('offsetDays', 0);
        } else {
          handleFieldChange('offsetDays', currentValue * sign);
          handleFieldChange('offsetMonths', 0);
        }
      }}
    >
      <option value="month">mo</option>
      <option value="days">days</option>
    </select>
  );

  // Render the direction select (before/after)
  const renderDirectionSelect = (height: string = 'h-6') => (
    <select
      className={cn(
        `${height} px-1 text-xs rounded appearance-none cursor-pointer`,
        inputBaseClasses
      )}
      value={(localRule.offsetMonths ?? 0) < 0 || (localRule.offsetDays ?? 0) < 0 ? 'before' : 'after'}
      onChange={(e) => {
        const sign = e.target.value === 'before' ? -1 : 1;
        if (localRule.offsetMonths !== 0) {
          handleFieldChange('offsetMonths', Math.abs(localRule.offsetMonths ?? 0) * sign);
        }
        if (localRule.offsetDays !== 0) {
          handleFieldChange('offsetDays', Math.abs(localRule.offsetDays ?? 0) * sign);
        }
      }}
    >
      <option value="after">after</option>
      <option value="before">before</option>
    </select>
  );

  // Render the anchor type select
  const renderAnchorSelect = (height: string = 'h-6', additionalClasses: string = '') => (
    <select
      value={localRule.anchorType || 'FYE'}
      onChange={(e) => handleFieldChange('anchorType', e.target.value)}
      className={cn(
        `${height} px-1 text-xs rounded appearance-none cursor-pointer`,
        inputBaseClasses,
        additionalClasses
      )}
    >
      {Object.entries(anchorTypeShort).map(([value, label]) => (
        <option key={value} value={value}>
          {label}
        </option>
      ))}
    </select>
  );

  // Render action buttons
  const renderActionButtons = () => (
    <>
      <Button
        variant="ghost"
        size="sm"
        iconOnly
        aria-label="Move up"
        onClick={onMoveUp}
        disabled={isFirst}
        className="h-6 w-6 p-1 hover:bg-background-tertiary disabled:opacity-30"
      >
        <ChevronUp className="w-3 h-3" />
      </Button>
      <Button
        variant="ghost"
        size="sm"
        iconOnly
        aria-label="Move down"
        onClick={onMoveDown}
        disabled={isLast}
        className="h-6 w-6 p-1 hover:bg-background-tertiary disabled:opacity-30"
      >
        <ChevronDown className="w-3 h-3" />
      </Button>
      <Button
        variant="ghost"
        size="sm"
        iconOnly
        aria-label="Delete"
        onClick={onDelete}
        className="h-6 w-6 p-1 hover:bg-red-50 dark:hover:bg-red-900/20 hover:text-red-600"
      >
        <Trash2 className="w-3 h-3" />
      </Button>
    </>
  );

  return (
    <>
      {/* Desktop: Table row */}
      <div className="hidden md:grid grid-cols-[1fr_2fr_100px_80px] gap-2 px-3 py-2 bg-background-primary hover:bg-background-secondary/30 transition-colors items-center">
        {/* Task Name */}
        <div className="min-w-0">
          <input
            type="text"
            value={localRule.taskName}
            onChange={(e) => handleFieldChange('taskName', e.target.value)}
            placeholder="Task name"
            className={cn(
              'w-full h-7 px-2 text-xs font-medium rounded-md',
              inputBaseClasses,
              'placeholder:text-text-muted'
            )}
          />
        </div>

        {/* Due Date Rule */}
        <div className="min-w-0">
          {isRuleBased ? (
            <div className="flex items-center gap-1 flex-wrap text-xs">
              {renderOffsetInput()}
              {renderUnitSelect()}
              {renderDirectionSelect()}
              {renderAnchorSelect('h-6', 'flex-1 min-w-[100px]')}
            </div>
          ) : (
            <div className="flex items-center gap-1 text-xs">
              <span className="text-text-muted whitespace-nowrap">On</span>
              <input
                type="date"
                value={localRule.specificDate || ''}
                onChange={(e) => handleFieldChange('specificDate', e.target.value)}
                className={cn(
                  'h-6 px-1.5 text-xs rounded',
                  inputBaseClasses
                )}
              />
            </div>
          )}
        </div>

        {/* Recurring Configuration */}
        <div className="min-w-0">
          <RecurrenceConfig
            isRecurring={localRule.isRecurring}
            frequency={localRule.frequency ?? null}
            generateOccurrences={localRule.generateOccurrences ?? null}
            generateUntilDate={localRule.generateUntilDate ?? null}
            onUpdate={(updates) => {
              Object.entries(updates).forEach(([field, value]) => {
                handleFieldChange(field as keyof DeadlineRuleInput, value);
              });
            }}
          />
        </div>

        {/* Preview - Only show if enabled */}
        {previewEnabled && (
          <div className="min-w-[150px]">
            <DeadlinePreviewColumn
              rule={localRule}
              companyId={companyId}
              companyData={companyData}
              serviceStartDate={serviceStartDate}
            />
          </div>
        )}

        {/* Actions */}
        <div className="flex items-center justify-end gap-0.5">
          {renderActionButtons()}
        </div>
      </div>

      {/* Mobile: Card layout */}
      <div className="md:hidden p-3 border-b border-border-primary space-y-2 bg-background-primary">
        {/* Row 1: Task name + actions */}
        <div className="flex items-center justify-between gap-2">
          <input
            type="text"
            value={localRule.taskName}
            onChange={(e) => handleFieldChange('taskName', e.target.value)}
            placeholder="Task name"
            className={cn(
              'flex-1 h-8 px-2 text-sm font-medium rounded-md',
              inputBaseClasses,
              'placeholder:text-text-muted'
            )}
          />
          <div className="flex items-center gap-1">
            {renderActionButtons()}
          </div>
        </div>

        {/* Row 2: Due date rule */}
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <span className="text-text-muted">Due</span>
          {isRuleBased ? (
            <>
              {renderOffsetInput('h-7')}
              {renderUnitSelect('h-7')}
              {renderDirectionSelect('h-7')}
              {renderAnchorSelect('h-7', 'flex-1 min-w-[90px]')}
            </>
          ) : (
            <>
              <span className="text-text-muted">on</span>
              <input
                type="date"
                value={localRule.specificDate || ''}
                onChange={(e) => handleFieldChange('specificDate', e.target.value)}
                className={cn(
                  'h-7 px-2 text-xs rounded flex-1',
                  inputBaseClasses
                )}
              />
            </>
          )}
        </div>

        {/* Row 3: Frequency */}
        <div className="flex items-center gap-2">
          <span className="text-xs text-text-muted">Repeats:</span>
          <RecurrenceConfig
            isRecurring={localRule.isRecurring}
            frequency={localRule.frequency ?? null}
            generateOccurrences={localRule.generateOccurrences ?? null}
            generateUntilDate={localRule.generateUntilDate ?? null}
            onUpdate={(updates) => {
              Object.entries(updates).forEach(([field, value]) => {
                handleFieldChange(field as keyof DeadlineRuleInput, value);
              });
            }}
          />
        </div>

        {/* Preview - Only show if enabled on mobile */}
        {previewEnabled && (
          <div className="pt-1">
            <DeadlinePreviewColumn
              rule={localRule}
              companyId={companyId}
              companyData={companyData}
              serviceStartDate={serviceStartDate}
            />
          </div>
        )}
      </div>
    </>
  );
}
