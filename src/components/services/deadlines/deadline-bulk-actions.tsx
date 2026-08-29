'use client';

import { useState } from 'react';
import { CalendarClock, CheckCircle, CircleOff } from 'lucide-react';
import { BulkActionsToolbar, type BulkAction } from '@/components/ui/bulk-actions-toolbar';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { Modal, ModalBody, ModalFooter } from '@/components/ui/modal';
import { Button } from '@/components/ui/button';
import type { UpdateDeadlineOccurrenceInput } from '@/lib/validations/deadline';
import type { DeadlineOccurrenceDto } from '@/services/deadline';

type DeadlineBulkActionId = 'complete' | 'waive' | 'override';

interface DeadlineBulkActionsProps {
  selected: DeadlineOccurrenceDto[];
  onClearSelection: () => void;
  onUpdate: (occurrence: DeadlineOccurrenceDto, data: UpdateDeadlineOccurrenceInput) => Promise<unknown>;
}

function itemLabel(count: number): string {
  return `${count} deadline${count === 1 ? '' : 's'}`;
}

export function DeadlineBulkActions({ selected, onClearSelection, onUpdate }: DeadlineBulkActionsProps) {
  const [activeAction, setActiveAction] = useState<DeadlineBulkActionId | null>(null);
  const [overrideDate, setOverrideDate] = useState('');
  const [overrideReason, setOverrideReason] = useState('');
  const [overrideError, setOverrideError] = useState('');
  const [bulkPending, setBulkPending] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);

  const selectedOpenOnly = selected.length > 0 && selected.every((occurrence) => occurrence.status === 'OPEN');
  const selectedNonCancelled = selected.length > 0 && selected.every((occurrence) => occurrence.status !== 'CANCELLED');

  const runBulkUpdate = async (
    dataForOccurrence: (occurrence: DeadlineOccurrenceDto) => UpdateDeadlineOccurrenceInput,
  ): Promise<boolean> => {
    setBulkPending(true);
    setFeedback(null);
    const results = await Promise.allSettled(selected.map(async (occurrence) => onUpdate(occurrence, dataForOccurrence(occurrence))));
    const failed = results.filter((result) => result.status === 'rejected').length;
    const succeeded = results.length - failed;
    setFeedback(failed === 0
      ? `${succeeded} deadline${succeeded === 1 ? '' : 's'} updated successfully.`
      : `${succeeded} deadline${succeeded === 1 ? '' : 's'} updated; ${failed} failed. Review and retry the failed rows.`);
    setBulkPending(false);
    if (failed === 0) onClearSelection();
    return failed === 0;
  };

  const confirmComplete = async () => {
    await runBulkUpdate((occurrence) => ({ expectedUpdatedAt: occurrence.updatedAt, status: 'COMPLETED' }));
    setActiveAction(null);
  };

  const confirmWaive = async (reason?: string) => {
    await runBulkUpdate((occurrence) => ({ expectedUpdatedAt: occurrence.updatedAt, status: 'WAIVED', reason: reason! }));
    setActiveAction(null);
  };

  const submitOverride = async () => {
    if (!overrideDate) {
      setOverrideError('A new operative date is required');
      return;
    }
    if (!overrideReason.trim()) {
      setOverrideError('A reason is required');
      return;
    }
    const succeeded = await runBulkUpdate((occurrence) => ({
      expectedUpdatedAt: occurrence.updatedAt,
      operativeDueDate: overrideDate,
      reason: overrideReason.trim(),
    }));
    if (succeeded) {
      setActiveAction(null);
      setOverrideDate('');
      setOverrideReason('');
      setOverrideError('');
    }
  };

  const openOverride = () => {
    setOverrideDate(selected[0]?.operativeDueDate ?? '');
    setOverrideReason('');
    setOverrideError('');
    setFeedback(null);
    setActiveAction('override');
  };

  const actions: BulkAction[] = [
    {
      id: 'complete',
      label: 'Mark complete',
      icon: CheckCircle,
      description: selectedOpenOnly ? 'Mark selected open deadlines complete' : 'Only open deadlines can be marked complete',
      disabled: !selectedOpenOnly,
    },
    {
      id: 'waive',
      label: 'Waive',
      icon: CircleOff,
      variant: 'warning',
      description: selectedOpenOnly ? 'Waive selected open deadlines' : 'Only open deadlines can be waived',
      disabled: !selectedOpenOnly,
    },
    {
      id: 'override',
      label: 'Override date',
      icon: CalendarClock,
      description: selectedNonCancelled ? 'Override the operative date for selected deadlines' : 'Cancelled deadlines cannot be overridden',
      disabled: !selectedNonCancelled,
    },
  ];

  const handleAction = (actionId: string) => {
    setFeedback(null);
    if (actionId === 'complete') setActiveAction('complete');
    if (actionId === 'waive') setActiveAction('waive');
    if (actionId === 'override') openOverride();
  };

  return (
    <>
      {selected.length > 0 ? (
        <div role="region" aria-label="Deadline bulk actions">
          <BulkActionsToolbar
            selectedCount={selected.length}
            onClearSelection={onClearSelection}
            actions={actions.map((action) => ({ ...action, isLoading: bulkPending }))}
            onAction={handleAction}
          />
        </div>
      ) : null}
      {feedback ? <div role="status" className="rounded-lg border border-border-primary bg-background-secondary px-3 py-2 text-sm text-text-secondary">{feedback}</div> : null}
      <ConfirmDialog
        isOpen={activeAction === 'complete'}
        onClose={() => setActiveAction(null)}
        onConfirm={confirmComplete}
        title={`Mark ${itemLabel(selected.length)} complete`}
        description={`This will mark ${itemLabel(selected.length)} as completed.`}
        confirmLabel="Mark complete"
        variant="info"
        isLoading={bulkPending}
      />
      <ConfirmDialog
        isOpen={activeAction === 'waive'}
        onClose={() => setActiveAction(null)}
        onConfirm={confirmWaive}
        title={`Waive ${itemLabel(selected.length)}`}
        description={`Provide one reason for waiving ${itemLabel(selected.length)}.`}
        confirmLabel="Waive deadline"
        variant="warning"
        requireReason
        reasonMinLength={1}
        reasonPlaceholder="Why are these deadlines being waived?"
        isLoading={bulkPending}
      />
      <Modal
        isOpen={activeAction === 'override'}
        onClose={() => setActiveAction(null)}
        title={`Override ${itemLabel(selected.length)} date`}
        description={`Apply one operative date and reason to ${itemLabel(selected.length)}.`}
        size="sm"
      >
        <ModalBody className="space-y-3">
          <label className="block text-sm text-text-secondary">
            New operative date
            <input
              type="date"
              value={overrideDate}
              onChange={(event) => { setOverrideDate(event.target.value); setOverrideError(''); }}
              className="input input-sm mt-1 min-h-11 w-full"
            />
          </label>
          <label className="block text-sm text-text-secondary">
            Reason
            <textarea
              value={overrideReason}
              onChange={(event) => { setOverrideReason(event.target.value); setOverrideError(''); }}
              rows={3}
              className="input input-sm mt-1 w-full py-2"
              placeholder="Why is the operative date changing?"
            />
          </label>
          {overrideError ? <p role="alert" className="text-sm text-status-error">{overrideError}</p> : null}
        </ModalBody>
        <ModalFooter>
          <Button type="button" variant="secondary" size="sm" onClick={() => setActiveAction(null)} disabled={bulkPending}>Cancel</Button>
          <Button type="button" variant="primary" size="sm" onClick={() => void submitOverride()} isLoading={bulkPending}>Override date</Button>
        </ModalFooter>
      </Modal>
    </>
  );
}
