'use client';

import { CalendarDays, Edit3, Pause, Play, Trash2, XCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { MobileCard, CardDetailsGrid, CardDetailItem } from '@/components/ui/responsive-table';
import { cn } from '@/lib/utils';
import type { TaskStatusAction } from '@/hooks/use-tasks';
import type { TaskListItem, TaskStageSummary, TaskStatus } from '@/services/tasks/types';
import { TaskStagePipeline } from './task-stage-pipeline';

interface TaskListProps {
  tasks: TaskListItem[];
  onSelectStage: (task: TaskListItem, stage: TaskStageSummary) => void;
  onEdit: (task: TaskListItem) => void;
  onStatusAction: (task: TaskListItem, action: TaskStatusAction) => void;
  onArchive: (task: TaskListItem) => void;
  busyTaskId?: string | null;
}

const taskStatusClasses: Record<TaskStatus, string> = {
  NOT_STARTED: 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300',
  IN_PROGRESS: 'bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300',
  PAUSED: 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300',
  COMPLETED: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300',
  CANCELLED: 'bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300',
};

function taskStatusLabel(status: TaskStatus) {
  return {
    NOT_STARTED: 'Not started',
    IN_PROGRESS: 'In progress',
    PAUSED: 'Paused',
    COMPLETED: 'Completed',
    CANCELLED: 'Cancelled',
  }[status];
}

function dueDateLabel(value: string | null) {
  if (!value) return { date: 'No due date', detail: 'Unscheduled' };
  const date = new Date(value);
  const dueDay = value.slice(0, 10);
  const todayParts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Singapore',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date());
  const todayValue = (type: 'year' | 'month' | 'day') => (
    todayParts.find((part) => part.type === type)?.value ?? ''
  );
  const today = `${todayValue('year')}-${todayValue('month')}-${todayValue('day')}`;
  return {
    date: new Intl.DateTimeFormat('en-SG', {
      timeZone: 'Asia/Singapore',
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    }).format(date),
    detail: dueDay < today ? 'Overdue' : dueDay === today ? 'Today' : 'Scheduled',
  };
}

function Owner({ task }: { task: TaskListItem }) {
  if (!task.owner) return <span className="text-text-muted">Unassigned</span>;
  const name = `${task.owner.firstName} ${task.owner.lastName}`.trim();
  const initials = `${task.owner.firstName[0] ?? ''}${task.owner.lastName[0] ?? ''}`.toUpperCase();
  return (
    <div className="flex items-center gap-2" title={name || task.owner.email}>
      <span className="flex h-7 w-7 items-center justify-center rounded-full bg-emerald-50 text-xs font-semibold text-oak-primary dark:bg-oak-primary/20">{initials || '?'}</span>
      <span className="max-w-[120px] truncate text-sm text-text-secondary">{name || task.owner.email}</span>
    </div>
  );
}

interface TaskActionsProps extends Omit<TaskListProps, 'tasks' | 'onSelectStage'> {
  task: TaskListItem;
}

function TaskActions({
  task,
  onEdit,
  onStatusAction,
  onArchive,
  busyTaskId,
}: TaskActionsProps) {
  const disabled = busyTaskId === task.id;
  const canTransition = !['COMPLETED', 'CANCELLED'].includes(task.status);
  const statusAction = task.status === 'PAUSED' ? 'resume' : 'pause';
  const StatusIcon = statusAction === 'resume' ? Play : Pause;
  const statusLabel = statusAction === 'resume' ? 'Resume' : 'Pause';

  return (
    <div className="flex items-center justify-end gap-0.5">
      <Button variant="ghost" size="xs" iconOnly aria-label={`Edit ${task.title}`} title="Edit metadata" onClick={() => onEdit(task)} disabled={disabled} leftIcon={<Edit3 />} />
      {canTransition ? (
        <Button variant="ghost" size="xs" iconOnly aria-label={`${statusLabel} ${task.title}`} title={statusLabel} onClick={() => onStatusAction(task, statusAction)} disabled={disabled} leftIcon={<StatusIcon />} />
      ) : null}
      {canTransition ? (
        <Button variant="ghost" size="xs" iconOnly aria-label={`Cancel ${task.title}`} title="Cancel" onClick={() => onStatusAction(task, 'cancel')} disabled={disabled} leftIcon={<XCircle />} />
      ) : null}
      <Button variant="ghost" size="xs" iconOnly aria-label={`Delete ${task.title}`} title="Delete" onClick={() => onArchive(task)} disabled={disabled} leftIcon={<Trash2 />} />
    </div>
  );
}

export function TaskList({
  tasks,
  onSelectStage,
  onEdit,
  onStatusAction,
  onArchive,
  busyTaskId,
}: TaskListProps) {
  return (
    <div data-testid="task-list">
      <div className="space-y-3 md:hidden">
        {tasks.map((task) => {
          const due = dueDateLabel(task.dueDate);
          return (
            <div key={task.id} data-testid="task-mobile-card" className="md:hidden">
              <MobileCard
                className="p-3"
                title={task.title}
                subtitle={task.pipelineVersion.pipeline.name}
                badge={<span className={cn('rounded-full px-2 py-0.5 text-xs font-medium', taskStatusClasses[task.status])}>{taskStatusLabel(task.status)}</span>}
                actions={<TaskActions task={task} onEdit={onEdit} onStatusAction={onStatusAction} onArchive={onArchive} busyTaskId={busyTaskId} />}
                details={(
                  <div className="space-y-3">
                    <CardDetailsGrid>
                      <CardDetailItem label="Company" value={task.company?.name ?? 'Not linked'} />
                      <CardDetailItem label="Owner" value={task.owner ? `${task.owner.firstName} ${task.owner.lastName}`.trim() : 'Unassigned'} />
                      <CardDetailItem label="Due" value={due.date} icon={<CalendarDays className="h-3.5 w-3.5" />} fullWidth />
                    </CardDetailsGrid>
                    <div className="border-t border-border-primary pt-3">
                      <span className="mb-2 block text-xs font-medium text-text-muted">Stages</span>
                      <div className="overflow-x-auto pb-1">
                        <TaskStagePipeline stages={task.stages} onSelectStage={(stage) => onSelectStage(task, stage)} />
                      </div>
                    </div>
                  </div>
                )}
              />
            </div>
          );
        })}
      </div>

      <div
        data-testid="task-table-scroll"
        className="hidden overflow-x-auto rounded-lg border border-border-primary bg-background-secondary md:block"
      >
        <table className="table min-w-[980px]">
          <thead>
            <tr>
              {['Company', 'Task', 'Stages', 'Owner', 'Due', 'Actions'].map((header) => <th key={header}>{header}</th>)}
            </tr>
          </thead>
          <tbody>
            {tasks.map((task) => {
              const due = dueDateLabel(task.dueDate);
              return (
                <tr key={task.id}>
                  <td className="max-w-[180px] truncate">{task.company?.name ?? <span className="text-text-muted">Not linked</span>}</td>
                  <td>
                    <div className="min-w-[180px]">
                      <p className="font-medium text-text-primary">{task.title}</p>
                      <div className="mt-0.5 flex items-center gap-2">
                        <span className="text-xs text-text-muted">{task.pipelineVersion.pipeline.name}</span>
                        <span className={cn('rounded-full px-1.5 py-0.5 text-[11px] font-medium', taskStatusClasses[task.status])}>{taskStatusLabel(task.status)}</span>
                      </div>
                    </div>
                  </td>
                  <td data-testid="task-stage-cell" className="min-w-[300px] whitespace-nowrap">
                    <TaskStagePipeline stages={task.stages} onSelectStage={(stage) => onSelectStage(task, stage)} />
                  </td>
                  <td><Owner task={task} /></td>
                  <td>
                    <div className="min-w-[110px]">
                      <p className="text-sm font-medium text-text-primary">{due.date}</p>
                      <p className={cn('text-xs', due.detail === 'Overdue' ? 'text-red-600' : 'text-text-muted')}>{due.detail}</p>
                    </div>
                  </td>
                  <td className="w-[140px]">
                    <TaskActions task={task} onEdit={onEdit} onStatusAction={onStatusAction} onArchive={onArchive} busyTaskId={busyTaskId} />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
