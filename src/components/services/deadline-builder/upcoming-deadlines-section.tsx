'use client';

import { useState, useEffect, useDeferredValue } from 'react';
import { Calendar } from 'lucide-react';
import { CardSection } from '@/components/ui/card-section';
import { ChronologicalDeadlinePreview } from './chronological-deadline-preview';
import type { DeadlineRuleInput } from '@/lib/validations/service';
import type { CompanyData } from './deadline-builder-table';
import { useSession } from '@/hooks/use-auth';

export interface UpcomingDeadlinesSectionProps {
  companyId: string;
  companyData: CompanyData;
  rules: DeadlineRuleInput[];
  serviceStartDate?: string;
  highlightTaskName?: string | null;
  previewEnabled?: boolean;
  monthsAhead?: number;
}

export function UpcomingDeadlinesSection({
  companyId,
  companyData,
  rules,
  serviceStartDate,
  highlightTaskName,
  previewEnabled = true,
  monthsAhead = 18,
}: UpcomingDeadlinesSectionProps) {
  const { data: session } = useSession();
  const [serverPreview, setServerPreview] = useState<{
    deadlines: Array<{ taskName: string; statutoryDueDate: string }>;
    warnings: string[];
  } | null>(null);
  const [serverPreviewLoading, setServerPreviewLoading] = useState(previewEnabled && rules.length > 0);
  const [serverPreviewError, setServerPreviewError] = useState<string | null>(null);
  const deferredRules = useDeferredValue(rules);

  useEffect(() => {
    if (!previewEnabled) return;
    if (deferredRules.length === 0) {
      setServerPreview({ deadlines: [], warnings: [] });
      setServerPreviewError(null);
      return;
    }

    const controller = new AbortController();
    const fetchPreview = async () => {
      setServerPreviewLoading(true);
      setServerPreviewError(null);

      try {
        const previewRules = deferredRules.map((rule) => {
          const trimmedName = rule.taskName?.trim();
          if (trimmedName) return rule;
          return { ...rule, taskName: 'Untitled task' };
        });

        const response = await fetch(`/api/companies/${companyId}/services/preview-deadlines`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            rules: previewRules,
            serviceStartDate: serviceStartDate || null,
            monthsAhead,
            tenantId: session?.tenantId || undefined,
            fyeYearOverride: companyData.fyeYear ?? undefined,
          }),
          signal: controller.signal,
        });

        if (!response.ok) {
          const payload = await response.json().catch(() => ({}));
          throw new Error(payload.error || 'Failed to load preview');
        }

        const data = await response.json() as {
          deadlines: Array<{ taskName: string; statutoryDueDate: string }>;
          warnings?: string[];
        };

        setServerPreview({
          deadlines: data.deadlines || [],
          warnings: data.warnings || [],
        });
      } catch (err) {
        if ((err as Error).name === 'AbortError') return;
        setServerPreviewError(err instanceof Error ? err.message : 'Failed to load preview');
        setServerPreview(null);
      } finally {
        setServerPreviewLoading(false);
      }
    };

    fetchPreview();

    return () => controller.abort();
  }, [
    companyId,
    deferredRules,
    previewEnabled,
    serviceStartDate,
    companyData.fyeYear,
    session?.tenantId,
    monthsAhead,
  ]);

  const previewIsRefreshing = previewEnabled && (serverPreviewLoading || deferredRules !== rules);

  return (
    <CardSection
      title="Upcoming Deadlines"
      icon={<Calendar className="w-4 h-4" />}
      id="upcoming-deadlines"
      rightContent={
        previewIsRefreshing
          ? <span className="text-[10px] text-text-muted">Updating preview...</span>
          : null
      }
    >
      <div className="max-h-[420px] overflow-y-auto">
        <ChronologicalDeadlinePreview
          rules={deferredRules}
          companyData={companyData}
          serviceStartDate={serviceStartDate}
          highlightTaskName={highlightTaskName}
          serverDeadlines={serverPreview?.deadlines}
          serverWarnings={serverPreview?.warnings}
          loading={serverPreviewLoading}
          error={serverPreviewError}
        />
      </div>
    </CardSection>
  );
}
