'use client';

import { useMemo, useState } from 'react';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Modal, ModalBody, ModalFooter } from '@/components/ui/modal';
import { ScheduleEntryEditor } from '@/components/services/shared/schedule-entry-editor';
import type { ScheduleEntryInput } from '@/lib/validations/service-schedule';
import type { ManualDeadlineCyclePreview } from '@/services/deadline/manual-cycle';

type ParameterRow = { key: string; value: string };
type JsonValue = string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue };

export interface ManualCycleDialogProps {
  isOpen: boolean;
  clientServiceId: string;
  onClose: () => void;
  onApplied?: () => void;
  canApply?: boolean;
}

const INITIAL_PARAMETERS: ParameterRow[] = [{ key: '', value: '' }];

function parseJsonObject(value: string, label: string): Record<string, JsonValue> {
  if (!value.trim()) return {};
  const parsed: unknown = JSON.parse(value);
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error(`${label} must be a JSON object.`);
  }
  return parsed as Record<string, JsonValue>;
}

function parametersFromRows(rows: ParameterRow[]): Record<string, JsonValue> {
  const result: Record<string, JsonValue> = {};
  for (const row of rows) {
    const key = row.key.trim();
    if (!key) continue;
    const value = row.value.trim();
    if (!value) {
      result[key] = '';
      continue;
    }
    try {
      result[key] = JSON.parse(value) as JsonValue;
    } catch {
      result[key] = value;
    }
  }
  return result;
}

function responseError(response: Response, fallback: string): Promise<Error> {
  return response.json().catch(() => null).then((body: unknown) => {
    if (body && typeof body === 'object' && 'message' in body && typeof body.message === 'string') {
      return new Error(body.message);
    }
    return new Error(fallback);
  });
}

