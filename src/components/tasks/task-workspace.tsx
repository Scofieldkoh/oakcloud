'use client';

import { useState } from 'react';
import Link from 'next/link';
import { ListChecks, Plus } from 'lucide-react';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { useCurrentWorkspaceUsers } from '@/hooks/use-admin';
import { useCompanies } from '@/hooks/use-companies';
import { useTaskPipelines } from '@/hooks/use-task-pipelines';
import {
  useArchiveTask,
  useCreateTask,
  useTaskStage,
  useTaskStageTransition,
  useTaskStatusMutation,
  useTasks,
  useUpdateTask,
  useUpdateTaskStage,
  type TaskListParams,
  type TaskStatusAction,
} from '@/hooks/use-tasks';
import type {
  TaskCreatePayload,
  TaskListItem,
  TaskStageSummary,
  TaskUpdatePayload,
} from '@/services/tasks/types';
import { TaskFilters } from './task-filters';
import { TaskFormModal } from './task-form-modal';
import { TaskList } from './task-list';
import { TaskStageModal } from './task-stage-modal';

interface SelectedStage {
  task: TaskListItem;
  stage: TaskStageSummary;
}

interface PendingConfirmation {
  task: TaskListItem;
  type: 'cancel' | 'archive';
}

export function TaskWorkspace() {
  const [filters, setFilters] = useState<TaskListParams>({ page: 1, limit: 20 });
  const [formMode, setFormMode] = useState<'create' | 'edit' | null>(null);
  const [editingTask, setEditingTask] = useState<TaskListItem | null>(null);
  const [selectedStage, setSelectedStage] = useState<SelectedStage | null>(null);
  const [confirmation, setConfirmation] = useState<PendingConfirmation | null>(null);

  const taskQuery = useTasks(filters);
  const pipelineQuery = useTaskPipelines();
  const companyQuery = useCompanies({ limit: 200, sortBy: 'name', sortOrder: 'asc' });
  const ownerQuery = useCurrentWorkspaceUsers({ limit: 200, sortBy: 'firstName', sortOrder: 'asc' });
  const createTask = useCreateTask();
  const updateTask = useUpdateTask();
  const archiveTask = useArchiveTask();
  const statusMutation = useTaskStatusMutation();
  const stageQuery = useTaskStage(
    selectedStage?.task.id ?? '',
    selectedStage?.stage.id ?? '',
  );
  const updateStage = useUpdateTaskStage();
  const transitionStage = useTaskStageTransition();

  const pipelines = pipelineQuery.data ?? [];
  const companies = companyQuery.data?.companies ?? [];
  const owners = ownerQuery.data?.users ?? [];
  const tasks = taskQuery.data?.tasks ?? [];
  const mutationError = (
    createTask.error
    || updateTask.error
    || archiveTask.error
    || statusMutation.error
    || updateStage.error
    || transitionStage.error
  );

  const closeForm = () => {
    if (createTask.isPending || updateTask.isPending) return;
    setFormMode(null);
    setEditingTask(null);
    createTask.reset();
    updateTask.reset();
  };

  const handleStatusAction = (task: TaskListItem, action: TaskStatusAction) => {
    if (action === 'cancel') {
      statusMutation.reset();
      setConfirmation({ task, type: 'cancel' });
      return;
    }
    statusMutation.mutate({ id: task.id, action });
  };

  const handleFormSubmit = async (payload: TaskCreatePayload | TaskUpdatePayload) => {
    if (formMode === 'create') {
      await createTask.mutateAsync(payload as TaskCreatePayload);
    } else if (editingTask) {
      await updateTask.mutateAsync({ id: editingTask.id, payload: payload as TaskUpdatePayload });
    }
    closeForm();
  };

  return (
    <div className="space-y-4" data-testid="task-workspace">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl font-semibold text-text-primary sm:text-2xl">Tasks</h1>
          <p className="mt-1 text-sm text-text-secondary">Track work through reusable pipelines and open each stage in context.</p>
        </div>
        <div className="flex items-center gap-2">
          <Link
            href="/pipelines"
            className="inline-flex min-h-10 items-center justify-center gap-2 rounded-lg border border-border-primary bg-background-elevated px-4 text-sm font-medium text-text-primary transition-colors hover:bg-background-tertiary sm:min-h-8"
          >
            <ListChecks className="h-4 w-4" aria-hidden="true" />
            Manage pipelines
          </Link>
          <Button
            leftIcon={<Plus />}
            onClick={() => {
              createTask.reset();
              setEditingTask(null);
              setFormMode('create');
            }}
          >
            Create task
          </Button>
        </div>
      </div>

      <TaskFilters
        value={filters}
        pipelines={pipelines}
        companies={companies}
        owners={owners}
        onChange={setFilters}
      />

      {mutationError && !formMode ? (
        <Alert
          variant="error"
          title="Task action failed"
          onClose={() => {
            createTask.reset();
            updateTask.reset();
            archiveTask.reset();
            statusMutation.reset();
            updateStage.reset();
            transitionStage.reset();
          }}
        >
          {mutationError.message}
        </Alert>
      ) : null}

      {taskQuery.isLoading ? (
        <div className="card p-6 text-sm text-text-secondary" role="status">Loading tasks…</div>
      ) : taskQuery.error ? (
        <Alert variant="error">{taskQuery.error.message}</Alert>
      ) : tasks.length === 0 ? (
        <div className="card p-6 text-center sm:p-12">
          <ListChecks className="mx-auto mb-3 h-10 w-10 text-text-muted" aria-hidden="true" />
          <h2 className="text-lg font-semibold text-text-primary">No tasks found</h2>
          <p className="mt-1 text-sm text-text-secondary">Create a task or adjust the filters.</p>
        </div>
      ) : (
        <TaskList
          tasks={tasks}
          onSelectStage={(task, stage) => {
            updateStage.reset();
            transitionStage.reset();
            setSelectedStage({ task, stage });
          }}
          onEdit={(task) => {
            updateTask.reset();
            setEditingTask(task);
            setFormMode('edit');
          }}
          onStatusAction={handleStatusAction}
          onArchive={(task) => {
            archiveTask.reset();
            setConfirmation({ task, type: 'archive' });
          }}
          busyTaskId={statusMutation.isPending ? statusMutation.variables?.id ?? null : null}
        />
      )}

      {taskQuery.data && taskQuery.data.totalPages > 1 ? (
        <div className="flex items-center justify-between text-xs text-text-secondary">
          <span>Page {taskQuery.data.page} of {taskQuery.data.totalPages}</span>
          <div className="flex gap-2">
            <Button variant="secondary" size="xs" disabled={taskQuery.data.page <= 1} onClick={() => setFilters((current) => ({ ...current, page: Math.max(1, (current.page ?? 1) - 1) }))}>Previous</Button>
            <Button variant="secondary" size="xs" disabled={taskQuery.data.page >= taskQuery.data.totalPages} onClick={() => setFilters((current) => ({ ...current, page: (current.page ?? 1) + 1 }))}>Next</Button>
          </div>
        </div>
      ) : null}

      <TaskFormModal
        isOpen={Boolean(formMode)}
        mode={formMode ?? 'create'}
        pipelines={pipelines}
        companies={companies}
        owners={owners}
        initialTask={editingTask}
        onClose={closeForm}
        onSubmit={handleFormSubmit}
        isSubmitting={createTask.isPending || updateTask.isPending}
        error={(formMode === 'create' ? createTask.error : updateTask.error) ?? null}
      />

      <TaskStageModal
        isOpen={Boolean(selectedStage)}
        stage={stageQuery.data}
        isLoading={stageQuery.isLoading}
        error={stageQuery.error ?? updateStage.error ?? transitionStage.error ?? null}
        onClose={() => {
          updateStage.reset();
          transitionStage.reset();
          setSelectedStage(null);
        }}
        onUpdateMetadata={async (payload) => {
          if (!selectedStage) return;
          await updateStage.mutateAsync({
            taskId: selectedStage.task.id,
            stageId: selectedStage.stage.id,
            payload,
          });
        }}
        onTransition={async (transition) => {
          if (!selectedStage) return;
          await transitionStage.mutateAsync({
            taskId: selectedStage.task.id,
            stageId: selectedStage.stage.id,
            transition,
          });
        }}
        isMutating={updateStage.isPending || transitionStage.isPending}
      />

      <ConfirmDialog
        isOpen={confirmation?.type === 'cancel'}
        onClose={() => {
          statusMutation.reset();
          setConfirmation(null);
        }}
        onConfirm={async () => {
          if (!confirmation) return;
          await statusMutation.mutateAsync({ id: confirmation.task.id, action: 'cancel' });
          setConfirmation(null);
        }}
        title="Cancel task?"
        description="The task remains available for inspection but cannot continue."
        confirmLabel="Cancel task"
        variant="warning"
        isLoading={statusMutation.isPending}
      >
        {statusMutation.error ? (
          <Alert variant="error" title="Cancellation failed">
            {statusMutation.error.message}
          </Alert>
        ) : null}
      </ConfirmDialog>

      <ConfirmDialog
        isOpen={confirmation?.type === 'archive'}
        onClose={() => {
          archiveTask.reset();
          setConfirmation(null);
        }}
        onConfirm={async (reason) => {
          if (!confirmation || !reason) return;
          await archiveTask.mutateAsync({ id: confirmation.task.id, reason });
          setConfirmation(null);
        }}
        title="Delete task?"
        description="This soft-deletes the task and preserves its audit history."
        confirmLabel="Delete task"
        requireReason
        reasonMinLength={1}
        isLoading={archiveTask.isPending}
      >
        {archiveTask.error ? (
          <Alert variant="error" title="Delete failed">
            {archiveTask.error.message}
          </Alert>
        ) : null}
      </ConfirmDialog>
    </div>
  );
}
