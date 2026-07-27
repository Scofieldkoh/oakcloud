'use client';

import { Search, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import type { TaskPipeline } from '@/hooks/use-task-pipelines';
import type { TaskListParams } from '@/hooks/use-tasks';

interface CompanyOption {
  id: string;
  name: string;
}

interface OwnerOption {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
}

interface TaskFiltersProps {
  value: TaskListParams;
  pipelines: TaskPipeline[];
  companies: CompanyOption[];
  owners: OwnerOption[];
  onChange: (value: TaskListParams) => void;
  className?: string;
}

const selectClassName = 'h-9 min-w-[140px] rounded-lg border border-border-primary bg-background-secondary px-3 text-sm text-text-primary focus:border-oak-primary focus:outline-none focus:ring-2 focus:ring-oak-primary/30';

export function TaskFilters({
  value,
  pipelines,
  companies,
  owners,
  onChange,
  className,
}: TaskFiltersProps) {
  const update = (patch: Partial<TaskListParams>) => onChange({ ...value, ...patch, page: 1 });
  const hasFilters = Boolean(
    value.query
    || value.pipelineId
    || value.companyId
    || value.ownerId
    || value.status
    || value.dueBucket,
  );

  return (
    <div className={cn('flex flex-wrap items-center gap-2', className)} data-testid="task-filters">
      <label className="relative min-w-[220px] flex-1 sm:max-w-xs">
        <span className="sr-only">Search tasks</span>
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-muted" aria-hidden="true" />
        <input
          type="search"
          aria-label="Search tasks"
          value={value.query ?? ''}
          onChange={(event) => update({ query: event.target.value || undefined })}
          placeholder="Search tasks"
          className="h-9 w-full rounded-lg border border-border-primary bg-background-secondary pl-9 pr-3 text-sm text-text-primary placeholder:text-text-muted focus:border-oak-primary focus:outline-none focus:ring-2 focus:ring-oak-primary/30"
        />
      </label>
      <select aria-label="Pipeline" value={value.pipelineId ?? ''} onChange={(event) => update({ pipelineId: event.target.value || undefined })} className={selectClassName}>
        <option value="">All pipelines</option>
        {pipelines.map((pipeline) => <option key={pipeline.id} value={pipeline.id}>{pipeline.name}</option>)}
      </select>
      <select aria-label="Company" value={value.companyId ?? ''} onChange={(event) => update({ companyId: event.target.value || undefined })} className={selectClassName}>
        <option value="">All companies</option>
        {companies.map((company) => <option key={company.id} value={company.id}>{company.name}</option>)}
      </select>
      <select aria-label="Owner" value={value.ownerId ?? ''} onChange={(event) => update({ ownerId: event.target.value || undefined })} className={selectClassName}>
        <option value="">All owners</option>
        {owners.map((owner) => <option key={owner.id} value={owner.id}>{`${owner.firstName} ${owner.lastName}`.trim() || owner.email}</option>)}
      </select>
      <select aria-label="Task status" value={value.status ?? ''} onChange={(event) => update({ status: event.target.value as TaskListParams['status'] || undefined })} className={selectClassName}>
        <option value="">All statuses</option>
        <option value="NOT_STARTED">Not started</option>
        <option value="IN_PROGRESS">In progress</option>
        <option value="PAUSED">Paused</option>
        <option value="COMPLETED">Completed</option>
        <option value="CANCELLED">Cancelled</option>
      </select>
      <select aria-label="Due" value={value.dueBucket ?? ''} onChange={(event) => update({ dueBucket: event.target.value as TaskListParams['dueBucket'] || undefined })} className={selectClassName}>
        <option value="">Any due date</option>
        <option value="overdue">Overdue</option>
        <option value="today">Today</option>
        <option value="thisWeek">This week</option>
        <option value="nextWeek">Next week</option>
      </select>
      {hasFilters ? (
        <Button
          variant="ghost"
          size="sm"
          leftIcon={<X />}
          onClick={() => onChange({})}
        >
          Clear
        </Button>
      ) : null}
    </div>
  );
}
