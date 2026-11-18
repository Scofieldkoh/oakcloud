'use client';

import { useId, useState } from 'react';
import { AlertTriangle, Loader2, ShieldCheck } from 'lucide-react';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Modal, ModalBody, ModalFooter } from '@/components/ui/modal';
import { useToast } from '@/components/ui/toast';
import { SENTROWEB_MAX_ENTITIES_PER_RUN } from '@/lib/sentroweb/config';
import { sentrowebErrorMessage } from '@/lib/sentroweb/error-codes';
import type { SentrowebCandidateDto, SentrowebCandidatesResponse } from '@/lib/sentroweb/types';
import {
  SentrowebRequestError,
  useSentrowebCandidates,
  useStartSentrowebCheck,
} from '@/hooks/use-sentroweb-checks';
import { formatDateTime } from '@/lib/utils';
import { sentrowebRoleLabel, sentrowebSearchTypeLabel } from './sentroweb-badges';

interface SentrowebCheckDialogProps {
  companyId: string;
  isOpen: boolean;
  onClose: () => void;
  /** Called with the new run's id after the server accepted the check. */
  onStarted?: (runId: string) => void;
}

/** Whether the cooldown after the latest run is still running. */
function isCooldownActive(cooldownUntil: string | null | undefined): boolean {
  if (!cooldownUntil) return false;
  const until = Date.parse(cooldownUntil);
  return Number.isFinite(until) && until > Date.now();
}

/** The most that may be ticked and sent: the server's limit, never more than the fixed 10. */
function selectionLimit(data: SentrowebCandidatesResponse | undefined): number {
  const serverLimit = data?.maxEntities;
  return typeof serverLimit === 'number' && serverLimit > 0
    ? Math.min(serverLimit, SENTROWEB_MAX_ENTITIES_PER_RUN)
    : SENTROWEB_MAX_ENTITIES_PER_RUN;
}

/** All ticked when they fit in one check; none ticked when the person has to choose. */
function defaultSelection(candidates: SentrowebCandidateDto[], limit: number): string[] {
  return candidates.length <= limit ? candidates.map((candidate) => candidate.key) : [];
}

function pluralise(count: number, singular: string): string {
  return `${count} ${singular}${count === 1 ? '' : 's'}`;
}

/** The message to show for a failed start request. Only the server's own `error` is shown. */
function startErrorMessage(error: unknown): string {
  if (error instanceof SentrowebRequestError) {
    if ([409, 422, 503].includes(error.status)) {
      return error.serverMessage ?? sentrowebErrorMessage(error.code) ?? 'The check could not be started.';
    }
    return sentrowebErrorMessage(error.code) ?? 'The check could not be started. Please try again.';
  }
  return 'The check could not be started. Please try again.';
}

/** Confirm which people and companies to screen with Sentroweb, then start the check. */
export function SentrowebCheckDialog({ companyId, isOpen, onClose, onStarted }: SentrowebCheckDialogProps) {
  // The body remounts each time the dialog opens, so ticks and errors never carry over.
  if (!isOpen) return null;
  return <SentrowebCheckDialogBody companyId={companyId} onClose={onClose} onStarted={onStarted} />;
}