export function ManualCycleDialog({
  isOpen,
  clientServiceId,
  onClose,
  onApplied,
  canApply = true,
}: ManualCycleDialogProps) {
  const [ruleVersionId, setRuleVersionId] = useState('');
  const [periodKey, setPeriodKey] = useState('');
  const [periodStart, setPeriodStart] = useState('');
  const [periodEnd, setPeriodEnd] = useState('');
  const [parameterRows, setParameterRows] = useState<ParameterRow[]>(INITIAL_PARAMETERS);
  const [scheduleEntries, setScheduleEntries] = useState<ScheduleEntryInput[]>([]);
  const [sourceValuesText, setSourceValuesText] = useState('');
  const [notes, setNotes] = useState('');
  const [preview, setPreview] = useState<ManualDeadlineCyclePreview | null>(null);
  const [includeByIdentity, setIncludeByIdentity] = useState<Record<string, boolean>>({});
  const [dateByIdentity, setDateByIdentity] = useState<Record<string, string>>({});
  const [statusByIdentity, setStatusByIdentity] = useState<Record<string, 'OPEN' | 'COMPLETED'>>({});
  const [completionDateByIdentity, setCompletionDateByIdentity] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<'preview' | 'apply' | null>(null);

  const identity = (milestone: { milestoneKey: string; scheduleEntryKey: string }) => `${milestone.milestoneKey}::${milestone.scheduleEntryKey}`;
  const hasRequiredInputs = Boolean(ruleVersionId.trim() && periodKey.trim() && periodStart && periodEnd);
  const previewBody = useMemo(() => ({
    ruleVersionId: ruleVersionId.trim(),
    periodKey: periodKey.trim(),
    periodStart,
    periodEnd,
    parameterOverrides: parametersFromRows(parameterRows),
    scheduleEntries,
    sourceValues: (() => {
      try {
        return parseJsonObject(sourceValuesText, 'Source values');
      } catch {
        return {};
      }
    })(),
  }), [parameterRows, periodEnd, periodKey, periodStart, ruleVersionId, scheduleEntries, sourceValuesText]);

  const invalidatePreview = () => {
    setPreview(null);
    setError(null);
  };

  const previewCycle = async () => {
    if (!hasRequiredInputs || busy) return;
    setBusy('preview');
    setError(null);
    try {
      const sourceValues = parseJsonObject(sourceValuesText, 'Source values');
      const response = await fetch(`/api/client-services/${clientServiceId}/deadline-cycles/preview`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ ...previewBody, sourceValues }),
      });
      if (!response.ok) throw await responseError(response, 'Unable to preview cycle.');
      const result = await response.json() as ManualDeadlineCyclePreview;
      setPreview(result);
      const includes: Record<string, boolean> = {};
      const dates: Record<string, string> = {};
      const statuses: Record<string, 'OPEN' | 'COMPLETED'> = {};
      const completionDates: Record<string, string> = {};
      for (const milestone of result.milestones) {
        const key = identity(milestone);
        includes[key] = true;
        dates[key] = milestone.operativeDueDate;
        statuses[key] = 'OPEN';
        completionDates[key] = '';
      }
      setIncludeByIdentity(includes);
      setDateByIdentity(dates);
      setStatusByIdentity(statuses);
      setCompletionDateByIdentity(completionDates);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to preview cycle.');
      setPreview(null);
    } finally {
      setBusy(null);
    }
  };

  const applyCycle = async () => {
    if (!preview || !canApply || busy) return;
    setBusy('apply');
    setError(null);
    try {
      const sourceValues = parseJsonObject(sourceValuesText, 'Source values');
      const selections = preview.milestones.map((milestone) => {
        const key = identity(milestone);
        const include = includeByIdentity[key] !== false;
        if (!include) return { milestoneKey: milestone.milestoneKey, scheduleEntryKey: milestone.scheduleEntryKey, include: false };
        const status = statusByIdentity[key] ?? 'OPEN';
        const completionDate = completionDateByIdentity[key]?.trim() || null;
        return {
          milestoneKey: milestone.milestoneKey,
          scheduleEntryKey: milestone.scheduleEntryKey,
          include: true,
          operativeDueDate: dateByIdentity[key] || milestone.operativeDueDate,
          status,
          completionDate: status === 'COMPLETED' ? completionDate : null,
        };
      });
      const response = await fetch(`/api/client-services/${clientServiceId}/deadline-cycles`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ ...previewBody, sourceValues, previewFingerprint: preview.previewFingerprint, notes: notes.trim() || null, selections }),
      });
      if (!response.ok) throw await responseError(response, 'Unable to apply cycle.');
      onApplied?.();
      onClose();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to apply cycle.');
    } finally {
      setBusy(null);
    }
  };

  const updateParameter = (index: number, patch: Partial<ParameterRow>) => {
    invalidatePreview();
    setParameterRows((rows) => rows.map((row, rowIndex) => rowIndex === index ? { ...row, ...patch } : row));
  };

  const addParameter = () => {
    invalidatePreview();
    setParameterRows((rows) => [...rows, { key: '', value: '' }]);
  };

  const removeParameter = (index: number) => {
    invalidatePreview();
    setParameterRows((rows) => rows.filter((_, rowIndex) => rowIndex !== index));
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Trigger historical deadline cycle"
      description="Preview the published rule against a historical period before creating a manual cycle."
      size="5xl"
      closeOnOverlayClick={!busy}
      closeOnEscape={!busy}
    >
      <ModalBody className="max-h-[72vh] space-y-5 overflow-y-auto">
        {error ? <Alert variant="error" title="Cycle unavailable">{error}</Alert> : null}
        <section className="space-y-3" aria-labelledby="manual-cycle-period-heading">
          <div>
            <h3 id="manual-cycle-period-heading" className="text-sm font-semibold text-text-primary">Rule and historical period</h3>
            <p className="mt-1 text-xs text-text-secondary">Only published rule versions and periods ending before today can be applied.</p>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <div className="lg:col-span-2">
              <label htmlFor="manual-cycle-rule-version" className="label">Rule version ID</label>
              <input id="manual-cycle-rule-version" className="input input-sm min-h-11 w-full" value={ruleVersionId} onChange={(event) => { invalidatePreview(); setRuleVersionId(event.target.value); }} placeholder="Published version UUID" />
            </div>
            <div>
              <label htmlFor="manual-cycle-period-key" className="label">Period key</label>
              <input id="manual-cycle-period-key" className="input input-sm min-h-11 w-full" value={periodKey} onChange={(event) => { invalidatePreview(); setPeriodKey(event.target.value); }} placeholder="FY2024" />
            </div>
            <div>
              <label htmlFor="manual-cycle-period-start" className="label">Period start</label>
              <input id="manual-cycle-period-start" type="date" className="input input-sm min-h-11 w-full" value={periodStart} onChange={(event) => { invalidatePreview(); setPeriodStart(event.target.value); }} />
            </div>
            <div>
              <label htmlFor="manual-cycle-period-end" className="label">Period end</label>
              <input id="manual-cycle-period-end" type="date" className="input input-sm min-h-11 w-full" value={periodEnd} onChange={(event) => { invalidatePreview(); setPeriodEnd(event.target.value); }} />
            </div>
          </div>
        </section>

        <section className="space-y-3" aria-labelledby="manual-cycle-inputs-heading">
          <div>
            <h3 id="manual-cycle-inputs-heading" className="text-sm font-semibold text-text-primary">Parameter overrides</h3>
            <p className="mt-1 text-xs text-text-secondary">Values are parsed as JSON when possible; plain text is retained as a string.</p>
          </div>
          <div className="space-y-2">
            {parameterRows.map((row, index) => (
              <div key={`parameter-${index}`} className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_minmax(0,2fr)_auto]">
                <label className="sr-only" htmlFor={`manual-cycle-parameter-key-${index}`}>Parameter key {index + 1}</label>
                <input id={`manual-cycle-parameter-key-${index}`} className="input input-sm min-h-11" value={row.key} onChange={(event) => updateParameter(index, { key: event.target.value })} placeholder="Parameter key" />
                <label className="sr-only" htmlFor={`manual-cycle-parameter-value-${index}`}>Parameter value {index + 1}</label>
                <input id={`manual-cycle-parameter-value-${index}`} className="input input-sm min-h-11" value={row.value} onChange={(event) => updateParameter(index, { value: event.target.value })} placeholder="Value" />
                <Button size="xs" variant="ghost" className="min-h-11" aria-label={`Remove parameter ${index + 1}`} disabled={parameterRows.length === 1} onClick={() => removeParameter(index)}>Remove</Button>
              </div>
            ))}
          </div>
          <Button size="xs" variant="secondary" className="min-h-11" onClick={addParameter}>Add parameter</Button>
          <div>
            <label htmlFor="manual-cycle-source-values" className="label">Source values (optional JSON object)</label>
            <textarea id="manual-cycle-source-values" className="input min-h-20 w-full resize-y" value={sourceValuesText} onChange={(event) => { invalidatePreview(); setSourceValuesText(event.target.value); }} placeholder={'{"financialYearEnd": "2024-03-31"}'} />
          </div>
        </section>

        <section aria-label="Repeatable schedule entries">
          <ScheduleEntryEditor value={scheduleEntries} disabled={busy !== null} onChange={(value) => { invalidatePreview(); setScheduleEntries(value); }} />
        </section>

        <div className="flex flex-wrap items-center gap-3">
          <Button size="md" className="min-h-11" isLoading={busy === 'preview'} disabled={!hasRequiredInputs || busy !== null} onClick={previewCycle}>Preview cycle</Button>
          {preview ? <p role="status" className="text-xs text-text-secondary">Preview ready for {preview.milestones.length} milestone{preview.milestones.length === 1 ? '' : 's'} · fingerprint {preview.previewFingerprint.slice(0, 12)}…</p> : <p className="text-xs text-text-muted">Preview is required before Apply.</p>}
        </div>

        {preview ? (
          <section className="space-y-3" aria-labelledby="manual-cycle-milestones-heading">
            <div>
              <h3 id="manual-cycle-milestones-heading" className="text-sm font-semibold text-text-primary">Milestones</h3>
              <p className="mt-1 text-xs text-text-secondary">Select exactly one choice for each evaluated milestone. Edits require a new preview.</p>
            </div>
            <div className="space-y-2">
              {preview.milestones.map((milestone) => {
                const key = identity(milestone);
                const included = includeByIdentity[key] !== false;
                const status = statusByIdentity[key] ?? 'OPEN';
                return (
                  <article key={key} className="space-y-3 rounded-lg border border-border-primary bg-background-primary p-3">
                    <div className="flex flex-wrap items-start gap-3">
                      <label className="flex min-h-11 min-w-11 items-center gap-2 text-sm text-text-primary">
                        <input type="checkbox" className="h-4 w-4" checked={included} onChange={(event) => { invalidatePreview(); setIncludeByIdentity((values) => ({ ...values, [key]: event.target.checked })); }} />
                        <span className="font-medium">{milestone.name}</span>
                      </label>
                      <span className="text-xs text-text-secondary">Calculated {milestone.calculatedDueDate}</span>
                      <span className="text-xs text-text-secondary">{milestone.deadlineType}</span>
                    </div>
                    <div className="grid gap-3 sm:grid-cols-3">
                      <div>
                        <label htmlFor={`manual-cycle-date-${key}`} className="label">Operative date</label>
                        <input id={`manual-cycle-date-${key}`} type="date" disabled={!included} className="input input-sm min-h-11 w-full" value={dateByIdentity[key] ?? milestone.operativeDueDate} onChange={(event) => { invalidatePreview(); setDateByIdentity((values) => ({ ...values, [key]: event.target.value })); }} />
                      </div>
                      <div>
                        <label htmlFor={`manual-cycle-status-${key}`} className="label">Status</label>
                        <select id={`manual-cycle-status-${key}`} disabled={!included} className="input input-sm min-h-11 w-full" value={status} onChange={(event) => { invalidatePreview(); setStatusByIdentity((values) => ({ ...values, [key]: event.target.value as 'OPEN' | 'COMPLETED' })); }}>
                          <option value="OPEN">Open</option>
                          <option value="COMPLETED">Completed</option>
                        </select>
                      </div>
                      <div>
                        <label htmlFor={`manual-cycle-completion-${key}`} className="label">Completion date</label>
                        <input id={`manual-cycle-completion-${key}`} type="date" disabled={!included || status !== 'COMPLETED'} className="input input-sm min-h-11 w-full" value={completionDateByIdentity[key] ?? ''} onChange={(event) => { invalidatePreview(); setCompletionDateByIdentity((values) => ({ ...values, [key]: event.target.value })); }} />
                      </div>
                    </div>
                    {milestone.explanation.length > 0 ? <details><summary className="min-h-11 cursor-pointer py-2 text-xs font-medium text-text-secondary">Why this date?</summary><ul className="list-disc space-y-1 pl-5 text-xs text-text-secondary">{milestone.explanation.map((reason) => <li key={reason}>{reason}</li>)}</ul></details> : null}
                  </article>
                );
              })}
            </div>
            <div>
              <label htmlFor="manual-cycle-notes" className="label">Notes</label>
              <textarea id="manual-cycle-notes" className="input min-h-20 w-full resize-y" value={notes} onChange={(event) => { invalidatePreview(); setNotes(event.target.value); }} placeholder="Why this historical cycle was triggered" maxLength={5000} />
            </div>
          </section>
        ) : null}
      </ModalBody>
      <ModalFooter>
        <Button variant="ghost" size="md" className="min-h-11" disabled={busy !== null} onClick={onClose}>Cancel</Button>
        <Button variant="primary" size="md" className="min-h-11" isLoading={busy === 'apply'} disabled={!preview || !canApply || busy !== null} onClick={applyCycle}>Apply cycle</Button>
      </ModalFooter>
    </Modal>
  );
}
