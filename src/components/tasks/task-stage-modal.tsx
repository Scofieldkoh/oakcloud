'use client';

import { useEffect, useMemo, useState } from 'react';
import { AlertCircle, ArrowUpRight, CheckCircle2, Circle, Clock3, Link2, UserRound } from 'lucide-react';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Modal, ModalBody, ModalFooter } from '@/components/ui/modal';
import { cn } from '@/lib/utils';
import { withTaskLaunchContext } from '@/lib/task-launch-context';
import type { TaskStageTransition } from '@/hooks/use-tasks';
import type { TaskStageDetail } from '@/services/tasks/types';
import { formatTaskStageStatus } from './task-stage-pipeline';

interface TaskStageModalProps {
  isOpen: boolean;
  stage?: TaskStageDetail | null;
  isLoading?: boolean;
  error?: Error | null;
  onClose: () => void;
  onUpdateMetadata: (payload: { notes?: string | null; assigneeId?: string | null }) => void | Promise<void>;
  onTransition: (transition: TaskStageTransition) => void | Promise<void>;
  isMutating?: boolean;
  companies?: Array<{ id: string; name: string }>;
  taskCompanyId?: string | null;
}

function dateTimeLabel(value: string | null) {
  if (!value) return 'Not recorded';
  return new Intl.DateTimeFormat('en-SG', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(new Date(value));
}

function launchHref(stage: TaskStageDetail) {
  if (!stage.launch.href) return null;
  return withTaskLaunchContext(stage.launch.href, {
    ...stage.launch.context,
    returnTo: stage.launch.context.returnTo ?? '/tasks',
  });
}

function primaryActionLabel(stage: TaskStageDetail) {
  if (stage.actionType === 'MANUAL' || stage.status === 'SKIPPED') {
    return stage.status === 'COMPLETED' || stage.status === 'SKIPPED'
      ? 'Reopen stage'
      : 'Complete stage';
  }
  return {
    COMPANY_PROFILE: 'Create company',
    DOCUMENT_GENERATION: 'Open document generator',
    ESIGNING: 'Open e-signing workspace',
  }[stage.actionType];
}

export function TaskStageModal({
  isOpen,
  stage,
  isLoading = false,
  error,
  onClose,
  onUpdateMetadata,
  onTransition,
  isMutating = false,
  companies = [],
  taskCompanyId,
}: TaskStageModalProps) {
  const [notes, setNotes] = useState('');
  const [showSkip, setShowSkip] = useState(false);
  const [skipReason, setSkipReason] = useState('');
  const [skipError, setSkipError] = useState('');
  const [selectedCompanyId, setSelectedCompanyId] = useState('');

  useEffect(() => {
    setNotes(stage?.notes ?? '');
    setShowSkip(false);
    setSkipReason('');
    setSkipError('');
    setSelectedCompanyId(taskCompanyId ?? '');
  }, [stage?.id, stage?.isRequired, stage?.notes, taskCompanyId]);

  const resolvedLaunchHref = useMemo(() => stage ? launchHref(stage) : null, [stage]);
  const canCreateCompany = stage?.actionType === 'COMPANY_PROFILE'
    && resolvedLaunchHref?.startsWith('/companies/new');

  if (!isOpen) return null;

  const runAction = (action: () => void | Promise<void>) => {
    try {
      void Promise.resolve(action()).catch(() => undefined);
    } catch {
      // The owning workspace supplies the recoverable mutation error.
    }
  };

  const renderPrimaryAction = () => {
    if (!stage) return null;
    const label = primaryActionLabel(stage);
    const isBlocked = stage.blockers.length > 0;

    if (stage.status === 'SKIPPED' || (
      stage.actionType === 'MANUAL' && stage.status === 'COMPLETED'
    )) {
      return (
        <Button
          data-testid="stage-primary-action"
          onClick={() => runAction(() => onTransition({ action: 'reopen' }))}
          isLoading={isMutating}
          leftIcon={<CheckCircle2 />}
        >
          {label}
        </Button>
      );
    }
    if (stage.actionType === 'MANUAL') {
      return (
        <Button
          data-testid="stage-primary-action"
          onClick={() => runAction(() => onTransition({ action: 'complete' }))}
          disabled={isBlocked}
          isLoading={isMutating}
          leftIcon={<CheckCircle2 />}
        >
          {label}
        </Button>
      );
    }
    if (stage.actionType === 'COMPANY_PROFILE' && selectedCompanyId) {
      return (
        <Button
          data-testid="stage-primary-action"
          onClick={() => runAction(() => onTransition({
            action: 'linkOutcome',
            outcome: { type: 'COMPANY', companyId: selectedCompanyId },
          }))}
          isLoading={isMutating}
          leftIcon={<Link2 />}
        >
          Link selected company
        </Button>
      );
    }
    if (stage.actionType === 'COMPANY_PROFILE' && !canCreateCompany) {
      return (
        <Button
          data-testid="stage-primary-action"
          disabled
          leftIcon={<Link2 />}
        >
          Select an existing company
        </Button>
      );
    }
    if (isBlocked || !resolvedLaunchHref) {
      return (
        <Button
          data-testid="stage-primary-action"
          disabled
          leftIcon={<ArrowUpRight />}
        >
          {label}
        </Button>
      );
    }
    return (
      <a
        data-testid="stage-primary-action"
        href={resolvedLaunchHref}
        className="inline-flex min-h-10 items-center justify-center gap-2 rounded-lg bg-oak-primary px-5 text-sm font-medium text-white transition-colors hover:bg-oak-dark focus:outline-none focus-visible:ring-2 focus-visible:ring-oak-primary/30 focus-visible:ring-offset-2"
      >
        <ArrowUpRight className="h-4 w-4" aria-hidden="true" />
        {label}
      </a>
    );
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={stage?.name ?? 'Stage details'}
      description={stage ? formatTaskStageStatus(stage.status) : undefined}
      size="xl"
      className="max-h-[calc(100vh-2rem)] overflow-y-auto"
      closeOnOverlayClick={!isMutating}
      closeOnEscape={!isMutating}
    >
      <ModalBody className="space-y-5">
        {isLoading ? <div role="status" className="py-8 text-center text-sm text-text-secondary">Loading stage…</div> : null}
        {error ? <Alert variant="error">{error.message}</Alert> : null}
        {stage ? (
          <>
            <section>
              <h3 className="mb-2 text-sm font-semibold text-text-primary">Overview</h3>
              <p className="text-sm text-text-secondary">{stage.description || 'No description provided.'}</p>
              <div className="mt-3 grid grid-cols-1 gap-3 rounded-lg border border-border-primary bg-background-primary p-3 text-sm sm:grid-cols-2">
                <div className="flex items-start gap-2">
                  <UserRound className="mt-0.5 h-4 w-4 text-text-muted" aria-hidden="true" />
                  <div><span className="block text-xs text-text-muted">Assignee</span><span className="text-text-primary">{stage.assignee ? `${stage.assignee.firstName} ${stage.assignee.lastName}`.trim() || stage.assignee.email : 'Unassigned'}</span></div>
                </div>
                <div className="flex items-start gap-2">
                  <Clock3 className="mt-0.5 h-4 w-4 text-text-muted" aria-hidden="true" />
                  <div><span className="block text-xs text-text-muted">Started</span><span className="text-text-primary">{dateTimeLabel(stage.startedAt)}</span></div>
                </div>
                <div className="flex items-start gap-2">
                  <CheckCircle2 className="mt-0.5 h-4 w-4 text-text-muted" aria-hidden="true" />
                  <div><span className="block text-xs text-text-muted">Completed</span><span className="text-text-primary">{dateTimeLabel(stage.completedAt)}</span></div>
                </div>
                <div className="flex items-start gap-2">
                  <Link2 className="mt-0.5 h-4 w-4 text-text-muted" aria-hidden="true" />
                  <div><span className="block text-xs text-text-muted">Outcome</span><span className="text-text-primary">{stage.outcomeSummary || 'No linked outcome yet.'}</span></div>
                </div>
              </div>
            </section>

            {stage.actionType === 'COMPANY_PROFILE' && stage.status !== 'SKIPPED' ? (
              <section>
                <label
                  htmlFor="task-stage-company"
                  className="mb-2 block text-sm font-semibold text-text-primary"
                >
                  Existing company
                </label>
                <select
                  id="task-stage-company"
                  value={selectedCompanyId}
                  onChange={(event) => setSelectedCompanyId(event.target.value)}
                  disabled={isMutating}
                  className="input input-sm w-full"
                >
                  <option value="">
                    {canCreateCompany
                      ? 'Create a new company'
                      : 'Select a company'}
                  </option>
                  {companies.map((company) => (
                    <option key={company.id} value={company.id}>{company.name}</option>
                  ))}
                </select>
                <p className="mt-1 text-xs text-text-muted">
                  {canCreateCompany
                    ? 'Select an existing company to link it, or continue to create a new one.'
                    : 'Select an existing company to link it to this task.'}
                </p>
              </section>
            ) : null}

            {stage.checklistItems.length > 0 ? (
              <section>
                <h3 className="mb-2 text-sm font-semibold text-text-primary">Checklist</h3>
                <div className="space-y-1 rounded-lg border border-border-primary">
                  {stage.checklistItems.map((item) => (
                    <label key={item.id} className="flex min-h-11 items-center gap-3 border-b border-border-primary px-3 py-2 last:border-b-0">
                      <input
                        type="checkbox"
                        checked={item.isCompleted}
                        onChange={(event) => runAction(() => onTransition({ action: 'checklist', checklistItemId: item.id, isCompleted: event.target.checked }))}
                        disabled={isMutating}
                        className="h-4 w-4 rounded border-border-secondary text-oak-primary focus:ring-oak-primary"
                      />
                      {item.isCompleted ? <CheckCircle2 className="h-4 w-4 text-emerald-600" aria-hidden="true" /> : <Circle className="h-4 w-4 text-text-muted" aria-hidden="true" />}
                      <span className={cn('text-sm', item.isCompleted ? 'text-text-secondary line-through' : 'text-text-primary')}>{item.label}</span>
                    </label>
                  ))}
                </div>
              </section>
            ) : null}

            <section>
              <label htmlFor="task-stage-notes" className="mb-2 block text-sm font-semibold text-text-primary">Notes</label>
              <textarea
                id="task-stage-notes"
                aria-label="Notes"
                value={notes}
                onChange={(event) => setNotes(event.target.value)}
                rows={3}
                maxLength={5000}
                className="input w-full resize-y px-3 py-2 text-sm"
              />
              <div className="mt-2 flex justify-end">
                <Button
                  variant="secondary"
                  size="xs"
                  onClick={() => runAction(() => onUpdateMetadata({ notes: notes.trim() || null }))}
                  disabled={isMutating || notes === (stage.notes ?? '')}
                >
                  Save notes
                </Button>
              </div>
            </section>

            {stage.blockers.length > 0 ? (
              <Alert variant="warning" title="Action blocked">
                <ul className="list-disc space-y-1 pl-4">
                  {stage.blockers.map((blocker) => <li key={blocker.code}>{blocker.message}</li>)}
                </ul>
              </Alert>
            ) : null}

            {!stage.isRequired && !['COMPLETED', 'SKIPPED'].includes(stage.status) ? (
              <section className="rounded-lg border border-dashed border-border-secondary p-3">
                {!showSkip ? (
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-xs text-text-secondary">This stage is optional.</p>
                    <Button variant="ghost" size="xs" onClick={() => setShowSkip(true)}>Skip stage</Button>
                  </div>
                ) : (
                  <div className="space-y-2">
                    <label htmlFor="stage-skip-reason" className="block text-xs font-medium text-text-secondary">Skip reason</label>
                    <textarea
                      id="stage-skip-reason"
                      aria-label="Skip reason"
                      value={skipReason}
                      onChange={(event) => {
                        setSkipReason(event.target.value);
                        if (skipError) setSkipError('');
                      }}
                      rows={2}
                      className="input w-full resize-y px-3 py-2 text-sm"
                    />
                    {skipError ? <p className="text-xs text-red-500">{skipError}</p> : null}
                    <div className="flex justify-end gap-2">
                      <Button variant="ghost" size="xs" onClick={() => setShowSkip(false)}>Keep stage</Button>
                      <Button
                        variant="secondary"
                        size="xs"
                        onClick={() => {
                          if (!skipReason.trim()) {
                            setSkipError('Skip reason is required');
                            return;
                          }
                          runAction(() => onTransition({ action: 'skip', reason: skipReason.trim() }));
                        }}
                      >
                        Confirm skip
                      </Button>
                    </div>
                  </div>
                )}
              </section>
            ) : null}
          </>
        ) : null}
      </ModalBody>
      {stage ? (
        <ModalFooter>
          <span className="mr-auto flex items-center gap-1.5 text-xs text-text-muted">
            {stage.isRequired ? <AlertCircle className="h-3.5 w-3.5" aria-hidden="true" /> : null}
            {stage.isRequired ? 'Required stage' : 'Optional stage'}
          </span>
          {renderPrimaryAction()}
        </ModalFooter>
      ) : null}
    </Modal>
  );
}
