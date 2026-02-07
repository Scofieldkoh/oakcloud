'use client';

import { useState, useCallback, useEffect, useMemo, useRef } from 'react';
import { ChevronUp, ChevronDown, Trash2, Copy, FileText } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
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
  defaultBillingAmount?: number | null;
  defaultBillingCurrency?: string | null;
  onUpdate: (rule: DeadlineRuleInput) => void;
  onDelete: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
  onDuplicate?: () => void;
  isFirst: boolean;
  isLast: boolean;
  isSelected?: boolean;
  onSelect?: () => void;
}

const anchorTypeShort: Record<string, string> = {
  FYE: 'FYE',
  SERVICE_START: 'Service Start',
  FIXED_CALENDAR: 'Calendar',
  QUARTER_END: 'Quarter End',
  MONTH_END: 'Month End',
  INCORPORATION: 'Incorporation',
  IPC_EXPIRY: 'IPC Expiry',
};

const monthLabels = [
  { value: 1, label: 'Jan' },
  { value: 2, label: 'Feb' },
  { value: 3, label: 'Mar' },
  { value: 4, label: 'Apr' },
  { value: 5, label: 'May' },
  { value: 6, label: 'Jun' },
  { value: 7, label: 'Jul' },
  { value: 8, label: 'Aug' },
  { value: 9, label: 'Sep' },
  { value: 10, label: 'Oct' },
  { value: 11, label: 'Nov' },
  { value: 12, label: 'Dec' },
];

const currencyOptions = [
  { value: 'SGD', label: 'SGD' },
  { value: 'USD', label: 'USD' },
  { value: 'EUR', label: 'EUR' },
  { value: 'GBP', label: 'GBP' },
  { value: 'MYR', label: 'MYR' },
];

type OffsetUnit = 'month' | 'days';

function deriveOffsetUnit(rule: DeadlineRuleInput): OffsetUnit {
  if (rule.offsetMonths !== null && rule.offsetMonths !== undefined) {
    if (rule.offsetMonths !== 0) return 'month';
    if (rule.offsetDays === null || rule.offsetDays === undefined) return 'month';
  }
  return 'days';
}

