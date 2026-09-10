'use client';

import { useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { ArtifactView } from '@/components/ui/structured-data-view';
import { useAssistantCorrection, type AssistantCorrectionResult } from '@/hooks/use-business-assistant';
import { BIZFILE_CORRECTION_FIELDS, eligibleBizFileCorrectionFindings } from './correction-fields';

const correctionFieldGroups = BIZFILE_CORRECTION_FIELDS.reduce<Array<{ group: string; fields: typeof BIZFILE_CORRECTION_FIELDS[number][] }>>((groups, field) => {
  const existing = groups.find((group) => group.group === field.group);
  if (existing) existing.fields.push(field);
  else groups.push({ group: field.group, fields: [field] });
  return groups;
}, []);

export function BizFileCorrectionPanel({ workspaceId, runId, reviewId, findings }: {
  workspaceId: string;
  runId: string;
  reviewId: string;
  findings: unknown;
}) {
  const correction = useAssistantCorrection(workspaceId, runId);
  const eligible = eligibleBizFileCorrectionFindings(findings);
  const [selected, setSelected] = useState<string[]>([]);
  const [created, setCreated] = useState<AssistantCorrectionResult | null>(null);
  const requestIds = useRef(new Map<string, string>());
  const selectedFindings = eligible.filter((finding) => selected.includes(finding.id));

  function toggle(findingId: string, checked: boolean) {
    setCreated(null);
    setSelected((current) => checked ? [...current, findingId] : current.filter((id) => id !== findingId));
  }

  function submit() {
    if (selectedFindings.length === 0) return;
    const fingerprint = selectedFindings.map((finding) => finding.id).sort().join('|');
    const key = `${reviewId}:${fingerprint}`;
    const clientRequestId = requestIds.current.get(key) ?? crypto.randomUUID();
    requestIds.current.set(key, clientRequestId);
    correction.mutate({
      clientRequestId,
      reviewId,
      corrections: selectedFindings.map((finding) => ({ findingId: finding.id, value: finding.expected })),
    }, {
      onSuccess: (result) => {
        setCreated(result);
        setSelected([]);
      },
    });
  }

  return <section aria-label="Correct reviewed BizFile fields" className="mt-3 rounded-lg border border-border-primary bg-background-secondary p-3">
    <h5 className="font-medium">Correct reviewed BizFile fields</h5>
    <p className="mt-1 text-xs text-text-secondary">Only deterministic values from this independent review can be corrected here. Creating a correction makes a new proposal; stored company data does not change until that proposal is reviewed and approved.</p>
    <details className="mt-3 text-xs">
      <summary className="cursor-pointer font-medium text-text-secondary">Supported correction fields ({BIZFILE_CORRECTION_FIELDS.length})</summary>
      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        {correctionFieldGroups.map((group) => <section key={group.group}>
          <h6 className="font-medium text-text-secondary">{group.group}</h6>
          <ul className="mt-1 space-y-1 text-text-muted">{group.fields.map((field) => <li key={field.path}>{field.label}</li>)}</ul>
        </section>)}
      </div>
      <p className="mt-3 text-text-muted">Collection rows such as officers, shareholders, charges, share-capital rows, and former-name rows are not supported by this correction flow.</p>
    </details>

    {eligible.length > 0 ? <div className="mt-3 space-y-2">
      {eligible.map((finding) => <label key={finding.id} className="block rounded-md border border-border-primary bg-background-primary p-3">
        <span className="flex items-start gap-2">
          <input type="checkbox" className="mt-0.5 h-4 w-4 accent-oak-primary" checked={selected.includes(finding.id)} disabled={correction.isPending}
            onChange={(event) => toggle(finding.id, event.target.checked)} />
          <span className="min-w-0 flex-1">
            <span className="font-medium">{finding.label}</span>
            {finding.message ? <span className="mt-1 block text-text-secondary">{finding.message}</span> : null}
          </span>
        </span>
        <span className="mt-2 grid gap-2 sm:grid-cols-2">
          <span><span className="block text-text-muted">Recorded value</span><ArtifactView value={finding.actual ?? null} /></span>
          <span><span className="block text-text-muted">Reviewed correction</span><ArtifactView value={finding.expected} /></span>
        </span>
      </label>)}
      <Button variant="secondary" size="xs" disabled={selectedFindings.length === 0 || correction.isPending} isLoading={correction.isPending} onClick={submit}>
        Create correction proposal
      </Button>
    </div> : <p className="mt-3 text-xs text-text-secondary">This review has no supported deterministic field corrections.</p>}

    {created ? <p role="status" className="mt-3 text-xs">Correction proposal created. A new approval card has been added to this conversation; review and approve it before any stored company data changes.</p> : null}
    {correction.error ? <p role="alert" className="mt-3 text-xs text-status-error">{correction.error.message}</p> : null}
  </section>;
}
