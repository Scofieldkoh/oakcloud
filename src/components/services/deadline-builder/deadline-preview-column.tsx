'use client';

import { useMemo, useState } from 'react';
import { Box, Flex, Text, Spinner } from '@chakra-ui/react';
import { AlertCircle, Calendar, ExternalLink } from 'lucide-react';
import type { DeadlineRuleInput } from '@/lib/validations/service';
import type { CompanyData } from './deadline-builder-table';

export interface DeadlinePreviewColumnProps {
  rule: DeadlineRuleInput;
  companyId: string;
  companyData: CompanyData;
  serviceStartDate?: string; // Service start date from form
  onOpenFYEModal?: () => void; // Callback to open FYE settings modal
}

/**
 * Preview column showing calculated deadline dates
 *
 * Note: This is a simplified client-side preview.
 * For full preview with server-side calculation, integrate with the preview API.
 */
export function DeadlinePreviewColumn({
  rule,
  companyId,
  companyData,
  serviceStartDate,
}: DeadlinePreviewColumnProps) {
  // Client-side preview calculation (simplified)
  const preview = useMemo(() => {
    const warnings: string[] = [];
    const dates: string[] = [];

    try {
      if (rule.ruleType === 'FIXED_DATE') {
        // Fixed date preview
        if (!rule.specificDate) {
          return { dates: [], warnings: ['Missing specific date'], error: null };
        }

        const baseDate = new Date(rule.specificDate);
        if (isNaN(baseDate.getTime())) {
          return { dates: [], warnings: [], error: 'Invalid date' };
        }

        // Check if date is in the past
        if (baseDate < new Date()) {
          warnings.push('Date is in the past');
        }

        // For recurring, show multiple occurrences
        if (rule.isRecurring && rule.frequency && rule.frequency !== 'ONE_TIME') {
          const occurrenceCount = rule.generateOccurrences || 3;
          for (let i = 0; i < Math.min(occurrenceCount, 3); i++) {
            const occurrence = new Date(baseDate);
            if (rule.frequency === 'MONTHLY') {
              occurrence.setMonth(occurrence.getMonth() + i);
            } else if (rule.frequency === 'QUARTERLY') {
              occurrence.setMonth(occurrence.getMonth() + (i * 3));
            } else if (rule.frequency === 'ANNUALLY') {
              occurrence.setFullYear(occurrence.getFullYear() + i);
            }
            dates.push(occurrence.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }));
          }
          if (occurrenceCount > 3) {
            dates.push(`+${occurrenceCount - 3} more`);
          }
        } else {
          dates.push(baseDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }));
        }
      } else if (rule.ruleType === 'RULE_BASED') {
        // Rule-based preview
        if (!rule.anchorType) {
          return { dates: [], warnings: [], error: 'Missing anchor type' };
        }

        // Check for missing company data
        if (rule.anchorType === 'FYE') {
          if (companyData.fyeMonth === null || companyData.fyeMonth === undefined ||
              companyData.fyeDay === null || companyData.fyeDay === undefined) {
            warnings.push('Company FYE not set');
            return { dates: [], warnings, error: null };
          }

          // Calculate FYE-based date
          const currentYear = new Date().getFullYear();
          for (let i = 0; i < 3; i++) {
            const fye = new Date(currentYear + i, companyData.fyeMonth - 1, companyData.fyeDay);
            const dueDate = new Date(fye);
            dueDate.setMonth(dueDate.getMonth() + (rule.offsetMonths || 0));
            dueDate.setDate(dueDate.getDate() + (rule.offsetDays || 0));
            dates.push(dueDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }));
          }
        } else if (rule.anchorType === 'INCORPORATION') {
          if (!companyData.incorporationDate) {
            warnings.push('Incorporation date not set');
            return { dates: [], warnings, error: null };
          }
          const incDate = new Date(companyData.incorporationDate);
          if (rule.isRecurring && rule.frequency && rule.frequency !== 'ONE_TIME') {
            const occurrenceCount = rule.generateOccurrences || 3;
            for (let i = 0; i < Math.min(occurrenceCount, 3); i++) {
              const occurrence = new Date(incDate);
              occurrence.setFullYear(occurrence.getFullYear() + i);
              occurrence.setMonth(occurrence.getMonth() + (rule.offsetMonths || 0));
              occurrence.setDate(occurrence.getDate() + (rule.offsetDays || 0));
              dates.push(occurrence.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }));
            }
            if (occurrenceCount > 3) {
              dates.push(`+${occurrenceCount - 3} more`);
            }
          } else {
            const dueDate = new Date(incDate);
            dueDate.setMonth(dueDate.getMonth() + (rule.offsetMonths || 0));
            dueDate.setDate(dueDate.getDate() + (rule.offsetDays || 0));
            dates.push(dueDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }));
          }
        } else if (rule.anchorType === 'SERVICE_START') {
          // Use service start date if provided
          if (!serviceStartDate) {
            warnings.push('Service start date not set');
            return { dates: [], warnings, error: null };
          }

          const startDate = new Date(serviceStartDate);
          if (rule.isRecurring && rule.frequency && rule.frequency !== 'ONE_TIME') {
            // Generate recurring dates from service start
            for (let i = 0; i < 3; i++) {
              const occurrence = new Date(startDate);
              if (rule.frequency === 'MONTHLY') {
                occurrence.setMonth(occurrence.getMonth() + i);
              } else if (rule.frequency === 'QUARTERLY') {
                occurrence.setMonth(occurrence.getMonth() + (i * 3));
              } else if (rule.frequency === 'ANNUALLY') {
                occurrence.setFullYear(occurrence.getFullYear() + i);
              }
              occurrence.setMonth(occurrence.getMonth() + (rule.offsetMonths || 0));
              occurrence.setDate(occurrence.getDate() + (rule.offsetDays || 0));
              dates.push(occurrence.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }));
            }
          } else {
            // One-time calculation from service start
            const dueDate = new Date(startDate);
            dueDate.setMonth(dueDate.getMonth() + (rule.offsetMonths || 0));
            dueDate.setDate(dueDate.getDate() + (rule.offsetDays || 0));
            dates.push(dueDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }));
          }
        } else if (rule.anchorType === 'QUARTER_END' || rule.anchorType === 'MONTH_END') {
          // Calculate from current date
          const now = new Date();
          const isQuarter = rule.anchorType === 'QUARTER_END';
          for (let i = 0; i < 3; i++) {
            const anchorDate = new Date(now);
            if (isQuarter) {
              // Next quarter end
              const currentQuarter = Math.floor(anchorDate.getMonth() / 3);
              anchorDate.setMonth((currentQuarter + 1 + i) * 3, 0);
            } else {
              // Next month end
              anchorDate.setMonth(anchorDate.getMonth() + 1 + i, 0);
            }
            const dueDate = new Date(anchorDate);
            dueDate.setMonth(dueDate.getMonth() + (rule.offsetMonths || 0));
            dueDate.setDate(dueDate.getDate() + (rule.offsetDays || 0));
            dates.push(dueDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }));
          }
        } else {
          // Other anchor types
          warnings.push('Date calculated on save');
        }
      }
    } catch (error) {
      return { dates: [], warnings: [], error: error instanceof Error ? error.message : 'Unknown error' };
    }

    return { dates, warnings, error: null };
  }, [rule, companyData, serviceStartDate]);

  // Error state
  if (preview.error) {
    return (
      <Flex align="center" gap="2">
        <AlertCircle className="w-3.5 h-3.5 text-red-500" />
        <Text fontSize="xs" color="red.600">
          {preview.error}
        </Text>
      </Flex>
    );
  }

  // Warning state with actionable link
  if (preview.warnings.length > 0) {
    const isFYEWarning = preview.warnings[0].includes('FYE');
    const isIncorporationWarning = preview.warnings[0].includes('Incorporation');

    return (
      <Flex
        align="center"
        gap="1.5"
        fontSize="xs"
      >
        <AlertCircle className="w-3.5 h-3.5 text-yellow-500 flex-shrink-0" />
        <Box>
          <Text fontSize="xs" color="var(--text-secondary)">
            {preview.warnings[0]}
          </Text>
          {(isFYEWarning || isIncorporationWarning) && (
            <a
              href={`/companies/${companyId}/edit`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-oak-light hover:text-oak-dark text-xs flex items-center gap-1 mt-0.5 transition-colors"
            >
              <span>Set in company profile</span>
              <ExternalLink className="w-2.5 h-2.5" />
            </a>
          )}
        </Box>
      </Flex>
    );
  }

  // Success state
  if (preview.dates.length > 0) {
    return (
      <Box>
        {preview.dates.map((date, index) => (
          <Flex key={index} align="center" gap="2" mb={index < preview.dates.length - 1 ? "1" : "0"}>
            <Calendar className="w-3 h-3 text-oak-500" />
            <Text fontSize="xs" color="var(--text-primary)">
              {date}
            </Text>
          </Flex>
        ))}
      </Box>
    );
  }

  // Empty state
  return (
    <Text fontSize="xs" color="var(--text-muted)">
      No preview
    </Text>
  );
}