export function DeadlineRuleRow({
  rule,
  companyId,
  companyData,
  previewEnabled = true,
  serviceStartDate,
  defaultBillingAmount,
  defaultBillingCurrency,
  onUpdate,
  onDelete,
  onMoveUp,
  onMoveDown,
  onDuplicate,
  isFirst,
  isLast,
  isSelected = false,
  onSelect,
}: DeadlineRuleRowProps) {
  const [localRule, setLocalRule] = useState(rule);
  const [offsetUnit, setOffsetUnit] = useState<OffsetUnit>(() => deriveOffsetUnit(rule));
  const desktopDescriptionRef = useRef<HTMLTextAreaElement | null>(null);
  const mobileDescriptionRef = useRef<HTMLTextAreaElement | null>(null);
  const [isDescriptionExpanded, setIsDescriptionExpanded] = useState(false);

  useEffect(() => {
    setLocalRule(rule);
    setOffsetUnit(deriveOffsetUnit(rule));
  }, [rule]);

  const autoResizeTextarea = useCallback((textarea: HTMLTextAreaElement | null) => {
    if (!textarea) return;
    textarea.style.height = 'auto';
    textarea.style.height = `${textarea.scrollHeight}px`;
  }, []);

  useEffect(() => {
    if (!isDescriptionExpanded) return;
    autoResizeTextarea(desktopDescriptionRef.current);
    autoResizeTextarea(mobileDescriptionRef.current);
  }, [autoResizeTextarea, isDescriptionExpanded, localRule.description]);

  const commitRule = useCallback(
    (updatedRule: DeadlineRuleInput) => {
      setLocalRule(updatedRule);
      onUpdate(updatedRule);
    },
    [onUpdate]
  );

  const handleFieldChange = useCallback(
    (field: keyof DeadlineRuleInput, value: unknown) => {
      const updatedRule: DeadlineRuleInput = { ...localRule, [field]: value };

      if (field === 'ruleType') {
        if (value === 'FIXED_DATE') {
          updatedRule.anchorType = null;
          updatedRule.offsetMonths = null;
          updatedRule.offsetDays = null;
          updatedRule.fixedMonth = null;
          updatedRule.fixedDay = null;
          if (!updatedRule.specificDate) {
            updatedRule.specificDate = new Date().toISOString().split('T')[0];
          }
        } else if (value === 'RULE_BASED') {
          updatedRule.specificDate = null;
          if (!updatedRule.anchorType) {
            updatedRule.anchorType = 'FYE';
          }
          if (updatedRule.offsetMonths === null || updatedRule.offsetMonths === undefined) {
            updatedRule.offsetMonths = 0;
          }
          if (updatedRule.offsetDays === null || updatedRule.offsetDays === undefined) {
            updatedRule.offsetDays = 0;
          }
          setOffsetUnit(deriveOffsetUnit(updatedRule));
        }
      }

      if (field === 'isBillable' && value === true) {
        if ((updatedRule.amount === null || updatedRule.amount === undefined) && defaultBillingAmount != null) {
          updatedRule.amount = defaultBillingAmount;
        }
        if (defaultBillingCurrency && (updatedRule.currency == null || updatedRule.currency === 'SGD')) {
          updatedRule.currency = defaultBillingCurrency;
        }
      }

      if (field === 'anchorType') {
        if (value === 'FIXED_CALENDAR') {
          updatedRule.fixedMonth = updatedRule.fixedMonth ?? 12;
          updatedRule.fixedDay = updatedRule.fixedDay ?? 31;
          updatedRule.offsetMonths = 0;
          updatedRule.offsetDays = 0;
        } else {
          updatedRule.fixedMonth = null;
          updatedRule.fixedDay = null;
          if (updatedRule.offsetMonths === null && updatedRule.offsetDays === null) {
            updatedRule.offsetDays = 0;
          }
        }
      }

      commitRule(updatedRule);
    },
    [commitRule, localRule]
  );

  const isRuleBased = localRule.ruleType === 'RULE_BASED';
  const isFixedCalendar = isRuleBased && localRule.anchorType === 'FIXED_CALENDAR';
  const isBillable = Boolean(localRule.isBillable);
  const offsetSign = useMemo(() => {
    const monthSign = localRule.offsetMonths ?? 0;
    const daySign = localRule.offsetDays ?? 0;
    return monthSign < 0 || daySign < 0 ? -1 : 1;
  }, [localRule.offsetDays, localRule.offsetMonths]);
  const offsetMagnitude = useMemo(() => {
    const sourceValue = offsetUnit === 'month' ? localRule.offsetMonths : localRule.offsetDays;
    return Math.abs(sourceValue ?? 0);
  }, [localRule.offsetDays, localRule.offsetMonths, offsetUnit]);

  const inputBaseClasses = cn(
    'bg-background-primary border border-border-primary',
    'hover:border-border-secondary focus:border-oak-primary focus:ring-2 focus:ring-oak-primary/30',
    'outline-none transition-colors text-text-primary'
  );

  const handleOffsetValueChange = useCallback(
    (rawValue: string) => {
      const parsed = Number.parseInt(rawValue, 10);
      const nextMagnitude = Number.isNaN(parsed) ? 0 : Math.max(0, parsed);
      const signedValue = nextMagnitude * offsetSign;
      const updatedRule: DeadlineRuleInput =
        offsetUnit === 'month'
          ? {
              ...localRule,
              offsetMonths: signedValue,
              offsetDays: 0,
            }
          : {
              ...localRule,
              offsetMonths: 0,
              offsetDays: signedValue,
            };

      commitRule(updatedRule);
    },
    [commitRule, localRule, offsetSign, offsetUnit]
  );

  const handleOffsetUnitChange = useCallback(
    (nextUnit: OffsetUnit) => {
      setOffsetUnit(nextUnit);
      const signedValue = offsetMagnitude * offsetSign;
      const updatedRule: DeadlineRuleInput =
        nextUnit === 'month'
          ? {
              ...localRule,
              offsetMonths: signedValue,
              offsetDays: 0,
            }
          : {
              ...localRule,
              offsetMonths: 0,
              offsetDays: signedValue,
            };
      commitRule(updatedRule);
    },
    [commitRule, localRule, offsetMagnitude, offsetSign]
  );

  const handleOffsetDirectionChange = useCallback(
    (direction: 'before' | 'after') => {
      const sign = direction === 'before' ? -1 : 1;
      const signedValue = offsetMagnitude * sign;
      const updatedRule: DeadlineRuleInput =
        offsetUnit === 'month'
          ? {
              ...localRule,
              offsetMonths: signedValue,
              offsetDays: 0,
            }
          : {
              ...localRule,
              offsetMonths: 0,
              offsetDays: signedValue,
            };
      commitRule(updatedRule);
    },
    [commitRule, localRule, offsetMagnitude, offsetUnit]
  );

  const renderOffsetInput = (height: string = 'h-8') => (
    <input
      type="number"
      min={0}
      value={offsetMagnitude}
      onChange={(e) => handleOffsetValueChange(e.target.value)}
      className={cn(
        `w-16 ${height} px-2 text-sm text-center rounded-lg`,
        inputBaseClasses
      )}
    />
  );

  const renderUnitSelect = (height: string = 'h-8') => (
    <select
      className={cn(
        `${height} px-2 text-sm rounded-lg appearance-none cursor-pointer`,
        inputBaseClasses
      )}
      value={offsetUnit}
      onChange={(e) => handleOffsetUnitChange(e.target.value as OffsetUnit)}
    >
      <option value="month">months</option>
      <option value="days">days</option>
    </select>
  );

  const renderDirectionSelect = (height: string = 'h-8') => (
    <select
      className={cn(
        `${height} px-2 text-sm rounded-lg appearance-none cursor-pointer`,
        inputBaseClasses
      )}
      value={offsetSign < 0 ? 'before' : 'after'}
      onChange={(e) => handleOffsetDirectionChange(e.target.value as 'before' | 'after')}
    >
      <option value="after">after</option>
      <option value="before">before</option>
    </select>
  );

  const renderAnchorSelect = (
    height: string = 'h-8',
    additionalClasses: string = ''
  ) => (
    <select
      value={localRule.anchorType || 'FYE'}
      onChange={(e) => handleFieldChange('anchorType', e.target.value)}
      className={cn(
        `${height} px-2 text-sm rounded-lg appearance-none cursor-pointer`,
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

  const renderRuleTypeSelect = (height: string = 'h-8') => (
    <select
      value={localRule.ruleType}
      onChange={(e) => handleFieldChange('ruleType', e.target.value)}
      className={cn(
        `${height} px-2 text-sm rounded-lg appearance-none cursor-pointer min-w-[128px]`,
        inputBaseClasses
      )}
    >
      <option value="RULE_BASED">Relative rule</option>
      <option value="FIXED_DATE">Specific date</option>
    </select>
  );

  const renderFixedCalendarMonthSelect = (height: string = 'h-8') => (
    <select
      value={localRule.fixedMonth ?? 1}
      onChange={(e) => {
        const monthValue = Number.parseInt(e.target.value, 10);
        handleFieldChange('fixedMonth', Number.isNaN(monthValue) ? 1 : monthValue);
      }}
      className={cn(
        `${height} px-2 text-sm rounded-lg appearance-none cursor-pointer`,
        inputBaseClasses
      )}
    >
      {monthLabels.map((month) => (
        <option key={month.value} value={month.value}>
          {month.label}
        </option>
      ))}
    </select>
  );

  const renderFixedCalendarDayInput = (height: string = 'h-8') => (
    <input
      type="number"
      min={1}
      max={31}
      value={localRule.fixedDay ?? 1}
      onChange={(e) => {
        const dayValue = Number.parseInt(e.target.value, 10);
        const bounded = Number.isNaN(dayValue) ? 1 : Math.min(31, Math.max(1, dayValue));
        handleFieldChange('fixedDay', bounded);
      }}
      className={cn(
        `w-16 ${height} px-2 text-sm text-center rounded-lg`,
        inputBaseClasses
      )}
    />
  );

  const renderAmountInput = (height: string = 'h-8', widthClass = 'w-24') => (
    <input
      type="number"
      min={0}
      step="0.01"
      value={localRule.amount ?? ''}
      onChange={(e) => {
        const raw = e.target.value;
        if (raw.trim() === '') {
          handleFieldChange('amount', null);
          return;
        }
        const parsed = Number.parseFloat(raw);
        if (!Number.isNaN(parsed)) {
          handleFieldChange('amount', parsed);
        }
      }}
      disabled={!isBillable}
      placeholder="Amount"
      className={cn(
        `${widthClass} ${height} px-2 text-sm text-right rounded-lg`,
        inputBaseClasses,
        !isBillable && 'opacity-50 cursor-not-allowed'
      )}
    />
  );

  const renderCurrencySelect = (height: string = 'h-8', widthClass = 'w-20') => (
    <select
      value={localRule.currency || 'SGD'}
      onChange={(e) => handleFieldChange('currency', e.target.value)}
      disabled={!isBillable}
      className={cn(
        `${widthClass} ${height} px-2 text-sm rounded-lg appearance-none cursor-pointer`,
        inputBaseClasses,
        !isBillable && 'opacity-50 cursor-not-allowed'
      )}
    >
      {currencyOptions.map((option) => (
        <option key={option.value} value={option.value}>
          {option.label}
        </option>
      ))}
    </select>
  );

  const taskLabel = localRule.taskName?.trim() || 'this task';
  const renderActionButtons = () => (
    <>
      <Button
        variant="ghost"
        size="sm"
        aria-label={`${isDescriptionExpanded ? 'Collapse' : 'Expand'} ${taskLabel} description`}
        onClick={() => setIsDescriptionExpanded((prev) => !prev)}
        className={cn(
          'h-10 w-10 md:h-8 md:w-8 p-1.5 hover:bg-background-tertiary',
          isDescriptionExpanded && 'bg-oak-primary/10 text-oak-primary'
        )}
      >
        <FileText className="w-3.5 h-3.5" />
      </Button>
      <Button
        variant="ghost"
        size="sm"
        aria-label={`Move ${taskLabel} up`}
        onClick={onMoveUp}
        disabled={isFirst}
        className="h-10 w-10 md:h-8 md:w-8 p-1.5 hover:bg-background-tertiary disabled:opacity-30"
      >
        <ChevronUp className="w-3.5 h-3.5" />
      </Button>
      <Button
        variant="ghost"
        size="sm"
        aria-label={`Move ${taskLabel} down`}
        onClick={onMoveDown}
        disabled={isLast}
        className="h-10 w-10 md:h-8 md:w-8 p-1.5 hover:bg-background-tertiary disabled:opacity-30"
      >
        <ChevronDown className="w-3.5 h-3.5" />
      </Button>
      {onDuplicate && (
        <Button
          variant="ghost"
          size="sm"
          aria-label={`Duplicate ${taskLabel}`}
          onClick={onDuplicate}
          className="h-10 w-10 md:h-8 md:w-8 p-1.5 hover:bg-background-tertiary"
        >
          <Copy className="w-3.5 h-3.5" />
        </Button>
      )}
      <Button
        variant="ghost"
        size="sm"
        aria-label={`Delete ${taskLabel}`}
        onClick={onDelete}
        className="h-10 w-10 md:h-8 md:w-8 p-1.5 hover:bg-red-50 dark:hover:bg-red-900/20 hover:text-red-600"
      >
        <Trash2 className="w-3.5 h-3.5" />
      </Button>
    </>
  );

  const handleDescriptionChange = useCallback(
    (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      handleFieldChange('description', e.target.value);
      autoResizeTextarea(e.currentTarget);
    },
    [autoResizeTextarea, handleFieldChange]
  );

  return (
    <>
      <div
        className={cn(
          'hidden md:block px-3 py-3 bg-background-primary hover:bg-background-secondary/30 transition-colors',
          isSelected && 'ring-1 ring-oak-primary/30 bg-oak-light/10'
        )}
        onClick={onSelect}
      >
        <div
          className={cn(
            'grid gap-2 items-center',
            previewEnabled
              ? 'grid-cols-[1.75fr_2fr_170px_240px_1fr_240px]'
              : 'grid-cols-[1.75fr_2fr_170px_240px_240px]'
          )}
        >
          <div className="min-w-0">
            <input
              type="text"
              value={localRule.taskName}
              onChange={(e) => handleFieldChange('taskName', e.target.value)}
              onFocus={onSelect}
              placeholder="Task name"
              className={cn(
                'w-full h-8 px-3 text-sm font-medium rounded-lg',
                inputBaseClasses,
                'placeholder:text-text-muted'
              )}
            />
          </div>

          <div className="min-w-0">
          {isRuleBased ? (
            <div className="flex items-center gap-1.5 flex-nowrap text-sm">
              {renderRuleTypeSelect()}
              {isFixedCalendar ? (
                <>
                  {renderAnchorSelect('h-8', 'w-28 shrink-0')}
                  <span className="text-text-muted whitespace-nowrap">on</span>
                  {renderFixedCalendarMonthSelect()}
                  {renderFixedCalendarDayInput()}
                </>
              ) : (
                <>
                  {renderOffsetInput()}
                  {renderUnitSelect()}
                  {renderDirectionSelect()}
                  {renderAnchorSelect('h-8', 'w-28 shrink-0')}
                </>
              )}
            </div>
          ) : (
            <div className="flex items-center gap-1.5 text-sm">
              {renderRuleTypeSelect()}
              <input
                type="date"
                value={localRule.specificDate || ''}
                onChange={(e) => handleFieldChange('specificDate', e.target.value)}
                className={cn(
                  'h-8 px-2.5 text-sm rounded-lg',
                  inputBaseClasses
                )}
              />
            </div>
          )}
          </div>

          <div className="min-w-0">
          <RecurrenceConfig
            isRecurring={localRule.isRecurring}
            frequency={localRule.frequency ?? null}
            generateOccurrences={localRule.generateOccurrences ?? null}
            generateUntilDate={localRule.generateUntilDate ?? null}
            size="sm"
            onUpdate={(updates) => {
              Object.entries(updates).forEach(([field, value]) => {
                handleFieldChange(field as keyof DeadlineRuleInput, value);
              });
            }}
          />
          </div>

          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <Checkbox
                size="sm"
                checked={Boolean(localRule.isBillable)}
                onChange={(event) => handleFieldChange('isBillable', event.target.checked)}
                aria-label={`Mark ${taskLabel} as billable`}
                className="justify-start"
              />
              {renderAmountInput()}
              {renderCurrencySelect()}
            </div>
          </div>

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

          <div className="flex items-center justify-end gap-0.5 flex-nowrap min-w-[200px]">
            {renderActionButtons()}
          </div>
        </div>

        {isDescriptionExpanded && (
          <div className="mt-2">
            <label className="text-[11px] font-medium text-text-muted block mb-1">
              Description
            </label>
            <textarea
              value={localRule.description || ''}
              onChange={handleDescriptionChange}
              onFocus={onSelect}
              placeholder="Description (e.g., steps, requirements, references)"
              rows={2}
              ref={desktopDescriptionRef}
              className={cn(
                'w-full px-3 py-2 text-xs rounded-lg resize-none overflow-hidden',
                inputBaseClasses,
                'placeholder:text-text-muted'
              )}
            />
          </div>
        )}
      </div>

      <div
        className={cn(
          'md:hidden p-4 border-b border-border-primary space-y-3 bg-background-primary',
          isSelected && 'ring-1 ring-oak-primary/30 bg-oak-light/10'
        )}
        onClick={onSelect}
      >
        <div className="flex items-center justify-between gap-2">
          <input
            type="text"
            value={localRule.taskName}
            onChange={(e) => handleFieldChange('taskName', e.target.value)}
            onFocus={onSelect}
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

        {isDescriptionExpanded && (
          <div>
            <label className="text-[11px] font-medium text-text-muted block mb-1">
              Description
            </label>
            <textarea
              value={localRule.description || ''}
              onChange={handleDescriptionChange}
              onFocus={onSelect}
              placeholder="Description (e.g., steps, requirements, references)"
              rows={2}
              ref={mobileDescriptionRef}
              className={cn(
                'w-full px-2 py-2 text-xs rounded-md resize-none overflow-hidden',
                inputBaseClasses,
                'placeholder:text-text-muted'
              )}
            />
          </div>
        )}

        <div className="flex flex-wrap items-center gap-2 text-sm">
          <span className="text-text-muted">Due rule</span>
          {isRuleBased ? (
            <>
              {renderRuleTypeSelect('h-8')}
              {isFixedCalendar ? (
                <>
                  {renderAnchorSelect('h-8', 'w-28 shrink-0')}
                  <span className="text-text-muted">on</span>
                  {renderFixedCalendarMonthSelect('h-8')}
                  {renderFixedCalendarDayInput('h-8')}
                </>
              ) : (
                <>
                  {renderOffsetInput('h-8')}
                  {renderUnitSelect('h-8')}
                  {renderDirectionSelect('h-8')}
                  {renderAnchorSelect('h-8', 'w-28 shrink-0')}
                </>
              )}
            </>
          ) : (
            <>
              {renderRuleTypeSelect('h-8')}
              <input
                type="date"
                value={localRule.specificDate || ''}
                onChange={(e) => handleFieldChange('specificDate', e.target.value)}
                className={cn(
                  'h-8 px-2.5 text-sm rounded-lg flex-1',
                  inputBaseClasses
                )}
              />
            </>
          )}
        </div>

        <div className="flex items-center gap-2">
          <span className="text-xs text-text-muted">Repeats:</span>
          <RecurrenceConfig
            isRecurring={localRule.isRecurring}
            frequency={localRule.frequency ?? null}
            generateOccurrences={localRule.generateOccurrences ?? null}
            generateUntilDate={localRule.generateUntilDate ?? null}
            size="sm"
            onUpdate={(updates) => {
              Object.entries(updates).forEach(([field, value]) => {
                handleFieldChange(field as keyof DeadlineRuleInput, value);
              });
            }}
          />
        </div>

        <div className="space-y-2">
          <Checkbox
            size="sm"
            checked={Boolean(localRule.isBillable)}
            onChange={(event) => handleFieldChange('isBillable', event.target.checked)}
            label="Billable"
          />
          <div className="flex items-center gap-2">
            {renderAmountInput('h-8', 'flex-1')}
            {renderCurrencySelect('h-8', 'w-24')}
          </div>
        </div>

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