function SentrowebCheckDialogBody({
  companyId,
  onClose,
  onStarted,
}: Omit<SentrowebCheckDialogProps, 'isOpen'>) {
  const { success } = useToast();
  const { data, isLoading, error: loadError, refetch } = useSentrowebCandidates(companyId, true);
  const start = useStartSentrowebCheck(companyId);
  const [ticked, setTicked] = useState<string[] | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [cooldownFromError, setCooldownFromError] = useState<string | null>(null);
  const [alreadyRunningFromError, setAlreadyRunningFromError] = useState(false);
  const listId = useId();

  const candidates = data?.candidates ?? [];
  const limit = selectionLimit(data);
  const knownKeys = new Set(candidates.map((candidate) => candidate.key));
  // Only keys that are still on the list can be sent.
  const selectedKeys = (ticked ?? (data ? defaultSelection(candidates, limit) : [])).filter((key) =>
    knownKeys.has(key),
  );
  const selectedCount = selectedKeys.length;
  const creditsPerSearch = data?.creditsPerSearch ?? 1;
  const credits = selectedCount * creditsPerSearch;

  const cooldownUntil = data?.cooldownUntil ?? cooldownFromError;
  const inCooldown = isCooldownActive(cooldownUntil);
  const alreadyRunning = Boolean(data?.activeRunId) || alreadyRunningFromError;
  const notConfigured = data ? !data.configured : false;
  const overLimit = selectedCount > limit;
  const mustChoose = candidates.length > limit && selectedCount === 0;

  const canRun =
    !!data &&
    !notConfigured &&
    !alreadyRunning &&
    !start.isPending &&
    selectedCount >= 1 &&
    !overLimit;

  const toggle = (key: string, checked: boolean) => {
    const current = new Set(selectedKeys);
    if (checked) current.add(key);
    else current.delete(key);
    setTicked(candidates.map((candidate) => candidate.key).filter((candidateKey) => current.has(candidateKey)));
  };

  const handleRun = async () => {
    if (!canRun) return;
    const entityKeys = Array.from(new Set(selectedKeys));
    if (entityKeys.length === 0 || entityKeys.length > limit) return;

    setSubmitError(null);
    try {
      const result = await start.mutateAsync({ entityKeys, ...(inCooldown ? { force: true } : {}) });
      success('Sentroweb check started');
      onClose();
      onStarted?.(result.runId);
    } catch (err) {
      setSubmitError(startErrorMessage(err));
      if (err instanceof SentrowebRequestError) {
        if (err.code === 'COOLDOWN') setCooldownFromError(err.cooldownUntil ?? new Date(Date.now() + 60_000).toISOString());
        if (err.code === 'ALREADY_RUNNING') setAlreadyRunningFromError(true);
      }
    }
  };

  const handleClose = () => {
    if (start.isPending) return;
    onClose();
  };

  return (
    <Modal
      isOpen
      onClose={handleClose}
      title="Sentroweb check"
      description="Screen the people and companies linked to this company against Sentroweb."
      size="2xl"
      closeOnOverlayClick={!start.isPending}
      closeOnEscape={!start.isPending}
    >
      <ModalBody className="space-y-4">
        {isLoading ? (
          <div className="flex items-center gap-2 text-sm text-text-secondary" role="status">
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
            Loading people and companies…
          </div>
        ) : null}

        {loadError ? (
          <Alert variant="error">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span>Could not load the people and companies to check.</span>
              <Button size="xs" variant="secondary" onClick={() => void refetch()}>
                Try again
              </Button>
            </div>
          </Alert>
        ) : null}

        {notConfigured ? <Alert variant="error">Sentroweb isn&apos;t configured on this server.</Alert> : null}

        {alreadyRunning ? <Alert variant="warning">A check is already running for this company.</Alert> : null}

        {inCooldown && !alreadyRunning ? (
          <Alert variant="warning" title="This company was checked recently">
            A check can run again after {formatDateTime(cooldownUntil)}. Running it again uses more credits.
          </Alert>
        ) : null}

        {data && candidates.length === 0 && !notConfigured ? (
          <p className="text-sm text-text-secondary">This company has no people or companies to check.</p>
        ) : null}

        {candidates.length > 0 ? (
          <div>
            <p className="mb-2 text-sm font-medium text-text-primary" id={listId}>
              {candidates.length > limit
                ? `Choose up to ${limit} of ${candidates.length} people and companies to check`
                : 'People and companies to check'}
            </p>
            <ul aria-labelledby={listId} className="divide-y divide-border-primary rounded-lg border border-border-primary">
              {candidates.map((candidate) => (
                <CandidateRow
                  key={candidate.key}
                  candidate={candidate}
                  checked={selectedKeys.includes(candidate.key)}
                  disabled={start.isPending}
                  onChange={(checked) => toggle(candidate.key, checked)}
                />
              ))}
            </ul>
          </div>
        ) : null}

        {overLimit ? (
          <p role="alert" className="flex items-center gap-2 text-sm text-status-error">
            <AlertTriangle className="h-4 w-4 shrink-0" aria-hidden="true" />
            Choose at most {limit}
          </p>
        ) : null}
        {!overLimit && mustChoose ? (
          <p className="text-sm text-text-secondary">Tick the people and companies you want to check.</p>
        ) : null}

        {data && candidates.length > 0 ? (
          <p className="text-sm font-medium text-text-primary" aria-live="polite">
            This will use {pluralise(credits, 'Sentroweb credit')}
            {creditsPerSearch !== 1 ? ` (${creditsPerSearch} per search)` : ''}
          </p>
        ) : null}

        <p className="text-xs text-text-secondary">
          Every name searched is added to Sentroweb ongoing monitoring, the same as a manual search.
        </p>

        {submitError ? <Alert variant="error">{submitError}</Alert> : null}
      </ModalBody>
      <ModalFooter>
        <Button variant="secondary" onClick={handleClose} disabled={start.isPending}>
          Cancel
        </Button>
        <Button
          onClick={() => void handleRun()}
          disabled={!canRun}
          isLoading={start.isPending}
          leftIcon={<ShieldCheck />}
        >
          {inCooldown ? 'Run again anyway' : 'Run check'}
        </Button>
      </ModalFooter>
    </Modal>
  );
}

function CandidateRow({
  candidate,
  checked,
  disabled,
  onChange,
}: {
  candidate: SentrowebCandidateDto;
  checked: boolean;
  disabled: boolean;
  onChange: (checked: boolean) => void;
}) {
  const detailId = useId();
  const typeLabel = sentrowebSearchTypeLabel(candidate.searchType);
  const roleLabels = candidate.roles.map(sentrowebRoleLabel);

  return (
    <li className="flex flex-wrap items-center justify-between gap-2 px-3 py-2">
      <Checkbox
        size="sm"
        label={candidate.name}
        checked={checked}
        disabled={disabled}
        aria-describedby={detailId}
        onChange={(event) => onChange(event.target.checked)}
      />
      <span id={detailId} className="flex flex-wrap items-center gap-1.5">
        {roleLabels.map((role) => (
          <span key={role} className="badge badge-info badge-sm">
            {role}
          </span>
        ))}
        <span className="badge badge-neutral badge-sm">{typeLabel}</span>
      </span>
    </li>
  );
}
